// Each tool states a rule in its own output ("each step up multiplies by 1.61803398875", "two adjacent
// widths add up to the next one", "add any one of the matches to the shorter side"). These tests check
// those rules on a few hundred seeded random inputs, through the same in-memory MCP client as tools.test.mjs.
// The seed is fixed, so every run checks the same inputs; a failure message names the input that broke.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../dist/server.js';

const GR = 1.61803398875;
const UNITS = ['rem', 'em', 'px', '%', 'vw', 'vh', 'ch', 'ex', 'pt'];

let client;
before(async () => {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await createServer().connect(serverSide);
  client = new Client({ name: 'goldenratio-invariants', version: '0.0.0' });
  await client.connect(clientSide);
});
after(() => client.close());

async function json(name, args) {
  const r = await client.callTool({ name, arguments: args });
  assert.equal(!!r.isError, false, r.content[0].text);
  return JSON.parse(r.content[0].text);
}

// mulberry32: a small seeded generator, so the "random" inputs are the same on every run.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const int = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
const close = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b));

// Mostly short stacks, sometimes up to the schema maximum of 40.
function sides(r) {
  const stack = () => Array.from({ length: r() < 0.1 ? int(r, 0, 40) : int(r, 0, 6) }, () => int(r, 1, 11));
  return { left: stack(), right: stack() };
}

test('golden_calculator: adding any listed match to the shorter side makes both sides equal', async () => {
  const r = rng(1);
  let checked = 0;
  for (let i = 0; i < 300; i++) {
    const { left, right } = sides(r);
    const out = await json('golden_calculator', { left, right });
    const at = JSON.stringify({ left, right });
    if (out.equal) {
      assert.deepEqual(out.matches, [], at);
      assert.ok(Math.abs(out.left_height_px - out.right_height_px) <= 0.1 + 1e-9, at);
      continue;
    }
    if (!out.matches.length) continue;
    assert.ok(out.shorter_side === 'left' || out.shorter_side === 'right', at);
    for (const m of out.matches.slice(0, 3)) {
      const next = { left: [...left], right: [...right] };
      next[out.shorter_side].push(...m);
      if (next[out.shorter_side].length > 40) continue;
      const after = await json('golden_calculator', next);
      assert.equal(after.equal, true, `${at} + ${JSON.stringify(m)} on the ${out.shorter_side}`);
      checked++;
    }
  }
  assert.ok(checked > 200, `only ${checked} matches checked`);
});

test('golden_calculator: swapping the two sides gives the same matches and the same result', async () => {
  const r = rng(2);
  for (let i = 0; i < 200; i++) {
    const { left, right } = sides(r);
    const a = await json('golden_calculator', { left, right });
    const b = await json('golden_calculator', { left: right, right: left });
    const at = JSON.stringify({ left, right });
    assert.equal(b.equal, a.equal, at);
    assert.deepEqual(b.matches, a.matches, at);
    assert.equal(b.shorter_side, { left: 'right', right: 'left', null: null }[a.shorter_side], at);
  }
});

test('golden_calculator: "Try" shows under the shorter side only, and only when there are matches', async () => {
  const r = rng(3);
  for (let i = 0; i < 200; i++) {
    const { left, right } = sides(r);
    const out = await json('golden_calculator', { left, right });
    const at = JSON.stringify({ left, right });
    const tries = ['left', 'right'].filter((s) => out.site_view[s]?.heading === 'Try');
    if (out.matches.length && !out.equal) {
      assert.deepEqual(tries, [out.shorter_side], at);
      assert.deepEqual(out.site_view[out.shorter_side].rows, out.matches, at);
    } else {
      assert.deepEqual(tries, [], at);
    }
    for (const s of ['left', 'right']) {
      if (out.site_view[s]?.heading === 'Using') assert.deepEqual(out.site_view[s].rows, [out[s]], at);
      if (!out[s].length && out.site_view[s]) assert.equal(out.site_view[s].heading, 'Try', at);
    }
  }
});

test('golden_ratio_steps: each value is the one below it times 1.61803398875, and two neighbours add up to the next', async () => {
  const r = rng(4);
  for (let i = 0; i < 200; i++) {
    const value = r() < 0.5 ? int(r, 1, 2000) / 10 : 10 ** int(r, -6, 11) * (1 + r());
    const steps_up = int(r, 0, 20);
    const steps_down = int(r, 0, 20);
    const at = JSON.stringify({ value, steps_up, steps_down });
    const { steps } = await json('golden_ratio_steps', { value, steps_up, steps_down });
    assert.deepEqual(steps.map((s) => s.step), Array.from({ length: steps_up + steps_down + 1 }, (_, k) => k - steps_down), at);
    assert.equal(steps.find((s) => s.step === 0).value, value, at);
    for (let k = 1; k < steps.length; k++) assert.ok(close(steps[k].value / steps[k - 1].value, GR), `${at} step ${steps[k].step}`);
    for (let k = 2; k < steps.length; k++) {
      assert.ok(close(steps[k - 2].value + steps[k - 1].value, steps[k].value), `${at} step ${steps[k].step}`);
    }
    for (const s of steps) assert.notEqual(Number(s.text), 0, `${at} prints ${s.value} as ${s.text}`);
  }
});

