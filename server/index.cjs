const { loadConfig } = require('./config.cjs');
const { createPool } = require('./store.cjs');
const { createApp } = require('./app.cjs');
(async () => {
  const config = loadConfig();
  const pool = createPool(config.mysql);
  await pool.query('SELECT id FROM chew_users LIMIT 1');
  const app = await createApp(pool, config);
  const server = app.listen(config.port, config.host || '127.0.0.1', () => console.log(new Date().toISOString(), 'Chew Simulator ready:', config.publicOrigin));
  server.on('error', error => { console.error('Listen failed:', error.code); pool.end().finally(() => process.exit(1)); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => pool.end().then(() => process.exit(0))));
})().catch(error => { console.error('Startup failed:', error.code || error.message); process.exit(1); });
