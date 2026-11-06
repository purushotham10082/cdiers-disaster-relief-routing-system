import React, { useState } from 'react';
import { Pencil, TriangleAlert } from 'lucide-react';
import { api } from '../api.js';
import { useAction, useData } from '../data.jsx';
import { Alert, Badge, Card, Field, Modal, Page, Table } from '../components/ui.jsx';
import MapView, { RoadLegend } from '../components/MapView.jsx';

export default function Roads() {
  const { d } = useData(); const act = useAction();
  const [edit, setEdit] = useState(null), [fail, setFail] = useState(null), [result, setResult] = useState(null), [q, setQ] = useState('');
  const rows = d.roads.filter((r) => r.name.toLowerCase().includes(q.toLowerCase()) || r.id.toLowerCase().includes(q.toLowerCase()));
  const saveEdit = async () => { const r = await act(() => api('PUT', `/roads/${edit.id}`, { damage: edit.damage, floodDepth: edit.floodDepth, traffic: edit.traffic, blocked: edit.blocked }), 'Road saved to roads.json'); if (r) { setEdit(null); setResult(r); } };
  const runFail = async () => { const r = await act(() => api('POST', `/roads/${fail.id}/simulate-failure`, { failureType: fail.failureType, floodDepth: fail.floodDepth, damage: fail.damage, blocked: true })); if (r) { setFail(null); setResult(r); } };
  return (
    <Page title="Road Network" sub="Simulated road graph used by A*. Damage 0 safe, 1-25 minor, 26-50 moderate, 51-75 severe, 76-100 critical. This is not live traffic data.">
      {result && <Alert tone={result.affectedMissions?.some((a) => a.outcome === 'no-route') ? 'red' : 'green'}><b>{result.road.id} {result.road.name}</b>: {result.message || 'Saved.'}
        {result.affectedMissions?.length > 0 && <ul>{result.affectedMissions.map((a) => <li key={a.missionId}>{a.missionId}: {a.message}{a.newRoute ? ' New route: ' + a.newRoute.join(' > ') : ''}</li>)}</ul>}</Alert>}
      <Card><MapView height={340} layers={{ roads: true, incidents: false, hospitals: false, shelters: false, warehouses: false, teams: false }} /><RoadLegend /></Card>
      <div className="card"><div className="row" style={{ marginBottom: 10 }}><input style={{ maxWidth: 280 }} placeholder="Filter roads..." value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Table rows={rows} cols={[
          { h: 'ID', r: (r) => <b>{r.id}</b> }, { h: 'Road', r: (r) => r.name }, { h: 'Distance', r: (r) => `${r.distanceKm} km` }, { h: 'Damage', r: (r) => <span>{r.damage} <Badge>{r.damageLevel}</Badge></span> },
          { h: 'Flood depth', r: (r) => `${r.floodDepth} m` }, { h: 'Traffic', r: (r) => `${r.traffic}/10` }, { h: 'Blocked', r: (r) => (r.blocked ? <Badge tone="red">Blocked{r.failureType ? ': ' + r.failureType : ''}</Badge> : <span className="muted">No</span>) },
          { h: 'Actions', r: (r) => (<div className="row"><button className="icon-btn" title="Edit" onClick={() => setEdit({ ...r })}><Pencil size={16} /></button>
            <button className="btn red sm" onClick={() => setFail({ id: r.id, name: r.name, failureType: 'Flooding', floodDepth: 1.5, damage: 90 })}><TriangleAlert size={13} />Simulate failure</button>
            {r.blocked && <button className="btn ghost sm" onClick={() => act(() => api('PUT', `/roads/${r.id}`, { blocked: false, damage: 0, floodDepth: 0, failureType: '' }), 'Road cleared')}>Clear</button>}</div>) }]} /></div>
      {edit && <Modal title={`Edit ${edit.id}: ${edit.name}`} onClose={() => setEdit(null)}>
        <div className="form-grid"><Field label="Damage (0-100)"><input type="number" min="0" max="100" value={edit.damage} onChange={(e) => setEdit({ ...edit, damage: e.target.value })} /></Field>
          <Field label="Flood depth (m)"><input type="number" step="0.1" min="0" max="5" value={edit.floodDepth} onChange={(e) => setEdit({ ...edit, floodDepth: e.target.value })} /></Field>
          <Field label="Traffic (0-10)"><input type="number" min="0" max="10" value={edit.traffic} onChange={(e) => setEdit({ ...edit, traffic: e.target.value })} /></Field>
          <Field label="Blocked"><select value={String(edit.blocked)} onChange={(e) => setEdit({ ...edit, blocked: e.target.value === 'true' })}><option value="false">No</option><option value="true">Yes</option></select></Field></div>
        <button className="btn" onClick={saveEdit}>Save road</button></Modal>}
      {fail && <Modal title={`Simulate failure: ${fail.name}`} onClose={() => setFail(null)}>
        <p className="muted">The road becomes blocked. Any active mission that still needs this road is re-routed with A*.</p>
        <Field label="Failure type"><select value={fail.failureType} onChange={(e) => setFail({ ...fail, failureType: e.target.value })}>{['Flooding', 'Structural Damage', 'Fire', 'Debris', 'Accident', 'Storm Surge'].map((x) => <option key={x}>{x}</option>)}</select></Field>
        <div className="form-grid"><Field label="Flood depth (m)"><input type="number" step="0.1" value={fail.floodDepth} onChange={(e) => setFail({ ...fail, floodDepth: e.target.value })} /></Field>
          <Field label="Damage (0-100)"><input type="number" value={fail.damage} onChange={(e) => setFail({ ...fail, damage: e.target.value })} /></Field></div>
        <button className="btn red" onClick={runFail}>Simulate failure</button></Modal>}
    </Page>
  );
}
