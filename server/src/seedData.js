// Demo / Simulation Data. NOT live government data.
const bcrypt = require('bcryptjs');
const { haversine } = require('./utils/geo');

const LOC = [
  ['velachery', 'Velachery', 12.9815, 80.218], ['pallikaranai', 'Pallikaranai', 12.93, 80.215],
  ['adyar', 'Adyar', 13.0067, 80.257], ['guindy', 'Guindy', 13.0067, 80.2206], ['saidapet', 'Saidapet', 13.0213, 80.2231],
  ['mambalam', 'Mambalam', 13.0368, 80.2176], ['nungambakkam', 'Nungambakkam', 13.0569, 80.2425],
  ['meenambakkam', 'Meenambakkam', 12.9941, 80.1709], ['tnagar', 'T. Nagar', 13.0418, 80.2341],
  ['annanagar', 'Anna Nagar', 13.085, 80.2101], ['perambur', 'Perambur', 13.1186, 80.2455], ['royapuram', 'Royapuram', 13.113, 80.295],
  ['tondiarpet', 'Tondiarpet', 13.126, 80.288], ['marina', 'Marina', 13.05, 80.2824], ['santhome', 'Santhome', 13.033, 80.279],
  ['besantnagar', 'Besant Nagar', 12.9992, 80.2667], ['thiruvanmiyur', 'Thiruvanmiyur', 12.983, 80.2594],
  ['sholinganallur', 'Sholinganallur', 12.901, 80.2279], ['porur', 'Porur', 13.0382, 80.1565], ['ambattur', 'Ambattur', 13.1143, 80.1548],
  ['tambaram', 'Tambaram', 12.9249, 80.1], ['mudichur', 'Mudichur', 12.904, 80.075],
];
const locations = LOC.map(([id, name, lat, lng]) => ({ id, name, lat, lng }));
const L = Object.fromEntries(locations.map((l) => [l.id, l]));

// from, to, damage, floodDepth(m), traffic(0-10)
const ROADS = [
  ['guindy', 'velachery', 10, 0.1, 7], ['guindy', 'saidapet', 0, 0, 6], ['guindy', 'meenambakkam', 0, 0, 3], ['guindy', 'adyar', 5, 0, 5],
  ['guindy', 'porur', 0, 0, 5], ['saidapet', 'mambalam', 0, 0, 6], ['saidapet', 'tnagar', 0, 0, 7], ['saidapet', 'adyar', 5, 0, 5],
  ['saidapet', 'velachery', 12, 0.1, 6], ['mambalam', 'tnagar', 0, 0, 7], ['mambalam', 'porur', 0, 0, 4], ['mambalam', 'annanagar', 0, 0, 5],
  ['tnagar', 'nungambakkam', 0, 0, 6], ['tnagar', 'santhome', 0, 0, 5], ['nungambakkam', 'annanagar', 0, 0, 5], ['nungambakkam', 'marina', 0, 0, 4],
  ['nungambakkam', 'perambur', 0, 0, 5], ['annanagar', 'perambur', 0, 0, 4], ['annanagar', 'ambattur', 0, 0, 4], ['ambattur', 'porur', 0, 0, 3],
  ['perambur', 'tondiarpet', 0, 0, 4], ['perambur', 'royapuram', 0, 0, 5], ['tondiarpet', 'royapuram', 0, 0, 5], ['royapuram', 'marina', 5, 0, 5],
  ['marina', 'santhome', 0, 0, 5], ['santhome', 'adyar', 8, 0, 5], ['adyar', 'besantnagar', 6, 0, 4], ['besantnagar', 'thiruvanmiyur', 0, 0, 4],
  ['adyar', 'thiruvanmiyur', 0, 0, 5], ['thiruvanmiyur', 'velachery', 15, 0.2, 6], ['thiruvanmiyur', 'sholinganallur', 10, 0, 4],
  ['velachery', 'pallikaranai', 30, 0.4, 6], ['pallikaranai', 'sholinganallur', 20, 0.3, 4], ['pallikaranai', 'tambaram', 10, 0.1, 4],
  ['velachery', 'tambaram', 5, 0, 5], ['meenambakkam', 'tambaram', 0, 0, 4], ['tambaram', 'mudichur', 0, 0, 3], ['meenambakkam', 'mudichur', 5, 0, 3],
  ['meenambakkam', 'velachery', 5, 0, 5], ['porur', 'meenambakkam', 0, 0, 4],
];
const roads = ROADS.map(([f, t, damage, floodDepth, traffic], i) => ({
  id: `R-${String(i + 1).padStart(3, '0')}`, name: `${L[f].name} - ${L[t].name}`, from: f, to: t,
  distanceKm: +(haversine(L[f].lat, L[f].lng, L[t].lat, L[t].lng) * 1.25 + 0.2).toFixed(2),
  damage, floodDepth, traffic, blocked: false, failureType: null, simulation: true,
}));

