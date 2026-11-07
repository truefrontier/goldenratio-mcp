// Starts dist/http.js on a free localhost port and checks routing, errors, the rate limit and a real MCP round trip.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer as netServer } from 'node:net';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const HTTP_JS = new URL('../dist/http.js', import.meta.url).pathname;
const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

function freePort() {
  return new Promise((resolve, reject) => {
    const s = netServer().once('error', reject).listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// Resolves once the server logs that it is listening.
async function start(env = {}) {
  const port = await freePort();
  const child = spawn(process.execPath, [HTTP_JS], { env: { ...process.env, PORT: String(port), ...env }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((resolve, reject) => {
    child.once('exit', (code) => reject(new Error(`http.js exited early with code ${code}`)));
    child.stdout.on('data', (d) => d.toString().includes('listening') && resolve());
  });
  return { base: `http://127.0.0.1:${port}`, child };
}

let srv;
before(async () => (srv = await start()));
after(() => srv.child.kill());

const post = (path, body, headers = {}) =>
  fetch(srv.base + path, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers }, body });

test('GET /healthz is ok', async () => {
  const r = await fetch(srv.base + '/healthz');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'application/json');
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await r.json(), { ok: true });
});

test('GET / describes the server and lists the same tools the MCP endpoint serves', async () => {
  const r = await fetch(srv.base + '/');
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const info = await r.json();
  assert.deepEqual(info, {
    name: 'goldenratio.app MCP server',
    version: VERSION,
    mcp_endpoint: 'https://mcp.goldenratio.app/mcp',
    transport: 'streamable-http',
    site: 'https://goldenratio.app',
    source: 'https://github.com/truefrontier/goldenratio-mcp',
    terms: 'https://github.com/truefrontier/goldenratio-mcp#hosted-service',
    tools: ['golden_calculator', 'golden_spacing', 'golden_grid', 'golden_css_variables', 'tailwind_plugin_setup', 'golden_ratio_steps'],
  });

  const client = new Client({ name: 'goldenratio-test', version: '0.0.0' });
  await client.connect(new StreamableHTTPClientTransport(new URL(srv.base + '/mcp')));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(info.tools, tools.map((t) => t.name));
    assert.equal(client.getServerVersion().version, VERSION);
    const r2 = await client.callTool({ name: 'golden_calculator', arguments: { left: [6, 5], right: [7] } });
    assert.equal(JSON.parse(r2.content[0].text).equal, true);
  } finally {
    await client.close();
  }
});

test('unknown paths are 404, whatever the method', async () => {
  for (const [method, path] of [['GET', '/nope'], ['POST', '/nope'], ['GET', '/mcp/']]) {
    const r = await fetch(srv.base + path, { method });
    assert.equal(r.status, 404, `${method} ${path}`);
    assert.equal(r.headers.get('access-control-allow-origin'), '*');
    assert.deepEqual(await r.json(), { error: 'not found' });
  }
});

test('GET and DELETE /mcp are 405 with Allow: POST (stateless, no SSE stream or session)', async () => {
  for (const method of ['GET', 'DELETE']) {
    const r = await fetch(srv.base + '/mcp', { method });
    assert.equal(r.status, 405, method);
    assert.equal(r.headers.get('allow'), 'POST');
    assert.deepEqual(await r.json(), { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. POST JSON-RPC to /mcp.' }, id: null });
  }
});

test('OPTIONS answers the CORS preflight', async () => {
  const r = await fetch(srv.base + '/mcp', { method: 'OPTIONS', headers: { origin: 'https://example.com', 'access-control-request-method': 'POST' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.equal(r.headers.get('access-control-allow-methods'), 'GET, POST, OPTIONS');
  assert.equal(r.headers.get('access-control-allow-headers'), 'content-type, accept, mcp-protocol-version, mcp-session-id');
  assert.equal(await r.text(), '');
});

test('malformed JSON is a 400 parse error', async () => {
  const r = await post('/mcp', '{"jsonrpc":');
  assert.equal(r.status, 400);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const body = await r.json();
  assert.equal(body.error.code, -32700);
  assert.equal(body.id, null);
});

test('a body over 256 KB is 413, not a parse error; 256 KB exactly still gets through', async () => {
  const r = await post('/mcp', JSON.stringify({ pad: 'x'.repeat(300 * 1024) }));
  assert.equal(r.status, 413);
  assert.equal(r.headers.get('access-control-allow-origin'), '*');
  assert.deepEqual(await r.json(), { jsonrpc: '2.0', error: { code: -32000, message: 'Request body too large (max 256 KB).' }, id: null });

  const atCap = `{"pad":"${'x'.repeat(256 * 1024 - 10)}"}`;
  assert.equal(Buffer.byteLength(atCap), 256 * 1024);
  const ok = await post('/mcp', atCap);
  assert.equal(ok.status, 400, 'reaches the MCP transport, which rejects a body that is not JSON-RPC');
  assert.equal((await ok.json()).error.message, 'Parse error: Invalid JSON-RPC message');
});

test('the default rate limit is the 120 a minute the README promises', async () => {
  const hit = () => post('/mcp', '{', { 'fly-client-ip': '203.0.113.120' }).then((r) => r.status);
  for (let i = 1; i <= 120; i++) assert.equal(await hit(), 400, `post ${i}`);
  assert.equal(await hit(), 429);
  assert.match(readFileSync(new URL('../README.md', import.meta.url), 'utf8'), /no auth, 120 requests a minute per IP/);
});

test('the rate limit returns 429 after RATE_LIMIT_PER_MIN posts from one client IP', async () => {
  const limited = await start({ RATE_LIMIT_PER_MIN: '2' });
  try {
    const hit = (headers) => fetch(limited.base + '/mcp', { method: 'POST', headers, body: '{' });
    assert.equal((await hit({ 'fly-client-ip': '203.0.113.1' })).status, 400);
    assert.equal((await hit({ 'fly-client-ip': '203.0.113.1' })).status, 400);
    const r = await hit({ 'fly-client-ip': '203.0.113.1' });
    assert.equal(r.status, 429);
    assert.deepEqual(await r.json(), { jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded, try again in a minute.' }, id: null });
    // Each client IP gets its own bucket: Fly's fly-client-ip, else the first x-forwarded-for entry.
    assert.equal((await hit({ 'fly-client-ip': '203.0.113.2' })).status, 400);
    assert.equal((await hit({ 'x-forwarded-for': '198.51.100.7, 10.0.0.1' })).status, 400);
    assert.equal((await hit({ 'x-forwarded-for': '198.51.100.7, 10.0.0.2' })).status, 400);
    assert.equal((await hit({ 'x-forwarded-for': '198.51.100.7' })).status, 429);
    // GETs are not counted.
    assert.equal((await fetch(limited.base + '/healthz', { headers: { 'fly-client-ip': '203.0.113.1' } })).status, 200);
  } finally {
    limited.child.kill();
  }
});
