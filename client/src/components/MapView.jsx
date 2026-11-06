import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useData } from '../data.jsx';

export const ROAD_COLORS = { Safe: '#2e8b57', Minor: '#8fb339', Moderate: '#e0a100', Severe: '#e36a1b', Critical: '#a3194f', Blocked: '#c8372d' };
const DISASTER_COLORS = { Flood: '#1c6fd1', 'Extreme Rainfall': '#3b8fe0', Cyclone: '#6b3fc4', 'Storm Surge': '#4a5bd6', Tsunami: '#0e4f9e', Fire: '#e8491d', 'Industrial Accident': '#c9502a', 'Chemical Emergency': '#9b8a00', 'Building Collapse': '#7a5a3a', 'Major Road Accident': '#d62f6f', 'Heat Wave': '#d98e04' };
export const disasterColor = (t) => DISASTER_COLORS[t] || '#c8372d';
const P = {
  hospital: '<path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>',
  shelter: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  warehouse: '<path d="M22 8.35V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8.35A2 2 0 0 1 3.26 6.5l8-3.2a2 2 0 0 1 1.48 0l8 3.2A2 2 0 0 1 22 8.35Z"/><path d="M6 18h12"/><path d="M6 14h12"/><rect x="6" y="10" width="12" height="12"/>',
  team: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="m4.93 4.93 4.24 4.24M14.83 9.17l4.24-4.24M14.83 14.83l4.24 4.24M9.17 14.83l-4.24 4.24"/>',
  truck: '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  ambulance: '<path d="M10 10H6"/><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14"/><path d="M8 8v4"/><path d="M9 18h6"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  fire: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
};
const KIND = { hospital: ['hospital', '#c8372d'], shelter: ['shelter', '#2e8b57'], warehouse: ['warehouse', '#8a5a14'], team: ['team', '#0b6e99'] };
const VEH_COLOR = { Ambulance: '#c8372d', 'Fire Engine': '#e8491d', 'Water Tanker': '#1c6fd1' };
const vehIcon = (t) => (t === 'Ambulance' ? 'ambulance' : t === 'Fire Engine' ? 'fire' : 'truck');
function svgIcon(name, color, size = 24) {
  const i = Math.round(size * 0.58);
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};display:flex;align-items:center;justify-content:center;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)"><svg xmlns="http://www.w3.org/2000/svg" width="${i}" height="${i}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${P[name]}</svg></div>` });
}


// ---- Road-following geometry (display only; A* still runs on our own graph) ----
// Each graph edge is snapped to real streets using the free OSRM demo server (OpenStreetMap data).
// Results are cached in localStorage; if the service is unreachable we fall back to straight lines.
let geo = new Map();
try { geo = new Map(JSON.parse(localStorage.getItem('cdiers_geo_v1') || '[]')); } catch { /* ignore */ }
const pending = new Set(); let queue = Promise.resolve(), timer = null; const listeners = new Set();
const keyOf = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
function ensureGeo(a, b, locMap) {
  const k = keyOf(a, b);
  if (geo.has(k) || pending.has(k) || !locMap[a] || !locMap[b]) return;
  pending.add(k);
  const [f, t] = k.split('|');
  queue = queue.then(async () => {
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${locMap[f].lng},${locMap[f].lat};${locMap[t].lng},${locMap[t].lat}?overview=full&geometries=geojson`;
      const j = await (await fetch(url)).json();
      const c = j.routes?.[0]?.geometry?.coordinates;
      if (c?.length) {
        geo.set(k, c.map(([x, y]) => [y, x]));
        try { localStorage.setItem('cdiers_geo_v1', JSON.stringify([...geo])); } catch { /* ignore */ }
        clearTimeout(timer); timer = setTimeout(() => listeners.forEach((fn) => fn()), 500);
      }
    } catch { /* offline: keep straight line */ }
    await new Promise((r) => setTimeout(r, 300));
  });
}
function edgePts(a, b, locMap) {
  ensureGeo(a, b, locMap);
  const pts = geo.get(keyOf(a, b));
  if (!pts) return [[locMap[a].lat, locMap[a].lng], [locMap[b].lat, locMap[b].lng]];
  return a < b ? pts : [...pts].reverse();
}
const pathPts = (nodes, locMap) => nodes.slice(1).flatMap((n, i) => edgePts(nodes[i], n, locMap));

function icon(letter, color, size = 24, ring = false) {
  return L.divIcon({ className: '', iconSize: [size, size], iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};color:#fff;display:flex;align-items:center;justify-content:center;font:700 ${size * 0.5}px Segoe UI,sans-serif;border:2px solid #fff;box-shadow:0 0 0 ${ring ? 3 : 1}px ${ring ? color + '66' : 'rgba(0,0,0,.35)'}">${letter}</div>` });
}
/**
 * layers: { roads, incidents, hospitals, shelters, warehouses, teams, vehicles }  (booleans)
 * routes: [{ nodes:[ids], color, weight, dash, label }]
 * highlightRoads: [roadId]  (drawn thick red - e.g. blocked road during reroute)
 * pins: [{ nodeId, letter, color, label }]
 */
