// A* safe-routing implemented from scratch (no routing library / API).
const { haversine } = require('../utils/geo');

// cost = distance * (1 + damage/25 + floodDepth*3 + traffic/5)
const safeCost = (r) => r.distanceKm * (1 + (r.damage || 0) / 25 + (r.floodDepth || 0) * 3 + (r.traffic || 0) / 5);
// Risk 0-100 per road (used for the route risk score and "high risk" flag)
const roadRisk = (r) => Math.min(100, (r.damage || 0) * 0.6 + (r.floodDepth || 0) * 25 + (r.traffic || 0) * 2.5);
const isHighRisk = (r) => r.damage > 50 || r.floodDepth >= 0.5 || roadRisk(r) >= 50;
const damageLevel = (d) => (d <= 0 ? 'Safe' : d <= 25 ? 'Minor' : d <= 50 ? 'Moderate' : d <= 75 ? 'Severe' : 'Critical');

function edgeMinutes(r, speedKmh) {
  const eff = speedKmh * Math.max(0.15, 1 - (r.damage || 0) / 150 - (r.floodDepth || 0) * 0.25 - (r.traffic || 0) / 20);
  return (r.distanceKm / eff) * 60;
}

/**
 * mode: 'safe' (weighted cost) | 'distance' (pure distance)
 * allowBlocked: used only to find what the naive route would have used.
 * Heuristic = straight-line (haversine) km. Every edge cost >= edge distance >= straight line,
 * so the heuristic never overestimates -> A* is optimal.
 */
function astar(locations, roads, startId, goalId, { mode = 'safe', allowBlocked = false, speedKmh = 40 } = {}) {
  const loc = new Map(locations.map((l) => [l.id, l]));
  if (!loc.has(startId) || !loc.has(goalId)) return null;
  const adj = new Map(locations.map((l) => [l.id, []]));
  for (const r of roads) {
    if (r.blocked && !allowBlocked) continue; // blocked roads are excluded
    if (!adj.has(r.from) || !adj.has(r.to)) continue;
    adj.get(r.from).push({ to: r.to, road: r });
    adj.get(r.to).push({ to: r.from, road: r });
  }
  const goal = loc.get(goalId);
  const h = (id) => haversine(loc.get(id).lat, loc.get(id).lng, goal.lat, goal.lng);
  const g = new Map([[startId, 0]]), came = new Map(), closed = new Set();
  const open = new Map([[startId, h(startId)]]); // node -> f
  let explored = 0;
  while (open.size) {
    let cur = null, best = Infinity;
    for (const [id, f] of open) if (f < best) { best = f; cur = id; }
    open.delete(cur);
    if (cur === goalId) return summarise(startId, goalId, came, speedKmh, explored);
    closed.add(cur); explored++;
    for (const { to, road } of adj.get(cur)) {
      if (closed.has(to)) continue;
      const step = mode === 'distance' ? road.distanceKm : safeCost(road);
      const tentative = g.get(cur) + step;
      if (tentative < (g.has(to) ? g.get(to) : Infinity)) {
        g.set(to, tentative); came.set(to, { from: cur, road });
        open.set(to, tentative + h(to));
      }
    }
  }
  return null; // no route
}

function summarise(start, goal, came, speedKmh, explored) {
  const nodes = [goal], roads = [];
  for (let c = goal; c !== start;) { const p = came.get(c); roads.unshift(p.road); nodes.unshift(p.from); c = p.from; }
  const distanceKm = roads.reduce((s, r) => s + r.distanceKm, 0);
  const cost = roads.reduce((s, r) => s + safeCost(r), 0);
  const etaMin = roads.reduce((s, r) => s + edgeMinutes(r, speedKmh), 0);
  const riskScore = distanceKm ? roads.reduce((s, r) => s + roadRisk(r) * r.distanceKm, 0) / distanceKm : 0;
  return {
    nodes, roadIds: roads.map((r) => r.id),
    roads: roads.map((r) => ({ id: r.id, name: r.name, from: r.from, to: r.to, distanceKm: r.distanceKm, damage: r.damage, floodDepth: r.floodDepth, traffic: r.traffic, risk: Math.round(roadRisk(r)) })),
    distanceKm: +distanceKm.toFixed(2), cost: +cost.toFixed(2), etaMin: Math.round(etaMin), riskScore: Math.round(riskScore), explored,
  };
}

/** Joins two consecutive legs (vehicle -> warehouse, warehouse -> destination) into one route. */
function joinRoutes(a, b) {
  const dist = a.distanceKm + b.distanceKm;
  return {
    nodes: [...a.nodes, ...b.nodes.slice(1)], roadIds: [...a.roadIds, ...b.roadIds], roads: [...a.roads, ...b.roads],
    distanceKm: +dist.toFixed(2), cost: +(a.cost + b.cost).toFixed(2), etaMin: a.etaMin + b.etaMin,
    riskScore: dist ? Math.round((a.riskScore * a.distanceKm + b.riskScore * b.distanceKm) / dist) : 0, explored: a.explored + b.explored,
  };
}
const SPEEDS = { Ambulance: 55, 'Fire Engine': 50, 'Emergency Response Vehicle': 50, 'Rescue Van': 45, 'Relief Truck': 38, 'Water Tanker': 32 };
const speedFor = (type) => SPEEDS[type] || 40;

/** Compare shortest vs safe route and report what was avoided. */
function analyseRoutes(locations, roads, src, dst, vehicleType) {
  const speedKmh = speedFor(vehicleType);
  const safe = astar(locations, roads, src, dst, { mode: 'safe', speedKmh });
  const shortest = astar(locations, roads, src, dst, { mode: 'distance', speedKmh });
  const naive = astar(locations, roads, src, dst, { mode: 'distance', allowBlocked: true, speedKmh });
  if (!safe) return { found: false, message: 'No safe route currently available.', suggestions: noRouteSuggestions() };
  const byId = new Map(roads.map((r) => [r.id, r]));
  const safeSet = new Set(safe.roadIds);
  const blockedAvoided = (naive ? naive.roadIds : []).filter((id) => byId.get(id)?.blocked && !safeSet.has(id));
  const highRiskAvoided = (shortest ? shortest.roadIds : []).filter((id) => isHighRisk(byId.get(id)) && !safeSet.has(id));
  return { found: true, safe, shortest, blockedAvoided, highRiskAvoided, speedKmh };
}
const noRouteSuggestions = () => [
  'Dispatch from another warehouse',
  'Use another staging location closer to a reachable road',
  'Use another vehicle (e.g. a rescue van or boat-capable team)',
  'Wait for road clearance and re-run the calculation',
];
module.exports = { joinRoutes, astar, analyseRoutes, safeCost, roadRisk, isHighRisk, damageLevel, speedFor, noRouteSuggestions };
