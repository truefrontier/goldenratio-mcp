// Regenerates src/site/spacing-cheatsheet.json from the site's Spacing page:
//   node scripts/extract-spacing-cheatsheet.mjs ../goldenratio-app/src/views/Spacing.vue > src/site/spacing-cheatsheet.json
import { parse } from 'node-html-parser';
import fs from 'fs';

const src = fs.readFileSync(process.argv[2], 'utf8');
const tpl = src.slice(src.indexOf('<template>') + 10, src.lastIndexOf('</template>'));
const tables = parse(tpl).querySelectorAll('table');
const out = tables.map((t) =>
  t.querySelectorAll('tbody tr').map((tr) => {
    const td = tr.querySelectorAll('td');
    const preview = td[3]?.querySelector('div')?.getAttribute('class')?.split(/\s+/).find((c) => /^w-/.test(c)) ?? null;
    return { name: td[0].text.trim().replace(/\s+/g, ' '), size: td[1].text.trim(), pixels: td[2].text.trim(), preview_class: preview };
  }),
);
console.log(JSON.stringify({ scale: out[0], double_and_half: out[1] }, null, 1));
