// End-to-end self test on a temporary data folder.
const os = require('os'), path = require('path'), fs = require('fs');
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cdiers-'));
const app = require('./index');
const { seedAll } = require('./seed');
let pass = 0, fail = 0, token, base;
const ok = (c, m) => { c ? pass++ : (fail++, console.log('  FAIL:', m)); if (c) console.log('  ok  :', m); };
async function api(method, url, body, tok = token) {
  const r = await fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = await r.json(); } catch {} return { s: r.status, j };
}
(async () => {
  await seedAll(true);
  const srv = app.listen(0); base = `http://localhost:${srv.address().port}/api`;
  ok((await api('GET', '/dashboard', null, null)).s === 401, 'protected route rejects anonymous');
  const l = await api('POST', '/auth/login', { email: 'admin@cdiers.local', password: 'Admin@123' }, null);
  token = l.j.token; ok(!!token && !JSON.stringify(l.j).includes('passwordHash'), 'login works, no hash leaked');
  const rl = (await api('POST', '/auth/login', { email: 'responder@cdiers.local', password: 'Responder@123' }, null)).j.token;
  ok((await api('POST', '/incidents', { disasterType: 'Flood', locationId: 'velachery', severity: 'High' }, rl)).s === 403, 'responder cannot create incidents (RBAC)');

  // ---- removed features
  ok((await api('PUT', '/vehicles/V-001', { status: 'Maintenance' })).s === 404, 'vehicle status editing removed');
  ok((await api('PUT', '/hospitals/H-001', { status: 'Full' })).s === 404 && (await api('PUT', '/shelters/S-001', { status: 'Full' })).s === 404, 'hospital / shelter status editing removed');
  ok((await api('GET', '/resources')).s === 404 && (await api('PUT', '/resources/water', { warehouseId: 'WH-001', delta: 5 })).s === 404, 'stock management removed');
  const wh = (await api('GET', '/warehouses')).j; ok(wh.length === 4 && !wh[0].inventory, 'warehouses are plain collection points (no inventory)');
  const hs = (await api('GET', '/hospitals')).j[0], ss = (await api('GET', '/shelters')).j[0];
  ok(!('availableBeds' in hs) && !('status' in hs) && !('capacity' in ss) && !('availableCapacity' in ss), 'hospitals / shelters are location points only');

  // ---- incident -> zone -> roads disabled -> evacuation truck
  const roads0 = (await api('GET', '/roads')).j;
  const inc = await api('POST', '/incidents', { disasterType: 'Flood', locationId: 'velachery', severity: 'Critical', description: 'Major flood <b>' });
  ok(inc.s === 201 && inc.j.zone && inc.j.zone.radiusKm === 6, `disaster zone identified (${inc.j.zone && inc.j.zone.radiusKm} km, ${inc.j.zone && inc.j.zone.nodeIds.length} locations)`);
  const roads1 = (await api('GET', '/roads')).j;
  const zoneRoads = roads1.filter((r) => r.blocked && r.zoneIncidents.includes(inc.j.id));
  ok(zoneRoads.length >= 3 && zoneRoads.length === inc.j._zone.roadsDisabled, `roads inside the zone disabled automatically: ${zoneRoads.map((r) => r.name).join('; ')}`);
  ok(!zoneRoads.some((r) => r.from === 'velachery' || r.to === 'velachery'), 'access roads to the emergency location stay open');
  ok(inc.j._evacuation.dispatched && inc.j._evacuation.mission.type === 'Evacuation', `evacuation truck dispatched to ${inc.j._evacuation.destination.kind} ${inc.j._evacuation.destination.name}`);
  const ev = inc.j._evacuation.mission;
  ok(ev.status === 'Dispatched' && ev.route.nodes[ev.pickupIndex] === 'velachery' && ev.route.nodes.at(-1) === ev.destinationNodeId, `evacuation route: ${ev.route.nodes.join('>')}`);
  const zset = new Set(inc.j.zone.nodeIds);
  ok(!zset.has(ev.destinationNodeId), 'evacuation destination is outside the disaster zone (safe)');
  ok(ev.route.roadIds.every((id) => !zoneRoads.some((z) => z.id === id)), 'evacuation route avoids disabled zone roads');
  const calc = (await api('POST', '/routes/calculate', { sourceId: 'tondiarpet', targetId: 'velachery', vehicleType: 'Ambulance' })).j;
  ok(calc.found && calc.safe.roadIds.every((id) => !zoneRoads.some((z) => z.id === id)), 'route optimisation uses only remaining safe roads (truck assumed)');

  // ---- emergency request -> automatic dispatch
  const rq = await api('POST', '/requests', { incidentId: inc.j.id, locationId: 'velachery', priority: 'Critical', peopleAffected: 250, waterRequired: 3000, foodRequired: 1500, medicalKitsRequired: 50, rescuePersonnelRequired: 10 });
  ok(rq.s === 201 && rq.j.dispatched && rq.j.missions.length >= 1, `request auto-dispatched ${rq.j.missions.length} truck mission(s) without manual vehicle selection`);
  ok(rq.j.missions.every((m) => m.status === 'Dispatched' && ['Relief Truck', 'Water Tanker'].includes((rq.j.plan.tasks.find((t) => t.vehicleId === m.vehicleId) || {}).vehicleType)), 'all supply missions use trucks and are dispatched');
  ok(rq.j.plan.tasks.every((t) => t.weightKg <= t.capacityKg), 'truck capacity respected');
  ok(new Set(rq.j.plan.tasks.map((t) => t.warehouseId)).size === 1 && !!rq.j.plan.warehouse, `all resources from ONE nearest warehouse: ${rq.j.plan.warehouse.name}`);
  const sup = rq.j.missions.find((m) => m.type === 'Supply');
  ok(sup.route.nodes.at(-1) === 'velachery', 'supply route ends at the emergency location');
  ok(rq.j.missions.some((m) => m.teamId), 'rescue team assigned and dispatched');

  // ---- road failure on an active mission -> A* reroute
  const target = rq.j.missions.find((m) => m.route.roadIds.length >= 2) || sup;
  const first = target.route.roadIds[0];
  const f = await api('POST', `/roads/${first}/simulate-failure`, { failureType: 'Flooding', floodDepth: 1.5 });
  const m2 = (await api('GET', `/missions/${target.id}`)).j;
  ok(f.s === 200 && !m2.route.roadIds.includes(first) && m2.routeHistory.length >= 1, 'road failure -> A* re-routes active mission');
  let g = 0, cur = m2; while (cur.status !== 'Arrived' && g++ < 40) cur = (await api('POST', `/missions/${target.id}/step`)).j;
  ok(cur.status === 'Arrived', 'truck moved along route and arrived');
  ok((await api('POST', `/missions/${target.id}/advance`)).j.status === 'Delivered' && (await api('POST', `/missions/${target.id}/advance`)).j.status === 'Completed', 'delivered and completed');
  const tl = (await api('GET', `/missions/${target.id}/timeline`)).j; ok(tl.length >= 6, `timeline has ${tl.length} events`);

  // ---- truck shortage: request waits, then is dispatched automatically when a truck frees up
  await api('POST', '/missions-release-all');
  let waiting = null;
  for (let i = 0; i < 12 && !waiting; i++) { const r = (await api('POST', '/requests', { locationId: 'tnagar', priority: 'High', waterRequired: 9000, foodRequired: 3000 })).j; if (!r.dispatched) waiting = r; }
  ok(!!waiting && waiting.request.status === 'Pending' && waiting.request.dispatchNote, `with no free truck the request waits: ${waiting && waiting.request.dispatchNote}`);
  let after = null, n = 0;
  for (const mm of (await api('GET', '/missions')).j.filter((m) => !['Completed', 'Cancelled'].includes(m.status))) {
    for (const st of ['Arrived', 'Delivered', 'Completed']) await api('PUT', `/missions/${mm.id}`, { status: st });
    after = (await api('GET', '/requests')).j.find((r) => r.id === waiting.request.id); n++;
    if (after.status !== 'Pending') break;
  }
  ok(after && after.status !== 'Pending', `waiting request auto-dispatched once trucks freed (after ${n} completed missions, now ${after && after.status})`);

  // ---- no route handling
  await api('POST', '/missions-release-all');
  for (const r of (await api('GET', '/roads')).j.filter((r) => r.from === 'mudichur' || r.to === 'mudichur')) await api('PUT', `/roads/${r.id}`, { blocked: true });
  const nr = (await api('POST', '/routes/calculate', { sourceId: 'guindy', targetId: 'mudichur' })).j;
  ok(nr.found === false && /No safe route/.test(nr.message) && nr.suggestions.length > 0, 'no-route handled gracefully with suggestions');

  // ---- closing the incident re-opens zone roads
  const inc2 = await api('PUT', `/incidents/${inc.j.id}`, { status: 'Resolved' });
  const roads2 = (await api('GET', '/roads')).j;
  ok(inc2.s === 200 && roads2.filter((r) => (r.zoneIncidents || []).includes(inc.j.id)).length === 0, 'resolving the incident re-opens its zone roads');

  // ---- scenarios
  await api('POST', '/missions-release-all');
  for (const id of ['velachery-flood', 'pallikaranai-flood', 'coastal-cyclone', 'industrial-guindy']) {
    await api('POST', '/simulation/reset');
    const sc = await api('POST', '/simulation/run', { scenario: id });
    ok(sc.s === 200 && sc.j.incident.zone && sc.j.evacuation && sc.j.missions.length >= 1, `${id}: zone + evacuation(${sc.j.evacuation && sc.j.evacuation.dispatched}) + ${sc.j.missions.length} request mission(s)`);
    if (id === 'industrial-guindy') ok(sc.j.missions.some((x) => x.vehicleId === 'V-009') && sc.j.evacuation.destination.kind === 'Hospital', 'industrial: fire engine dispatched, evacuation goes to a hospital');
    if (id === 'coastal-cyclone') ok(sc.j.evacuation.destination.kind === 'Shelter', 'cyclone: evacuation goes to a shelter');
  }
  ok((await api('GET', '/audit-logs')).j.length > 10, 'audit logs recorded');
  fs.writeFileSync(path.join(process.env.DATA_DIR, 'shelters.json'), '');
  ok((await api('GET', '/shelters')).s === 200, 'empty JSON file handled');
  console.log(`\n${pass} passed, ${fail} failed`); srv.close(); process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
