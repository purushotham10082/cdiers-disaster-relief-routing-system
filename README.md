# CDIERS - Chennai Disaster Intelligence & Emergency Relief Routing System

## Project Overview
A Chennai-only disaster command-center prototype. When a disaster is reported, the operator creates an emergency request, the system allocates relief stock from one or more warehouses, checks vehicle capacity, finds the **shortest SAFE route** with a hand-written A* algorithm, dispatches the mission, and **automatically re-routes** the vehicle if a road on its path becomes blocked.

> This is a disaster-management prototype using simulated/demo operational data and a local road graph. It is not a live emergency dispatch system. All data is labelled **Simulation Data**.

## Features
- Login with bcrypt-hashed passwords, JWT sessions, 4 roles, rate limiting, input validation, audit log
- **Disaster zone:** creating an incident identifies the affected zone (radius by severity: Critical 6 km, High 4, Medium 3, Low 2) and automatically disables the roads inside it. Roads touching the emergency location stay open as the access corridor so trucks can still reach it. Resolving or deleting the incident re-opens them.
- **Automatic resource dispatch:** creating an emergency request finds the nearest warehouse (by safe route), assigns truck(s) by capacity (no manual vehicle selection), calculates the safest route truck -> warehouse -> emergency location, and dispatches. If no truck is free the request waits and is dispatched automatically when one frees up.
- **Automatic evacuation:** creating an incident dispatches a truck from its nearest position to the affected location, then carries people to the nearest safe (outside the zone) shelter or hospital (hospital first for injury-type disasters).
- Safe routing with A* (blocked, zone and damaged roads avoided), route comparison, road failure simulation with automatic re-route, no-route handling with suggestions
- Live Map shows only active mission routes by default; the full road network and its condition is an optional toggle
- Hospitals, shelters and warehouses are plain location points (no status, capacity or stock tracking). Vehicles and rescue teams are view-only: the system assigns and updates them.
- Vehicle-to-pickup leg, live movement playback, per-mission timeline, reports, 4 one-click scenarios

## Technology Stack
React + Vite (JavaScript), Recharts, Lucide icons, Leaflet/OpenStreetMap; Node.js + Express; JSON files for storage. **No database of any kind.** (`bcryptjs` is used instead of native `bcrypt` so installation works on Windows without build tools; hashes are bcrypt-compatible.)

## Folder Structure
```
CDIERS/
  data/                 JSON files = persistent storage (users, roads, incidents, missions, auditLogs, ...)
  server/src/
    algorithms/astar.js A* + route analysis
    services/           dispatch, road failure/re-route, scenarios, audit
    routes/             auth.js, api.js
    middleware/auth.js  JWT + roles
    utils/              jsonStore.js, validate.js, geo.js
    seed.js, seedData.js  demo data
    selftest.js         end-to-end test (npm test)
  client/src/           React app (pages/, components/)
  start.bat             Windows one-click start
```

## Installation (Windows, needs only Node.js 18.11+ and internet for map tiles)
Easiest: double-click `start.bat`. Or manually:
```
npm run setup      (installs root, server and client dependencies)
npm run dev        (starts backend :5000 and frontend :5173 together)
```
### Running backend only
```
cd server && npm install && npm run dev
```
### Running frontend only
```
cd client && npm install && npm run dev
```
Open http://localhost:5173

## Demo Login
| Role | Email | Password |
|---|---|---|
| Admin | admin@cdiers.local | Admin@123 |
| Command Center Operator | operator@cdiers.local | Operator@123 |
| Dispatcher | dispatcher@cdiers.local | Dispatch@123 |
| Field Responder | responder@cdiers.local | Responder@123 |

## How A* Works
`server/src/algorithms/astar.js` keeps an open set ordered by `f = g + h`. `g` is the cost so far, `h` is the straight-line (haversine) distance to the goal. Because every road's cost is at least its length, which is at least the straight-line distance, `h` never overestimates, so the result is optimal. If the open set empties, there is no route and the API returns "No safe route currently available."

## How Safe Routing Works
Each road costs `distance * (1 + damage/25 + floodDepth*3 + traffic/5)`. Blocked roads are removed from the graph. The API also computes the pure-distance route and reports distance, ETA (vehicle speed reduced by damage/flood/traffic), a 0-100 risk score, roads used, **blocked roads avoided** and **high-risk roads avoided**.

