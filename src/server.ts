import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import {
  GR, GRID_EXAMPLES, SPACING_CHEATSHEET, THEME_KEYS, cssText, cssVariables, findGoldenMatches, fontSize, goldenValues,
  scale, spacing, borderWidth, lineHeight,
} from './golden.js';

export const VERSION = '0.1.1';
export const REMOTE_URL = 'https://mcp.goldenratio.app/mcp';
export const TERMS_URL = 'https://github.com/truefrontier/goldenratio-mcp#hosted-service';
export const TOOLS = ['golden_calculator', 'golden_spacing', 'golden_grid', 'golden_css_variables', 'tailwind_plugin_setup', 'golden_ratio_steps'];

const ok = (data: unknown) => ({ content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] });
const fail = (e: unknown) => ({ isError: true, content: [{ type: 'text' as const, text: String((e as Error)?.message ?? e) }] });
const wrap = <A,>(fn: (a: A) => unknown) => async (a: A) => {
  try {
    return ok(fn(a));
  } catch (e) {
    return fail(e);
  }
};

const optionsShape = {
  spacer_base: z.number().positive().max(1000).optional().describe('theme.goldenRatio.spacerBase: the size of spacer 6 (default 1.5, as on goldenratio.app).'),
  spacer_unit: z.enum(['rem', 'em', 'px', '%', 'vw', 'vh', 'ch', 'ex', 'pt']).optional().describe("theme.goldenRatio.spacerUnit (default 'rem')."),
};
const opts = (a: { spacer_base?: number; spacer_unit?: string; prefix?: boolean | string; use_css_vars?: boolean }) => ({
  spacerBase: a.spacer_base,
  spacerUnit: a.spacer_unit,
  prefix: a.prefix,
  useCssVars: a.use_css_vars,
});

const num = (v: string) => parseFloat(v);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

// Width names accepted by golden_grid: "5", "grp-5", "w-grp-5", "half-4", "double-2"...
const WIDTH_RE = /^(?:w-)?(?:grp-)?((?:half-|double-)?(?:[1-9]|1[01]))$/;
function widthKey(w: string) {
  const m = String(w).trim().match(WIDTH_RE);
  if (!m) throw new Error(`Unknown grid width "${w}". Use 1-11, half-1..half-11 or double-1..double-11 (w-grp- prefix optional).`);
  return `grp-${m[1]}`;
}

function calculator(a: { left?: number[]; right?: number[] }) {
  const left = a.left ?? [];
  const right = a.right ?? [];
  const r = findGoldenMatches(left, right) as { matches: number[][]; equal: boolean } | [];
  const { matches, equal } = Array.isArray(r) ? { matches: [] as number[][], equal: false } : r;
  // Column heights: each spacer N is an h-N block, i.e. var(--golden-ratio-N) = spacer N rem at 16px.
  const rem = Object.fromEntries(goldenValues().map((v) => [v.name, num(v.value)]));
  const px = (col: number[]) => Math.round(col.reduce((s, n) => s + rem[n] * 16, 0) * 10) / 10; // site rounds to 0.1px
  const lHeight = px(left);
  const rHeight = px(right);
  // Same branches as the Calculator.vue template under each column.
  const view = (col: number[], mine: number, other: number) =>
    matches.length && mine < other ? { heading: 'Try', rows: matches } : col.length ? { heading: 'Using', rows: [col] } : null;
  const shorter = lHeight < rHeight ? 'left' : rHeight < lHeight ? 'right' : null;
  return {
    left,
    right,
    equal,
    left_height_px: lHeight,
    right_height_px: rHeight,
    shorter_side: equal ? null : shorter,
    matches,
    explanation: equal
      ? 'Both sides are equal golden-ratio totals (the site shows a green check and confetti).'
      : matches.length
        ? `Add any one of the "matches" combinations to the ${shorter} side to make both sides equal.`
        : left.length || right.length
          ? 'No combination of spacers 1-11 closes the gap exactly.'
          : 'Add spacers (1-11) to one or both sides.',
    site_view: { left: view(left, lHeight, rHeight), right: view(right, rHeight, lHeight) },
  };
}

