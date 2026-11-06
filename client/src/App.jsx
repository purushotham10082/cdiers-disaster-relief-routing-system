import React, { useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Activity, AlertTriangle, Building2, ClipboardList, FileBarChart, Flame, Home, LifeBuoy, Map as MapIcon, Navigation, Package, Route as RouteIcon, ScrollText, Settings as Cog, ShieldAlert, Stethoscope, Truck, Warehouse, Waypoints, LogOut } from 'lucide-react';
import { api, clearSession, getUser, setSession } from './api.js';
import { Providers, useData } from './data.jsx';
import { Alert, SimTag } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LiveMap from './pages/LiveMap.jsx';
import Incidents from './pages/Incidents.jsx';
import Requests from './pages/Requests.jsx';

import { Vehicles, Teams } from './pages/Fleet.jsx';
import { Hospitals, Shelters, Warehouses } from './pages/Facilities.jsx';
import Roads from './pages/Roads.jsx';
import RouteOpt from './pages/RouteOpt.jsx';
import Missions from './pages/Missions.jsx';
import Simulation from './pages/Simulation.jsx';
import { Reports, AuditLogs, SettingsPage } from './pages/Admin.jsx';

const NAV = [
  ['Command', [['/', 'Dashboard', Home], ['/map', 'Live Map', MapIcon], ['/simulation', 'Disaster Simulation', Activity]]],
  ['Operations', [['/incidents', 'Incidents', Flame], ['/requests', 'Emergency Requests', ShieldAlert], ['/missions', 'Relief Missions', ClipboardList], ['/routes', 'Route Optimization', Navigation]]],
  ['Resources', [['/warehouses', 'Warehouses', Warehouse], ['/vehicles', 'Vehicles', Truck], ['/teams', 'Rescue Teams', LifeBuoy]]],
  ['Infrastructure', [['/roads', 'Road Network', Waypoints], ['/hospitals', 'Hospitals', Stethoscope], ['/shelters', 'Shelters', Building2]]],
  ['Administration', [['/reports', 'Reports', FileBarChart], ['/audit', 'Audit Logs', ScrollText], ['/settings', 'Settings', Cog]]],
];
function Clock() {
  const [t, setT] = useState(new Date());
  React.useEffect(() => { const i = setInterval(() => setT(new Date()), 1000); return () => clearInterval(i); }, []);
  return <span className="clock mono">{t.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short' })} · {t.toLocaleTimeString('en-IN', { hour12: false })} IST</span>;
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@cdiers.local'), [password, setPassword] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api('POST', '/auth/login', { email, password }); setSession(r.token, r.user); onLogin(r.user); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <div className="login">
      <div className="login-art"><h1>Chennai Disaster Command Center</h1><p>Find the shortest safe route, not just the shortest route. CDIERS disables roads inside a disaster zone, sends a truck from the nearest warehouse, evacuates people to the nearest safe shelter or hospital, and re-routes active missions when a road fails.</p><ul className="feat"><li>Safe routing with A*, not just the shortest path</li><li>Automatic dispatch from the nearest warehouse</li><li>Disaster zones disable unsafe roads</li><li>Automatic re-route when a road fails</li></ul><p><SimTag /></p></div>
      <div className="login-form">
        <form onSubmit={submit}>
          <h1 style={{ marginBottom: 14 }}>Sign in</h1>
          {err && <Alert tone="red">{err}</Alert>}
          <label className="field"><span>Email</span><input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" /></label>
          <label className="field"><span>Password</span><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
          <button className="btn" disabled={busy} style={{ width: '100%', justifyContent: 'center' }}>{busy ? 'Signing in...' : 'Sign in'}</button>
          <div className="demo-acc">Demo accounts (simulation): <button type="button" onClick={() => { setEmail('admin@cdiers.local'); setPassword('Admin@123'); }}>Admin</button> · <button type="button" onClick={() => { setEmail('operator@cdiers.local'); setPassword('Operator@123'); }}>Operator</button> · <button type="button" onClick={() => { setEmail('dispatcher@cdiers.local'); setPassword('Dispatch@123'); }}>Dispatcher</button> · <button type="button" onClick={() => { setEmail('responder@cdiers.local'); setPassword('Responder@123'); }}>Responder</button></div>
        </form>
      </div>
    </div>
  );
}

function Shell({ user, onLogout }) {
  const { d, error } = useData();
  const critical = d ? d.emergencyRequests.filter((r) => r.priority === 'Critical' && !['Fulfilled', 'Cancelled'].includes(r.status)).length : 0;
  return (
    <div className="shell">
      <nav className="side" aria-label="Main">
        <div className="brand"><b>CDIERS</b><span>Chennai Disaster Intelligence &amp; Emergency Relief Routing</span></div>
        {NAV.map(([title, items]) => <div key={title}><div className="nav-title">{title}</div>{items.map(([to, label, Icon]) => <NavLink key={to} to={to} end={to === '/'}><Icon size={17} />{label}{label === 'Emergency Requests' && critical > 0 && <em className="pill">{critical}</em>}</NavLink>)}</div>)}
      </nav>
      <div className="main">
        <header className="top">
          <div className="row"><span className={'conn ' + (error ? 'off' : 'on')} title={error ? 'API unreachable' : 'Connected to API'} /><span className="muted">{error ? 'Offline' : 'Live'}</span><Clock /><SimTag />{critical > 0 && <span className="badge red"><AlertTriangle size={12} style={{ verticalAlign: -2 }} /> {critical} critical request{critical > 1 ? 's' : ''}</span>}</div>
          <div className="who"><span><b>{user.name}</b> <span className="muted">· {user.role}</span></span><button className="btn ghost sm" onClick={onLogout}><LogOut size={14} />Sign out</button></div>
        </header>
        {error && <div style={{ padding: '12px 22px 0' }}><Alert tone="red">{error}</Alert></div>}
        {!d ? <div className="page"><div className="empty">Loading command center data...</div></div> : (
          <Routes>
            <Route path="/" element={<Dashboard />} /><Route path="/map" element={<LiveMap />} /><Route path="/incidents" element={<Incidents user={user} />} />
            <Route path="/requests" element={<Requests />} /><Route path="/warehouses" element={<Warehouses />} />
            <Route path="/vehicles" element={<Vehicles />} /><Route path="/teams" element={<Teams />} /><Route path="/hospitals" element={<Hospitals />} /><Route path="/shelters" element={<Shelters />} />
            <Route path="/roads" element={<Roads />} /><Route path="/routes" element={<RouteOpt />} /><Route path="/missions" element={<Missions />} />
            <Route path="/simulation" element={<Simulation user={user} />} /><Route path="/reports" element={<Reports />} /><Route path="/audit" element={<AuditLogs />} /><Route path="/settings" element={<SettingsPage user={user} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        )}
      </div>
    </div>
  );
}
export default function App() {
  const [user, setUser] = useState(getUser());
  const logout = () => { clearSession(); setUser(null); };
  if (!user) return <Login onLogin={setUser} />;
  return <Providers><Shell user={user} onLogout={logout} /></Providers>;
}
