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
    // 10,000 more addresses, the way one IPv6 client can rotate through its own prefix. None is refused.
    const statuses = [];
    for (let i = 0; i < 10_000; i += 100) {
      statuses.push(...(await Promise.all(Array.from({ length: 100 }, (_, j) => post(srv.base, { 'fly-client-ip': `2001:db8:1::${(i + j).toString(16)}` })))));
    }
    assert.ok(statuses.every((s) => s === 400));
    // The table is full, so the oldest bucket (the first client's) was dropped and starts over.
    assert.equal(await post(srv.base, first), 400);
    // The newest buckets are kept: the last address is still counted.
    const last = { 'fly-client-ip': '2001:db8:1::270f' };
    assert.deepEqual([await post(srv.base, last), await post(srv.base, last)], [400, 429]);
  } finally {
    srv.child.kill();
  }
});