function spacingTool(a: { spacer_base?: number; spacer_unit?: string; root_font_px?: number; prefix?: boolean | string }) {
  const o = opts(a);
  const unit = a.spacer_unit ?? 'rem';
  const rootPx = a.root_font_px ?? 16;
  const vars = cssVariables({ ...o, prefix: undefined, useCssVars: true })!;
  const values = goldenValues(o).map((v) => {
    const n = num(v.value);
    return {
      name: v.name,
      tailwind_key: v.key,
      value: v.value,
      css_var: `--golden-ratio-${v.name}`,
      px: unit === 'rem' || unit === 'em' ? round(n * rootPx) : unit === 'px' ? n : null,
    };
  });
  const isDefault = (a.spacer_base ?? 1.5) === 1.5 && unit === 'rem';
  return {
    spacer_base: a.spacer_base ?? 1.5,
    spacer_unit: unit,
    root_font_px: rootPx,
    rule: 'Spacer 6 = spacer_base. Each step up multiplies by 1.61803398875, each step down divides by it. half-N = N / 2, double-N = N x 2.',
    usage: 'Tailwind utilities with the plugin: p-6, mt-half-7, gap-double-4, h-5, w-11 ... (any spacing utility). Plain CSS: var(--golden-ratio-6).',
    values,
    css_variables_defined: Object.keys(vars).length,
    ...(isDefault ? { site_cheatsheet: SPACING_CHEATSHEET, cheatsheet_note: 'The goldenratio.app Spacing page shows these rounded values; "values" above are the exact ones the site CSS uses.' } : {}),
  };
}

function gridTool(a: { container_px?: number; row?: string[]; include_examples?: boolean }) {
  const all = spacing();
  const grid: { name: string; class: string; width: string; px?: number }[] = [];
  for (const kind of ['', 'half-', 'double-'])
    for (let n = 1; n <= 11; n++) {
      const key = `grp-${kind}${n}`;
      grid.push({ name: `${kind}${n}`, class: `w-${key}`, width: all[key], ...(a.container_px ? { px: round((num(all[key]) / 100) * a.container_px, 2) } : {}) });
    }
  const sumRow = (keys: string[]) => keys.reduce((s, k) => s + num(all[k]), 0);
  const rowResult = a.row
    ? (() => {
        const keys = a.row.map(widthKey);
        const total = sumRow(keys);
        return {
          columns: keys.map((k) => ({ class: `w-${k}`, width: all[k] })),
          total_percent: round(total, 6),
          fills_row_exactly: Math.abs(total - 100) < 1e-6,
          overflows: total > 100 + 1e-6,
          remaining_percent: round(100 - total, 6),
        };
      })()
    : undefined;
  return {
    rule: 'grp-6 = 100% of the row. Each step down divides by 1.61803398875, so two adjacent widths add up to the next one (5 + 4 = 6, 4 + 3 = 5). half-N = N / 2, double-N = N x 2.',
    starter_css: '.container {\n  @apply w-full mx-auto px-5;\n}\n\n.row {\n  @apply flex flex-wrap;\n}',
    widths: grid,
    ...(rowResult ? { row: rowResult } : {}),
    ...(a.include_examples === false
      ? {}
      : {
          site_examples: GRID_EXAMPLES.map((r) => {
            const keys = r.cols.filter((c) => c.width).map((c) => `grp-${c.width}`);
            return { section: r.section, row_classes: r.row_classes.join(' '), cols: r.cols.map((c) => c.classes.join(' ')), total_percent: round(sumRow(keys), 6) };
          }),
        }),
  };
}

function cssTool(a: { spacer_base?: number; spacer_unit?: string; format?: 'css' | 'min' | 'json' }) {
  const vars = cssVariables({ ...opts(a), useCssVars: true })!;
  const format = a.format ?? 'css';
  if (format === 'json') return vars;
  return (
    cssText(vars, format === 'min') +
    (format === 'css' ? '\n\n/* --golden-ratio carries a px unit because Tailwind renders the plugin\'s bare number that way; use --gr for the unitless ratio. */' : '')
  );
}

