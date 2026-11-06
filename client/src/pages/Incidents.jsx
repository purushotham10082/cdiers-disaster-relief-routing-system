import React, { useState } from 'react';
import { Eye, Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { api } from '../api.js';
import { useAction, useData } from '../data.jsx';
import { Alert, Badge, Chips, DISASTERS, Field, Modal, Page, PRIORITIES, Table, when } from '../components/ui.jsx';

const STATUSES = ['Reported', 'Verified', 'Active', 'Under Response', 'Resolved', 'Closed'];
export default function Incidents({ user }) {
  const { d, name } = useData(); const act = useAction();
  const canEdit = ['Admin', 'Command Center Operator'].includes(user.role);
  const [form, setForm] = useState(null), [view, setView] = useState(null), [fs, setFs] = useState('All'), [q, setQ] = useState('');
  const rows = d.incidents.filter((x) => (fs === 'All' || x.status === fs) && (`${x.id} ${x.disasterType} ${x.location} ${x.description}`).toLowerCase().includes(q.toLowerCase()));
  const save = async () => {
    const body = { disasterType: form.disasterType, locationId: form.locationId, severity: form.severity, status: form.status, description: form.description };
    if (!form.id) body.autoEvacuate = form.autoEvacuate !== false;
    const r = await act(() => (form.id ? api('PUT', `/incidents/${form.id}`, body) : api('POST', '/incidents', body)), (x) => (form.id ? 'Incident updated' : `Incident created. Zone ${x._zone?.radiusKm ?? '-'} km, ${x._zone?.roadsDisabled ?? 0} road(s) disabled. ${x._evacuation?.dispatched ? `Evacuation truck sent to ${x._evacuation.destination.name}` : x._evacuation ? 'Evacuation waiting: ' + x._evacuation.reason : ''}`));
    if (r) setForm(null);
  };
  const blank = { disasterType: 'Flood', locationId: 'velachery', severity: 'High', status: 'Reported', description: '' };
  return (
    <Page title="Incident Management" sub="Every incident is stored in data/incidents.json and appears on the map." actions={canEdit && <button className="btn" onClick={() => setForm(blank)}><Plus size={16} />Create incident</button>}>
      <div className="card"><div className="toolbar"><input placeholder="Search incidents..." value={q} onChange={(e) => setQ(e.target.value)} /><Chips options={['All', ...STATUSES]} value={fs} onChange={setFs} /></div><Table rows={rows} empty="No incidents match. Create one to see it on the map." onRow={setView} cols={[
        { h: 'ID', r: (i) => <b>{i.id}</b> }, { h: 'Disaster', r: (i) => i.disasterType }, { h: 'Location', r: (i) => i.location }, { h: 'Lat / Lng', r: (i) => <span className="mono muted">{i.latitude.toFixed(3)}, {i.longitude.toFixed(3)}</span> },
        { h: 'Severity', r: (i) => <Badge>{i.severity}</Badge> }, { h: 'Status', r: (i) => <Badge>{i.status}</Badge> }, { h: 'Reported', r: (i) => when(i.reportedAt) },
        { h: 'Actions', r: (i) => (<div className="row" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="View" onClick={() => setView(i)}><Eye size={16} /></button>
          {canEdit && !['Resolved', 'Closed'].includes(i.status) && <button className="icon-btn" title="Dispatch evacuation truck" onClick={() => act(() => api('POST', `/incidents/${i.id}/evacuate`), (x) => `Evacuation truck dispatched to ${x.destination.name}`)}><Truck size={16} /></button>}
          {canEdit && <button className="icon-btn" title="Edit" onClick={() => setForm({ ...i })}><Pencil size={16} /></button>}
          {user.role === 'Admin' && <button className="icon-btn" title="Delete" onClick={() => window.confirm(`Delete ${i.id}?`) && act(() => api('DELETE', `/incidents/${i.id}`), 'Incident deleted')}><Trash2 size={16} /></button>}</div>) },
      ]} /></div>
      {form && <Modal title={form.id ? `Edit ${form.id}` : 'Create incident'} onClose={() => setForm(null)}>
        <div className="form-grid">
          <Field label="Disaster type"><select value={form.disasterType} onChange={(e) => setForm({ ...form, disasterType: e.target.value })}>{DISASTERS.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Location"><select value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>{d.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Severity"><select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select></Field>
          <Field label="Status"><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></Field>
        </div>
        <Field label="Description"><textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        {!form.id && <label className="row" style={{ gap: 6, marginBottom: 8 }}><input type="checkbox" style={{ width: 'auto' }} checked={form.autoEvacuate !== false} onChange={(e) => setForm({ ...form, autoEvacuate: e.target.checked })} />Automatically dispatch an evacuation truck to the nearest safe shelter or hospital</label>}
        <p className="muted">Saving identifies the disaster zone (size depends on severity) and disables the roads inside it. Latitude and longitude come from the selected location.</p>
        <button className="btn" onClick={save}>Save incident</button>
      </Modal>}
      {view && <Modal title={`${view.id} - ${view.disasterType}`} onClose={() => setView(null)}><dl className="kv">
        <dt>Location</dt><dd>{view.location} ({name(view.locationId)})</dd><dt>Coordinates</dt><dd>{view.latitude}, {view.longitude}</dd><dt>Severity</dt><dd><Badge>{view.severity}</Badge></dd>
        <dt>Status</dt><dd><Badge>{view.status}</Badge></dd><dt>Reported</dt><dd>{when(view.reportedAt)}</dd><dt>Description</dt><dd>{view.description || '-'}</dd></dl>
        {view.zone ? <Alert tone="red"><b>Disaster zone:</b> {view.zone.radiusKm} km radius, {view.zone.nodeIds.length} locations inside, {view.zone.roadIds.length} road(s) disabled. Roads touching the emergency location stay open so trucks can reach it.</Alert> : <p className="muted">No active disaster zone.</p>}
        {view.evacuation && <Alert tone={view.evacuation.status === 'Dispatched' ? 'green' : 'amber'}>{view.evacuation.status === 'Dispatched' ? `Evacuation ${view.evacuation.missionId}: truck carrying people to ${view.evacuation.destination.name}` : `Evacuation waiting: ${view.evacuation.reason}`}</Alert>}
        <p className="muted">Requests for this incident: {d.emergencyRequests.filter((r) => r.incidentId === view.id).map((r) => r.id).join(', ') || 'none'}</p></Modal>}
    </Page>
  );
}
