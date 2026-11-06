// Disaster zone: a circle around the incident. Roads fully inside the circle are disabled,
// EXCEPT roads that touch the incident location itself: those stay open as the access corridor so
// rescue/relief trucks can still reach (and leave) the emergency location.
const { haversine } = require('./geo');
const ZONE_KM = { Critical: 6, High: 4, Medium: 3, Low: 2 };
function computeZone(incident, locs, roads) {
  const radiusKm = ZONE_KM[incident.severity] || 2.5;
  const nodeIds = locs.filter((l) => haversine(incident.latitude, incident.longitude, l.lat, l.lng) <= radiusKm).map((l) => l.id);
  const inside = new Set(nodeIds);
  const noRoadDamage = incident.disasterType === 'Heat Wave'; // heat waves do not damage roads
  const roadIds = noRoadDamage ? [] : roads.filter((r) => inside.has(r.from) && inside.has(r.to) && r.from !== incident.locationId && r.to !== incident.locationId).map((r) => r.id);
  return { radiusKm, centerNodeId: incident.locationId, nodeIds, roadIds };
}
const OPEN_STATUSES = ['Reported', 'Verified', 'Active', 'Under Response'];
module.exports = { computeZone, ZONE_KM, OPEN_STATUSES };
