// Regenerates src/site/grid-examples.json from the site's Grid page:
//   node scripts/extract-grid-examples.mjs ../goldenratio-app/src/views/Grid.vue > src/site/grid-examples.json
import { parse } from 'node-html-parser';
import fs from 'fs';

const src = fs.readFileSync(process.argv[2], 'utf8');
const tpl = src.slice(src.indexOf('<template>') + 10, src.lastIndexOf('</template>')).replace(/<!--[\s\S]*?-->/g, '');
const classes = (el) => (el.getAttribute?.('class') || '').split(/\s+/).filter(Boolean);
const elems = (el) => el.childNodes.filter((k) => k.nodeType === 1);
let section = null;
const rows = [];
const walk = (el) => {
  for (const c of elems(el)) {
    if (c.tagName === 'H2') {
      section = c.text.trim().replace(/\s+/g, ' ').replace(/ - Part \d$/, '');
      continue;
    }
    const cls = classes(c);
    const kids = elems(c);
    const cols = kids.filter((k) => classes(k).some((x) => x.startsWith('w-grp-')));
    const isExample = cls.includes('row') && cols.length && !cls.includes('sm:flex-no-wrap') && !c.querySelector('h2');
    if (!isExample) {
      walk(c);
      continue;
    }
    rows.push({
      section,
      row_classes: cls.filter((x) => ['row', 'flex-no-wrap', 'justify-between', 'justify-around'].includes(x)),
      cols: kids.map((k) => {
        const kc = classes(k);
        const w = kc.find((x) => x.startsWith('w-grp-'));
        return {
          width: w ? w.slice('w-grp-'.length) : null,
          classes: kc.filter((x) => x.startsWith('w-grp-') || ['flex-grow', 'flex-shrink-0', 'ml-auto', 'mr-auto'].includes(x)),
          label: k.text.trim(),
        };
      }),
    });
  }
};
walk(parse(tpl));
console.log(JSON.stringify(rows, null, 1));
