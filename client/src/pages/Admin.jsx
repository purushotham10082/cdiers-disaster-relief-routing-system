import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useData } from '../data.jsx';
import { Alert, Badge, Card, Page, RES_LABEL, Stat, Table, when } from '../components/ui.jsx';
import { ChartBar, ChartPie, useStats } from './Dashboard.jsx';

const rows = (o) => Object.entries(o || {}).map(([name, value]) => ({ name, value }));
export function Reports() {
  const s = useStats();
  if (!s) return <Page title="Reports"><div className="empty">Loading...</div></Page>;
  const disp = Object.entries(s.resourcesDispatched).map(([k, v]) => ({ name: RES_LABEL[k] || k, value: v }));
  return (
    <Page title="Reports" sub="Computed live from the JSON data files (Simulation Data).">
      <div className="stats">
        <Stat label="Total incidents" value={s.totalIncidents} /><Stat label="Active incidents" value={s.activeIncidents} tone="red" /><Stat label="Completed missions" value={s.completedMissions} tone="green" />
        <Stat label="Pending requests" value={s.pendingRequests} tone="amber" /><Stat label="Vehicles deployed" value={s.vehiclesDeployed} /><Stat label="Blocked roads" value={s.blockedRoads} tone="red" />
        <Stat label="Route recalculations" value={s.routeRecalculations} tone="amber" /><Stat label="Resource units dispatched" value={Object.values(s.resourcesDispatched).reduce((a, b) => a + b, 0).toLocaleString()} />
      </div>
      <div className="grid g2">
        <Card title="Disaster distribution"><ChartPie rows={rows(s.incidentsByType)} /></Card>
        <Card title="Resources dispatched">{disp.length ? <ChartBar rows={disp} color="#0b6e99" /> : <div className="empty">Nothing dispatched yet.</div>}</Card>
        <Card title="Missions by status">{Object.keys(s.missionsByStatus).length ? <ChartBar rows={rows(s.missionsByStatus)} color="#6b3fc4" /> : <div className="empty">No missions yet.</div>}</Card>
        <Card title="Requests by priority"><ChartBar rows={rows(s.requestsByPriority)} color="#d98e04" /></Card>
      </div>
    </Page>
  );
}
export function AuditLogs() {
  const { d } = useData(); const [logs, setLogs] = useState(null), [err, setErr] = useState(''), [q, setQ] = useState('');
  useEffect(() => { api('GET', '/audit-logs').then(setLogs).catch((e) => setErr(e.message)); }, [d]);
  const list = (logs || []).filter((l) => JSON.stringify(l).toLowerCase().includes(q.toLowerCase()));
  return (
    <Page title="Audit Logs" sub="Every important action is recorded in data/auditLogs.json (Admin and Operator only).">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="card"><input style={{ maxWidth: 300, marginBottom: 10 }} placeholder="Search logs..." value={q} onChange={(e) => setQ(e.target.value)} />
        <Table rows={list} cols={[{ h: 'Time', r: (l) => when(l.timestamp) }, { h: 'User', r: (l) => l.user }, { h: 'Role', r: (l) => <span className="muted">{l.role}</span> }, { h: 'Module', r: (l) => <Badge tone="blue">{l.module}</Badge> }, { h: 'Action', r: (l) => <b>{l.action}</b> }, { h: 'Description', r: (l) => l.description }]} /></div>
    </Page>
  );
}
export function SettingsPage({ user }) {
  return (
    <Page title="Settings" sub="Session and prototype information.">
      <div className="grid g2">
        <Card title="Signed-in user"><dl className="kv"><dt>Name</dt><dd>{user.name}</dd><dt>Role</dt><dd><Badge tone="blue">{user.role}</Badge></dd><dt>Session</dt><dd>JWT, expires after 8 hours</dd></dl></Card>
        <Card title="Role permissions"><ul style={{ margin: 0, paddingLeft: 18 }}><li><b>Admin</b>: everything, including delete and data reset</li><li><b>Command Center Operator</b>: incidents, requests, roads, simulation, audit logs</li><li><b>Dispatcher</b>: dispatch, missions, vehicles, teams, stock</li><li><b>Field Responder</b>: read access and mission progress updates</li></ul></Card>
        <Card title="About this prototype"><p style={{ marginTop: 0 }}>CDIERS stores everything in local JSON files (no database). The map is OpenStreetMap; routing runs on a simulated Chennai road graph, not live traffic. It is not a live emergency dispatch system.</p></Card>
      </div>
    </Page>
  );
}
