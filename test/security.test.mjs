// What a client can do to the HTTP server's rate limit. Starts dist/http.js on a free localhost port.
// Run with `npm test` (builds dist/ first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const HTTP_JS = new URL('../dist/http.js', import.meta.url).pathname;
// PORT=0 lets http.js bind a free port itself, so no other process can take it between a probe and the bind.
// Resolves with that port once the server logs it.
async function start(env = {}) {
  const childEnv = { ...process.env, PORT: '0', ...env };
  for (const k of Object.keys(childEnv)) if (childEnv[k] === undefined) delete childEnv[k];
  const child = spawn(process.execPath, [HTTP_JS], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => (stderr += d));
  const port = await new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`http.js exited early with code ${code}: ${stderr}`)));
    child.stdout.on('data', (d) => { const m = d.toString().match(/listening on :(\d+)\//); if (m) resolve(m[1]); });
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

test('the rate-limit table holds at most 10,000 clients, so rotating IPv6 addresses cannot grow it', async () => {
  const srv = await start({ RATE_LIMIT_PER_MIN: '2', FLY_APP_NAME: 'goldenratio-mcp' });
  try {
    const first = { 'fly-client-ip': '2001:db8::1' };
    assert.deepEqual([await post(srv.base, first), await post(srv.base, first), await post(srv.base, first)], [400, 400, 429]);
    // 10,000 more /64s, the way one client holding a /48 can rotate through its own prefix. None is refused.
    const statuses = [];
    for (let i = 0; i < 10_000; i += 100) {
      statuses.push(...(await Promise.all(Array.from({ length: 100 }, (_, j) => post(srv.base, { 'fly-client-ip': `2001:db8:1:${(i + j).toString(16)}::1` })))));
    }
    assert.ok(statuses.every((s) => s === 400));
    // The table is full, so the oldest bucket (the first client's) was dropped and starts over.
    assert.equal(await post(srv.base, first), 400);
    // The newest buckets are kept: the last address is still counted.
    const last = { 'fly-client-ip': '2001:db8:1:270f::1' };
    assert.deepEqual([await post(srv.base, last), await post(srv.base, last)], [400, 429]);
  } finally {
    srv.child.kill();
  }
});
