# Maintaining goldenratio-mcp

**Bottom line:** the server's math is the site's own code, copied into `src/site/`. To keep it right, do two things: run `npm test` before every merge, and re-check the copies whenever goldenratio.app or its Tailwind plugin changes.

This page covers:

- running the tests, and what each test file checks
- what's copied from the site, and how to check it's still in step
- what to do when a copy changes

For install, deploy and the hosted service, see the [README](../README.md).

## Run the tests

```sh
npm ci --ignore-scripts
npm test
```

`npm test` builds `dist/`, runs every file in `test/`, then runs `scripts/smoke.mjs`, which calls each tool over stdio. It needs no network and no secrets. It runs on Node 20 or later. CI and the `Dockerfile` use Node 22.

| File | What it checks |
| --- | --- |
| `test/tools.test.mjs` | Every tool through an in-memory MCP client. The expected values are literal numbers checked against the live site on Oct 26, 2026. It also checks schema errors, and that the README, `server.json` and `package.json` agree with the server. |
| `test/invariants.test.mjs` | The rule each tool states in its own output, on a few hundred inputs from a fixed seed. For example: each spacer step is × 1.61803398875, two adjacent grid widths add up to the next one, and any listed calculator match makes both sides equal. |
| `test/http.test.mjs` | The HTTP server on a free local port: routes, CORS, the 256 KB body limit and the default rate limit. |
| `test/security.test.mjs` | What a client can do to the rate limit: forged headers, IPv6 /64 buckets and the 10,000-client cap. |
| `scripts/smoke.mjs` | 12 tool calls over stdio. Pass a URL to run the same calls against a remote server, for example after a deploy. |

### When a test fails

- **`tools.test.mjs` fails:** a tool's output changed. If you meant to change it, check the new value against the live site before you update the test. The README's [Verification](../README.md#verification) section says how the values were checked.
- **`invariants.test.mjs` fails:** the message names the input that broke. Rerun just that file with `node --test test/invariants.test.mjs`. The seed is fixed, so the same input fails every time.
- **The HTTP tests fail with `EADDRINUSE`:** they shouldn't. Each test server starts on `PORT=0`, so the OS picks a free port. Report it as a bug.

## Keep the copies in step with the site

The README promises that every value comes from the code goldenratio.app runs. These four files carry that promise:

| File here | Copied from | How |
| --- | --- | --- |
| `src/site/calc.js` | `goldenratio-app` `src/utils/calc.js` | Copied with one change: `find()` is a loop instead of calling itself, so 40 spacers don't overflow the stack. A comment in the file marks the change. |
| `src/site/tailwindcss-golden-ratio.cjs` | `tailwindcss-golden-ratio` `index.js` at 0.3.5 (commit `62e2ad9`, which has no tag) | Byte for byte. |
| `src/site/grid-examples.json` | `goldenratio-app` `src/views/Grid.vue` | `scripts/extract-grid-examples.mjs` |
| `src/site/spacing-cheatsheet.json` | `goldenratio-app` `src/views/Spacing.vue` | `scripts/extract-spacing-cheatsheet.mjs` |

**Last checked: Nov 12, 2026.** All four were in step with `goldenratio-app` `origin/master` as last fetched, `20d54ac` (Oct 26, 2026), and `tailwindcss-golden-ratio` at `62e2ad9`.

### How to check

With `goldenratio-app` and `tailwindcss-golden-ratio` cloned next to this repo, run these from this repo's root. They read the site's `origin/master` from git, so it doesn't matter which branch each checkout is on, and they don't change any file.

```sh
git -C ../goldenratio-app fetch -q origin

# 1. calc.js: the only differences should be the find() loop and its comment.
git -C ../goldenratio-app show origin/master:src/utils/calc.js | diff - src/site/calc.js

# 2. Which plugin version does the site load? Expect "0.3.5".
git -C ../goldenratio-app show origin/master:yarn.lock | grep -A1 '^tailwindcss-golden-ratio'

# 3. The plugin: no output means identical.
git -C ../tailwindcss-golden-ratio show 62e2ad9:index.js | cmp - src/site/tailwindcss-golden-ratio.cjs

# 4. The JSON data: no output means identical.
node scripts/extract-grid-examples.mjs <(git -C ../goldenratio-app show origin/master:src/views/Grid.vue) | cmp - src/site/grid-examples.json
node scripts/extract-spacing-cheatsheet.mjs <(git -C ../goldenratio-app show origin/master:src/views/Spacing.vue) | cmp - src/site/spacing-cheatsheet.json
```

Step 4 needs bash or zsh for `<(...)`. `npm run extract` does the same job, but it reads `../goldenratio-app` from disk and overwrites the JSON files.

Don't compare the plugin against the plugin repo's `master`. That's 3.3.5 (July 2024), a later major version, and the site still loads 0.3.5.

## When a copy changes

1. Copy the new file in. For `calc.js`, keep the `find()` loop change.
2. Run `npm test`.
   - If `tools.test.mjs` fails, the site's math changed. Check the new values against the live site, then update the expected values.
   - `invariants.test.mjs` should still pass, unless the rule itself changed (for example, a new ratio).
3. If the site moves to a newer plugin, check `src/golden.ts` too. It runs the plugin file with a stub for `tailwindcss/plugin`, and a newer plugin may need more than that stub.
4. Update the "Last checked" line above.
