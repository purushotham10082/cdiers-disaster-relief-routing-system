const store = require('../utils/jsonStore');
const audit = require('./audit');
const { astar, joinRoutes, speedFor, noRouteSuggestions } = require('../algorithms/astar');
const { haversine } = require('../utils/geo');

// Every resource / evacuation transport mission uses a truck. The system picks it automatically.
const TRUCKS = ['Relief Truck', 'Water Tanker'];
const NEED_ORDER = [['medicalKits', 'medicalKitsRequired'], ['water', 'waterRequired'], ['food', 'foodRequired']];
const TEAM_BY_INCIDENT = { Flood: 'Flood Rescue', 'Extreme Rainfall': 'Flood Rescue', Cyclone: 'Flood Rescue', 'Storm Surge': 'Flood Rescue', Tsunami: 'Flood Rescue', Fire: 'Fire & Rescue', 'Industrial Accident': 'Fire & Rescue', 'Chemical Emergency': 'Fire & Rescue', 'Building Collapse': 'Search & Rescue', 'Major Road Accident': 'Medical', 'Heat Wave': 'Medical' };
const INJURY_TYPES = ['Fire', 'Industrial Accident', 'Chemical Emergency', 'Building Collapse', 'Major Road Accident', 'Heat Wave']; // -> hospital first
const PRIORITY_RANK = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const dist = (loc, a, b) => haversine(loc.get(a).lat, loc.get(a).lng, loc.get(b).lat, loc.get(b).lng);

async function load() {
  const names = ['locations', 'roads', 'warehouses', 'vehicles', 'rescueTeams', 'resources', 'incidents', 'missions', 'shelters', 'hospitals'];
  const [locs, roads, whs, vehicles0, teams0, catalog, incidents, missions, shelters, hospitals] = await Promise.all(names.map((f) => store.readData(f + '.json')));
  // Self-heal: a vehicle/team is only really busy if its mission still exists and is active
  const live = new Set(missions.filter((m) => !['Completed', 'Cancelled'].includes(m.status)).map((m) => m.id));
  const vehicles = vehicles0.map((v) => (v.status !== 'Maintenance' && !(v.assignedMission && live.has(v.assignedMission)) ? { ...v, status: 'Available', assignedMission: null } : v));
  const teams = teams0.map((t) => (!(t.assignedMission && live.has(t.assignedMission)) ? { ...t, availability: 'Available', assignedMission: null } : t));
  return { locs, roads, whs, vehicles, teams, catalog, incidents, missions, shelters, hospitals, loc: new Map(locs.map((l) => [l.id, l])) };
}
const freeTrucks = (vehicles, types = TRUCKS) => vehicles.filter((v) => v.status === 'Available' && !v.assignedMission && types.includes(v.type));

/** Picks the nearest available team of the right type (it rides with the dispatched truck). */
function pickTeam(teams, loc, type, nodeId) {
  return teams.filter((t) => t.availability === 'Available' && t.type === type).sort((a, b) => dist(loc, a.nodeId, nodeId) - dist(loc, b.nodeId, nodeId))[0] || null;
}

/**
 * Plan for an emergency request (no data is changed):
 *  1. nearest warehouse (by safe route cost to the emergency location), 2. truck(s) by capacity,
 *  3. safe route truck -> warehouse -> emergency location (damaged / zone-blocked roads avoided).
 */
