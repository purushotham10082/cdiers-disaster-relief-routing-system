const store = require('../utils/jsonStore');
const audit = require('./audit');
const { autoDispatchRequest } = require('./dispatchService');
const incidentsSvc = require('./incidentService');
const { applyRoadChange } = require('./roadService');

// Demo / Simulation scenarios (not live measurements)
const SCENARIOS = {
  'velachery-flood': { name: 'Velachery Flood', summary: 'Major flood, 2,500 people affected. Water stock must be combined from several warehouses.',
    incident: { disasterType: 'Flood', locationId: 'velachery', severity: 'Critical', description: 'Demo risk profile: major flood in Velachery (simulation).' },
    request: { priority: 'Critical', peopleAffected: 2500, waterRequired: 5000, foodRequired: 2500, medicalKitsRequired: 150, rescuePersonnelRequired: 14, teamType: 'Flood Rescue', specialRequirements: 'Drinking water, food, medical kits, flood rescue team' },
    roads: [['velachery', 'pallikaranai', { floodDepth: 0.9, damage: 55, traffic: 8 }], ['thiruvanmiyur', 'velachery', { floodDepth: 0.6, damage: 35, traffic: 8 }], ['guindy', 'velachery', { floodDepth: 0.3, damage: 25, traffic: 8 }]] },
  'pallikaranai-flood': { name: 'Pallikaranai Flood', summary: 'Marsh-area waterlogging with severely flooded southern roads.',
    incident: { disasterType: 'Flood', locationId: 'pallikaranai', severity: 'High', description: 'Demo risk profile: waterlogging in Pallikaranai (simulation).' },
    request: { priority: 'High', peopleAffected: 1200, waterRequired: 3000, foodRequired: 1500, medicalKitsRequired: 80, rescuePersonnelRequired: 10, teamType: 'Flood Rescue', specialRequirements: 'Waterlogged streets, boats not modelled' },
    roads: [['velachery', 'pallikaranai', { floodDepth: 1.1, damage: 65, traffic: 7 }], ['pallikaranai', 'sholinganallur', { floodDepth: 0.8, damage: 50, traffic: 6 }]] },
  'coastal-cyclone': { name: 'Coastal Cyclone (Besant Nagar / Adyar)', summary: 'Evacuation request, shelter and medical need, blocked coastal roads.',
    incident: { disasterType: 'Cyclone', locationId: 'besantnagar', severity: 'Critical', description: 'Demo risk profile: cyclone landfall with storm surge near Besant Nagar / Adyar (simulation).' },
    request: { priority: 'Critical', peopleAffected: 1800, waterRequired: 2500, foodRequired: 1800, medicalKitsRequired: 120, rescuePersonnelRequired: 12, teamType: 'Flood Rescue', specialRequirements: 'Evacuation to shelter, medical support, blankets' }, evacuation: true,
    roads: [['santhome', 'adyar', { blocked: true, damage: 85, floodDepth: 1.2, failureType: 'Storm surge' }], ['adyar', 'besantnagar', { damage: 55, floodDepth: 0.5, traffic: 8 }]] },
  'industrial-guindy': { name: 'Industrial Emergency (Guindy)', summary: 'Fire / chemical emergency with fire engine and medical response.',
    incident: { disasterType: 'Industrial Accident', locationId: 'guindy', severity: 'High', description: 'Demo risk profile: industrial fire in Guindy estate (simulation).' },
    request: { priority: 'Critical', peopleAffected: 60, waterRequired: 0, foodRequired: 0, medicalKitsRequired: 60, rescuePersonnelRequired: 12, teamType: 'Fire & Rescue', vehiclePreference: ['Fire Engine'], specialRequirements: 'Fire suppression, hazmat, trauma care' },
    roads: [['guindy', 'saidapet', { damage: 20, traffic: 9 }]] },
};
const listScenarios = () => Object.entries(SCENARIOS).map(([id, s]) => ({ id, name: s.name, summary: s.summary, location: s.incident.locationId, disasterType: s.incident.disasterType }));

async function runScenario(id, actor) {
  const sc = SCENARIOS[id];
  if (!sc) throw Object.assign(new Error('Unknown scenario'), { status: 404 });
  const roads = await store.readData('roads.json');
  const roadEffects = [];
  for (const [a, b, patch] of sc.roads) {
    const r = roads.find((x) => (x.from === a && x.to === b) || (x.from === b && x.to === a));
    if (r) { const out = await applyRoadChange(r.id, patch, actor, 'Road degraded by scenario'); roadEffects.push({ roadId: r.id, name: r.name, ...patch, affected: out.affected }); }
  }
  // incident -> disaster zone -> roads disabled -> evacuation truck dispatched
  const created = await incidentsSvc.createIncident({ ...sc.incident, status: 'Active' }, actor, { autoEvacuate: true });
  const incident = created.incident;
  await audit.log(actor, 'Scenario started', 'Simulation', `${sc.name} (Simulation Data)`, { incidentId: incident.id });
  // emergency request -> nearest warehouse -> truck -> safe route -> dispatch
  const request = await store.create('emergencyRequests.json', 'REQ', { incidentId: incident.id, locationId: incident.locationId, ...sc.request, status: 'Pending', createdAt: new Date().toISOString(), simulation: true });
  await audit.log(actor, 'Emergency request created', 'Requests', `${request.id}: ${request.priority}, ${request.peopleAffected} people affected`, { incidentId: incident.id, requestId: request.id });
  const out = await autoDispatchRequest(request, actor);
  return { scenario: sc.name, incident, zone: created.zone && { radiusKm: created.zone.zone.radiusKm, roadsDisabled: created.zone.newlyBlocked.length }, evacuation: created.evacuation, request: await store.findById('emergencyRequests.json', request.id), roadEffects, plan: out.plan, missions: out.missions };
}
async function resetAll(actor) {
  const { seedAll } = require('../seed');
  await seedAll(true);
  await audit.log(actor, 'Demo data reset', 'System', 'All JSON data files were reset to Demo / Simulation Data');
}
module.exports = { listScenarios, runScenario, resetAll };
