// Calls every tool through an in-memory MCP client: real schema validation, real handlers, no network.
// Run with `npm test` (builds dist/ first).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, VERSION, REMOTE_URL } from '../dist/server.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const PKG = JSON.parse(read('../package.json'));
const TOOLS = ['golden_calculator', 'golden_spacing', 'golden_grid', 'golden_css_variables', 'tailwind_plugin_setup', 'golden_ratio_steps'];

// The default scale: [name, exact value, px at a 16px root]. Spacer 6 = 1.5rem; each step up is x 1.61803398875.
const SPACERS = [
  ['1', '0.13525491562416744rem', 2.1641],
  ['2', '0.21884705062541632rem', 3.5016],
  ['3', '0.35410196624961554rem', 5.6656],
  ['4', '0.5729490168750833rem', 9.1672],
  ['5', '0.9270509831247821rem', 14.8328],
  ['6', '1.5rem', 24],
  ['7', '2.427050983125rem', 38.8328],
  ['8', '3.9270509831253526rem', 62.8328],
  ['9', '6.354101966250923rem', 101.6656],
  ['10', '10.281152949377198rem', 164.4984],
  ['11', '16.635254915629613rem', 266.1641],
  ['half-1', '0.06762745781208372rem', 1.082],
  ['half-2', '0.10942352531270816rem', 1.7508],
  ['half-3', '0.17705098312480777rem', 2.8328],
  ['half-4', '0.28647450843754163rem', 4.5836],
  ['half-5', '0.46352549156239103rem', 7.4164],
  ['half-6', '0.75rem', 12],
  ['half-7', '1.2135254915625rem', 19.4164],
  ['half-8', '1.9635254915626763rem', 31.4164],
  ['half-9', '3.1770509831254614rem', 50.8328],
  ['half-10', '5.140576474688599rem', 82.2492],
  ['half-11', '8.317627457814806rem', 133.082],
  ['double-1', '0.2705098312483349rem', 4.3282],
  ['double-2', '0.43769410125083263rem', 7.0031],
  ['double-3', '0.7082039324992311rem', 11.3313],
  ['double-4', '1.1458980337501665rem', 18.3344],
  ['double-5', '1.8541019662495641rem', 29.6656],
  ['double-6', '3rem', 48],
  ['double-7', '4.85410196625rem', 77.6656],
  ['double-8', '7.854101966250705rem', 125.6656],
  ['double-9', '12.708203932501846rem', 203.3313],
  ['double-10', '20.562305898754396rem', 328.9969],
  ['double-11', '33.270509831259226rem', 532.3282],
];

// The golden grid: [name, width, px in a 1200px row]. grp-6 is the full row.
const GRID = [
  ['1', '9.016994374944495%', 108.2],
  ['2', '14.589803375027754%', 175.08],
  ['3', '23.60679774997437%', 283.28],
  ['4', '38.19660112500555%', 458.36],
  ['5', '61.80339887498547%', 741.64],
  ['6', '100%', 1200],
  ['7', '161.803398875%', 1941.64],
  ['8', '261.8033988750235%', 3141.64],
  ['9', '423.6067977500615%', 5083.28],
  ['10', '685.4101966251465%', 8224.92],
  ['11', '1109.0169943753074%', 13308.2],
  ['half-1', '4.508497187472248%', 54.1],
  ['half-2', '7.294901687513877%', 87.54],
  ['half-3', '11.803398874987185%', 141.64],
  ['half-4', '19.098300562502775%', 229.18],
  ['half-5', '30.901699437492734%', 370.82],
  ['half-6', '50%', 600],
  ['half-7', '80.9016994375%', 970.82],
  ['half-8', '130.90169943751175%', 1570.82],
  ['half-9', '211.80339887503075%', 2541.64],
  ['half-10', '342.7050983125732%', 4112.46],
  ['half-11', '554.5084971876537%', 6654.1],
  ['double-1', '18.03398874988899%', 216.41],
  ['double-2', '29.17960675005551%', 350.16],
  ['double-3', '47.21359549994874%', 566.56],
  ['double-4', '76.3932022500111%', 916.72],
  ['double-5', '123.60679774997094%', 1483.28],
  ['double-6', '200%', 2400],
  ['double-7', '323.60679775%', 3883.28],
  ['double-8', '523.606797750047%', 6283.28],
  ['double-9', '847.213595500123%', 10166.56],
  ['double-10', '1370.820393250293%', 16449.84],
  ['double-11', '2218.0339887506148%', 26616.41],
];