async function planDispatch(request) {
  const { locs, roads, whs, vehicles, teams, catalog, incidents, loc } = await load();
  const dest = request.locationId;
  const plan = { requestId: request.id, destinationNodeId: dest, warehouse: null, tasks: [], allocation: [], shortfalls: [], warnings: [], suggestions: [], team: null, feasible: false,
    busyVehicles: vehicles.filter((v) => TRUCKS.includes(v.type) && !(v.status === 'Available' && !v.assignedMission)).map((v) => ({ id: v.id, type: v.type, status: v.status, mission: v.assignedMission })) };
  if (!loc.has(dest)) { plan.warnings.push('Unknown destination location'); return plan; }
  const weight = Object.fromEntries(catalog.map((r) => [r.id, r.weightKg]));
  const items = NEED_ORDER.map(([resource, f]) => ({ resource, qty: Number(request[f]) || 0, w: weight[resource] || 1 })).filter((i) => i.qty > 0);
  const needsTeam = Number(request.rescuePersonnelRequired) > 0;
  if (!items.length && !needsTeam) plan.shortfalls.push({ resource: 'request', missing: 0, reason: 'Nothing was requested' });

  if (items.length) {
    const ranked = [];
    for (const w of whs) { const r = astar(locs, roads, w.nodeId, dest, { mode: 'safe' }); if (r) ranked.push({ w, r }); else plan.warnings.push(`${w.name} cannot reach the emergency location (no safe route currently available).`); }
    ranked.sort((a, b) => a.r.cost - b.r.cost);
    if (!ranked.length) { plan.shortfalls.push({ resource: 'warehouse', missing: 0, reason: 'No warehouse can reach the emergency location' }); plan.suggestions = noRouteSuggestions(); }
    else {
      const wh = ranked[0].w;
      plan.warehouse = { id: wh.id, name: wh.name, nodeId: wh.nodeId };
      plan.allocation = items.map((i) => ({ resource: i.resource, required: i.qty, allocated: i.qty, parts: [{ warehouseId: wh.id, warehouseName: wh.name, qty: i.qty }], vehicles: [] }));
      // trucks ordered by how close (safe route) they are to the warehouse and by capacity
      const cands = freeTrucks(vehicles).map((v) => ({ v, pickup: v.nodeId === wh.nodeId ? null : astar(locs, roads, v.nodeId, wh.nodeId, { mode: 'safe', speedKmh: speedFor(v.type) }) }))
        .filter((c) => c.v.nodeId === wh.nodeId || c.pickup).sort((a, b) => ((a.pickup?.cost || 0) - a.v.capacityKg / 1000) - ((b.pickup?.cost || 0) - b.v.capacityKg / 1000));
      const left = items.map((i) => ({ ...i }));
      while (left.some((i) => i.qty > 0)) {
        const c = cands.shift(); if (!c) break;
        let cap = c.v.capacityKg; const load = [];
        for (const i of left) { const take = Math.min(i.qty, Math.floor(cap / i.w)); if (take > 0) { load.push({ resource: i.resource, qty: take, weightKg: +(take * i.w).toFixed(1) }); cap -= take * i.w; i.qty -= take; } }
        if (!load.length) continue;
        const del = astar(locs, roads, wh.nodeId, dest, { mode: 'safe', speedKmh: speedFor(c.v.type) });
        if (!del) continue;
        plan.tasks.push({ type: 'Supply', warehouseId: wh.id, warehouseName: wh.name, sourceNodeId: wh.nodeId, vehicleId: c.v.id, vehicleType: c.v.type, registration: c.v.registration, capacityKg: c.v.capacityKg,
          items: load, weightKg: +load.reduce((s, x) => s + x.weightKg, 0).toFixed(1), route: c.pickup ? joinRoutes(c.pickup, del) : del, pickupIndex: c.pickup ? c.pickup.nodes.length - 1 : 0, pickupKm: c.pickup ? c.pickup.distanceKm : 0, vehicleStartNodeId: c.v.nodeId });
      }
      for (const i of left.filter((x) => x.qty > 0)) plan.shortfalls.push({ resource: i.resource, missing: i.qty, reason: 'No truck with free capacity is available right now' });
      if (left.some((i) => i.qty > 0)) plan.suggestions = ['It will be dispatched automatically when a truck becomes free', 'Cancel or complete an older mission to free a truck'];
      plan.allocation.forEach((a) => { a.vehicles = plan.tasks.filter((t) => t.items.some((i) => i.resource === a.resource)).map((t) => t.vehicleId); });
    }
  }

  if (needsTeam) {
    const inc = incidents.find((i) => i.id === request.incidentId);
    const want = request.teamType || TEAM_BY_INCIDENT[inc?.disasterType] || 'Search & Rescue';
    const team = pickTeam(teams, loc, want, dest);
    const soleDeliverable = items.length === 0;
    const miss = (reason) => (soleDeliverable ? plan.shortfalls.push({ resource: 'rescueTeam', missing: request.rescuePersonnelRequired, reason }) : plan.warnings.push(reason));
    if (!team) miss(`No available ${want} team`);
    else {
      plan.team = { id: team.id, name: team.name, type: team.type, personnel: team.personnel };
      if (team.personnel < request.rescuePersonnelRequired) plan.warnings.push(`${team.name} has ${team.personnel} personnel; ${request.rescuePersonnelRequired} requested.`);
      const prefs = request.vehiclePreference?.length ? request.vehiclePreference : (plan.tasks.length ? [] : ['Rescue Van', 'Emergency Response Vehicle', 'Fire Engine']);
      if (prefs.length) {
        const used = new Set(plan.tasks.map((t) => t.vehicleId));
        const v = vehicles.filter((x) => x.status === 'Available' && !x.assignedMission && prefs.includes(x.type) && !used.has(x.id)).sort((a, b) => dist(loc, a.nodeId, dest) - dist(loc, b.nodeId, dest))[0];
        const route = v && astar(locs, roads, v.nodeId, dest, { mode: 'safe', speedKmh: speedFor(v.type) });
        if (!v || !route) miss(`No available ${prefs.join(' / ')} can reach the emergency location`);
        else plan.tasks.push({ type: 'Responder', warehouseId: null, warehouseName: null, sourceNodeId: v.nodeId, vehicleId: v.id, vehicleType: v.type, registration: v.registration, capacityKg: v.capacityKg, items: [], weightKg: 0, team: plan.team, route, pickupIndex: 0, pickupKm: 0, vehicleStartNodeId: v.nodeId });
      } else if (plan.tasks.length) plan.tasks[0].team = plan.team;
    }
  }
  if (!plan.tasks.length && !plan.shortfalls.length) plan.shortfalls.push({ resource: 'dispatch', missing: 0, reason: 'Nothing can be dispatched right now' });
  plan.feasible = plan.tasks.length > 0 && plan.shortfalls.length === 0;
  return plan;
}

