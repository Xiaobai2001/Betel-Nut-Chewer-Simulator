const { loadConfig } = require('./config.cjs');
const { createPool } = require('./store.cjs');
const { accountInput, hashPassword } = require('./security.cjs');
(async () => {
  const input = accountInput({ username: process.env.CHEW_RESET_USER, password: process.env.CHEW_RESET_PASSWORD });
  if (!input) throw new Error('Set CHEW_RESET_USER and CHEW_RESET_PASSWORD (8-128 characters).');
  const pool = createPool(loadConfig().mysql), connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[user]] = await connection.execute('SELECT id FROM chew_users WHERE username=? FOR UPDATE', [input.username]);
    if (!user) throw new Error('Account not found.');
    await connection.execute('UPDATE chew_users SET password_hash=? WHERE id=?', [await hashPassword(input.password), user.id]);
    await connection.execute('DELETE FROM chew_sessions WHERE user_id=?', [user.id]);
    await connection.commit();
    console.log('Password reset. Existing sessions revoked; statistics preserved.');
  } catch (error) { await connection.rollback(); throw error; }
  finally { connection.release(); await pool.end(); }
})().catch(error => { console.error('Reset failed:', error.code || error.message); process.exitCode = 1; });
