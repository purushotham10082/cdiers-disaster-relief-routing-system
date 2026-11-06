import React, { useEffect, useState } from 'react';
import { Play, RotateCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAction } from '../data.jsx';
import { Alert, Badge, Card, Page, SimTag } from '../components/ui.jsx';
import { PlanView } from './Requests.jsx';

export default function Simulation({ user }) {
  const act = useAction(); const [list, setList] = useState([]), [out, setOut] = useState(null), [busy, setBusy] = useState('');
  useEffect(() => { api('GET', '/simulation/scenarios').then(setList).catch(() => {}); }, []);
  const run = async (id) => { setBusy(id); const r = await act(() => api('POST', '/simulation/run', { scenario: id }), (x) => `${x.scenario}: zone, evacuation and ${x.missions.length} request mission(s) dispatched`); setBusy(''); if (r) setOut(r); };
  return (
    <Page title="Disaster Simulation" sub="One click creates the incident, identifies its disaster zone, disables roads inside it, dispatches an evacuation truck, then creates the emergency request and dispatches a truck from the nearest warehouse." actions={user.role === 'Admin' && <button className="btn ghost" onClick={() => window.confirm('Reset ALL data files to the original demo data?') && act(() => api('POST', '/simulation/reset'), 'Demo data reset').then(() => setOut(null))}><RotateCcw size={15} />Reset demo data</button>}>
      <Alert tone="blue"><SimTag /> Scenarios use invented demo risk profiles. They are not live measurements or government data.</Alert>
      <div className="grid g2">{list.map((s) => (
        <Card key={s.id} title={s.name} actions={<Badge tone="orange">{s.disasterType}</Badge>}><p className="muted" style={{ marginTop: 0 }}>{s.summary}</p>
          <button className="btn" disabled={!!busy} onClick={() => run(s.id)}><Play size={15} />{busy === s.id ? 'Running...' : 'Run scenario'}</button></Card>))}</div>
      {out && <Card title={`Result: ${out.scenario}`}>
        <p><b>{out.incident.id}</b> {out.incident.disasterType} at {out.incident.location} ({out.incident.severity}) · <b>{out.request.id}</b> {out.request.priority}, {out.request.peopleAffected} people · <b>{out.missions.length}</b> mission(s) · <Link to="/missions">Open missions</Link> · <Link to="/map">Open map</Link></p>
        {out.roadEffects.length > 0 && <Alert tone="amber"><b>Roads affected</b><ul>{out.roadEffects.map((r) => <li key={r.roadId}>{r.roadId} {r.name}: {r.blocked ? 'BLOCKED' : `flood ${r.floodDepth ?? '-'} m, damage ${r.damage ?? '-'}`}</li>)}</ul></Alert>}
        {out.zone && <Alert tone="red"><b>Disaster zone:</b> {out.zone.radiusKm} km around {out.incident.location}; {out.zone.roadsDisabled} road(s) disabled automatically.</Alert>}
        {out.evacuation && <Alert tone={out.evacuation.dispatched ? 'green' : 'amber'}>{out.evacuation.dispatched ? <>Evacuation truck <b>{out.evacuation.mission.vehicleId}</b> dispatched to <b>{out.evacuation.destination.kind}: {out.evacuation.destination.name}</b>. Route: {out.evacuation.mission.route.nodes.join(' > ')}</> : `Evacuation waiting: ${out.evacuation.reason}`}</Alert>}
        <PlanView plan={out.plan} />
      </Card>}
    </Page>
  );
}