const ROOT_HEAD = [['--gr', '1.61803398875'], ['--golden-ratio', '1.61803398875px'], ['--golden-ratio-base', '1.5'], ['--golden-ratio-unit', '1rem']];
const ROOT_VARS = [...ROOT_HEAD, ...SPACERS.map(([n, v]) => [`--golden-ratio-${n}`, v])];
const ROOT_CSS = `:root {\n${ROOT_VARS.map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;

let client;
before(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  client = new Client({ name: 'goldenratio-test', version: '0.0.0' });
  await client.connect(clientSide);
});
after(() => client.close());

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  return { isError: !!r.isError, text: r.content[0].text };
}
async function text(name, args) {
  const r = await call(name, args);
  assert.equal(r.isError, false, r.text);
  return r.text;
}
const json = async (name, args) => JSON.parse(await text(name, args));
async function error(name, args) {
  const r = await call(name, args);
  assert.equal(r.isError, true, `expected an error, got: ${r.text.slice(0, 200)}`);
  return r.text;
}

// --- drift ---

test('lists the six tools in order, all read-only and closed-world', async () => {
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), TOOLS);
  for (const t of tools) assert.deepEqual(t.annotations, { readOnlyHint: true, openWorldHint: false }, t.name);
});

test('VERSION, the MCP server version and package.json agree', () => {
  assert.equal(VERSION, PKG.version);
  assert.equal(client.getServerVersion().name, 'goldenratio-app');
  assert.equal(client.getServerVersion().version, PKG.version);
  assert.equal(REMOTE_URL, 'https://mcp.goldenratio.app/mcp');
});

test('server.json matches package.json and the remote endpoint', () => {
  const sj = JSON.parse(read('../server.json'));
  assert.equal(sj.version, PKG.version);
  assert.equal(sj.version, VERSION);
  assert.deepEqual(sj.remotes, [{ type: 'streamable-http', url: REMOTE_URL }]);
  assert.deepEqual(sj.repository, { url: `https://github.com/${PKG.repository.replace('github:', '')}`, source: 'github' });
  assert.ok(sj.description.length <= 100, 'the MCP registry caps description at 100 characters');
});

test('README tools table lists the same tools as tools/list', async () => {
  const rows = read('../README.md').split('\n').filter((l) => /^\| `\w+` \|/.test(l));
  const { tools } = await client.listTools();
  assert.deepEqual(rows.map((l) => l.match(/^\| `(\w+)`/)[1]), tools.map((t) => t.name));
});

// --- golden_calculator ---

test('golden_calculator: the site start state [6, 5, 6] lists every "Try" row for the empty right side', async () => {
  const matches = [[8], [7, 6], [7, 5, 4], [6, 6, 5], [7, 5, 3, 2], [6, 6, 4, 3], [6, 5, 5, 4], [7, 4, 4, 2, 1], [6, 6, 4, 2, 1], [6, 5, 4, 4, 3], [5, 5, 5, 5, 2], [6, 5, 4, 3, 3, 2], [6, 5, 4, 3, 2, 2, 1], [4, 4, 4, 4, 4, 4, 3, 1]];
  assert.deepEqual(await json('golden_calculator', { left: [6, 5, 6] }), {
    left: [6, 5, 6],
    right: [],
    equal: false,
    left_height_px: 62.8,
    right_height_px: 0,
    shorter_side: 'right',
    matches,
    explanation: 'Add any one of the "matches" combinations to the right side to make both sides equal.',
    site_view: { left: { heading: 'Using', rows: [[6, 5, 6]] }, right: { heading: 'Try', rows: matches } },
  });
});

