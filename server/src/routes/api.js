const router = require('express').Router();
const store = require('../utils/jsonStore');
const { authenticate, requireRole, ROLES } = require('../middleware/auth');
const { validate } = require('../utils/validate');
const audit = require('../services/audit');
const { analyseRoutes, damageLevel } = require('../algorithms/astar');
const { applyRoadChange, recalcMission } = require('../services/roadService');
const dispatch = require('../services/dispatchService');
const incidents = require('../services/incidentService');
const scenarios = require('../services/scenarios');

router.use(authenticate);
const { ADMIN, OPERATOR, DISPATCHER, RESPONDER } = ROLES;
const ops = requireRole(OPERATOR);                       // Admin always allowed
const dispatchers = requireRole(OPERATOR, DISPATCHER);
const anyField = requireRole(OPERATOR, DISPATCHER, RESPONDER);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = (res, v) => res.status(400).json({ error: 'Validation failed', details: v.errors });
const notFound = (res, what) => res.status(404).json({ error: `${what} not found` });

const DISASTERS = ['Flood', 'Cyclone', 'Storm Surge', 'Tsunami', 'Extreme Rainfall', 'Heat Wave', 'Fire', 'Industrial Accident', 'Chemical Emergency', 'Building Collapse', 'Major Road Accident'];
const SEV = ['Critical', 'High', 'Medium', 'Low'];
const INC_STATUS = ['Reported', 'Verified', 'Active', 'Under Response', 'Resolved', 'Closed'];
const withDamage = (r) => ({ ...r, damageLevel: damageLevel(r.damage) });
const rank = (p) => SEV.indexOf(p);

// ---------- bootstrap + dashboard + reports ----------
router.get('/bootstrap', wrap(async (req, res) => {
  const names = ['locations', 'roads', 'incidents', 'warehouses', 'hospitals', 'shelters', 'vehicles', 'rescueTeams', 'emergencyRequests', 'missions'];
  const arr = await Promise.all(names.map((n) => store.readData(n + '.json')));
  const out = Object.fromEntries(names.map((n, i) => [n, arr[i]]));
  out.roads = out.roads.map(withDamage);
  out.emergencyRequests.sort((a, b) => rank(a.priority) - rank(b.priority) || new Date(a.createdAt) - new Date(b.createdAt));
  out.missions.sort((a, b) => rank(a.priority) - rank(b.priority));
  res.json(out);
}));
async function stats() {
  const [inc, req, mis, veh, roads, hos, shel, teams, whs] = await Promise.all(['incidents', 'emergencyRequests', 'missions', 'vehicles', 'roads', 'hospitals', 'shelters', 'rescueTeams', 'warehouses'].map((n) => store.readData(n + '.json')));
  const count = (a, f) => a.reduce((m, x) => ((m[f(x)] = (m[f(x)] || 0) + 1), m), {});
  const live = mis.filter((m) => !['Completed', 'Cancelled'].includes(m.status));
  const busy = new Set(live.map((m) => m.id));
  const dispatched = {}; mis.filter((m) => m.status !== 'Cancelled').forEach((m) => m.resources.forEach((r) => (dispatched[r.resource] = (dispatched[r.resource] || 0) + r.qty)));
  return {
    totalIncidents: inc.length, activeIncidents: inc.filter((i) => ['Reported', 'Verified', 'Active', 'Under Response'].includes(i.status)).length,
    criticalRequests: req.filter((r) => r.priority === 'Critical' && !['Fulfilled', 'Cancelled'].includes(r.status)).length, pendingRequests: req.filter((r) => r.status === 'Pending').length,
    activeMissions: live.length, completedMissions: mis.filter((m) => m.status === 'Completed').length, evacuationMissions: mis.filter((m) => m.type === 'Evacuation').length,
    availableVehicles: veh.filter((v) => v.status !== 'Maintenance' && !(v.assignedMission && busy.has(v.assignedMission))).length, vehiclesDeployed: new Set(mis.filter((m) => m.status !== 'Cancelled').map((m) => m.vehicleId)).size,
    blockedRoads: roads.filter((r) => r.blocked).length, zoneRoads: roads.filter((r) => r.blocked && (r.zoneIncidents || []).length).length, highDamageRoads: roads.filter((r) => r.damage > 50).length,
    hospitals: hos.length, shelters: shel.length, rescueTeams: teams.length, warehouses: whs.length, routeRecalculations: mis.reduce((s, m) => s + (m.routeHistory || []).length, 0),
    resourcesDispatched: dispatched, incidentsByType: count(inc, (i) => i.disasterType), requestsByPriority: count(req, (r) => r.priority), missionsByStatus: count(mis, (m) => m.status), missionsByType: count(mis, (m) => m.type),
  };
}
router.get('/dashboard', wrap(async (req, res) => res.json(await stats())));
router.get('/reports', wrap(async (req, res) => res.json(await stats())));

