const store = require('../utils/jsonStore');
const SYSTEM = { name: 'SYSTEM', role: 'System' };
// refs: { missionId, incidentId, requestId } -> used to build per-mission operation timelines
async function log(user, action, module, description, refs = {}) {
  const u = user || SYSTEM;
  try {
    return await store.create('auditLogs.json', 'LOG', { timestamp: new Date().toISOString(), user: u.name, role: u.role, action, module, description, refs });
  } catch (e) { console.error('audit failed', e.message); }
}
module.exports = { log };