test('golden_calculator: 6 + 5 equals 7', async () => {
  assert.deepEqual(await json('golden_calculator', { left: [6, 5], right: [7] }), {
    left: [6, 5],
    right: [7],
    equal: true,
    left_height_px: 38.8,
    right_height_px: 38.8,
    shorter_side: null,
    matches: [],
    explanation: 'Both sides are equal golden-ratio totals (the site shows a green check and confetti).',
    site_view: { left: { heading: 'Using', rows: [[6, 5]] }, right: { heading: 'Using', rows: [[7]] } },
  });
});

test('golden_calculator: a shorter left side gets the "Try" rows on the left', async () => {
  const out = await json('golden_calculator', { left: [6, 7], right: [9] });
  assert.equal(out.left_height_px, 62.8);
  assert.equal(out.right_height_px, 101.7);
  assert.equal(out.shorter_side, 'left');
  assert.deepEqual(out.matches, [[7], [6, 5], [6, 4, 3], [5, 5, 4], [6, 4, 2, 1], [5, 5, 3, 2], [5, 4, 4, 3], [5, 4, 3, 3, 2], [4, 4, 4, 4, 1], [5, 4, 3, 2, 2, 1]]);
  assert.equal(out.explanation, 'Add any one of the "matches" combinations to the left side to make both sides equal.');
  assert.deepEqual(out.site_view.left, { heading: 'Try', rows: out.matches });
  assert.deepEqual(out.site_view.right, { heading: 'Using', rows: [[9]] });
});

test('golden_calculator: no spacers on either side', async () => {
  assert.deepEqual(await json('golden_calculator', {}), {
    left: [],
    right: [],
    equal: false,
    left_height_px: 0,
    right_height_px: 0,
    shorter_side: null,
    matches: [],
    explanation: 'Add spacers (1-11) to one or both sides.',
    site_view: { left: null, right: null },
  });
});

// --- golden_spacing ---

test('golden_spacing: the default scale, exact values, px and the site cheatsheet', async () => {
  const out = await json('golden_spacing', {});
  assert.equal(out.spacer_base, 1.5);
  assert.equal(out.spacer_unit, 'rem');
  assert.equal(out.root_font_px, 16);
  assert.deepEqual(
    out.values,
    SPACERS.map(([name, value, px]) => ({ name, tailwind_key: name, value, css_var: `--golden-ratio-${name}`, px })),
  );
  assert.equal(out.css_variables_defined, 37);
  assert.deepEqual(out.site_cheatsheet.scale.slice(4, 7), [
    { name: '4', size: '0.573rem', pixels: '9.16px', preview_class: 'w-4' },
    { name: '5', size: '0.927rem', pixels: '14.828px', preview_class: 'w-5' },
    { name: '6', size: '1.5rem', pixels: '24px', preview_class: 'w-6' },
  ]);
  assert.equal(out.cheatsheet_note, 'The goldenratio.app Spacing page shows these rounded values; "values" above are the exact ones the site CSS uses.');
});

test('golden_spacing: px base with a prefix changes the keys and drops the site cheatsheet', async () => {
  const out = await json('golden_spacing', { spacer_base: 16, spacer_unit: 'px', prefix: true });
  assert.deepEqual(out.values.slice(4, 7), [
    { name: '5', tailwind_key: 'gr-5', value: '9.888543819997675px', css_var: '--golden-ratio-5', px: 9.888543819997675 },
    { name: '6', tailwind_key: 'gr-6', value: '16px', css_var: '--golden-ratio-6', px: 16 },
    { name: '7', tailwind_key: 'gr-7', value: '25.88854382px', css_var: '--golden-ratio-7', px: 25.88854382 },
  ]);
  assert.equal('site_cheatsheet' in out, false);
  assert.equal((await json('golden_spacing', { prefix: 'my-' })).values[0].tailwind_key, 'my-1');
});

test('golden_spacing: em values use root_font_px; viewport units have no px', async () => {
  const em = await json('golden_spacing', { spacer_base: 1, spacer_unit: 'em', root_font_px: 10 });
  assert.deepEqual(em.values.slice(4, 7).map((v) => [v.value, v.px]), [['0.6180339887498547em', 6.1803], ['1em', 10], ['1.61803398875em', 16.1803]]);
  const vw = await json('golden_spacing', { spacer_unit: 'vw' });
  assert.equal(vw.values[5].value, '1.5vw');
  assert.deepEqual([...new Set(vw.values.map((v) => v.px))], [null]);
});

