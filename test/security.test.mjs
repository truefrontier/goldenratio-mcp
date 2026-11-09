// What a client can do to the HTTP server's rate limit. Starts dist/http.js on a free localhost port.
// Run with `npm test` (builds dist/ first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as netServer } from 'node:net';

const HTTP_JS = new URL('../dist/http.js', import.meta.url).pathname;
function freePort() {
  return new Promise((resolve, reject) => {
    const s = netServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}
async function start(env = {}) {
  const port = await freePort();
  const childEnv = { ...process.env, PORT: String(port), ...env };
  for (const k of Object.keys(childEnv)) if (childEnv[k] === undefined) delete childEnv[k];
  const child = spawn(process.execPath, [HTTP_JS], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  await new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`http.js exited early with code ${code}: ${stderr}`)));
    child.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
  });
  return { base: `http://127.0.0.1:${port}`, child, stderr: () => stderr };
}
// A malformed body is answered with a 400 without building an MCP server, so posts are cheap.
const post = (base, headers = {}) => fetch(base + '/mcp', { method: 'POST', headers, body: '{' }).then((r) => r.status);

test('a bad RATE_LIMIT_PER_MIN falls back to 120 a minute instead of turning the limit off', async () => {
  for (const value of ['abc', 'Infinity', '', '0', '-5', '2.5']) {
    const srv = await start({ RATE_LIMIT_PER_MIN: value, FLY_APP_NAME: undefined });
    try {
      const statuses = [];
      for (let i = 0; i < 121; i++) statuses.push(await post(srv.base));
      assert.equal(statuses.filter((s) => s === 400).length, 120, `RATE_LIMIT_PER_MIN=${JSON.stringify(value)}`);
      assert.equal(statuses[120], 429, `RATE_LIMIT_PER_MIN=${JSON.stringify(value)}`);
      assert.match(srv.stderr(), /RATE_LIMIT_PER_MIN.*using 120/);
    } finally {
      srv.child.kill();
    }
  }
});

test('off Fly, a client cannot pick its own rate-limit bucket with fly-client-ip or x-forwarded-for', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: undefined });
  try {
    assert.equal(await post(srv.base, { 'fly-client-ip': '203.0.113.1' }), 400);
    assert.equal(await post(srv.base, { 'x-forwarded-for': '198.51.100.1' }), 400);
    assert.equal(await post(srv.base, { 'fly-client-ip': '203.0.113.2' }), 429);
    assert.equal(await post(srv.base, { 'x-forwarded-for': '198.51.100.2, 10.0.0.1' }), 429);
  } finally {
    srv.child.kill();
  }
});

test('on Fly, IPv6 clients share one rate-limit bucket per /64', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'goldenratio-mcp' });
  try {
    const from = (ip) => post(srv.base, { 'fly-client-ip': ip });
    // One client usually gets a whole /64, so stepping through its addresses must not reset the count.
    assert.equal(await from('2001:db8:1:2::1'), 400);
    assert.equal(await from('2001:db8:1:2:ffff:ffff:ffff:ffff'), 400);
    assert.equal(await from('2001:0DB8:0001:0002::3'), 429);
    // The next /64 over is a different client.
    assert.equal(await from('2001:db8:1:3::1'), 400);
  } finally {
    srv.child.kill();
  }
});

test('IPv4 clients keep one rate-limit bucket per address, also in the ::ffff: form a dual-stack socket reports', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'goldenratio-mcp' });
  try {
    const from = (ip) => post(srv.base, { 'fly-client-ip': ip });
    assert.equal(await from('::ffff:198.51.100.1'), 400);
    assert.equal(await from('::ffff:198.51.100.1'), 400);
    assert.equal(await from('::ffff:198.51.100.1'), 429);
    // Mapped IPv4 addresses all sit in ::/64, so a plain /64 rule would put every IPv4 client in one bucket.
    assert.equal(await from('::ffff:198.51.100.2'), 400);
    assert.equal(await from('198.51.100.3'), 400);
  } finally {
    srv.child.kill();
  }
});

test('on Fly, the rate limit buckets by fly-client-ip and ignores x-forwarded-for', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'goldenratio-mcp' });
  try {
    const a = { 'fly-client-ip': '203.0.113.1' };
    assert.equal(await post(srv.base, a), 400);
    assert.equal(await post(srv.base, { ...a, 'x-forwarded-for': '198.51.100.1' }), 400);
    assert.equal(await post(srv.base, { ...a, 'x-forwarded-for': '198.51.100.2' }), 429);
    assert.equal(await post(srv.base, { 'fly-client-ip': '203.0.113.2' }), 400);
  } finally {
    srv.child.kill();
  }
});
