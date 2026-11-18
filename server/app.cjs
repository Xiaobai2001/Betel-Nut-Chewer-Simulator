const express = require('express');
const path = require('node:path');
const crypto = require('node:crypto');
const { hashPassword, verifyPassword, digestToken, accountInput } = require('./security.cjs');
const { validateEvents, recordEvents, getStats, saveCheckin } = require('./store.cjs');

async function createApp(pool, config) {
  const app = express();
  app.disable('x-powered-by');
  const publicOrigin = new URL(config.publicOrigin).origin;
  const cookieOptions = { httpOnly: true, sameSite: 'strict', secure: publicOrigin.startsWith('https:'), path: '/' };
  const dummyHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
  const limits = new Map();
  function rateLimit(label, maximum, milliseconds) {
    return (req, res, next) => {
      const now = Date.now(), key = label + ':' + req.socket.remoteAddress;
      for (const [entry, value] of limits) if (value.until < now) limits.delete(entry);
      if (!limits.has(key) && limits.size >= 10000) return res.status(429).json({ error: '请求繁忙，请稍后再试。' });
      const bucket = limits.get(key) || { count: 0, until: now + milliseconds };
      bucket.count++; limits.set(key, bucket);
      if (bucket.count > maximum) { res.set('Retry-After', String(Math.ceil((bucket.until - now) / 1000))); return res.status(429).json({ error: '操作过于频繁，请稍后再试。' }); }
      next();
    };
  }
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY' });
    next();
  });
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: '不允许跨站请求。' });
    if (!['GET', 'HEAD'].includes(req.method) && (req.headers.origin !== publicOrigin || !req.is('application/json'))) return res.status(403).json({ error: '请从配置的网站地址提交请求。' });
    next();
  });
  app.use('/api', express.json({ limit: '32kb', strict: true }));
  const tokenFrom = req => {
    const token = (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('chew_session='))?.slice(13);
    return /^[A-Za-z0-9_-]{43}$/.test(token || '') ? token : null;
  };
  async function authenticate(req, res, next) {
    const token = tokenFrom(req);
    if (token) {
      const [[user]] = await pool.execute('SELECT u.id,u.username,u.display_name FROM chew_sessions s JOIN chew_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP(3)', [digestToken(token)]);
      if (user) { req.user = { id: Number(user.id), username: user.username, displayName: user.display_name }; req.sessionToken = token; }
    }
    next();
  }
  const required = (req, res, next) => req.user ? next() : res.status(401).json({ error: '请先登录。' });
  async function newSession(req, res, user) {
    const old = tokenFrom(req);
    if (old) await pool.execute('DELETE FROM chew_sessions WHERE token_hash=?', [digestToken(old)]);
    const token = crypto.randomBytes(32).toString('base64url');
    await pool.execute('INSERT INTO chew_sessions (token_hash,user_id,expires_at) VALUES (?,?,DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 14 DAY))', [digestToken(token), user.id]);
    res.cookie('chew_session', token, { ...cookieOptions, maxAge: 14 * 86400000 });
    return { id: Number(user.id), username: user.username, displayName: user.display_name };
  }
  app.get('/api/health', async (req, res) => { await pool.query('SELECT 1'); res.json({ ok: true, version: '1.3.0' }); });
  app.get('/api/session', authenticate, (req, res) => res.json({ user: req.user || null, registration: config.allowRegistration !== false }));
  app.post('/api/register', rateLimit('register', 5, 3600000), async (req, res) => {
    if (config.allowRegistration === false) return res.status(403).json({ error: '本站暂未开放注册。' });
    const input = accountInput(req.body);
    if (!input) return res.status(400).json({ error: '账号需为 3–24 位字母、数字或下划线；密码 8–128 位；昵称最多 24 字。' });
    try {
      const [result] = await pool.execute('INSERT INTO chew_users (username,display_name,password_hash) VALUES (?,?,?)', [input.username, input.displayName, await hashPassword(input.password)]);
      const user = await newSession(req, res, { id: result.insertId, username: input.username, display_name: input.displayName });
      res.status(201).json({ user });
    } catch (error) { if (error.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: '该账号已经注册，请登录或换一个账号。' }); throw error; }
  });
  app.post('/api/login', rateLimit('login', 15, 900000), async (req, res) => {
    const input = accountInput(req.body);
    if (!input) return res.status(400).json({ error: '请输入有效账号和密码。' });
    const [[user]] = await pool.execute('SELECT id,username,display_name,password_hash FROM chew_users WHERE username=?', [input.username]);
    const valid = await verifyPassword(input.password, user?.password_hash || dummyHash);
    if (!valid || !user) return res.status(401).json({ error: '账号或密码不正确。' });
    res.json({ user: await newSession(req, res, user) });
  });
  app.post('/api/logout', authenticate, async (req, res) => {
    if (req.user && req.body?.accountId !== req.user.id) return res.status(403).json({ error: '登录账号已变化，请刷新页面。' });
    if (req.sessionToken) await pool.execute('DELETE FROM chew_sessions WHERE token_hash=?', [digestToken(req.sessionToken)]);
    res.clearCookie('chew_session', cookieOptions); res.json({ ok: true });
  });
  app.get('/api/stats', authenticate, required, async (req, res) => res.json({ accountId: req.user.id, ...await getStats(pool, req.user.id) }));
  app.post('/api/checkin', authenticate, required, rateLimit('checkin', 30, 60000), async (req, res) => {
    if (req.body?.accountId !== req.user.id) return res.status(403).json({ error: '登录账号已变化，请刷新后重新打卡。' });
    res.json(await saveCheckin(pool, req.user.id, req.body));
  });
  app.post(['/api/events', '/api/events-v2'], authenticate, required, rateLimit('events', 180, 60000), async (req, res) => {
    if (req.body?.accountId !== req.user.id) return res.status(403).json({ error: '登录账号已变化，请重新登录对应账号后同步。' });
    if (req.path === '/api/events-v2' && req.body?.protocol !== 2) return res.status(400).json({ error: '此接口需要新版操作协议。' });
    if (!validateEvents(req.body)) return res.status(400).json({ error: '无效的操作记录。' });
    res.json(await recordEvents(pool, req.user.id, req.body));
  });
  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在。' }));
  app.use(express.static(path.resolve(__dirname, '../app'), { dotfiles: 'deny', etag: true, setHeaders: res => res.set('Cache-Control', 'no-cache') }));
  app.use((req, res) => res.status(404).send('Not found'));
  app.use((error, req, res, next) => {
    const status = error.status >= 400 && error.status < 500 ? error.status : 503;
    if (status === 503) console.error(new Date().toISOString(), 'Request failed:', error.code || 'INTERNAL_ERROR');
    res.status(status).json({ error: status === 503 ? '服务暂时不可用，记录会保留在本机等待同步。' : error.type === 'entity.parse.failed' ? '请求格式错误。' : error.type === 'entity.too.large' ? '请求过大。' : error.message });
  });
  return app;
}
module.exports = { createApp };
