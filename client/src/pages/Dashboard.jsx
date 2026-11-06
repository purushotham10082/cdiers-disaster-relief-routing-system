import React, { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts';
import { AlertOctagon, Ambulance, Building2, ClipboardList, Flame, LifeBuoy, Package, ShieldAlert, Stethoscope, Truck, Waypoints, Ban } from 'lucide-react';
import { api } from '../api.js';
import { Link } from 'react-router-dom';
import { useData } from '../data.jsx';
import { Alert, Badge, Card, Page, RES_LABEL, Stat, missionProgress } from '../components/ui.jsx';
import MapView from '../components/MapView.jsx';

const COLORS = ['#0b6e99', '#c8372d', '#d98e04', '#2e8b57', '#6b3fc4', '#e36a1b', '#3b8fe0', '#7a5a3a'];
const toRows = (o) => Object.entries(o || {}).map(([name, value]) => ({ name, value }));
export function useStats() {
  const { d } = useData(); const [s, setS] = useState(null);
  useEffect(() => { api('GET', '/dashboard').then(setS).catch(() => {}); }, [d]);
  return s;
}
export const ChartBar = ({ rows, color = '#0b6e99', h = 230 }) => (
  <ResponsiveContainer width="100%" height={h}><BarChart data={rows} margin={{ left: -15 }}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} height={50} textAnchor="end" /><YAxis allowDecimals={false} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="value" fill={color} isAnimationActive={false} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
);
export const ChartPie = ({ rows, h = 230 }) => (
  <ResponsiveContainer width="100%" height={h}><PieChart><Pie data={rows} dataKey="value" nameKey="name" outerRadius={80} isAnimationActive={false} label={(e) => e.value}>{rows.map((r, i) => <Cell key={r.name} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart></ResponsiveContainer>
);
export default function Dashboard() {
  const s = useStats(); const { d, name } = useData();
  if (!s) return <Page title="Command Center Dashboard"><div className="grid g3">{[1, 2, 3].map((i) => <div key={i} className="skeleton" />)}</div></Page>;
  const queue = d.emergencyRequests.filter((r) => !['Fulfilled', 'Cancelled'].includes(r.status)).slice(0, 6);
  const active = d.missions.filter((m) => !['Completed', 'Cancelled'].includes(m.status)).slice(0, 6);
  const blocked = d.roads.filter((r) => r.blocked);
  const stuck = d.missions.filter((m) => m.routeBlocked);
  const waiting = d.emergencyRequests.filter((r) => r.status === 'Pending' && r.priority === 'Critical');
  return (
    <Page title="Command Center Dashboard" sub="Chennai operations overview. All figures are Demo / Simulation Data.">
      {stuck.map((m) => <Alert key={m.id} tone="red"><b>{m.id}</b> has no safe route right now. <Link to="/missions">Open missions</Link></Alert>)}
      {waiting.length > 0 && <Alert tone="red"><b>{waiting.length} critical request{waiting.length > 1 ? 's' : ''} waiting for dispatch:</b> {waiting.map((r) => `${r.id} (${name(r.locationId)})`).join(', ')}. <Link to="/requests">Plan dispatch</Link></Alert>}
      {blocked.length > 0 && <Alert tone="amber"><b>{blocked.length} blocked road{blocked.length > 1 ? 's' : ''}:</b> {blocked.map((r) => r.name).join('; ')}</Alert>}
      <div className="stats">
        <Stat label="Active disasters" value={s.activeIncidents} tone="red" icon={Flame} />
        <Stat label="Critical requests" value={s.criticalRequests} tone="red" icon={ShieldAlert} />
        <Stat label="Active missions" value={s.activeMissions} icon={ClipboardList} />
        <Stat label="Available vehicles" value={s.availableVehicles} tone="green" icon={Truck} />
        <Stat label="Zone-disabled roads" value={s.zoneRoads} tone={s.zoneRoads ? 'red' : ''} icon={Package} />
        <Stat label="Blocked roads" value={s.blockedRoads} tone={s.blockedRoads ? 'red' : ''} icon={Ban} />
        <Stat label="High-damage roads" value={s.highDamageRoads} tone="amber" icon={Waypoints} />
        <Stat label="Hospitals" value={s.hospitals} icon={Stethoscope} />
        <Stat label="Shelters" value={s.shelters} icon={Building2} />
        <Stat label="Rescue teams" value={s.rescueTeams} icon={LifeBuoy} />
        <Stat label="Route recalculations" value={s.routeRecalculations} tone="amber" icon={AlertOctagon} />
        <Stat label="Completed missions" value={s.completedMissions} tone="green" icon={Ambulance} />
      </div>
      <div className="two-col">
        <Card title="Situation map" actions={<Link to="/map" className="btn ghost sm">Open full map</Link>}>
          <MapView height={400} layers={{ roads: true, incidents: true, hospitals: true, shelters: true, warehouses: true, teams: false, vehicles: false }} />
        </Card>
        <div>
          <Card title="Priority queue" actions={<Link to="/requests" className="btn ghost sm">All requests</Link>}>
            {queue.length ? <ul className="list">{queue.map((r) => <li key={r.id}><div><b>{r.id}</b> {name(r.locationId)}<div className="muted">{r.peopleAffected} people · {r.specialRequirements || 'No special requirements'}</div></div><div className="col-end"><Badge>{r.priority}</Badge><Badge>{r.status}</Badge></div></li>)}</ul> : <div className="empty">No open requests.</div>}
          </Card>
          <Card title="Active missions" actions={<Link to="/missions" className="btn ghost sm">All missions</Link>}>
            {active.length ? <ul className="list">{active.map((m) => <li key={m.id}><div style={{ flex: 1 }}><b>{m.id}</b> to {name(m.destinationNodeId)} <span className="muted">· {m.vehicleId}</span><div className="bar" style={{ marginTop: 5 }}><i style={{ width: missionProgress(m) + '%', background: m.status === 'Route Recalculated' ? '#7b45d1' : '#0b6e99' }} /></div></div><div className="col-end"><Badge>{m.status}</Badge></div></li>)}</ul> : <div className="empty">No active missions. Run a simulation to see one.</div>}
          </Card>
        </div>
      </div>
      <div className="grid g2">
        <Card title="Incidents by disaster type"><ChartBar rows={toRows(s.incidentsByType)} color="#c8372d" /></Card>
        <Card title="Emergency requests by priority"><ChartPie rows={toRows(s.requestsByPriority)} /></Card>
        <Card title="Mission status">{Object.keys(s.missionsByStatus).length ? <ChartPie rows={toRows(s.missionsByStatus)} /> : <div className="empty">No missions yet. Dispatch a request or run a simulation.</div>}</Card>
        <Card title="Missions by type">{Object.keys(s.missionsByType).length ? <ChartBar rows={toRows(s.missionsByType)} color="#2e8b57" /> : <div className="empty">No missions yet.</div>}</Card>
      </div>
    </Page>
  );
}
