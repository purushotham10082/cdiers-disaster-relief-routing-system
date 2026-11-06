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
  res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>CDIERS Server</title>
  <style>
    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      background: #0f172a;
      color: #f8fafc;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    main {
      max-width: 28rem;
      margin: 1.5rem;
      padding: 2rem 3rem;
      border: 1px solid #334155;
      border-radius: 12px;
      background: #1e293b;
      box-shadow: 0 10px 25px rgb(0 0 0 / 30%);
      text-align: center;
    }
    h1 { margin: 0 0 0.75rem; color: #38bdf8; font-size: 1.5rem; }
    p { margin: 0; color: #cbd5e1; }
  </style>
</head>
<body>
  <main>
    <h1>CDIERS Server</h1>
    <p>Status: Up and running successfully!</p>
  </main>
</body>
</html>`);
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