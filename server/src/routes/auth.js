const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const store = require('../utils/jsonStore');
const { sign, authenticate } = require('../middleware/auth');
const audit = require('../services/audit');
const { validate } = require('../utils/validate');

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many login attempts. Try again in 15 minutes.' } });
const DUMMY = bcrypt.hashSync('not-a-real-password', 10); // constant-time-ish response for unknown users

router.post('/login', limiter, async (req, res, next) => {
  try {
    const v = validate(req.body, { email: { type: 'string', required: true, max: 120 }, password: { type: 'string', required: true, max: 100 } });
    if (!v.ok) return res.status(400).json({ error: 'Email and password are required' });
    const user = (await store.readData('users.json')).find((u) => u.email.toLowerCase() === v.data.email.toLowerCase());
    const ok = await bcrypt.compare(v.data.password, user ? user.passwordHash : DUMMY);
    if (!user || !ok) { await audit.log({ name: v.data.email, role: 'Unknown' }, 'Login failed', 'Auth', 'Failed sign-in attempt'); return res.status(401).json({ error: 'Invalid email or password' }); }
    await audit.log(user, 'Login', 'Auth', `${user.name} signed in`);
    res.json({ token: sign(user), user: { id: user.id, name: user.name, email: user.email, role: user.role } }); // no hash ever leaves the server
  } catch (e) { next(e); }
});
router.get('/me', authenticate, (req, res) => res.json({ user: req.user }));
module.exports = router;