function tailwindTool(a: { prefix?: boolean | string; spacer_base?: number; spacer_unit?: string; use_css_vars?: boolean }) {
  const o = opts(a);
  const goldenRatio: Record<string, unknown> = {};
  if (a.prefix !== undefined) goldenRatio.prefix = a.prefix;
  if (a.spacer_base !== undefined) goldenRatio.spacerBase = a.spacer_base;
  if (a.spacer_unit !== undefined) goldenRatio.spacerUnit = a.spacer_unit;
  if (a.use_css_vars !== undefined) goldenRatio.useCssVars = a.use_css_vars;
  const cfg = `// tailwind.config.js
module.exports = {
  theme: {${Object.keys(goldenRatio).length ? `\n    goldenRatio: ${JSON.stringify(goldenRatio, null, 2).replace(/\n/g, '\n    ')},` : ''}
    extend: {},
  },
  plugins: [require('tailwindcss-golden-ratio')],
};`;
  const fs = fontSize(o);
  return {
    install: 'npm install -D tailwindcss-golden-ratio',
    tailwind_config: cfg,
    compatibility: 'tailwindcss-golden-ratio 0.3.5 targets Tailwind CSS 1.x (goldenratio.app runs it on tailwindcss ^1.4).',
    options: {
      prefix: 'false (default): p-6, w-half-7. true: gr- prefix (p-gr-6). A string: that prefix.',
      spacerBase: 'Size of spacer 6. Default 1.5.',
      spacerUnit: "Default 'rem'.",
      useCssVars: 'Default true: utilities point at var(--golden-ratio-N) and a :root block defines them.',
    },
    theme_sections_extended: THEME_KEYS,
    spacing: spacing(o),
    scale: scale(),
    font_size_extras: Object.fromEntries(Object.entries(fs).filter(([k]) => /^1[1-5]0$/.test(k))),
    border_width_and_line_height: borderWidth(o),
    line_height_same_as_border_width: JSON.stringify(lineHeight(o)) === JSON.stringify(borderWidth(o)),
    css_variables: a.use_css_vars === false ? null : cssText(cssVariables(o)!),
    source: 'https://github.com/truefrontier/tailwindcss-golden-ratio',
  };
}

function stepsTool(a: { value: number; steps_up?: number; steps_down?: number; unit?: string }) {
  const up = a.steps_up ?? 5;
  const down = a.steps_down ?? 5;
  const unit = a.unit ?? '';
  const rows: { step: number; value: number; text: string }[] = [];
  for (let k = -down; k <= up; k++) {
    let v = a.value;
    for (let i = 0; i < Math.abs(k); i++) v = k < 0 ? v / GR : v * GR; // same repeated multiply/divide as the site
    rows.push({ step: k, value: v, text: `${round(v, 4)}${unit}` });
  }
  return {
    golden_ratio: GR,
    rule: 'Multiply by 1.61803398875 to go up a step, divide to go down. Any two neighbours add up to the next value.',
    steps: rows,
  };
}

