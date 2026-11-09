// Remote MCP over Streamable HTTP (stateless, read-only, no auth). POST /mcp.
import { createServer as createHttpServer, IncomingMessage, ServerResponse } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createServer, VERSION, REMOTE_URL, TERMS_URL, TOOLS } from './server.js';

const PORT = Number(process.env.PORT ?? 8080);
const LIMIT = rateLimit(process.env.RATE_LIMIT_PER_MIN); // requests per IP per minute
const hits = new Map<string, { n: number; reset: number }>();

// Number('abc') is NaN, and `++h.n > NaN` is always false, so a bad value used to turn the limit off.
function rateLimit(raw: string | undefined, fallback = 120) {
  const n = Number(raw ?? fallback);
  if (Number.isInteger(n) && n > 0) return n;
  console.error(`RATE_LIMIT_PER_MIN=${JSON.stringify(raw)} is not a positive whole number; using ${fallback}.`);
  return fallback;
}

// Fly Proxy sets fly-client-ip, and Fly sets FLY_APP_NAME in every Machine. Anywhere else a client can
// send that header itself (and always picks x-forwarded-for's first entry), so use the socket address.
const ON_FLY = !!process.env.FLY_APP_NAME;
function clientIp(req: IncomingMessage) {
  return (ON_FLY && (req.headers['fly-client-ip'] as string)) || req.socket.remoteAddress || '?';
}
function limited(ip: string) {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return false;
  }
  return ++h.n > LIMIT;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.reset < now) hits.delete(k);
}, 60_000).unref();

function send(res: ServerResponse, code: number, body: unknown, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'access-control-allow-origin': '*' });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

class BodyTooLarge extends Error {}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 256 * 1024) throw new BodyTooLarge();
    chunks.push(c);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
}

createHttpServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type, accept, mcp-protocol-version, mcp-session-id',
    });
    return res.end();
  }
  if (url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (url.pathname === '/' && req.method === 'GET') {
    return send(res, 200, {
      name: 'goldenratio.app MCP server',
      version: VERSION,
      mcp_endpoint: REMOTE_URL,
      transport: 'streamable-http',
      site: 'https://goldenratio.app',
      source: 'https://github.com/truefrontier/goldenratio-mcp',
      terms: TERMS_URL,
      tools: TOOLS,
    });
  }
  if (url.pathname !== '/mcp') return send(res, 404, { error: 'not found' });
  if (req.method !== 'POST') {
    // Stateless server: no SSE stream or sessions to resume.
    res.setHeader('allow', 'POST');
    return send(res, 405, { jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed. POST JSON-RPC to /mcp.' }, id: null });
  }
  if (limited(clientIp(req))) return send(res, 429, { jsonrpc: '2.0', error: { code: -32000, message: 'Rate limit exceeded, try again in a minute.' }, id: null });
  try {
    const body = await readBody(req);
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => {
      transport.close();
      server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, body);
  } catch (e) {
    if (res.headersSent) return;
    if (e instanceof BodyTooLarge) return send(res, 413, { jsonrpc: '2.0', error: { code: -32000, message: 'Request body too large (max 256 KB).' }, id: null });
    send(res, 400, { jsonrpc: '2.0', error: { code: -32700, message: String((e as Error).message) }, id: null });
  }
}).listen(PORT, () => console.log(`goldenratio-mcp ${VERSION} listening on :${PORT}/mcp`));
