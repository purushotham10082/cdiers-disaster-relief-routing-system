import React, { useState } from 'react';
import { Plus, Send } from 'lucide-react';
import { api } from '../api.js';
import { useAction, useData } from '../data.jsx';
import { Alert, Badge, Card, Chips, Field, Modal, Page, PRIORITIES, RES_LABEL, Table } from '../components/ui.jsx';
import MapView, { RoadLegend } from '../components/MapView.jsx';
import { Link } from 'react-router-dom';

const blank = (d) => ({ incidentId: d.incidents[0]?.id || '', locationId: 'velachery', priority: 'Critical', peopleAffected: 250, waterRequired: 1000, foodRequired: 500, medicalKitsRequired: 50, rescuePersonnelRequired: 10, specialRequirements: '' });
export function PlanView({ plan }) {
  const { name } = useData();
  return (
    <div>
      {plan.tasks.length === 0 && (
        <Alert tone="red"><b>No route to show because no truck could be assigned.</b>
          {plan.busyVehicles?.length > 0 ? <ul>{plan.busyVehicles.map((v) => <li key={v.id}>{v.id} {v.type}: {v.mission ? `assigned to ${v.mission}` : v.status}</li>)}</ul> : null}
          <div>Finish or cancel old missions in <Link to="/missions">Relief Missions</Link> (use "Cancel all active missions" to free every vehicle and return stock), then plan again.</div></Alert>)}
      {plan.warnings.map((w, i) => <Alert key={i} tone="amber">{w}</Alert>)}
      {plan.shortfalls.length > 0 && <Alert tone="red"><b>Shortfalls</b><ul>{plan.shortfalls.map((s, i) => <li key={i}>{RES_LABEL[s.resource] || s.resource}: {s.missing} missing - {s.reason}</li>)}</ul></Alert>}
      {plan.suggestions.length > 0 && <Alert tone="blue"><b>Suggestions</b><ul>{plan.suggestions.map((s) => <li key={s}>{s}</li>)}</ul></Alert>}
      {plan.allocation.length > 0 && <Card title={plan.warehouse ? `Resources collected from the nearest warehouse: ${plan.warehouse.name}` : 'Resources'}><Table rows={plan.allocation.map((a) => ({ ...a, id: a.resource }))} cols={[
        { h: 'Resource', r: (a) => RES_LABEL[a.resource] }, { h: 'Required', r: (a) => a.required },
        { h: 'Collected from', r: (a) => a.parts.map((p) => p.warehouseName).join(', ') }]} /></Card>}
      <Card title={`Dispatch tasks (${plan.tasks.length})`}><Table rows={plan.tasks.map((t, i) => ({ ...t, id: i }))} empty="No dispatch task can be created." cols={[
        { h: 'Type', r: (t) => t.type }, { h: 'From', r: (t) => t.warehouseName || name(t.sourceNodeId) + ' (vehicle base)' }, { h: 'Truck', r: (t) => `${t.vehicleId} ${t.vehicleType}` },
        { h: 'Truck to warehouse', r: (t) => (t.pickupKm ? `${t.pickupKm} km from ${name(t.vehicleStartNodeId)}` : 'At warehouse') },
        { h: 'Load / capacity', r: (t) => `${t.weightKg} / ${t.capacityKg} kg` }, { h: 'Items', r: (t) => t.items.map((i) => `${i.qty} ${RES_LABEL[i.resource]}`).join(', ') || (t.team ? t.team.name : '-') },
        { h: 'Full safe route', r: (t) => t.route.nodes.map(name).join(' > ') }, { h: 'Km / ETA / risk', r: (t) => `${t.route.distanceKm} km / ${t.route.etaMin} min / ${t.route.riskScore}` }]} /></Card>
      {plan.team && <p>Rescue team: <b>{plan.team.name}</b> ({plan.team.type}, {plan.team.personnel} personnel)</p>}
      <MapView height={320} layers={{ roads: true, incidents: true, hospitals: false, shelters: false, warehouses: true, teams: false, vehicles: false }} routes={plan.tasks.map((t, i) => ({ nodes: t.route.nodes, color: ['#0b6e99', '#2e8b57', '#7b45d1', '#d98e04'][i % 4], label: t.vehicleId }))} fit />
      <RoadLegend /><div className="legend"><span>! Incident (blue = flood, other colours = other disasters)</span><span style={{ color: '#8a5a14' }}>● Warehouse</span><span><i style={{ background: '#0b6e99' }} />Dispatch route (appears once a vehicle is assigned)</span></div>
    </div>
  );
}
export default function Requests() {
  const { d, name } = useData(); const act = useAction();
  const [form, setForm] = useState(null), [plan, setPlan] = useState(null), [pf, setPf] = useState('All'), [q, setQ] = useState('');
  const rows = d.emergencyRequests.filter((x) => (pf === 'All' || x.priority === pf) && (`${x.id} ${name(x.locationId)} ${x.specialRequirements} ${x.status}`).toLowerCase().includes(q.toLowerCase()));
  // Creating a request runs the whole workflow automatically: nearest warehouse -> truck -> safe route -> dispatch
  const create = async () => {
    const r = await act(() => api('POST', '/requests', form), (x) => (x.dispatched ? `Dispatched ${x.missions.length} truck mission(s) automatically` : `Request saved. Waiting: ${x.request.dispatchNote || 'no truck free'}`));
    if (r) { setForm(null); setPlan({ request: r.request, plan: r.plan, dispatched: r.dispatched, title: 'Automatic dispatch result' }); }
  };
  const retry = async (r) => { await act(() => api('POST', '/dispatch/commit', { requestId: r.id }), (x) => `Dispatched ${x.missions.length} truck mission(s)`); };
  const set = (k, v) => setForm({ ...form, [k]: v });
  const num = (k, l) => <Field label={l}><input type="number" min="0" value={form[k]} onChange={(e) => set(k, e.target.value)} /></Field>;
  return (
    <Page title="Emergency Requests" sub="Sorted by priority: Critical, High, Medium, Low." actions={<button className="btn" onClick={() => setForm(blank(d))}><Plus size={16} />New request</button>}>
      <div className="card"><div className="toolbar"><input placeholder="Search requests..." value={q} onChange={(e) => setQ(e.target.value)} /><Chips options={['All', ...PRIORITIES]} value={pf} onChange={setPf} /></div><Table rows={rows} cols={[
        { h: 'ID', r: (r) => <b>{r.id}</b> }, { h: 'Priority', r: (r) => <Badge>{r.priority}</Badge> }, { h: 'Incident', r: (r) => r.incidentId || '-' }, { h: 'Location', r: (r) => name(r.locationId) },
        { h: 'People', r: (r) => r.peopleAffected }, { h: 'Water', r: (r) => r.waterRequired }, { h: 'Food', r: (r) => r.foodRequired }, { h: 'Med kits', r: (r) => r.medicalKitsRequired }, { h: 'Rescue', r: (r) => r.rescuePersonnelRequired },
        { h: 'Status', r: (r) => <Badge>{r.status}</Badge> }, { h: 'Notes', r: (r) => <span className="muted">{r.dispatchNote || r.specialRequirements}</span> },
        { h: 'Actions', r: (r) => (<div className="row">
          {r.status === 'Pending' && <button className="btn sm" onClick={() => retry(r)}><Send size={13} />Retry dispatch</button>}
          {!['Fulfilled', 'Cancelled'].includes(r.status) && r.status === 'Pending' && <button className="btn ghost sm" onClick={() => act(() => api('PUT', `/requests/${r.id}`, { status: 'Cancelled' }), 'Request cancelled')}>Cancel</button>}</div>) }]} /></div>
      {form && <Modal title="New emergency request" onClose={() => setForm(null)} wide>
        <div className="form-grid">
          <Field label="Incident"><select value={form.incidentId} onChange={(e) => set('incidentId', e.target.value)}><option value="">None</option>{d.incidents.map((i) => <option key={i.id} value={i.id}>{i.id} - {i.disasterType}, {i.location}</option>)}</select></Field>
          <Field label="Location"><select value={form.locationId} onChange={(e) => set('locationId', e.target.value)}>{d.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
          <Field label="Priority"><select value={form.priority} onChange={(e) => set('priority', e.target.value)}>{PRIORITIES.map((p) => <option key={p}>{p}</option>)}</select></Field>
          {num('peopleAffected', 'People affected')}{num('waterRequired', 'Water required (bottles)')}{num('foodRequired', 'Food required (packets)')}{num('medicalKitsRequired', 'Medical kits required')}{num('rescuePersonnelRequired', 'Rescue personnel required')}
        </div>
        <Field label="Special requirements"><textarea rows={2} value={form.specialRequirements} onChange={(e) => set('specialRequirements', e.target.value)} /></Field>
        <p className="muted">Saving the request automatically finds the nearest warehouse, assigns a truck, calculates the safest route and dispatches it.</p>
        <button className="btn" onClick={create}>Create and dispatch</button>
      </Modal>}
      {plan && <Modal title={`${plan.title || 'Dispatch plan'} - ${plan.request.id} (${plan.request.priority})`} onClose={() => setPlan(null)} wide>
        <Alert tone={plan.dispatched ? 'green' : 'amber'}>{plan.dispatched ? 'Dispatched automatically: nearest warehouse, truck assigned, safest route calculated. Follow it in Relief Missions or the Live Map.' : `Not dispatched yet: ${plan.request.dispatchNote || 'no truck free'}. It will be dispatched automatically when a truck becomes free.`}</Alert>
        <PlanView plan={plan.plan} />
        <div className="row" style={{ marginTop: 12 }}><button className="btn ghost" onClick={() => setPlan(null)}>Close</button></div>
      </Modal>}
    </Page>
  );
}
