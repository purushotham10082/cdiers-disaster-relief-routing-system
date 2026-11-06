import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Navigation } from 'lucide-react';
import { api } from '../api.js';
import { useAction, useData } from '../data.jsx';
import { Alert, Card, Field, Page, Table } from '../components/ui.jsx';
import MapView, { RoadLegend } from '../components/MapView.jsx';

export default function RouteOpt() {
  const { d, name } = useData(); const act = useAction(); const [sp] = useSearchParams();
  const [src, setSrc] = useState('guindy'), [dst, setDst] = useState(sp.get('to') || 'velachery'), [res, setRes] = useState(null);
  const calc = async () => { const r = await act(() => api('POST', '/routes/calculate', { sourceId: src, targetId: dst })); if (r) setRes(r); };
  useEffect(() => { if (sp.get('to')) calc(); /* eslint-disable-next-line */ }, []);
  const opts = (
    <>
      <optgroup label="Locations">{d.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</optgroup>
      <optgroup label="Hospitals">{d.hospitals.map((h) => <option key={h.id} value={h.nodeId}>{h.name}</option>)}</optgroup>
      <optgroup label="Shelters">{d.shelters.map((s) => <option key={s.id} value={s.nodeId}>{s.name}</option>)}</optgroup>
      <optgroup label="Warehouses">{d.warehouses.map((w) => <option key={w.id} value={w.nodeId}>{w.name}</option>)}</optgroup>
    </>
  );
  const rc = (r, label) => r && (
    <Card title={label}><dl className="kv"><dt>Distance</dt><dd>{r.distanceKm} km</dd><dt>Estimated time</dt><dd>{r.etaMin} min</dd><dt>Risk score</dt><dd>{r.riskScore} / 100</dd><dt>Weighted cost</dt><dd>{r.cost}</dd><dt>A* nodes explored</dt><dd>{r.explored}</dd><dt>Path</dt><dd>{r.nodes.map(name).join(' > ')}</dd></dl>
      <Table rows={r.roads} cols={[{ h: 'Road', r: (x) => `${x.id} ${x.name}` }, { h: 'km', r: (x) => x.distanceKm }, { h: 'Damage', r: (x) => x.damage }, { h: 'Flood', r: (x) => x.floodDepth }, { h: 'Traffic', r: (x) => x.traffic }, { h: 'Risk', r: (x) => x.risk }]} /></Card>
  );
  const nameRoad = (id) => d.roads.find((r) => r.id === id)?.name || id;
  return (
    <Page title="Route Optimization" sub="A* on the simulated Chennai road graph. Safe cost = distance x (1 + damage/25 + flood depth x 3 + traffic/5). Blocked and disaster-zone roads are excluded. All transport uses a truck.">
      <Card>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
          <Field label="Source"><select value={src} onChange={(e) => setSrc(e.target.value)}>{opts}</select></Field>
          <Field label="Destination"><select value={dst} onChange={(e) => setDst(e.target.value)}>{opts}</select></Field>
        </div>
        <button className="btn" onClick={calc}><Navigation size={16} />Calculate safe route</button>
      </Card>
      {res && !res.found && <Alert tone="red"><b>{res.message}</b><ul>{res.suggestions.map((s) => <li key={s}>{s}</li>)}</ul></Alert>}
      {res?.found && <>
        <div className="grid g2">{rc(res.shortest, 'Shortest route (distance only)')}{rc(res.safe, 'Safe route (A* weighted)')}</div>
        <Alert tone={res.blockedAvoided.length || res.highRiskAvoided.length ? 'amber' : 'green'}>
          Blocked roads avoided: <b>{res.blockedAvoided.length ? res.blockedAvoided.map(nameRoad).join(', ') : 'none'}</b> · High-risk roads avoided: <b>{res.highRiskAvoided.length ? res.highRiskAvoided.map(nameRoad).join(', ') : 'none'}</b>
          {res.safe.nodes.join() === res.shortest.nodes.join() && ' · The shortest route is also the safest right now.'}
        </Alert>
        <Card title="Map"><MapView height={460} layers={{ roads: true, incidents: true, hospitals: true, shelters: true, warehouses: true, teams: false }}
          routes={[res.shortest && res.shortest.nodes.join() !== res.safe.nodes.join() ? { nodes: res.shortest.nodes, color: '#7d8b99', dash: '4 10', weight: 6, label: 'Shortest' } : null, { nodes: res.safe.nodes, color: '#0b6e99', weight: 8, label: 'Safe route' }].filter(Boolean)}
          pins={[{ nodeId: src, letter: 'A', color: '#14283c', label: 'Source' }, { nodeId: dst, letter: 'B', color: '#14283c', label: 'Destination' }]} fit /><RoadLegend />
          <div className="legend"><span><i style={{ background: '#0b6e99' }} />Safe route</span><span><i style={{ background: '#7d8b99' }} />Shortest route (when different)</span></div></Card>
      </>}
    </Page>
  );
}