// ---------- generic read-only lists ----------
for (const [path, file] of [['warehouses', 'warehouses'], ['vehicles', 'vehicles'], ['hospitals', 'hospitals'], ['shelters', 'shelters'], ['rescue-teams', 'rescueTeams'], ['locations', 'locations']]) {
  router.get('/' + path, wrap(async (req, res) => res.json(await store.readData(file + '.json'))));
  router.get('/' + path + '/:id', wrap(async (req, res) => { const x = await store.findById(file + '.json', req.params.id); x ? res.json(x) : notFound(res, 'Record'); }));
}
// ---------- incidents ----------
const incSchema = {
  disasterType: { type: 'enum', values: DISASTERS, required: true }, locationId: { type: 'string', required: true, max: 40 },
  severity: { type: 'enum', values: SEV, required: true }, description: { type: 'string', max: 500, default: '' },
  status: { type: 'enum', values: INC_STATUS, default: 'Reported' }, latitude: { type: 'number', min: 12.7, max: 13.4 }, longitude: { type: 'number', min: 79.9, max: 80.5 },
};
async function incWithLoc(data) {
  const loc = (await store.readData('locations.json')).find((l) => l.id === data.locationId);
  if (!loc) return null;
  return { ...data, location: loc.name, latitude: data.latitude ?? loc.lat, longitude: data.longitude ?? loc.lng };
}
router.get('/incidents', wrap(async (req, res) => res.json(await store.readData('incidents.json'))));
router.get('/incidents/:id', wrap(async (req, res) => { const x = await store.findById('incidents.json', req.params.id); x ? res.json(x) : notFound(res, 'Incident'); }));
router.post('/incidents', ops, wrap(async (req, res) => {
  const v = validate({ ...req.body, status: req.body?.status || 'Reported' }, { ...incSchema, autoEvacuate: { type: 'boolean', default: true } }); if (!v.ok) return bad(res, v);
  const { autoEvacuate, ...data } = v.data;
  const out = await incidents.createIncident(data, req.user, { autoEvacuate: req.body?.autoEvacuate === undefined ? true : autoEvacuate });
  res.status(201).json({ ...out.incident, _zone: out.zone && { radiusKm: out.zone.zone.radiusKm, roadsDisabled: out.zone.newlyBlocked.length, rerouted: out.zone.rerouted }, _evacuation: out.evacuation });
}));
router.put('/incidents/:id', ops, wrap(async (req, res) => {
  const v = validate(req.body, incSchema, { partial: true }); if (!v.ok) return bad(res, v);
  let d = v.data; if (d.locationId) { d = await incWithLoc({ ...d }); if (!d) return res.status(400).json({ error: 'Unknown location' }); }
  let x = await store.updateById('incidents.json', req.params.id, d); if (!x) return notFound(res, 'Incident');
  await audit.log(req.user, 'Incident updated', 'Incidents', `${x.id}: status ${x.status}, severity ${x.severity}`, { incidentId: x.id });
  await incidents.syncIncident(x, req.user);
  res.json(await store.findById('incidents.json', x.id));
}));
router.post('/incidents/:id/evacuate', ops, wrap(async (req, res) => {
  const inc = await store.findById('incidents.json', req.params.id); if (!inc) return notFound(res, 'Incident');
  if (inc.evacuation?.missionId) { const m = await store.findById('missions.json', inc.evacuation.missionId); if (m && !['Completed', 'Cancelled'].includes(m.status)) return res.status(409).json({ error: `Evacuation ${m.id} is already running for this incident` }); }
  const out = await dispatch.dispatchEvacuation(inc, req.user);
  out.dispatched ? res.status(201).json(out) : res.status(409).json({ error: out.reason });
}));
router.delete('/incidents/:id', requireRole(), wrap(async (req, res) => {
  const ok = await incidents.removeIncident(req.params.id, req.user); if (!ok) return notFound(res, 'Incident');
  await audit.log(req.user, 'Incident deleted', 'Incidents', req.params.id); res.json({ deleted: true });
}));

