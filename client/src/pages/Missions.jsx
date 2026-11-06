import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Ban, Footprints, History, Pause, Play, RefreshCw, TriangleAlert } from 'lucide-react';
import { api } from '../api.js';
import { useAction, useData, useToast } from '../data.jsx';
import { Alert, Badge, Card, Modal, Page, RES_LABEL, Stepper, Table, clock, missionProgress, when } from '../components/ui.jsx';
import MapView, { RoadLegend } from '../components/MapView.jsx';

const STATUSES = ['Planned', 'Resources Allocated', 'Dispatched', 'En Route', 'Route Recalculated', 'Arrived', 'Delivered', 'Completed', 'Cancelled'];
function Timeline({ id, onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { api('GET', `/missions/${id}/timeline`).then(setRows).catch(() => setRows([])); }, [id]);
  return (
    <Modal title={`Operations timeline - ${id}`} onClose={onClose}>
      {!rows ? 'Loading...' : !rows.length ? <div className="empty">No events yet.</div> : <ul className="timeline">{rows.map((l) => (
        <li key={l.id} className={/recalculated/i.test(l.action) ? 're' : /blocked|no safe/i.test(l.action) ? 'warn' : ''}><time>{clock(l.timestamp)}</time>{l.description} <span className="muted">({l.user})</span></li>))}</ul>}
    </Modal>
  );
}
export default function Missions() {
  const { d, name } = useData(); const act = useAction();
  const toast = useToast();
  const [sel, setSel] = useState(null), [tl, setTl] = useState(null), [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(1);
  const m = d.missions.find((x) => x.id === sel);
  const MS = { 1: 2600, 2: 1500, 4: 800 }[speed];
  // Live movement: every tick dispatches (if needed) and moves the vehicle one node, until it arrives
  const live = useRef(m); live.current = m;
  const busy = useRef(false);
  useEffect(() => { setPlaying(false); }, [sel]);
  useEffect(() => {
    if (!playing) return undefined;
    const t = setInterval(async () => {
      const cur = live.current;
      if (busy.current || !cur) return;
      if (cur.routeBlocked) { setPlaying(false); toast('Stopped: no safe route currently available.', 'err'); return; }
      busy.current = true;
      try {
        if (['Planned', 'Resources Allocated'].includes(cur.status)) await act(() => api('POST', `/missions/${cur.id}/advance`));
        else if (['Dispatched', 'En Route', 'Route Recalculated'].includes(cur.status)) { const r = await act(() => api('POST', `/missions/${cur.id}/step`)); if (!r) setPlaying(false); else if (r.status === 'Arrived') { setPlaying(false); toast(`${cur.id} arrived at destination`); } }
        else setPlaying(false);
      } finally { busy.current = false; }
    }, MS);
    return () => clearInterval(t);
    // eslint-disable-next-line
  }, [playing, MS]);
  const veh = (id) => d.vehicles.find((v) => v.id === id);
  const blocked = m ? (m.routeHistory || []).map((h) => h.blockedRoadId).filter(Boolean) : [];
  const pk = m?.pickupIndex || 0;
  const delColor = m?.routeHistory?.length ? '#2e8b57' : '#0b6e99';
  const routes = m ? [
    ...(m.routeHistory?.length ? [{ nodes: m.originalRoute.nodes, color: '#7d8b99', dash: '4 10', weight: 6, label: 'Original route' }] : []),
    ...(pk > 0 ? [{ nodes: m.route.nodes.slice(0, pk + 1), color: '#d98e04', dash: '10 8', weight: 7, label: 'Truck to pick-up point' }] : []),
    { nodes: m.route.nodes.slice(pk), color: delColor, weight: 8, label: m.routeHistory?.length ? 'New safe route' : 'Delivery route' },
  ] : [];
  const pins = m ? [...(pk > 0 ? [{ nodeId: m.sourceNodeId, letter: m.type === 'Evacuation' ? 'P' : 'W', color: m.type === 'Evacuation' ? '#c8372d' : '#8a5a14', label: m.type === 'Evacuation' ? 'Pick-up point' : 'Warehouse (loading point)' }] : []), { nodeId: m.destinationNodeId, letter: 'B', color: '#14283c', label: 'Destination' }] : [];
  const moverProp = m && !['Completed', 'Cancelled'].includes(m.status) ? { nodes: m.route.nodes, index: m.posIndex || 0, type: veh(m.vehicleId)?.type, label: `${m.vehicleId} ${veh(m.vehicleId)?.type || ''}`, duration: MS * 0.9 } : null;
  const evac = m?.type === 'Evacuation';
  const phase = !m ? '' : ['Completed', 'Cancelled', 'Delivered'].includes(m.status) ? m.status : m.status === 'Arrived' ? 'Arrived at destination' : pk > 0 && (m.posIndex || 0) < pk ? (evac ? `Heading to ${name(m.sourceNodeId)} to pick up people` : `Heading to ${d.warehouses.find((w) => w.id === m.warehouseId)?.name || 'warehouse'} to load`) : evac ? `Carrying people to ${m.destinationName}` : pk > 0 || m.type === 'Supply' ? 'Loaded, delivering to destination' : 'Responding to destination';
  const nextRoad = m && m.route.roadIds[m.posIndex || 0];
  return (
    <Page title="Relief Missions" sub="Critical missions first. Move the vehicle step by step, then block a road ahead to watch A* re-route it." actions={d.missions.some((x) => !['Completed', 'Cancelled'].includes(x.status)) && <button className="btn ghost" onClick={() => window.confirm('Cancel ALL active missions, free their vehicles and return unused stock?') && act(() => api('POST', '/missions-release-all'), (r) => `${r.cancelled} mission(s) cancelled`)}><Ban size={15} />Cancel all active missions</button>}>
      <div className="card"><Table rows={d.missions} sel={sel} empty="No missions yet. Plan a dispatch from Emergency Requests or run a Disaster Simulation." onRow={(x) => setSel(x.id)} cols={[
        { h: 'Mission', r: (x) => <b>{x.id}</b> }, { h: 'Priority', r: (x) => <Badge>{x.priority}</Badge> }, { h: 'Type', r: (x) => x.type }, { h: 'Request', r: (x) => x.requestId || x.incidentId || '-' }, { h: 'From', r: (x) => x.warehouseId ? d.warehouses.find((w) => w.id === x.warehouseId)?.name : name(x.sourceNodeId) + (x.type === 'Evacuation' ? ' (pickup)' : '') },
        { h: 'To', r: (x) => x.destinationName || name(x.destinationNodeId) }, { h: 'Vehicle', r: (x) => veh(x.vehicleId) ? `${x.vehicleId} ${veh(x.vehicleId).type}` : x.vehicleId }, { h: 'Team', r: (x) => x.teamName || '-' },
        { h: 'Carrying', r: (x) => x.resources.map((r) => `${r.qty} ${RES_LABEL[r.resource]}`).join(', ') || (x.type === 'Evacuation' ? 'People (evacuation)' : 'Rescue team') }, { h: 'Status', r: (x) => <Badge>{x.status}</Badge> }, { h: 'Progress', r: (x) => <div className="bar"><i style={{ width: missionProgress(x) + '%', background: x.status === 'Route Recalculated' ? '#7b45d1' : undefined }} /></div> }, { h: 'Created', r: (x) => when(x.createdAt) }]} /></div>
      {m && (
        <Card title={`${m.id} - ${m.type} mission${m.destinationName ? ' to ' + m.destinationName : ''}`} actions={<button className="btn ghost sm" onClick={() => setTl(m.id)}><History size={14} />Operations timeline</button>}>
          <Stepper status={m.status} recalculated={m.status === 'Route Recalculated'} />
          {m.alert && <Alert tone={m.routeBlocked ? 'red' : 'amber'}>{m.alert}</Alert>}
          <div className="row" style={{ marginBottom: 10 }}>
            <Badge>{m.status}</Badge>
            <select className="inline" value={m.status} onChange={(e) => act(() => api('PUT', `/missions/${m.id}`, { status: e.target.value }), 'Mission status updated')}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
            <button className={'btn sm' + (playing ? ' red' : '')} disabled={!['Planned', 'Resources Allocated', 'Dispatched', 'En Route', 'Route Recalculated'].includes(m.status)} onClick={() => setPlaying(!playing)}>{playing ? <><Pause size={14} />Pause</> : <><Play size={14} />Play live movement</>}</button>
            <select className="inline" aria-label="Playback speed" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select>
            <button className="btn sm" onClick={() => act(() => api('POST', `/missions/${m.id}/advance`), 'Mission advanced')} disabled={['Completed', 'Cancelled'].includes(m.status)}><ArrowRight size={14} />Next status</button>
            <button className="btn sm" onClick={() => act(() => api('POST', `/missions/${m.id}/step`), 'Vehicle moved one node')} disabled={!['Dispatched', 'En Route', 'Route Recalculated'].includes(m.status)}><Footprints size={14} />Move vehicle 1 node</button>
            <button className="btn red sm" disabled={!nextRoad || !['Dispatched', 'En Route', 'Route Recalculated', 'Resources Allocated'].includes(m.status)}
              onClick={async () => { const r = await act(() => api('POST', `/roads/${nextRoad}/simulate-failure`, { failureType: 'Flooding', floodDepth: 1.5, blocked: true })); if (r) { /* result visible via alert + map */ } }}><TriangleAlert size={14} />Block next road ahead</button>
            <button className="btn ghost sm" onClick={() => act(() => api('POST', `/missions/${m.id}/reroute`), 'Route recalculated')}><RefreshCw size={14} />Recalculate</button>
            {!['Completed', 'Cancelled'].includes(m.status) && <button className="btn ghost sm" onClick={() => window.confirm('Cancel mission and return unused stock?') && act(() => api('PUT', `/missions/${m.id}`, { status: 'Cancelled' }), 'Mission cancelled')}><Ban size={14} />Cancel</button>}
          </div>
          <dl className="kv" style={{ marginBottom: 10 }}>
            <dt>Phase</dt><dd><b>{phase}</b>{pk > 0 && <span className="muted"> · vehicle started {m.pickupKm} km from the warehouse</span>}</dd>
            <dt>Current route</dt><dd>{m.route.nodes.map(name).join(' > ')} ({m.route.distanceKm} km, ETA {m.route.etaMin} min, risk {m.route.riskScore})</dd>
            <dt>Vehicle position</dt><dd>{name(m.route.nodes[m.posIndex || 0])}</dd>
            {m.routeHistory?.length > 0 && <><dt>Original route</dt><dd>{m.originalRoute.nodes.map(name).join(' > ')}</dd><dt>Recalculations</dt><dd>{m.routeHistory.length} ({m.routeHistory.map((h) => h.reason).join(' ')})</dd></>}
            <dt>Dispatched / Arrived</dt><dd>{when(m.dispatchedAt)} / {when(m.arrivedAt)}</dd>
          </dl>
          <MapView height={460} layers={{ roads: true, incidents: true, hospitals: false, shelters: false, warehouses: true, teams: false, vehicles: false }} routes={routes} highlightRoads={blocked} pins={pins} mover={moverProp} fit /><RoadLegend />
          <div className="legend"><span><i style={{ background: '#d98e04' }} />Truck to pick-up point</span><span><i style={{ background: '#7d8b99' }} />Original route</span><span><i style={{ background: '#2e8b57' }} />New safe route</span><span><i style={{ background: '#c8372d' }} />Blocked road</span></div>
        </Card>
      )}
      {tl && <Timeline id={tl} onClose={() => setTl(null)} />}
    </Page>
  );
}
