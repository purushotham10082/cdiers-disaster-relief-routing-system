const store = require('../utils/jsonStore');
const audit = require('./audit');
const { blockZone, releaseZone } = require('./roadService');
const { dispatchEvacuation } = require('./dispatchService');
const { OPEN_STATUSES } = require('../utils/zone');

/** Incident occurs -> identify zone -> disable roads inside it -> re-route missions -> dispatch evacuation truck. */
async function createIncident(data, actor, { autoEvacuate = true } = {}) {
  const loc = (await store.readData('locations.json')).find((l) => l.id === data.locationId);
  if (!loc) throw Object.assign(new Error('Unknown location'), { status: 400 });
  let incident = await store.create('incidents.json', 'INC', { ...data, location: loc.name, latitude: data.latitude ?? loc.lat, longitude: data.longitude ?? loc.lng, reportedAt: new Date().toISOString(), zone: null, evacuation: null, simulation: true });
  await audit.log(actor, 'Incident created', 'Incidents', `${incident.id}: ${incident.disasterType} in ${incident.location} (${incident.severity})`, { incidentId: incident.id });
  let zoneInfo = null, evacuation = null;
  if (OPEN_STATUSES.includes(incident.status)) {
    zoneInfo = await blockZone(incident, actor);
    incident = await store.findById('incidents.json', incident.id);
    if (autoEvacuate) { evacuation = await dispatchEvacuation(incident, actor); incident = await store.findById('incidents.json', incident.id); }
  }
  return { incident, zone: zoneInfo, evacuation };
}
/** Keep the zone in step with severity / status / location edits. */
async function syncIncident(incident, actor) {
  if (OPEN_STATUSES.includes(incident.status)) return blockZone(incident, actor);
  if (incident.zone) await releaseZone(incident.id, actor);
  return null;
}
async function removeIncident(id, actor) {
  const inc = await store.findById('incidents.json', id);
  if (!inc) return false;
  if (inc.zone) await releaseZone(id, actor);
  return store.deleteById('incidents.json', id);
}
module.exports = { createIncident, syncIncident, removeIncident };
