# goldenratio-mcp

An MCP server for [goldenratio.app](https://goldenratio.app). Agents can use the site's golden-ratio design tools: the Golden Calculator, the golden spacing scale, the golden grid, the CSS variables and the Tailwind plugin setup.

The math is the site's own code, unedited:

- `src/site/calc.js` is a byte-for-byte copy of the site's `src/utils/calc.js` (the Golden Calculator).
- `src/site/tailwindcss-golden-ratio.cjs` is a byte-for-byte copy of `index.js` from [tailwindcss-golden-ratio](https://github.com/truefrontier/tailwindcss-golden-ratio) 0.3.5, the plugin the site's `tailwind.config.js` loads for every spacing value, grid width and CSS variable. The server runs that file as-is and calls its theme functions the way Tailwind does.
- `src/site/grid-examples.json` and `src/site/spacing-cheatsheet.json` are pulled out of the site's `Grid.vue` and `Spacing.vue` by the scripts in `scripts/`.

Every output was checked against the live site (see [Verification](#verification)).

The server is read-only. It needs no account and no secrets, stores nothing, and never calls goldenratio.app.

**Remote endpoint:** `https://mcp.goldenratio.app/mcp` (Streamable HTTP, stateless, no auth, 120 requests a minute per IP). The original address, `https://goldenratio-mcp.fly.dev/mcp`, still works and serves the same server. Use of the hosted endpoint is covered by [Hosted service](#hosted-service).

## Install

### Claude Code

```sh
# remote (nothing to install)
claude mcp add --transport http goldenratio-app https://mcp.goldenratio.app/mcp

# or local stdio
git clone https://github.com/truefrontier/goldenratio-mcp && cd goldenratio-mcp && npm install && npm run build
claude mcp add goldenratio-app -- node "$PWD/dist/stdio.js"
```

### Cursor / Grok Bot

Add this to `~/.cursor/mcp.json` (or a project's `.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "goldenratio-app": { "url": "https://mcp.goldenratio.app/mcp" }
  }
}
```

For local stdio, use `{ "command": "node", "args": ["/absolute/path/to/goldenratio-mcp/dist/stdio.js"] }`.

Grok Bot uses the same thing. Add a custom MCP connector with the URL `https://mcp.goldenratio.app/mcp` and no auth.

### Any other MCP client

Add a remote (Streamable HTTP) server with the URL above. If the client only runs stdio servers, bridge it with `npx -y mcp-remote https://mcp.goldenratio.app/mcp`, or run `node dist/stdio.js` from a local build.

## Tools

| Tool | Site feature | What it returns |
| --- | --- | --- |
| `golden_calculator` | [Golden Calculator](https://goldenratio.app/#/calculator) | Stack spacers 1-11 on a left and right side. Returns whether they're equal and every combination that makes the shorter side match ("Try"), plus what the site shows under each column. The site starts at left `[6, 5, 6]`. |
| `golden_spacing` | [Spacing cheatsheet](https://goldenratio.app/#/spacing) | Spacers 1-11, half-1..11 and double-1..11 with exact values, px, CSS variable names and Tailwind keys, for any `spacer_base` / `spacer_unit` / `prefix`. With the defaults it also returns the site's rounded cheatsheet table. |
| `golden_grid` | [Golden Grid](https://goldenratio.app/#/grid) | `w-grp-*`, `w-grp-half-*`, `w-grp-double-*` widths (optionally in px for a container), the starter `.container` / `.row` CSS, all 38 example rows from the page with their totals, and a check of your own row. |
| `golden_css_variables` | Site stylesheet | The `:root` block of `--golden-ratio-*` variables exactly as the site ships it (css, minified or json). |
| `tailwind_plugin_setup` | "Get Started" on the home page | Install command and `tailwind.config.js` for tailwindcss-golden-ratio, its options, and the exact theme values it generates (spacing, scale, fontSize extras, borderWidth, lineHeight). |
| `golden_ratio_steps` | Home page explainer / Alfred workflow | Step any number up or down by 1.61803398875. |

All tools are annotated `readOnlyHint: true`.

## Not covered

- The calculator's confetti, colors and button UI. The tool returns the same state the page shows.
- The Alfred workflow download itself. `golden_ratio_steps` does the same math.
- Anything outside the three tools pages (home page copy, header, footer).

## Site quirks kept on purpose

- `--golden-ratio` ships as `1.61803398875px`. The plugin passes the ratio as a bare number and Tailwind 1 adds `px` to bare numbers. `--gr` is the unitless ratio. `golden_css_variables` reproduces this so its output matches the site byte for byte.
- The Spacing page's table is rounded by hand (for example spacer 5 shows `14.828px`, the exact value is 14.8328px). `golden_spacing` returns both: `values` are the exact numbers the site's CSS uses, and `site_cheatsheet` is the table as printed.
- Column heights in `golden_calculator` are exact math rounded to 0.1px. The site measures rendered heights, which Chrome rounds to 1/64px, so the two can differ by 0.1px. The matches and the equal/not-equal result are identical.
- The plugin targets Tailwind CSS 1.x, like the site (`tailwindcss ^1.4`).

## Hosted service

The endpoint at `https://mcp.goldenratio.app/mcp` (also reachable at `https://goldenratio-mcp.fly.dev/mcp`) is provided free and as-is, with no guarantee of uptime or accuracy. It may change, be rate-limited, or shut down at any time without notice.

**Acceptable use.** Don't abuse or overload the service, don't try to get around the rate limit, and don't use it for anything illegal. We may block traffic that does.

**Data.** The server doesn't need an account, stores nothing you send, and doesn't write request or IP logs. To enforce the rate limit it keeps each client IP address in memory for about a minute, then drops it. The service is hosted on [Fly.io](https://fly.io), which routes the traffic and handles it under its own [privacy policy](https://fly.io/legal/privacy-policy). We don't sell any data.

## License

[MIT](LICENSE), Copyright (c) 2026 Brandname Maker LLC d/b/a True Frontier. Third-party notices are in [THIRD_PARTY.md](THIRD_PARTY.md).

The goldenratio.app and True Frontier names and logos aren't covered by this license.

## Develop

```sh
npm install
npm run build        # tsc, then copies src/site into dist/site unchanged
npm test             # calls every tool through a real MCP client over stdio
node scripts/smoke.mjs https://mcp.goldenratio.app/mcp   # same, against the remote
npm run start:http   # local Streamable HTTP on :8080/mcp
npm run extract      # regenerate the JSON data from a ../goldenratio-app checkout
```

Deploy: `fly deploy` (app `goldenratio-mcp`, see `fly.toml`).

## Verification

Checked with headless Chrome against the live site on Oct 26, 2026. All 152 checks were exact matches:

- The `:root` block from `golden_css_variables` (min) is identical to the one in the site's live stylesheet.
- All 33 `w-grp-*` widths match the live CSS. All 33 `--golden-ratio-*` values match, and each `.h-N` utility points at the matching variable.
- Both Spacing page tables match `site_cheatsheet` cell for cell.
- The 38 example rows on the Grid page match `site_examples` (row and column classes).
- 49 calculator states were checked: the site's starting state, 8 hand-picked cases and 40 random ones, each set by clicking the site's buttons. Equal/not-equal, the "Try"/"Using" heading and every listed combination matched on both sides. Heights were within 0.1px.