export function createServer() {
  const server = new McpServer(
    { name: 'goldenratio-app', title: 'goldenratio.app', version: VERSION, websiteUrl: 'https://goldenratio.app' },
    {
      instructions:
        'Golden-ratio design math from goldenratio.app: the Golden Calculator (which spacer combinations balance), ' +
        'the golden spacing scale (rem/px, half and double), the golden grid (w-grp-* widths), the CSS variables, and the ' +
        'tailwindcss-golden-ratio plugin setup. Every value comes from the same code the site runs. Read-only, no auth. ' +
        'Hosted service terms (as-is, no guarantees, acceptable use, data): ' + TERMS_URL,
    },
  );

  server.registerTool(
    'golden_calculator',
    {
      title: 'Golden Calculator',
      description:
        'The goldenratio.app Golden Calculator. Stack spacers numbered 1-11 (each is the previous x 1.618) on a left and a right side; ' +
        'returns whether both sides are equal and, if not, every combination of spacers that would make the shorter side match ("Try" on the site). ' +
        'The site starts with left = [6, 5, 6], right = [].',
      inputSchema: {
        left: z.array(z.number().int().min(1).max(11)).max(40).optional().describe('Spacer numbers stacked on the left, top to bottom, e.g. [6, 5, 6].'),
        right: z.array(z.number().int().min(1).max(11)).max(40).optional().describe('Spacer numbers stacked on the right.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    wrap(calculator),
  );

  server.registerTool(
    'golden_spacing',
    {
      title: 'Golden spacing scale',
      description:
        'The golden spacing scale (spacers 1-11 plus half-N and double-N) with exact values, px and CSS variable names, as used by goldenratio.app and the tailwindcss-golden-ratio plugin. ' +
        'With default options it also returns the rounded cheatsheet table from goldenratio.app/#/spacing.',
      inputSchema: {
        ...optionsShape,
        root_font_px: z.number().positive().max(100).optional().describe('Root font size for px conversion of rem/em values (default 16).'),
        prefix: z.union([z.boolean(), z.string().max(20)]).optional().describe('Plugin prefix option, only changes tailwind_key (true = "gr-").'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    wrap(spacingTool),
  );

  server.registerTool(
    'golden_grid',
    {
      title: 'Golden grid',
      description:
        'The golden grid from goldenratio.app/#/grid: w-grp-1..11, w-grp-half-*, w-grp-double-* percentage widths, the starter .container/.row CSS, ' +
        "every example row from the site with its total width, and an optional check of your own row (does it add up to exactly 100%?).",
      inputSchema: {
        container_px: z.number().positive().max(100000).optional().describe('Also give each width in px for a row this wide.'),
        row: z.array(z.string().max(20)).max(40).optional().describe('Widths to check as one row, e.g. ["5", "4"] or ["half-4", "5", "half-4"] (w-grp- prefix optional).'),
        include_examples: z.boolean().optional().describe('Include the site example rows (default true).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    wrap(gridTool),
  );

  server.registerTool(
    'golden_css_variables',
    {
      title: 'Golden CSS variables',
      description: 'The :root block of golden-ratio CSS variables (--golden-ratio-1..11, half-*, double-*, --gr) exactly as goldenratio.app ships it. Use without Tailwind.',
      inputSchema: {
        ...optionsShape,
        format: z.enum(['css', 'min', 'json']).optional().describe('css (default, readable), min (one line, as in the site stylesheet) or json.'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    wrap(cssTool),
  );

  server.registerTool(
    'tailwind_plugin_setup',
    {
      title: 'tailwindcss-golden-ratio setup',
      description:
        'How to add the tailwindcss-golden-ratio plugin (the one goldenratio.app uses): install command, tailwind.config.js, options, ' +
        'and the exact theme values it generates (spacing, grp widths, scale, fontSize extras, borderWidth/lineHeight) for the given options.',
      inputSchema: {
        prefix: z.union([z.boolean(), z.string().max(20)]).optional().describe('theme.goldenRatio.prefix (true = "gr-").'),
        ...optionsShape,
        use_css_vars: z.boolean().optional().describe('theme.goldenRatio.useCssVars (default true).'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    wrap(tailwindTool),
  );

  server.registerTool(
    'golden_ratio_steps',
    {
      title: 'Golden ratio steps',
      description: 'Step any number up or down the golden ratio (x or / 1.61803398875), e.g. to pick a type scale or the next size. What the goldenratio.app Alfred workflow does.',
      inputSchema: {
        value: z.number().positive().max(1e12).describe('Starting value, e.g. 16.'),
        steps_up: z.number().int().min(0).max(20).optional().describe('Steps above the value (default 5).'),
        steps_down: z.number().int().min(0).max(20).optional().describe('Steps below the value (default 5).'),
        unit: z.string().max(10).optional().describe('Unit suffix for the text column, e.g. "px".'),
      },
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    wrap(stepsTool),
  );

  return server;
}