export default function MapView({ height = 520, layers = {}, routes = [], highlightRoads = [], pins = [], fit = false, mover = null }) {
  const { d, locMap } = useData();
  const [ver, setVer] = useState(0);
  useEffect(() => { const fn = () => setVer((v) => v + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
  const mv = useRef({ marker: null, key: '', idx: 0, raf: 0 });
  const el = useRef(null), map = useRef(null), group = useRef(null), fitted = useRef(false);
  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true }).setView([13.01, 80.22], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; OpenStreetMap contributors' }).addTo(map.current);
    group.current = L.layerGroup().addTo(map.current);
    setTimeout(() => map.current && map.current.invalidateSize(), 150);
    return () => { cancelAnimationFrame(mv.current.raf); mv.current.marker = null; map.current.remove(); map.current = null; };
  }, []);
  useEffect(() => {
    if (!d || !map.current) return;
    const g = group.current; g.clearLayers();
    const ll = (id) => [locMap[id].lat, locMap[id].lng];
    const on = (k) => layers[k] !== false;
    if (on('roads')) d.roads.forEach((r) => {
      if (!locMap[r.from] || !locMap[r.to]) return;
      const key = r.blocked ? 'Blocked' : r.damageLevel;
      L.polyline(edgePts(r.from, r.to, locMap), { color: ROAD_COLORS[key], weight: r.blocked ? 5 : 4, opacity: 0.8, dashArray: r.blocked ? '2 8' : null })
        .bindPopup(`<b>${r.id}</b> ${r.name}<br/>${r.distanceKm} km &middot; ${key}<br/>damage ${r.damage}, flood ${r.floodDepth} m, traffic ${r.traffic}/10<br/><i>Simulation Data</i>`).addTo(g);
    });
    routes.forEach((rt) => { if (rt.nodes?.length > 1) L.polyline(pathPts(rt.nodes, locMap), { color: rt.color || '#0b6e99', weight: rt.weight || 7, opacity: 0.95, dashArray: rt.dash || null }).bindTooltip(rt.label || 'Route', { sticky: true }).addTo(g); });
    highlightRoads.forEach((id) => { const r = d.roads.find((x) => x.id === id); if (r) L.polyline(edgePts(r.from, r.to, locMap), { color: '#c8372d', weight: 9, opacity: 0.9 }).bindTooltip('Blocked: ' + r.name).addTo(g); });
    if (on('zones')) d.incidents.filter((i) => i.zone && !['Resolved', 'Closed'].includes(i.status)).forEach((i) => L.circle([i.latitude, i.longitude], { radius: i.zone.radiusKm * 1000, color: '#c8372d', weight: 2, dashArray: '6 6', fillColor: '#c8372d', fillOpacity: 0.07, interactive: false }).addTo(g));
    if (on('incidents')) d.incidents.filter((i) => !['Resolved', 'Closed'].includes(i.status)).forEach((i) => L.marker([i.latitude, i.longitude], { icon: icon('!', disasterColor(i.disasterType), 30, true) }).bindPopup(`<b>${i.id} - ${i.disasterType}</b><br/>${i.location} &middot; ${i.severity}<br/>${i.status}${i.zone ? `<br/>Disaster zone ${i.zone.radiusKm} km` : ''}<br/>${i.description}`).addTo(g));
    const infra = (k, kind, rows, label, pos) => on(k) && rows.forEach((x) => { const p = pos(x); if (p) L.marker(p, { icon: svgIcon(KIND[kind][0], KIND[kind][1], 26) }).bindPopup(label(x)).addTo(g); });
    infra('hospitals', 'hospital', d.hospitals, (h) => `<b>${h.name}</b><br/>Hospital (evacuation destination)`, (h) => [h.latitude, h.longitude]);
    infra('shelters', 'shelter', d.shelters, (s) => `<b>${s.name}</b><br/>Shelter (evacuation destination)`, (s) => [s.latitude, s.longitude]);
    infra('warehouses', 'warehouse', d.warehouses, (w) => `<b>${w.name}</b><br/>Resource collection point`, (w) => ll(w.nodeId));
    infra('teams', 'team', d.rescueTeams, (t) => `<b>Rescue base: ${t.name}</b><br/>${t.type} &middot; ${t.personnel} personnel &middot; ${t.availability}`, (t) => { const p = ll(t.nodeId); return [p[0] + 0.004, p[1] - 0.004]; });
    if (layers.vehicles !== false) { const seen = {}; d.vehicles.forEach((v) => { if (!locMap[v.nodeId]) return; const n = (seen[v.nodeId] = (seen[v.nodeId] || 0) + 1) - 1; const p = ll(v.nodeId);
      L.marker([p[0] - 0.004 - n * 0.0025, p[1] + 0.005 + n * 0.0015], { icon: svgIcon(vehIcon(v.type), VEH_COLOR[v.type] || '#394b5e', 22) }).bindPopup(`<b>${v.id} ${v.type}</b><br/>${v.registration}<br/>${v.status}${v.assignedMission ? ' &middot; ' + v.assignedMission : ''}<br/>Capacity ${v.capacityKg} kg`).addTo(g); }); }
    pins.forEach((p) => locMap[p.nodeId] && L.marker(ll(p.nodeId), { icon: icon(p.letter, p.color, 30, true), zIndexOffset: 1000 }).bindTooltip(p.label || '').addTo(g));
    if (fit && !fitted.current && routes.some((r) => r.nodes?.length > 1)) { const pts = routes.flatMap((r) => (r.nodes || []).map(ll)); map.current.fitBounds(L.latLngBounds(pts).pad(0.3)); fitted.current = true; }
    // eslint-disable-next-line
  }, [d, locMap, JSON.stringify(layers), JSON.stringify(routes), JSON.stringify(highlightRoads), JSON.stringify(pins), fit, ver]);
  // Animated vehicle: glides along the real road shape from the previous node to the new one
  const moverKey = JSON.stringify(mover);
  useEffect(() => {
    const st = mv.current;
    if (!mover || !d || !map.current) { if (st.marker) { st.marker.remove(); st.marker = null; } return; }
    const node = mover.nodes[mover.index];
    if (!locMap[node]) return;
    const here = [locMap[node].lat, locMap[node].lng];
    if (!st.marker) st.marker = L.marker(here, { icon: svgIcon(vehIcon(mover.type), VEH_COLOR[mover.type] || '#d98e04', 32), zIndexOffset: 2000 }).addTo(map.current);
    st.marker.unbindTooltip().bindTooltip(mover.label || 'Vehicle');
    const key = JSON.stringify(mover.nodes);
    cancelAnimationFrame(st.raf);
    if (st.key === key && mover.index > st.idx) {
      const pts = pathPts(mover.nodes.slice(st.idx, mover.index + 1), locMap);
      const seg = [0]; for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + map.current.distance(pts[i - 1], pts[i]));
      const total = seg[seg.length - 1], t0 = performance.now(), ms = Math.max(300, mover.duration || 1500);
      const tick = (now) => {
        const f = Math.min(1, (now - t0) / ms), target = f * total; let i = 1;
        while (i < seg.length - 1 && seg[i] < target) i++;
        const t = (target - seg[i - 1]) / ((seg[i] - seg[i - 1]) || 1);
        if (st.marker) st.marker.setLatLng([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t]);
        if (f < 1) st.raf = requestAnimationFrame(tick);
      };
      if (total > 0) st.raf = requestAnimationFrame(tick); else st.marker.setLatLng(here);
    } else st.marker.setLatLng(here);
    st.key = key; st.idx = mover.index;
    // eslint-disable-next-line
  }, [moverKey, !!d]);
  return <div ref={el} className="map" style={{ height }} />;
}
export const RoadLegend = () => (
  <div className="legend">{Object.entries(ROAD_COLORS).map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}</div>
);