// --- golden_grid ---

test('golden_grid: every width in px, and half-4 + 5 + half-4 fills the row', async () => {
  const out = await json('golden_grid', { row: ['half-4', '5', 'half-4'], container_px: 1200, include_examples: false });
  assert.deepEqual(out.widths, GRID.map(([name, width, px]) => ({ name, class: `w-grp-${name}`, width, px })));
  assert.deepEqual(out.row, {
    columns: [
      { class: 'w-grp-half-4', width: '19.098300562502775%' },
      { class: 'w-grp-5', width: '61.80339887498547%' },
      { class: 'w-grp-half-4', width: '19.098300562502775%' },
    ],
    total_percent: 100,
    fills_row_exactly: true,
    overflows: false,
    remaining_percent: 0,
  });
  assert.equal(out.starter_css, '.container {\n  @apply w-full mx-auto px-5;\n}\n\n.row {\n  @apply flex flex-wrap;\n}');
  assert.equal('site_examples' in out, false);
});

test('golden_grid: w-grp- and grp- prefixes are optional; rows can overflow or fall short', async () => {
  const exact = await json('golden_grid', { row: ['w-grp-5', 'grp-4'], include_examples: false });
  assert.deepEqual(exact.row.columns.map((c) => c.class), ['w-grp-5', 'w-grp-4']);
  assert.equal(exact.row.fills_row_exactly, true);
  assert.equal('px' in exact.widths[0], false);

  const over = await json('golden_grid', { row: ['6', '1'], include_examples: false });
  assert.deepEqual(
    { total: over.row.total_percent, fills: over.row.fills_row_exactly, overflows: over.row.overflows, remaining: over.row.remaining_percent },
    { total: 109.016994, fills: false, overflows: true, remaining: -9.016994 },
  );
  const short = await json('golden_grid', { row: [' 5 '], include_examples: false });
  assert.deepEqual(
    { total: short.row.total_percent, fills: short.row.fills_row_exactly, overflows: short.row.overflows, remaining: short.row.remaining_percent },
    { total: 61.803399, fills: false, overflows: false, remaining: 38.196601 },
  );
});

test('golden_grid: the 38 example rows from the Grid page, with their totals', async () => {
  const ex = (await json('golden_grid', {})).site_examples;
  assert.equal(ex.length, 38);
  assert.deepEqual([...new Set(ex.map((r) => r.section))], ['The Foundational Example', 'Doubles', 'Halves', 'Mix and Match', 'So Close...', 'Offset or Fill Space', 'Common Patterns']);
  assert.deepEqual(ex.slice(0, 3), [
    { section: 'The Foundational Example', row_classes: 'row', cols: ['w-grp-6'], total_percent: 100 },
    { section: 'The Foundational Example', row_classes: 'row', cols: ['w-grp-5', 'w-grp-4'], total_percent: 100 },
    { section: 'The Foundational Example', row_classes: 'row', cols: ['w-grp-4', 'w-grp-4', 'w-grp-3'], total_percent: 100 },
  ]);
  assert.deepEqual(ex[37], { section: 'Common Patterns', row_classes: 'row justify-between', cols: Array(12).fill('w-grp-half-2'), total_percent: 87.53882 });
});

// --- golden_css_variables ---

test('golden_css_variables: the minified :root block the site stylesheet ships', async () => {
  assert.equal(await text('golden_css_variables', { format: 'min' }), `:root{${ROOT_VARS.map(([k, v]) => `${k}:${v}`).join(';')}}`);
});

test('golden_css_variables: readable css with the px note, and json for other options', async () => {
  assert.equal(
    await text('golden_css_variables', {}),
    `${ROOT_CSS}\n\n/* --golden-ratio carries a px unit because Tailwind renders the plugin's bare number that way; use --gr for the unitless ratio. */`,
  );
  const vars = await json('golden_css_variables', { format: 'json', spacer_base: 10, spacer_unit: 'px' });
  assert.equal(Object.keys(vars).length, 37);
  assert.deepEqual(
    [vars['--golden-ratio-base'], vars['--golden-ratio-unit'], vars['--golden-ratio-5'], vars['--golden-ratio-6'], vars['--golden-ratio-7'], vars['--golden-ratio-half-6']],
    ['10', '1px', '6.180339887498547px', '10px', '16.1803398875px', '5px'],
  );
});

