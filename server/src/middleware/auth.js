const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// JWT secret: env var, else a random secret persisted next to the server (never sent to the client).
const secretFile = path.resolve(__dirname, '../../.jwt-secret');
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  try { return fs.readFileSync(secretFile, 'utf8').trim(); } catch { /* create below */ }
  const s = crypto.randomBytes(48).toString('hex');
  try { fs.writeFileSync(secretFile, s, { mode: 0o600 }); } catch { /* ignore */ }
  return s;
}
const SECRET = loadSecret();
const ROLES = { ADMIN: 'Admin', OPERATOR: 'Command Center Operator', DISPATCHER: 'Dispatcher', RESPONDER: 'Field Responder' };

const sign = (u) => jwt.sign({ sub: u.id, name: u.name, role: u.role }, SECRET, { expiresIn: '8h' });
function authenticate(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try { const p = jwt.verify(token, SECRET); req.user = { id: p.sub, name: p.name, role: p.role }; next(); }
  catch { res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' }); }
}
const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) || req.user.role === ROLES.ADMIN ? next() : res.status(403).json({ error: `Your role (${req.user.role}) is not allowed to do this` });
module.exports = { sign, authenticate, requireRole, ROLES };