async function createMissions(tasks, base, actor) {
  const out = [];
  for (const t of tasks) {
    const m = await store.create('missions.json', 'MIS', {
      type: t.type, requestId: base.requestId || null, incidentId: base.incidentId || null, warehouseId: t.warehouseId || null, sourceNodeId: t.sourceNodeId, destinationNodeId: t.destinationNodeId || base.destinationNodeId,
      destinationName: t.destinationName || null, destinationKind: t.destinationKind || null, vehicleId: t.vehicleId, teamId: t.team?.id || null, teamName: t.team?.name || null, resources: t.items, weightKg: t.weightKg, priority: base.priority,
      route: t.route, originalRoute: t.route, pickupIndex: t.pickupIndex || 0, pickupKm: t.pickupKm || 0, vehicleStartNodeId: t.vehicleStartNodeId || t.sourceNodeId, posIndex: 0, traveled: [], routeHistory: [], routeBlocked: false, alert: null,
      status: 'Resources Allocated', createdAt: new Date().toISOString(), dispatchedAt: null, arrivedAt: null, completedAt: null, simulation: true });
    await store.updateById('vehicles.json', t.vehicleId, { assignedMission: m.id });
    if (t.team) await store.updateById('rescueTeams.json', t.team.id, { assignedMission: m.id });
    const refs = { missionId: m.id, requestId: m.requestId || undefined, incidentId: m.incidentId || undefined };
    const what = t.type === 'Evacuation' ? `evacuation of people from ${t.sourceNodeId} to ${t.destinationKind} ${t.destinationName}` : t.items.map((i) => `${i.qty} ${i.resource}`).join(', ') || 'responder team';
    await audit.log(actor, 'Resources identified', 'Missions', `${m.id}: ${what}${t.warehouseName ? ' from nearest warehouse ' + t.warehouseName : ''}`, refs);
    await audit.log(actor, 'Truck assigned', 'Missions', `${m.id}: ${t.vehicleType} ${t.vehicleId} (${t.weightKg} kg of ${t.capacityKg} kg capacity)${t.pickupKm ? `, starts ${t.pickupKm} km from the pickup point` : ''}`, refs);
    await audit.log(actor, 'Safe route calculated', 'Missions', `${m.id}: ${t.route.nodes.join(' > ')} (${t.route.distanceKm} km, ETA ${t.route.etaMin} min, risk ${t.route.riskScore})`, refs);
    await setMissionStatus(m.id, 'Dispatched', actor); // automatic dispatch
    out.push(await store.findById('missions.json', m.id));
  }
  return out;
}
async function commitPlan(plan, request, actor) {
  if (!plan.tasks.length) throw Object.assign(new Error('Nothing to dispatch: ' + (plan.warnings[0] || plan.shortfalls[0]?.reason || 'no trucks available')), { status: 409 });
  return createMissions(plan.tasks, { requestId: request.id, incidentId: request.incidentId, destinationNodeId: plan.destinationNodeId, priority: request.priority }, actor);
}
/** Whole workflow for one request: nearest warehouse -> truck -> safe route -> dispatch. All-or-nothing. */
async function autoDispatchRequest(request, actor) {
  const plan = await planDispatch(request);
  if (!plan.feasible) {
    const note = plan.shortfalls[0]?.reason || plan.warnings[0] || 'Cannot dispatch yet';
    await store.updateById('emergencyRequests.json', request.id, { status: 'Pending', autoQueued: true, dispatchNote: note });
    await audit.log(actor, 'Dispatch waiting', 'Requests', `${request.id}: ${note}`, { requestId: request.id, incidentId: request.incidentId });
    return { plan, missions: [], dispatched: false };
  }
  await store.updateById('emergencyRequests.json', request.id, { autoQueued: false, dispatchNote: null });
  const missions = await commitPlan(plan, request, actor);
  return { plan, missions, dispatched: true };
}
/** Requests that could not be dispatched (no free truck) are retried by priority when a truck frees up. */
async function retryPending(actor) {
  const queue = (await store.readData('emergencyRequests.json')).filter((r) => r.status === 'Pending' && r.autoQueued).sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || new Date(a.createdAt) - new Date(b.createdAt));
  for (const r of queue) { try { await autoDispatchRequest(r, actor); } catch (e) { console.error('retry failed', e.message); } }
}

