const store = require('../utils/jsonStore');
const audit = require('./audit');
const { astar, joinRoutes, speedFor } = require('../algorithms/astar');

const ACTIVE = ['Planned', 'Resources Allocated', 'Dispatched', 'En Route', 'Route Recalculated'];
const roadLabel = (r) => `${r.id} (${r.name})`;

/** Recalculate one mission from its current position. */
async function recalcMission(mission, trigger, actor) {
  const [locs, roads, vehicles] = await Promise.all([store.readData('locations.json'), store.readData('roads.json'), store.readData('vehicles.json')]);
  const v = vehicles.find((x) => x.id === mission.vehicleId);
  const pos = mission.route.nodes[mission.posIndex || 0];
  const opt = { mode: 'safe', speedKmh: speedFor(v?.type) };
  // If the vehicle has not reached the warehouse yet, keep the pickup leg: vehicle -> warehouse -> destination
  const beforePickup = (mission.pickupIndex || 0) > (mission.posIndex || 0);
  let route, pickupIndex = 0;
  if (beforePickup) {
    const a = astar(locs, roads, pos, mission.sourceNodeId, opt), b = astar(locs, roads, mission.sourceNodeId, mission.destinationNodeId, opt);
    route = a && b ? joinRoutes(a, b) : null; pickupIndex = a ? a.nodes.length - 1 : 0;
  } else route = astar(locs, roads, pos, mission.destinationNodeId, opt);
  const reason = trigger ? `Route recalculated because Road ${roadLabel(trigger)} became unavailable.` : 'Route recalculated on request.';
  const refs = { missionId: mission.id, requestId: mission.requestId, incidentId: mission.incidentId };
  if (!route) {
    await audit.log(actor, 'No safe route', 'Missions', `${mission.id}: ${reason} No safe route currently available.`, refs);
    return store.updateById('missions.json', mission.id, {
      routeBlocked: true,
      alert: 'No safe route currently available. Suggestions: dispatch from another warehouse, use another staging location, use another vehicle, or wait for road clearance.',
    });
  }
  await audit.log(actor, 'Route recalculated', 'Missions', `${mission.id}: ${reason} New safe route: ${route.nodes.join(' > ')} (${route.distanceKm} km, ETA ${route.etaMin} min).`, refs);
  const hist = [...(mission.routeHistory || []), { at: new Date().toISOString(), reason, blockedRoadId: trigger?.id || null, previousNodes: mission.route.nodes, newNodes: route.nodes }];
  return store.updateById('missions.json', mission.id, (m) => ({
    route, posIndex: 0, pickupIndex, routeHistory: hist, routeBlocked: false, alert: reason,
    traveled: [...(m.traveled || []), ...m.route.nodes.slice(0, (m.posIndex || 0) + 1)].filter((n, i, a) => a.indexOf(n) === i),
    status: ['Dispatched', 'En Route', 'Route Recalculated'].includes(m.status) ? 'Route Recalculated' : m.status,
  }));
}

/** Apply a change to a road, then reroute any active mission whose remaining path uses it. */
async function applyRoadChange(roadId, patch, actor, label = 'Road updated') {
  const road = await store.updateById('roads.json', roadId, patch);
  if (!road) return null;
  await audit.log(actor, road.blocked ? 'Road blocked' : label, 'Road Network', `${roadLabel(road)}: damage ${road.damage}, flood ${road.floodDepth} m, traffic ${road.traffic}, blocked=${road.blocked}${road.failureType ? ', cause: ' + road.failureType : ''}`);
  const missions = (await store.readData('missions.json')).filter((m) => ACTIVE.includes(m.status));
  const affected = [];
  for (const m of missions) {
    const remaining = m.route.roadIds.slice(m.posIndex || 0);
    if (road.blocked && remaining.includes(road.id)) {
      const upd = await recalcMission(m, road, actor);
      affected.push({ missionId: m.id, outcome: upd.routeBlocked ? 'no-route' : 'rerouted', message: upd.alert, newRoute: upd.route?.nodes });
    } else if (!road.blocked && m.routeBlocked) {
      const upd = await recalcMission(m, null, actor);
      affected.push({ missionId: m.id, outcome: upd.routeBlocked ? 'no-route' : 'rerouted', message: upd.alert, newRoute: upd.route?.nodes });
    }
  }
  return { road, affected };
}

const { computeZone } = require('../utils/zone');

/** Re-route every active mission whose remaining path uses one of the given (now blocked) roads. */
async function rerouteUsing(roadIdSet, actor) {
  const roads = await store.readData('roads.json');
  const out = [];
  for (const m of (await store.readData('missions.json')).filter((x) => ACTIVE.includes(x.status))) {
    const hit = m.route.roadIds.slice(m.posIndex || 0).find((id) => roadIdSet.has(id));
    if (!hit) continue;
    const upd = await recalcMission(m, roads.find((r) => r.id === hit), actor);
    out.push({ missionId: m.id, outcome: upd.routeBlocked ? 'no-route' : 'rerouted', message: upd.alert });
  }
  return out;
}

/** Identify the disaster zone of an incident and disable the roads inside it. */
async function blockZone(incident, actor) {
  if (incident.zone) await releaseZone(incident.id, actor, true);
  const [locs, roads] = await Promise.all([store.readData('locations.json'), store.readData('roads.json')]);
  const zone = computeZone(incident, locs, roads);
  const newly = new Set();
  await store.mutate('roads.json', (arr) => {
    for (const r of arr) if (zone.roadIds.includes(r.id)) {
      if (!r.blocked) newly.add(r.id);
      r.blocked = true; r.failureType = r.failureType || 'Disaster zone';
      r.zoneIncidents = [...new Set([...(r.zoneIncidents || []), incident.id])];
    }
  });
  await store.updateById('incidents.json', incident.id, { zone });
  const where = (await store.readData('locations.json')).find((l) => l.id === incident.locationId)?.name || incident.locationId;
  await audit.log(actor, 'Disaster zone identified', 'Incidents', `${incident.id}: ${zone.radiusKm} km zone around ${where} covers ${zone.nodeIds.length} locations; ${zone.roadIds.length} road(s) disabled`, { incidentId: incident.id });
  const rerouted = await rerouteUsing(newly, actor);
  return { zone, newlyBlocked: [...newly], rerouted };
}

/** Re-open roads that were disabled only because of this incident's zone. */
async function releaseZone(incidentId, actor, silent = false) {
  const freed = [];
  await store.mutate('roads.json', (arr) => {
    for (const r of arr) if ((r.zoneIncidents || []).includes(incidentId)) {
      r.zoneIncidents = r.zoneIncidents.filter((x) => x !== incidentId);
      if (!r.zoneIncidents.length && r.failureType === 'Disaster zone') { r.blocked = false; r.failureType = null; freed.push(r.id); }
    }
  });
  await store.updateById('incidents.json', incidentId, { zone: null });
  if (!silent) await audit.log(actor, 'Disaster zone cleared', 'Incidents', `${incidentId}: ${freed.length} road(s) re-opened`, { incidentId });
  for (const m of (await store.readData('missions.json')).filter((x) => ACTIVE.includes(x.status) && x.routeBlocked)) await recalcMission(m, null, actor);
  return freed;
}
module.exports = { applyRoadChange, recalcMission, blockZone, releaseZone, ACTIVE };