## How Road Failure Simulation Works
`POST /api/roads/:id/simulate-failure` blocks the road (writes `roads.json`), then checks every active mission. If the road is on the part of the route the vehicle has not travelled yet, A* re-runs from the vehicle's current node. The mission becomes **Route Recalculated** and the timeline records "Route recalculated because Road R-001 (Guindy - Velachery) became unavailable." If no path exists the mission holds position with a no-route alert and suggestions.

## JSON Storage Architecture
`utils/jsonStore.js` exposes `readData, writeData, mutate, findById, create, updateById, deleteById`. Writes go to a temp file then atomically rename; a per-file promise queue serialises concurrent writes. Missing, empty or corrupt files return `[]` (corrupt files are moved aside) and are re-seeded on startup.

## Map vs Road Graph
OpenStreetMap is only the visual base layer. A* runs on a hand-built graph of 22 Chennai localities and 40 roads in `data/roads.json`. It is **not** live Chennai traffic or real road geometry.

## API Documentation
All routes except login need `Authorization: Bearer <token>`.
| Method | Route | Notes |
|---|---|---|
| POST | /api/auth/login | email, password |
| GET | /api/dashboard, /api/reports, /api/bootstrap | stats / all data |
| GET POST PUT DELETE | /api/incidents[/:id] | POST = zone + evacuation; delete = Admin |
| POST | /api/incidents/:id/evacuate | dispatch an evacuation truck |
| GET POST PUT | /api/requests[/:id] | POST auto-dispatches |
| GET | /api/warehouses, /vehicles, /hospitals, /shelters, /rescue-teams | read-only |
| GET PUT | /api/roads[/:id] | PUT re-routes affected missions |
| POST | /api/roads/:id/simulate-failure | failureType, floodDepth, damage |
| POST | /api/routes/calculate | sourceId, targetId (truck assumed) |
| POST | /api/dispatch/plan, /api/dispatch/commit | requestId (commit = retry dispatch) |
| GET POST PUT | /api/missions[/:id] | PUT `{status}` |
| POST | /api/missions/:id/advance, /step, /reroute | next status / move one node / recalc |
| GET | /api/missions/:id/timeline | operations timeline |
| GET POST | /api/simulation/scenarios, /run, /reset | scenarios, reset (Admin) |
| GET | /api/audit-logs | Admin / Operator |

## Disaster Simulation Instructions
Open **Disaster Simulation** and run Velachery Flood, Pallikaranai Flood, Coastal Cyclone or Industrial Emergency (Guindy). Then open **Relief Missions**, select a mission, press **Next status** (Dispatched), **Move vehicle 1 node**, then **Block next road ahead** and watch the route turn from grey (original) to green (new). Use **Reset demo data** (Admin) to start over.

### Full demo flow
Login > Dashboard > Live Map > Incidents: create Flood/Velachery/Critical > Emergency Requests: create water/food/medical/rescue > Plan dispatch (warehouses, capacity, A* route shown) > Confirm > Missions: dispatch > Road Network: Simulate failure on Guindy-Velachery > see re-route > Next status until Completed > Timeline > Audit Logs.

## Testing
`cd server && npm test` runs 38 end-to-end checks on a temporary data folder (login, RBAC, removed features, disaster zones, evacuation, nearest-warehouse auto-dispatch, truck capacity, waiting queue, road failure re-route, no-route, scenarios, empty-file recovery).

## Vehicle pickup leg and live movement
Each supply mission is planned as two legs joined into one route: vehicle's current location -> warehouse (loading point) -> destination. The plan shows the extra "vehicle to warehouse" distance; the map draws it as a dashed orange line, and the timeline records "Loading at warehouse". If a road fails before the vehicle reaches the warehouse, A* re-plans both legs. On **Relief Missions**, select a mission and press **Play live movement** (1x/2x/4x): it dispatches the mission and moves the vehicle node by node, gliding along the street shape on the map. Block a road ahead while it plays to see the live re-route.

## Project Limitations
- Simulated data and a hand-made road graph; not live traffic, weather or government data
- Vehicles do not return to base after completing a mission
- One rescue team per request; evacuation trucks carry people only (no head-count or shelter capacity is tracked)
- Several open incidents can disable many roads at once, so a mission may correctly report 'No safe route currently available'; resolve an incident to re-open its roads
- JSON files suit a single local server, not high-volume production use
