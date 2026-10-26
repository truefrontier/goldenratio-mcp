// Wraps the two pieces of goldenratio.app math, both used unedited:
//  - src/site/calc.js: the Golden Calculator (goldenratio-app/src/utils/calc.js)
//  - src/site/tailwindcss-golden-ratio.cjs: tailwindcss-golden-ratio@0.3.5 index.js, the plugin the
//    site's tailwind.config.js loads for every spacing, width, height and CSS variable value.
import { readFileSync } from 'node:fs';
import { findGoldenMatches } from './site/calc.js';

const here = (p: string) => new URL(p, import.meta.url);
export const GRID_EXAMPLES: GridExample[] = JSON.parse(readFileSync(here('./site/grid-examples.json'), 'utf8'));
export const SPACING_CHEATSHEET = JSON.parse(readFileSync(here('./site/spacing-cheatsheet.json'), 'utf8'));
export { findGoldenMatches };

export interface GridExample {
  section: string;
  row_classes: string[];
  cols: { width: string | null; classes: string[]; label: string }[];
}

export interface Options {
  prefix?: boolean | string; // theme.goldenRatio.prefix
  spacerBase?: number; // theme.goldenRatio.spacerBase (default 1.5)
  spacerUnit?: string; // theme.goldenRatio.spacerUnit (default 'rem')
  useCssVars?: boolean; // theme.goldenRatio.useCssVars (default true)
}

// Evaluate the plugin file as-is. Its only import is tailwindcss/plugin, which we stub to hand back
// the plugin's handler and config so we can call them the way Tailwind would.
type PluginExport = { handler: (api: any) => void; config: { theme: { extend: Record<string, any> } } };
const plugin: PluginExport = (() => {
  const src = readFileSync(here('./site/tailwindcss-golden-ratio.cjs'), 'utf8');
  const mod = { exports: {} as any };
  const req = (id: string) => {
    if (id === 'tailwindcss/plugin') return (handler: any, config: any) => ({ handler, config });
    throw new Error(`unexpected require(${id})`);
  };
  new Function('require', 'module', 'exports', src)(req, mod, mod.exports);
  return mod.exports;
})();

const extend = plugin.config.theme.extend;

function themeFn(o: Options) {
  const t: Record<string, unknown> = {
    'goldenRatio.prefix': o.prefix,
    'goldenRatio.spacerBase': o.spacerBase,
    'goldenRatio.spacerUnit': o.spacerUnit,
    'goldenRatio.useCssVars': o.useCssVars,
  };
  const theme: any = (path: string, def?: unknown) => {
    if (path === 'spacing') return extend.spacing(theme);
    return t[path] === undefined ? def : t[path];
  };
  return theme;
}

/** theme.extend.spacing as the plugin returns it (golden values + grp-* percentages). */
export const spacing = (o: Options = {}): Record<string, string> => extend.spacing(themeFn(o));
export const scale = (): Record<string, string> => ({ ...extend.scale });
export const fontSize = (o: Options = {}): Record<string, string> => extend.fontSize(themeFn(o));
export const borderWidth = (o: Options = {}): Record<string, string> => extend.borderWidth(themeFn(o));
export const lineHeight = (o: Options = {}): Record<string, string> => extend.lineHeight(themeFn(o));
export const THEME_KEYS = Object.keys(extend);

/** The :root block the plugin adds (only when useCssVars is on). */
export function cssVariables(o: Options = {}): Record<string, string> | null {
  let out: Record<string, unknown> | null = null;
  plugin.handler({ theme: themeFn(o), addComponents: (c: any) => (out = c[':root']) });
  if (!out) return null;
  // Tailwind 1 turns style objects into CSS with postcss-js, which appends px to bare numbers
  // (0 stays 0). The plugin passes --golden-ratio as a number, so it ships as 1.61803398875px.
  return Object.fromEntries(Object.entries(out as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'number' ? (v === 0 ? '0' : `${v}px`) : String(v)]));
}

export const cssText = (vars: Record<string, string>, minify = false) =>
  minify
    ? `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`
    : `:root {\n${Object.entries(vars).map(([k, v]) => `  ${k}: ${v};`).join('\n')}\n}`;

/** The literal golden value for a spacer name (1..11, half-N, double-N), ignoring CSS vars. */
export function goldenValues(o: Options = {}) {
  const all = spacing({ ...o, useCssVars: false });
  const grPrefix = o.prefix ? (o.prefix === true ? 'gr-' : o.prefix) : '';
  const names: string[] = [];
  for (const kind of ['', 'half-', 'double-']) for (let n = 1; n <= 11; n++) names.push(`${kind}${n}`);
  return names.map((name) => ({ name, key: `${grPrefix}${name}`, value: all[`${grPrefix}${name}`] }));
}

export const GR = Number(scale()['grp-7']); // 1.61803398875, the constant both files use
