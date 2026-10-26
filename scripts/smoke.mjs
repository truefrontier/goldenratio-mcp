// Calls every tool through a real MCP client.
// Usage: node scripts/smoke.mjs            (spawns the stdio server)
//        node scripts/smoke.mjs <url>      (remote Streamable HTTP, e.g. https://goldenratio-mcp.fly.dev/mcp)
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const url = process.argv[2];
const transport = url
  ? new StreamableHTTPClientTransport(new URL(url))
  : new StdioClientTransport({ command: process.execPath, args: [new URL('../dist/stdio.js', import.meta.url).pathname] });
const client = new Client({ name: 'goldenratio-smoke', version: '1.0.0' });
await client.connect(transport);
console.log('server:', JSON.stringify(client.getServerVersion()));
const { tools } = await client.listTools();
console.log('tools:', tools.map((t) => t.name).join(', '));

const calls = [
  ['golden_calculator', { left: [6, 5, 6] }],
  ['golden_calculator', { left: [6, 5], right: [7] }],
  ['golden_calculator', { left: [9], right: [6, 7] }],
  ['golden_spacing', {}],
  ['golden_spacing', { spacer_base: 16, spacer_unit: 'px', prefix: true }],
  ['golden_grid', { row: ['half-4', '5', 'half-4'], container_px: 1200, include_examples: false }],
  ['golden_grid', {}],
  ['golden_css_variables', { format: 'min' }],
  ['tailwind_plugin_setup', { prefix: 'gr-', spacer_base: 1 }],
  ['golden_ratio_steps', { value: 16, steps_up: 3, steps_down: 2, unit: 'px' }],
  ['golden_grid', { row: ['13'] }, 'expect-error'],
  ['golden_calculator', { left: [12] }, 'expect-error'],
];
let failures = 0;
for (const [name, args, expect] of calls) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? '';
  if (!!r.isError !== (expect === 'expect-error')) failures++;
  console.log(`\n--- ${name} ${JSON.stringify(args)}${r.isError ? ' [ERROR' + (expect ? ', expected' : '') + ']' : ''}\n${text.length > 700 ? text.slice(0, 700) + `\n... (${text.length} chars)` : text}`);
}
await client.close();
console.log(`\nDONE: ${calls.length} calls, ${failures} errors`);
process.exit(failures ? 1 : 0);
