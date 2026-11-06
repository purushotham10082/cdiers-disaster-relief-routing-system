import React from 'react';
import { useData } from '../data.jsx';
import { Badge, Page, Table } from '../components/ui.jsx';

export function Vehicles() {
  const { d, name } = useData();
  return (
    <Page title="Vehicles" sub="Check vehicle status. Trucks are assigned and dispatched automatically; the system updates their status.">
      <div className="card"><Table rows={d.vehicles} cols={[
        { h: 'ID', r: (v) => <b>{v.id}</b> }, { h: 'Type', r: (v) => v.type }, { h: 'Registration', r: (v) => v.registration }, { h: 'Capacity', r: (v) => `${v.capacityKg.toLocaleString()} kg` },
        { h: 'Location', r: (v) => name(v.nodeId) }, { h: 'Status', r: (v) => <Badge>{v.status}</Badge> }, { h: 'Assigned mission', r: (v) => v.assignedMission || '-' }]} /></div>
    </Page>
  );
}
export function Teams() {
  const { d, name } = useData();
  return (
    <Page title="Rescue Teams" sub="Check team status. Teams are assigned and dispatched automatically with emergency requests.">
      <div className="card"><Table rows={d.rescueTeams} cols={[
        { h: 'ID', r: (t) => <b>{t.id}</b> }, { h: 'Team', r: (t) => t.name }, { h: 'Type', r: (t) => <Badge tone="teal">{t.type}</Badge> }, { h: 'Personnel', r: (t) => t.personnel },
        { h: 'Location', r: (t) => name(t.nodeId) }, { h: 'Status', r: (t) => <Badge>{t.availability}</Badge> }, { h: 'Mission', r: (t) => t.assignedMission || '-' }]} /></div>
    </Page>
  );
}
