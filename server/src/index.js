const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { seedAll } = require('./seed');

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => { res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' }); next(); });
app.use(cors({ origin: [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/] }));
app.use(express.json({ limit: '100kb' }));
app.get('/', (req, res) => {
  res.send('CDIERS server is up and running!');
});
app.use('/api', rateLimit({ windowMs: 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests. Slow down.' } }));
app.get('/api/health', (req, res) => res.json({ ok: true, build: 'v6-selfheal-release-all', storage: 'json-files', data: 'Demo / Simulation Data' }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/api'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown API route' }));
// Safe error messages: details go to the server console only
app.use((err, req, res, next) => { // eslint-disable-line
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON body' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Internal server error' : err.message });
});

const PORT = process.env.PORT || 5000;
if (require.main === module) {
  seedAll(false).then(() => app.listen(PORT, () => console.log(`CDIERS API build v6 on http://localhost:${PORT} (JSON storage, no database)`)).on('error', (e) => { console.error(e.code === 'EADDRINUSE' ? `\nPORT ${PORT} IS ALREADY IN USE by an old CDIERS server. Close all old terminals or run: taskkill /F /IM node.exe\n` : e); process.exit(1); }));
}
module.exports = app;
app.get('/', (req, res) => {
  res.send('Server is up and running!');
});