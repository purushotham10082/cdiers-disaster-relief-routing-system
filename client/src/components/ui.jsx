import React from 'react';
import { X } from 'lucide-react';

const TONES = {
  Critical: 'red', High: 'orange', Medium: 'amber', Low: 'green', Blocked: 'red', Safe: 'green', Minor: 'lime', Moderate: 'amber', Severe: 'orange',
  Available: 'green', Operational: 'green', Open: 'green', Completed: 'green', Fulfilled: 'green', Delivered: 'green', Resolved: 'green', Closed: 'gray',
  Dispatched: 'blue', 'On Route': 'blue', 'En Route': 'blue', Active: 'red', 'Under Response': 'orange', Reported: 'amber', Verified: 'blue', Pending: 'amber',
  'Route Recalculated': 'purple', Arrived: 'teal', Maintenance: 'gray', Cancelled: 'gray', Full: 'red', Offline: 'gray', 'Near Capacity': 'amber', Deployed: 'blue',
  'Resources Allocated': 'teal', 'Partially Allocated': 'amber', 'In Progress': 'blue', Planned: 'gray', Medical: 'teal',
};
export const Badge = ({ children, tone }) => <span className={'badge ' + (tone || TONES[children] || 'gray')}>{children}</span>;
export const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { hour12: false, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-');
export const clock = (iso) => (iso ? new Date(iso).toLocaleTimeString('en-IN', { hour12: false }) : '');

export function Page({ title, sub, actions, children }) {
  return (
    <div className="page">
      <div className="page-head"><div><h1>{title}</h1>{sub && <p className="sub">{sub}</p>}</div><div className="row">{actions}</div></div>
      {children}
    </div>
  );
}
export const Card = ({ title, actions, children, className = '' }) => (
  <section className={'card ' + className}>{(title || actions) && <div className="card-head"><h2>{title}</h2><div className="row">{actions}</div></div>}{children}</section>
);
export function Modal({ title, onClose, children, wide }) {
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
export const Field = ({ label, children, hint }) => <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
export const Empty = ({ children }) => <div className="empty">{children}</div>;
export const Alert = ({ tone = 'amber', children }) => <div className={'alert ' + tone}>{children}</div>;
export function Table({ cols, rows, empty = 'Nothing here yet.', onRow, sel }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{cols.map((c) => <th key={c.h} style={c.w ? { width: c.w } : null}>{c.h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.id || i} onClick={onRow ? () => onRow(r) : undefined} className={(onRow ? 'clickable' : '') + (sel && sel === r.id ? ' sel' : '')}>{cols.map((c) => <td key={c.h}>{c.r(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
export const Stat = ({ label, value, tone, icon: Icon }) => (
  <div className={'stat ' + (tone || '')}>{Icon && <Icon size={18} />}<div className="stat-v">{value}</div><div className="stat-l">{label}</div></div>
);
export const SimTag = () => <span className="simtag">Simulation Data</span>;
export const RES_LABEL = { water: 'Drinking water', food: 'Food packets', medicalKits: 'Medical kits', blankets: 'Blankets', rescueEquipment: 'Rescue equipment', firstAid: 'First aid kits', lights: 'Emergency lights', generators: 'Generators', lifeJackets: 'Life jackets' };
export const DISASTERS = ['Flood', 'Cyclone', 'Storm Surge', 'Tsunami', 'Extreme Rainfall', 'Heat Wave', 'Fire', 'Industrial Accident', 'Chemical Emergency', 'Building Collapse', 'Major Road Accident'];
export const PRIORITIES = ['Critical', 'High', 'Medium', 'Low'];

export function Chips({ options, value, onChange }) {
  return <div className="chips" role="group">{options.map((o) => <button key={o} type="button" className={'chip' + (value === o ? ' on' : '')} aria-pressed={value === o} onClick={() => onChange(o)}>{o}</button>)}</div>;
}
export const STAGES = ['Resources Allocated', 'Dispatched', 'En Route', 'Arrived', 'Delivered', 'Completed'];
export const stageIndex = (s) => (s === 'Route Recalculated' ? 2 : s === 'Planned' ? 0 : STAGES.indexOf(s));
export function Stepper({ status, recalculated }) {
  if (status === 'Cancelled') return <div className="alert amber">This mission was cancelled.</div>;
  const cur = stageIndex(status);
  return (
    <ol className="stepper" aria-label="Mission progress">
      {STAGES.map((s, i) => <li key={s} className={(i < cur ? 'done ' : i === cur ? 'cur ' : '') + (i === cur && recalculated ? 'recalc' : '')}><i>{i < cur ? '\u2713' : i + 1}</i><span>{s}</span></li>)}
    </ol>
  );
}
export const missionProgress = (m) => {
  if (m.status === 'Completed' || m.status === 'Delivered') return 100;
  if (m.status === 'Cancelled') return 0;
  const hops = Math.max(1, m.route.nodes.length - 1);
  const travel = ['Arrived'].includes(m.status) ? 1 : (m.posIndex || 0) / hops;
  const base = { 'Resources Allocated': 0, Planned: 0, Dispatched: 5 }[m.status] ?? 10;
  return Math.min(98, Math.round(base + travel * 85));
};
