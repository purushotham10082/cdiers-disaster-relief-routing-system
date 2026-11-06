import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Navigation } from 'lucide-react';
import { useData } from '../data.jsx';
import { Page, Table } from '../components/ui.jsx';

const RouteBtn = ({ nodeId }) => { const nav = useNavigate(); return <button className="btn ghost sm" onClick={() => nav('/routes?to=' + nodeId)}><Navigation size={13} />Route here</button>; };
const cols = (name) => [{ h: 'ID', r: (x) => <b>{x.id}</b> }, { h: 'Name', r: (x) => x.name }, { h: 'Area', r: (x) => name(x.nodeId) }, { h: 'Latitude / Longitude', r: (x) => <span className="mono muted">{Number(x.latitude).toFixed(4)}, {Number(x.longitude).toFixed(4)}</span> }, { h: 'Route', r: (x) => <RouteBtn nodeId={x.nodeId} /> }];
export function Hospitals() {
  const { d, name } = useData();
  return <Page title="Hospitals" sub="Location points used as evacuation destinations (Simulation Data). No status is tracked."><div className="card"><Table rows={d.hospitals} cols={cols(name)} /></div></Page>;
}
export function Shelters() {
  const { d, name } = useData();
  return <Page title="Emergency Shelters" sub="Location points used as evacuation destinations (Simulation Data). No capacity or status is tracked."><div className="card"><Table rows={d.shelters} cols={cols(name)} /></div></Page>;
}
export function Warehouses() {
  const { d, name } = useData();
  return <Page title="Warehouses" sub="Resource collection points. The nearest warehouse (by safe route) supplies each emergency request. No stock is tracked."><div className="card"><Table rows={d.warehouses} cols={cols(name)} /></div></Page>;
}