/** Evacuation: nearest SAFE shelter/hospital (outside the disaster zone) and a truck to carry the people. */
async function planEvacuation(incident) {
  const { locs, roads, vehicles, shelters, hospitals } = await load();
  const centre = incident.locationId;
  const inside = new Set(incident.zone?.nodeIds || []);
  const order = INJURY_TYPES.includes(incident.disasterType) ? [['Hospital', hospitals], ['Shelter', shelters]] : [['Shelter', shelters], ['Hospital', hospitals]];
  let choice = null, warning = null;
  for (const [kind, list] of order) {
    const c = list.map((x) => ({ x, kind, route: astar(locs, roads, centre, x.nodeId, { mode: 'safe', speedKmh: speedFor('Relief Truck') }) })).filter((k) => k.route && !inside.has(k.x.nodeId)).sort((a, b) => a.route.cost - b.route.cost)[0];
    if (c) { choice = c; break; }
  }
  if (!choice) {
    const any = [...shelters.map((x) => ({ x, kind: 'Shelter' })), ...hospitals.map((x) => ({ x, kind: 'Hospital' }))].map((k) => ({ ...k, route: astar(locs, roads, centre, k.x.nodeId, { mode: 'safe', speedKmh: 38 }) })).filter((k) => k.route).sort((a, b) => a.route.cost - b.route.cost)[0];
    if (any) { choice = any; warning = 'No shelter/hospital outside the disaster zone is reachable; using the nearest reachable one.'; }
  }
  const plan = { incidentId: incident.id, feasible: false, warnings: warning ? [warning] : [], reason: null, task: null, destination: choice ? { id: choice.x.id, name: choice.x.name, kind: choice.kind, nodeId: choice.x.nodeId } : null };
  if (!choice) { plan.reason = 'No shelter or hospital can be reached on a safe route.'; return plan; }
  const trucks = freeTrucks(vehicles, ['Relief Truck']).map((v) => ({ v, pickup: v.nodeId === centre ? null : astar(locs, roads, v.nodeId, centre, { mode: 'safe', speedKmh: speedFor(v.type) }) })).filter((c) => c.v.nodeId === centre || c.pickup).sort((a, b) => (a.pickup?.cost || 0) - (b.pickup?.cost || 0));
  if (!trucks.length) { plan.reason = 'No truck is available right now.'; return plan; }
  const { v, pickup } = trucks[0];
  plan.task = { type: 'Evacuation', warehouseId: null, sourceNodeId: centre, destinationNodeId: choice.x.nodeId, destinationName: choice.x.name, destinationKind: choice.kind, vehicleId: v.id, vehicleType: v.type, registration: v.registration, capacityKg: v.capacityKg,
    items: [], weightKg: 0, team: null, route: pickup ? joinRoutes(pickup, choice.route) : choice.route, pickupIndex: pickup ? pickup.nodes.length - 1 : 0, pickupKm: pickup ? pickup.distanceKm : 0, vehicleStartNodeId: v.nodeId };
  plan.feasible = true;
  return plan;
}
async function dispatchEvacuation(incident, actor) {
  const plan = await planEvacuation(incident);
  const refs = { incidentId: incident.id };
  if (!plan.feasible) {
    await store.updateById('incidents.json', incident.id, { evacuation: { status: 'Waiting', reason: plan.reason } });
    await audit.log(actor, 'Evacuation waiting', 'Incidents', `${incident.id}: ${plan.reason}`, refs);
    return { dispatched: false, reason: plan.reason, warnings: plan.warnings };
  }
  const [m] = await createMissions([plan.task], { incidentId: incident.id, destinationNodeId: plan.task.destinationNodeId, priority: incident.severity }, actor);
  await store.updateById('incidents.json', incident.id, { evacuation: { status: 'Dispatched', missionId: m.id, destination: plan.destination } });
  await audit.log(actor, 'Evacuation dispatched', 'Incidents', `${incident.id}: truck ${m.vehicleId} will carry people to ${plan.destination.kind} ${plan.destination.name}`, { ...refs, missionId: m.id });
  return { dispatched: true, mission: m, destination: plan.destination, warnings: plan.warnings };
}