// --- tailwind_plugin_setup ---

test('tailwind_plugin_setup: default config, theme sections and generated values', async () => {
  const out = await json('tailwind_plugin_setup', {});
  assert.equal(out.install, 'npm install -D tailwindcss-golden-ratio');
  assert.equal(out.tailwind_config, "// tailwind.config.js\nmodule.exports = {\n  theme: {\n    extend: {},\n  },\n  plugins: [require('tailwindcss-golden-ratio')],\n};");
  assert.deepEqual(out.theme_sections_extended, ['scale', 'maxWidth', 'maxHeight', 'minWidth', 'minHeight', 'spacing', 'borderWidth', 'lineHeight', 'fontSize', 'inset']);
  assert.deepEqual(out.scale, {
    'grp-1': '0.09016994374944495',
    'grp-2': '0.14589803375027754',
    'grp-3': '0.2360679774997437',
    'grp-4': '0.3819660112500555',
    'grp-5': '0.6180339887498547',
    'grp-6': '1',
    'grp-7': '1.61803398875',
    'grp-8': '2.618033988750235',
    'grp-9': '4.236067977500615',
    'grp-10': '6.854101966251465',
    'grp-11': '11.090169943753075',
  });
  assert.deepEqual(out.font_size_extras, {
    110: '0.9090909090909091em',
    120: '0.8333333333333334em',
    130: '0.7692307692307692em',
    140: '0.7142857142857143em',
    150: '0.6666666666666666em',
  });
  assert.equal(Object.keys(out.spacing).length, 66);
  assert.deepEqual([out.spacing['6'], out.spacing['half-7'], out.spacing['grp-6'], out.spacing['grp-half-6']], ['var(--golden-ratio-6)', 'var(--golden-ratio-half-7)', '100%', '50%']);
  assert.equal(out.border_width_and_line_height['double-4'], 'var(--golden-ratio-double-4)');
  assert.equal(out.line_height_same_as_border_width, true);
  assert.equal(out.css_variables, ROOT_CSS);
  assert.equal(out.source, 'https://github.com/truefrontier/tailwindcss-golden-ratio');
});

test('tailwind_plugin_setup: options go into the config and change the values', async () => {
  const out = await json('tailwind_plugin_setup', { prefix: 'gr-', spacer_base: 1, use_css_vars: false });
  assert.equal(
    out.tailwind_config,
    `// tailwind.config.js\nmodule.exports = {\n  theme: {\n    goldenRatio: {\n      "prefix": "gr-",\n      "spacerBase": 1,\n      "useCssVars": false\n    },\n    extend: {},\n  },\n  plugins: [require('tailwindcss-golden-ratio')],\n};`,
  );
  assert.deepEqual([out.spacing['gr-6'], out.spacing['gr-7'], out.spacing['grp-6']], ['1rem', '1.61803398875rem', '100%']);
  assert.equal(out.border_width_and_line_height['gr-half-6'], '0.5rem');
  assert.equal(out.css_variables, null);
});

// --- golden_ratio_steps ---

test('golden_ratio_steps: 16px, three steps up and two down', async () => {
  assert.deepEqual(await json('golden_ratio_steps', { value: 16, steps_up: 3, steps_down: 2, unit: 'px' }), {
    golden_ratio: 1.61803398875,
    rule: 'Multiply by 1.61803398875 to go up a step, divide to go down. Any two neighbours add up to the next value.',
    steps: [
      { step: -2, value: 6.111456180000888, text: '6.1115px' },
      { step: -1, value: 9.888543819997675, text: '9.8885px' },
      { step: 0, value: 16, text: '16px' },
      { step: 1, value: 25.88854382, text: '25.8885px' },
      { step: 2, value: 41.88854382000376, text: '41.8885px' },
      { step: 3, value: 67.77708764000984, text: '67.7771px' },
    ],
  });
});