const warehouses = [
  { id: 'WH-001', name: 'Central Warehouse', nodeId: 'guindy' }, { id: 'WH-002', name: 'North Chennai Warehouse', nodeId: 'tondiarpet' },
  { id: 'WH-003', name: 'South Chennai Warehouse', nodeId: 'tambaram' }, { id: 'WH-004', name: 'Emergency Relief Store', nodeId: 'annanagar' },
].map((w) => ({ ...w, latitude: L[w.nodeId].lat, longitude: L[w.nodeId].lng, simulation: true }));

const resources = [
  { id: 'water', name: 'Drinking Water (1 L)', unit: 'bottles', weightKg: 1 },
  { id: 'food', name: 'Food Packets', unit: 'packets', weightKg: 0.5 },
  { id: 'medicalKits', name: 'Medical Kits', unit: 'kits', weightKg: 2 },
  { id: 'blankets', name: 'Blankets', unit: 'pcs', weightKg: 1.2 },
  { id: 'rescueEquipment', name: 'Rescue Equipment', unit: 'sets', weightKg: 8 },
  { id: 'firstAid', name: 'First Aid Kits', unit: 'kits', weightKg: 1 },
  { id: 'lights', name: 'Emergency Lights', unit: 'pcs', weightKg: 1.5 },
  { id: 'generators', name: 'Power Generators', unit: 'units', weightKg: 25 },
  { id: 'lifeJackets', name: 'Life Jackets', unit: 'pcs', weightKg: 1.5 },
];

const veh = (n, type, cap, node, status = 'Available') => ({ id: `V-${String(n).padStart(3, '0')}`, type, registration: `TN-01-DM-${1000 + n}`, capacityKg: cap, nodeId: node, status, assignedMission: null, simulation: true });
const vehicles = [
  veh(1, 'Relief Truck', 4000, 'guindy'), veh(2, 'Relief Truck', 4000, 'tondiarpet'), veh(3, 'Relief Truck', 3500, 'tambaram'),
  veh(4, 'Water Tanker', 6000, 'guindy'), veh(5, 'Water Tanker', 6000, 'annanagar'), veh(6, 'Ambulance', 300, 'adyar'),
  veh(7, 'Ambulance', 300, 'perambur'), veh(8, 'Rescue Van', 800, 'saidapet'), veh(9, 'Fire Engine', 600, 'guindy'),
  veh(10, 'Emergency Response Vehicle', 700, 'nungambakkam'), veh(11, 'Relief Truck', 4000, 'annanagar'), veh(12, 'Relief Truck', 3000, 'tambaram', 'Maintenance'), veh(13, 'Relief Truck', 4000, 'perambur'), veh(14, 'Relief Truck', 3500, 'mambalam'),
];

const team = (n, name, type, count, node) => ({ id: `T-${String(n).padStart(3, '0')}`, name, type, personnel: count, nodeId: node, availability: 'Available', assignedMission: null, simulation: true });
const rescueTeams = [
  team(1, 'Medical Response Alpha', 'Medical', 12, 'adyar'), team(2, 'Fire & Rescue Unit 1', 'Fire & Rescue', 18, 'guindy'),
  team(3, 'Flood Rescue South', 'Flood Rescue', 15, 'saidapet'), team(4, 'Flood Rescue North', 'Flood Rescue', 14, 'tondiarpet'),
  team(5, 'Search & Rescue Unit', 'Search & Rescue', 20, 'annanagar'), team(6, 'Emergency Engineering Crew', 'Emergency Engineering', 10, 'mambalam'),
  team(7, 'Medical Response Bravo', 'Medical', 8, 'tambaram'),
];

const hosp = (n, name, node) => ({ id: `H-${String(n).padStart(3, '0')}`, name, nodeId: node, latitude: L[node].lat + 0.003, longitude: L[node].lng + 0.003, simulation: true });
const hospitals = [
  hosp(1, 'North Chennai General Hospital (Demo)', 'royapuram'), hosp(2, 'Adyar Coastal Hospital (Demo)', 'adyar'), hosp(3, 'Guindy Trauma Centre (Demo)', 'guindy'),
  hosp(4, 'Anna Nagar Medical Centre (Demo)', 'annanagar'), hosp(5, 'Tambaram Community Hospital (Demo)', 'tambaram'), hosp(6, 'Velachery Flood Response Clinic (Demo)', 'velachery'),
];