const NEXT = { 'Resources Allocated': 'Dispatched', Planned: 'Dispatched', Dispatched: 'En Route', 'En Route': 'Arrived', 'Route Recalculated': 'Arrived', Arrived: 'Delivered', Delivered: 'Completed' };

/** Moves a mission to a new status and keeps vehicle / team / request consistent. */
async function setMissionStatus(id, status, actor) {
  const m = await store.findById('missions.json', id);
  if (!m) throw Object.assign(new Error('Mission not found'), { status: 404 });
  if (m.routeBlocked && ['Dispatched', 'En Route', 'Arrived'].includes(status)) throw Object.assign(new Error('No safe route currently available. Clear a road or re-plan before moving this mission.'), { status: 409 });
  const now = new Date().toISOString(); const patch = { status };
  const dest = m.destinationNodeId;
  if (status === 'Dispatched') { patch.dispatchedAt = now; await store.updateById('vehicles.json', m.vehicleId, { status: 'Dispatched' }); if (m.teamId) await store.updateById('rescueTeams.json', m.teamId, { availability: 'Deployed' }); }
  if (status === 'En Route') await store.updateById('vehicles.json', m.vehicleId, { status: 'On Route' });
  if (status === 'Arrived') { patch.arrivedAt = now; patch.posIndex = m.route.nodes.length - 1; await store.updateById('vehicles.json', m.vehicleId, { status: 'Arrived', nodeId: dest }); }
  if (status === 'Completed' || status === 'Cancelled') {
    patch.completedAt = now;
    await store.updateById('vehicles.json', m.vehicleId, { status: 'Available', assignedMission: null, ...(status === 'Completed' ? { nodeId: dest } : {}) });
    if (m.teamId) await store.updateById('rescueTeams.json', m.teamId, { availability: 'Available', assignedMission: null, ...(status === 'Completed' ? { nodeId: dest } : {}) });
  }
  const upd = await store.updateById('missions.json', id, patch);
  const refs = { missionId: id, requestId: m.requestId || undefined, incidentId: m.incidentId || undefined };
  await audit.log(actor, `Mission ${status}`, 'Missions', `${id} -> ${status}${status === 'Delivered' ? (m.type === 'Evacuation' ? ': people delivered to safety' : ': resources delivered') : ''}`, refs);
  if (m.requestId) {
    if (status === 'Completed' || status === 'Cancelled') {
      const sibs = (await store.readData('missions.json')).filter((x) => x.requestId === m.requestId);
      if (sibs.every((x) => ['Completed', 'Cancelled'].includes(x.status))) await store.updateById('emergencyRequests.json', m.requestId, { status: sibs.some((x) => x.status === 'Completed') ? 'Fulfilled' : 'Pending' });
      else await store.updateById('emergencyRequests.json', m.requestId, { status: 'In Progress' });
    } else if (status === 'Dispatched') await store.updateById('emergencyRequests.json', m.requestId, { status: 'In Progress' });
  }
  if (status === 'Completed') await retryPending(actor); // a truck is free again: dispatch waiting requests
  return upd;
}