test('golden_spacing: spacer 6 is spacer_base, each step is x 1.61803398875, half-N = N / 2, double-N = N x 2', async () => {
  const r = rng(5);
  for (let i = 0; i < 150; i++) {
    const spacer_base = r() < 0.3 ? int(r, 1, 1000) : int(r, 1, 100000) / 1000;
    const spacer_unit = UNITS[int(r, 0, UNITS.length - 1)];
    const root_font_px = int(r, 1, 100);
    const at = JSON.stringify({ spacer_base, spacer_unit, root_font_px });
    const out = await json('golden_spacing', { spacer_base, spacer_unit, root_font_px });
    const v = Object.fromEntries(out.values.map((x) => [x.name, parseFloat(x.value)]));
    assert.ok(close(v['6'], spacer_base), at);
    for (let n = 1; n <= 11; n++) {
      if (n < 11) assert.ok(close(v[n + 1] / v[n], GR), `${at} spacer ${n + 1}`);
      assert.ok(close(v[`half-${n}`], v[n] / 2), `${at} half-${n}`);
      assert.ok(close(v[`double-${n}`], v[n] * 2), `${at} double-${n}`);
    }
    for (const x of out.values) {
      assert.match(x.value, new RegExp(`^\\d+(\\.\\d+)?${spacer_unit}$`), at);
      const n = parseFloat(x.value);
      const px = spacer_unit === 'rem' || spacer_unit === 'em' ? Math.round(n * root_font_px * 1e4) / 1e4 : spacer_unit === 'px' ? n : null;
      assert.equal(x.px, px, `${at} ${x.name}`);
    }
  }
});

test('golden_grid: grp-6 is 100%, two adjacent widths add up to the next one, half-N = N / 2, double-N = N x 2', async () => {
  const r = rng(6);
  for (let i = 0; i < 20; i++) {
    const container_px = int(r, 1, 1000000) / 10;
    const { widths } = await json('golden_grid', { container_px, include_examples: false });
    const w = Object.fromEntries(widths.map((x) => [x.name, parseFloat(x.width)]));
    assert.equal(w['6'], 100);
    for (let n = 1; n <= 9; n++) assert.ok(close(w[n] + w[n + 1], w[n + 2]), `${n} + ${n + 1}`);
    for (let n = 1; n <= 11; n++) {
      assert.ok(close(w[`half-${n}`], w[n] / 2), `half-${n}`);
      assert.ok(close(w[`double-${n}`], w[n] * 2), `double-${n}`);
    }
    for (const x of widths) assert.equal(x.px, Math.round((parseFloat(x.width) / 100) * container_px * 100) / 100, `${container_px} ${x.name}`);
  }
});

test("golden_grid: a row's total is the sum of its widths, and fills, overflows and remaining agree with it", async () => {
  const r = rng(7);
  const { widths } = await json('golden_grid', { include_examples: false });
  const w = Object.fromEntries(widths.map((x) => [x.name, parseFloat(x.width)]));
  const names = Object.keys(w);
  // Rows that add up to grp-6 (100%) by the adjacent-widths rule: 5 + 4 = 6, 3 + 4 = 5, 2 + 3 = 4.
  const FILLS = [['5', '4'], ['4', '3', '4'], ['3', '2', '5'], ['double-4', '3'], ['half-6', 'half-6'], ['half-4', '5', 'half-4']];
  let fills = 0;
  for (let i = 0; i < 200; i++) {
    const row = (i % 2 ? FILLS[int(r, 0, FILLS.length - 1)] : Array.from({ length: int(r, 1, 6) }, () => names[int(r, 0, names.length - 1)]))
      .map((x) => [x, `grp-${x}`, `w-grp-${x}`, `W-Grp-${x.toUpperCase()}`][int(r, 0, 3)]);
    const total = row.reduce((s, x) => s + w[x.toLowerCase().replace(/^(w-)?(grp-)?/, '')], 0);
    const at = JSON.stringify(row);
    const out = (await json('golden_grid', { row, include_examples: false })).row;
    assert.equal(out.total_percent, Math.round(total * 1e6) / 1e6, at);
    assert.equal(out.fills_row_exactly, Math.abs(total - 100) < 1e-6, at);
    assert.equal(out.overflows, total > 100 + 1e-6, at);
    assert.ok(Math.abs(out.total_percent + out.remaining_percent - 100) <= 2e-6, at);
    if (out.fills_row_exactly) fills++;
  }
  assert.ok(fills >= 10, `only ${fills} rows filled exactly`);
});

test('golden_css_variables: css, min and json carry the same variables, with the values golden_spacing reports', async () => {
  const r = rng(8);
  for (let i = 0; i < 40; i++) {
    const o = { spacer_base: int(r, 1, 400) / 8, spacer_unit: UNITS[int(r, 0, UNITS.length - 1)] };
    const at = JSON.stringify(o);
    const vars = await json('golden_css_variables', { ...o, format: 'json' });
    const min = await client.callTool({ name: 'golden_css_variables', arguments: { ...o, format: 'min' } });
    const css = await client.callTool({ name: 'golden_css_variables', arguments: { ...o, format: 'css' } });
    assert.equal(min.content[0].text, `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`, at);
    for (const [k, v] of Object.entries(vars)) assert.ok(css.content[0].text.includes(`\n  ${k}: ${v};`), `${at} ${k}`);
    const { values } = await json('golden_spacing', o);
    for (const x of values) assert.equal(vars[x.css_var], x.value, `${at} ${x.css_var}`);
  }
});