test('golden_ratio_steps: five steps each way by default', async () => {
  const { steps } = await json('golden_ratio_steps', { value: 1 });
  assert.deepEqual(steps.map((s) => s.step), [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
  assert.deepEqual(steps.map((s) => s.value), [
    0.09016994374944495, 0.14589803375027754, 0.2360679774997437, 0.3819660112500555, 0.6180339887498547, 1, 1.61803398875, 2.618033988750235,
    4.236067977500615, 6.854101966251465, 11.090169943753075,
  ]);
});

test('golden_ratio_steps: small values keep 4 significant digits in text instead of printing 0', async () => {
  const { steps } = await json('golden_ratio_steps', { value: 0.0001, steps_up: 0, steps_down: 2, unit: 'px' });
  assert.deepEqual(steps, [
    { step: -2, value: 0.00003819660112500555, text: '0.0000382px' },
    { step: -1, value: 0.00006180339887498547, text: '0.0000618px' },
    { step: 0, value: 0.0001, text: '0.0001px' },
  ]);
  const { steps: one } = await json('golden_ratio_steps', { value: 1, steps_up: 1 });
  assert.deepEqual(one.map((s) => s.text), ['0.09017', '0.1459', '0.2361', '0.382', '0.618', '1', '1.618']);
});

// --- validation ---

test('arguments outside the schemas are rejected with the field that failed', async () => {
  const bad = (tool, msg) => `MCP error -32602: Input validation error: Invalid arguments for tool ${tool}: ${msg}`;
  const cases = [
    ['golden_calculator', { left: [12] }, 'Number must be less than or equal to 11 at left[0]'],
    ['golden_calculator', { left: [0] }, 'Number must be greater than or equal to 1 at left[0]'],
    ['golden_calculator', { right: [1.5] }, 'Expected integer, received float at right[0]'],
    ['golden_calculator', { left: '6' }, 'Expected array, received string at left'],
    ['golden_spacing', { spacer_base: 0 }, 'Number must be greater than 0 at spacer_base'],
    ['golden_spacing', { spacer_unit: 'foo' }, "Invalid enum value. Expected 'rem' | 'em' | 'px' | '%' | 'vw' | 'vh' | 'ch' | 'ex' | 'pt', received 'foo' at spacer_unit"],
    ['golden_spacing', { root_font_px: 101 }, 'Number must be less than or equal to 100 at root_font_px'],
    ['golden_grid', { container_px: -1 }, 'Number must be greater than 0 at container_px'],
    ['golden_grid', { row: ['x'.repeat(21)] }, 'String must contain at most 20 character(s) at row[0]'],
    ['golden_css_variables', { format: 'xml' }, "Invalid enum value. Expected 'css' | 'min' | 'json', received 'xml' at format"],
    ['tailwind_plugin_setup', { prefix: 'x'.repeat(21) }, 'String must contain at most 20 character(s) at prefix'],
    ['golden_ratio_steps', {}, 'Required at value'],
    ['golden_ratio_steps', { value: 0 }, 'Number must be greater than 0 at value'],
    ['golden_ratio_steps', { value: 1, steps_up: 21 }, 'Number must be less than or equal to 20 at steps_up'],
    ['golden_ratio_steps', { value: 1, steps_down: 1.5 }, 'Expected integer, received float at steps_down'],
    ['golden_ratio_steps', { value: 1, unit: 'x'.repeat(11) }, 'String must contain at most 10 character(s) at unit'],
  ];
  for (const [tool, args, msg] of cases) assert.equal(await error(tool, args), bad(tool, msg), `${tool} ${JSON.stringify(args)}`);
  assert.equal(await error('no_such_tool', {}), 'MCP error -32602: Tool no_such_tool not found');
});

test('golden_grid rejects width names outside 1-11', async () => {
  for (const w of ['0', '12', '13', 'half-12', 'triple-2', 'grp-', '']) {
    assert.equal(
      await error('golden_grid', { row: [w] }),
      `Unknown grid width "${w}". Use 1-11, half-1..half-11 or double-1..double-11 (w-grp- prefix optional).`,
    );
  }
});