const shel = (n, name, node) => ({ id: `S-${String(n).padStart(3, '0')}`, name, nodeId: node, latitude: L[node].lat - 0.003, longitude: L[node].lng - 0.002, simulation: true });
const shelters = [
  shel(1, 'Besant Nagar Community Hall (Demo)', 'besantnagar'), shel(2, 'Velachery School Shelter (Demo)', 'velachery'), shel(3, 'Pallikaranai Relief Camp (Demo)', 'pallikaranai'),
  shel(4, 'Tondiarpet Hall (Demo)', 'tondiarpet'), shel(5, 'Anna Nagar Indoor Stadium (Demo)', 'annanagar'), shel(6, 'Tambaram Relief Camp (Demo)', 'tambaram'),
  shel(7, 'Thiruvanmiyur Hall (Demo)', 'thiruvanmiyur'), shel(8, 'Saidapet Community Centre (Demo)', 'saidapet'), shel(9, 'Meenambakkam Hall (Demo)', 'meenambakkam'),
];

const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
const incidents = [
  { id: 'INC-001', disasterType: 'Extreme Rainfall', locationId: 'pallikaranai', location: 'Pallikaranai', latitude: L.pallikaranai.lat, longitude: L.pallikaranai.lng, severity: 'High', description: 'Waterlogging reported on arterial roads (demo risk profile).', reportedAt: ago(95), status: 'Active', simulation: true },
  { id: 'INC-002', disasterType: 'Major Road Accident', locationId: 'guindy', location: 'Guindy', latitude: L.guindy.lat, longitude: L.guindy.lng, severity: 'Medium', description: 'Multi-vehicle collision near industrial estate (simulation).', reportedAt: ago(40), status: 'Verified', simulation: true },
  { id: 'INC-003', disasterType: 'Fire', locationId: 'ambattur', location: 'Ambattur', latitude: L.ambattur.lat, longitude: L.ambattur.lng, severity: 'Low', description: 'Warehouse fire contained (simulation).', reportedAt: ago(300), status: 'Resolved', simulation: true },
];
const emergencyRequests = [
  { id: 'REQ-001', incidentId: 'INC-001', locationId: 'pallikaranai', priority: 'High', peopleAffected: 400, waterRequired: 1200, foodRequired: 800, medicalKitsRequired: 40, rescuePersonnelRequired: 0, specialRequirements: 'Dry rations for elderly', status: 'Pending', createdAt: ago(80), simulation: true },
  { id: 'REQ-002', incidentId: 'INC-002', locationId: 'guindy', priority: 'Critical', peopleAffected: 12, waterRequired: 0, foodRequired: 0, medicalKitsRequired: 20, rescuePersonnelRequired: 6, specialRequirements: 'Trauma response, hospital transfer', teamType: 'Medical', status: 'Pending', createdAt: ago(35), simulation: true },
  { id: 'REQ-003', incidentId: 'INC-001', locationId: 'velachery', priority: 'Low', peopleAffected: 60, waterRequired: 300, foodRequired: 0, medicalKitsRequired: 0, rescuePersonnelRequired: 0, specialRequirements: 'General supply request', status: 'Pending', createdAt: ago(20), simulation: true },
];

const users = [
  ['USR-001', 'Admin', 'admin@cdiers.local', 'Admin@123', 'Admin'],
  ['USR-002', 'Command Operator', 'operator@cdiers.local', 'Operator@123', 'Command Center Operator'],
  ['USR-003', 'Dispatcher', 'dispatcher@cdiers.local', 'Dispatch@123', 'Dispatcher'],
  ['USR-004', 'Field Responder', 'responder@cdiers.local', 'Responder@123', 'Field Responder'],
];
function build() {
  const { computeZone, OPEN_STATUSES } = require('./utils/zone');
  const roadsC = JSON.parse(JSON.stringify(roads)), incC = JSON.parse(JSON.stringify(incidents));
  incC.forEach((i) => {
    i.evacuation = null; i.zone = null;
    if (OPEN_STATUSES.includes(i.status)) {
      i.zone = computeZone(i, locations, roadsC);
      roadsC.forEach((r) => { if (i.zone.roadIds.includes(r.id)) { r.blocked = true; r.failureType = 'Disaster zone'; r.zoneIncidents = [i.id]; } });
    }
  });
  return {
    'users.json': users.map(([id, name, email, pw, role]) => ({ id, name, email, role, passwordHash: bcrypt.hashSync(pw, 10) })),
    'locations.json': locations, 'roads.json': roadsC, 'incidents.json': incC, 'resources.json': resources,
    'warehouses.json': warehouses, 'hospitals.json': hospitals, 'shelters.json': shelters, 'vehicles.json': vehicles,
    'rescueTeams.json': rescueTeams, 'emergencyRequests.json': emergencyRequests, 'missions.json': [],
    'auditLogs.json': [{ id: 'LOG-001', timestamp: new Date().toISOString(), user: 'SYSTEM', role: 'System', action: 'Seeded demo data', module: 'System', description: 'Demo / Simulation Data loaded', refs: {} }],
  };
}
module.exports = { build };
