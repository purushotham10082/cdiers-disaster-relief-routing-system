import React, { useState } from 'react';
import { useData } from '../data.jsx';
import MapView, { RoadLegend } from '../components/MapView.jsx';
import { Card, Page } from '../components/ui.jsx';

const LAYERS = [['routes', 'Active mission routes'], ['roads', 'Road network & conditions'], ['zones', 'Disaster zones'], ['incidents', 'Incidents'], ['hospitals', 'Hospitals'], ['shelters', 'Shelters'], ['warehouses', 'Warehouses'], ['teams', 'Rescue bases'], ['vehicles', 'Vehicles']];
export default function LiveMap() {
  const { d } = useData();
  // By default only the active mission routes are drawn; the full road network is an optional toggle.
  const [layers, setLayers] = useState({ routes: true, roads: false, zones: true, incidents: true, hospitals: true, shelters: true, warehouses: true, teams: false, vehicles: true });
  const routes = !layers.routes ? [] : d.missions.filter((m) => !['Completed', 'Cancelled', 'Delivered'].includes(m.status)).map((m) => ({ nodes: m.route.nodes, color: m.status === 'Route Recalculated' ? '#7b45d1' : m.type === 'Evacuation' ? '#c8372d' : '#0b6e99', label: `${m.id} ${m.type} (${m.status})` }));
  return (
    <Page title="Live Chennai Map" sub="Shows the active mission routes. Turn on 'Road network & conditions' to see every road. Roads are a simulated graph, not live traffic.">
      <Card>
        <div className="row" style={{ marginBottom: 10 }}>{LAYERS.map(([k, l]) => <label key={k} className="row" style={{ gap: 4 }}><input type="checkbox" style={{ width: 'auto' }} checked={!!layers[k]} onChange={(e) => setLayers({ ...layers, [k]: e.target.checked })} />{l}</label>)}</div>
        <MapView height={600} layers={layers} routes={routes} />
        {layers.roads && <RoadLegend />}
        <div className="legend"><span>! Incident (colour = disaster type)</span><span style={{ color: '#c8372d' }}>● Hospital</span><span style={{ color: '#2e8b57' }}>● Shelter</span><span style={{ color: '#8a5a14' }}>● Warehouse</span><span style={{ color: '#394b5e' }}>● Vehicle</span><span><i style={{ background: '#0b6e99' }} />Supply mission route</span><span><i style={{ background: '#c8372d' }} />Evacuation route</span><span><i style={{ background: '#7b45d1' }} />Re-routed mission</span><span style={{ color: '#c8372d' }}>◌ Disaster zone</span></div>
        {!routes.length && layers.routes && <p className="muted" style={{ marginBottom: 0 }}>No active missions right now. Create an incident or emergency request and the route appears here.</p>}
      </Card>
    </Page>
  );
}