// ---------- emergency requests ----------
const num = { type: 'number', min: 0, max: 1000000, default: 0 };
const reqSchema = {
  incidentId: { type: 'string', max: 40 }, locationId: { type: 'string', required: true, max: 40 }, priority: { type: 'enum', values: SEV, required: true },
  peopleAffected: num, waterRequired: num, foodRequired: num, medicalKitsRequired: num, rescuePersonnelRequired: num,
  specialRequirements: { type: 'string', max: 300, default: '' }, teamType: { type: 'enum', values: ['Medical', 'Fire & Rescue', 'Flood Rescue', 'Search & Rescue', 'Emergency Engineering'] },
  vehiclePreference: { type: 'array' }, status: { type: 'enum', values: ['Pending', 'Resources Allocated', 'Partially Allocated', 'In Progress', 'Fulfilled', 'Cancelled'], default: 'Pending' },
};
router.get('/requests', wrap(async (req, res) => { const a = await store.readData('emergencyRequests.json'); res.json(a.sort((x, y) => rank(x.priority) - rank(y.priority))); }));
router.post('/requests', ops, wrap(async (req, res) => {
  const v = validate(req.body, reqSchema); if (!v.ok) return bad(res, v);
  if (!(await store.readData('locations.json')).some((l) => l.id === v.data.locationId)) return res.status(400).json({ error: 'Unknown location' });
  const x = await store.create('emergencyRequests.json', 'REQ', { ...v.data, status: 'Pending', createdAt: new Date().toISOString(), simulation: true });
  await audit.log(req.user, 'Emergency request created', 'Requests', `${x.id}: ${x.priority}, ${x.peopleAffected} affected at ${x.locationId}`, { requestId: x.id, incidentId: x.incidentId });
  const out = await dispatch.autoDispatchRequest(x, req.user); // nearest warehouse -> truck -> safe route -> dispatch
  res.status(201).json({ request: await store.findById('emergencyRequests.json', x.id), ...out });
}));
router.put('/requests/:id', ops, wrap(async (req, res) => {
  const v = validate(req.body, reqSchema, { partial: true }); if (!v.ok) return bad(res, v);
  const x = await store.updateById('emergencyRequests.json', req.params.id, v.data); if (!x) return notFound(res, 'Request');
  await audit.log(req.user, 'Emergency request updated', 'Requests', `${x.id}: ${x.status}`, { requestId: x.id }); res.json(x);
}));

// ---------- roads ----------
router.get('/roads', wrap(async (req, res) => res.json((await store.readData('roads.json')).map(withDamage))));
const roadSchema = { damage: { type: 'number', min: 0, max: 100 }, floodDepth: { type: 'number', min: 0, max: 5 }, traffic: { type: 'number', min: 0, max: 10 }, blocked: { type: 'boolean' }, failureType: { type: 'string', max: 40 } };
router.put('/roads/:id', ops, wrap(async (req, res) => {
  const v = validate(req.body, roadSchema, { partial: true }); if (!v.ok) return bad(res, v);
  const out = await applyRoadChange(req.params.id, v.data.blocked === false ? { ...v.data, zoneIncidents: [] } : v.data, req.user, 'Road updated'); if (!out) return notFound(res, 'Road');
  res.json({ road: withDamage(out.road), affectedMissions: out.affected });
}));
router.post('/roads/:id/simulate-failure', ops, wrap(async (req, res) => {
  const v = validate(req.body, { failureType: { type: 'enum', values: ['Flooding', 'Structural Damage', 'Fire', 'Debris', 'Accident', 'Storm Surge'], default: 'Flooding' }, floodDepth: { type: 'number', min: 0, max: 5, default: 1.5 }, damage: { type: 'number', min: 0, max: 100, default: 90 }, blocked: { type: 'boolean', default: true } });
  if (!v.ok) return bad(res, v);
  const body = { failureType: v.data.failureType, floodDepth: v.data.floodDepth ?? 1.5, damage: v.data.damage ?? 90, blocked: req.body?.blocked === undefined ? true : v.data.blocked };
  const out = await applyRoadChange(req.params.id, body, req.user, 'Road failure simulated'); if (!out) return notFound(res, 'Road');
  res.json({ road: withDamage(out.road), affectedMissions: out.affected, message: out.affected.length ? out.affected.map((a) => a.message).join(' ') : 'Road updated. No active mission was using this road.' });
}));