/** Vehicle moves one node along its current route. */
async function stepMission(id, actor) {
  const m = await store.findById('missions.json', id);
  if (!m) throw Object.assign(new Error('Mission not found'), { status: 404 });
  if (m.routeBlocked) throw Object.assign(new Error('No safe route currently available. Vehicle is holding position.'), { status: 409 });
  if (!['Dispatched', 'En Route', 'Route Recalculated'].includes(m.status)) throw Object.assign(new Error('Mission must be dispatched before it can move'), { status: 409 });
  if (m.status === 'Dispatched') await setMissionStatus(id, 'En Route', actor);
  const next = (m.posIndex || 0) + 1;
  const reached = Math.min(next, m.route.nodes.length - 1);
  const arrived = next >= m.route.nodes.length - 1;
  const upd = await store.updateById('missions.json', id, { posIndex: reached });
  await store.updateById('vehicles.json', m.vehicleId, { nodeId: m.route.nodes[reached] });
  const refs = { missionId: id, requestId: m.requestId || undefined, incidentId: m.incidentId || undefined };
  await audit.log(actor, 'Vehicle moved', 'Missions', `${id}: reached ${m.route.nodes[reached]}`, refs);
  if (m.pickupIndex > 0 && reached === m.pickupIndex) {
    const what = m.type === 'Evacuation' ? `picking up people at ${m.sourceNodeId}` : `loading ${m.resources.map((r) => `${r.qty} ${r.resource}`).join(', ')} at ${(await store.findById('warehouses.json', m.warehouseId))?.name || 'warehouse'}`;
    await audit.log(actor, m.type === 'Evacuation' ? 'Picking up people' : 'Loading at warehouse', 'Missions', `${id}: ${what}`, refs);
  }
  return arrived ? setMissionStatus(id, 'Arrived', actor) : upd;
}
module.exports = { planDispatch, commitPlan, autoDispatchRequest, retryPending, planEvacuation, dispatchEvacuation, setMissionStatus, stepMission, NEXT, PRIORITY_RANK };