// ---------- routing ----------
router.post('/routes/calculate', wrap(async (req, res) => {
  const v = validate(req.body, { sourceId: { type: 'string', required: true, max: 40 }, targetId: { type: 'string', required: true, max: 40 }, vehicleType: { type: 'string', max: 40 } }); if (!v.ok) return bad(res, v);
  const [locs, roads] = await Promise.all([store.readData('locations.json'), store.readData('roads.json')]);
  if (!locs.some((l) => l.id === v.data.sourceId) || !locs.some((l) => l.id === v.data.targetId)) return res.status(400).json({ error: 'Unknown source or destination' });
  res.json(analyseRoutes(locs, roads, v.data.sourceId, v.data.targetId, 'Relief Truck')); // every transport mission uses a truck
}));

// ---------- dispatch & missions ----------
router.post('/dispatch/plan', dispatchers, wrap(async (req, res) => {
  const r = await store.findById('emergencyRequests.json', req.body?.requestId); if (!r) return notFound(res, 'Request');
  res.json(await dispatch.planDispatch(r));
}));
const dispatchNow = wrap(async (req, res) => {
  const r = await store.findById('emergencyRequests.json', req.body?.requestId); if (!r) return notFound(res, 'Request');
  const out = await dispatch.autoDispatchRequest(r, req.user);
  out.dispatched ? res.status(201).json(out) : res.status(409).json({ error: out.plan.shortfalls[0]?.reason || out.plan.warnings[0] || 'Cannot dispatch yet', plan: out.plan });
});
router.post('/dispatch/commit', dispatchers, dispatchNow);
router.get('/missions', wrap(async (req, res) => res.json(await store.readData('missions.json'))));
router.get('/missions/:id', wrap(async (req, res) => { const x = await store.findById('missions.json', req.params.id); x ? res.json(x) : notFound(res, 'Mission'); }));
router.post('/missions', dispatchers, dispatchNow);
const MSTATUS = ['Planned', 'Resources Allocated', 'Dispatched', 'En Route', 'Route Recalculated', 'Arrived', 'Delivered', 'Completed', 'Cancelled'];
router.put('/missions/:id', anyField, wrap(async (req, res) => {
  const v = validate(req.body, { status: { type: 'enum', values: MSTATUS, required: true } }); if (!v.ok) return bad(res, v);
  res.json(await dispatch.setMissionStatus(req.params.id, v.data.status, req.user));
}));
router.post('/missions/:id/advance', anyField, wrap(async (req, res) => {
  const m = await store.findById('missions.json', req.params.id); if (!m) return notFound(res, 'Mission');
  const next = dispatch.NEXT[m.status]; if (!next) return res.status(409).json({ error: `Mission is already ${m.status}` });
  res.json(await dispatch.setMissionStatus(m.id, next, req.user));
}));
router.post('/missions/:id/step', anyField, wrap(async (req, res) => res.json(await dispatch.stepMission(req.params.id, req.user))));
router.post('/missions/:id/reroute', dispatchers, wrap(async (req, res) => {
  const m = await store.findById('missions.json', req.params.id); if (!m) return notFound(res, 'Mission');
  res.json(await recalcMission(m, null, req.user));
}));
router.post('/missions-release-all', dispatchers, wrap(async (req, res) => {
  const active = (await store.readData('missions.json')).filter((m) => !['Completed', 'Cancelled'].includes(m.status));
  for (const m of active) await dispatch.setMissionStatus(m.id, 'Cancelled', req.user);
  await audit.log(req.user, 'All active missions cancelled', 'Missions', `${active.length} mission(s) cancelled, vehicles freed and stock returned`);
  res.json({ cancelled: active.length });
}));
router.get('/missions/:id/timeline', wrap(async (req, res) => {
  const m = await store.findById('missions.json', req.params.id); if (!m) return notFound(res, 'Mission');
  const logs = (await store.readData('auditLogs.json')).filter((l) => l.refs && (l.refs.missionId === m.id || (!l.refs.missionId && (l.refs.requestId === m.requestId || (l.refs.incidentId && l.refs.incidentId === m.incidentId)))));
  res.json(logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
}));

// ---------- simulation ----------
router.get('/simulation/scenarios', (req, res) => res.json(scenarios.listScenarios()));
router.post('/simulation/run', ops, wrap(async (req, res) => res.json(await scenarios.runScenario(req.body?.scenario, req.user))));
router.post('/simulation/reset', requireRole(), wrap(async (req, res) => { await scenarios.resetAll(req.user); res.json({ reset: true }); }));

// ---------- audit ----------
router.get('/audit-logs', ops, wrap(async (req, res) => { const l = await store.readData('auditLogs.json'); res.json(l.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 500)); }));
module.exports = router;
