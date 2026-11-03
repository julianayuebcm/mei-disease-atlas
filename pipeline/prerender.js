// Pre-render every page of the public site. Runs the site's own script (site.js) with a minimal DOM stand-in,
// in public-site mode, and prints JSON: {links: {token: href}, pages: [{token, path, title, desc, html}]}.
// Usage: node prerender.js site.js atlas.json BASE SITE_URL
const fs = require("fs");
const [, , siteJs, atlasJson, BASE_ARG, URL_ARG] = process.argv;
const el = () => ({ innerHTML: "", textContent: "", hidden: false, style: {}, value: "", addEventListener() {}, setAttribute() {},
  querySelectorAll: () => [], querySelector: () => null, scrollIntoView() {}, getBoundingClientRect: () => ({ width: 0, height: 0 }) });
global.document = { getElementById: () => el(), querySelectorAll: () => [], addEventListener() {}, title: "" };
global.window = { addEventListener() {}, scrollTo() {}, dispatchEvent() {}, __PRERENDER__: 1, ATLAS_STATIC: { base: BASE_ARG, url: URL_ARG } };
global.location = { hash: "", pathname: BASE_ARG, search: "" };
global.history = { pushState() {} };
global.innerWidth = 1200; global.innerHeight = 800;
global.matchMedia = () => ({ matches: false, addEventListener() {} });
global.Event = class { constructor(n) { this.type = n; } };
const data = JSON.parse(fs.readFileSync(atlasJson, "utf8"));
const code = fs.readFileSync(siteJs, "utf8") + `
initData(__DATA__); buildIndexes();
const tokens = ["home", "browse", "mechanisms", "genes", "elements", "methods", "about"];
Object.keys(MECH).filter(m => EVENTS.some(e => e.mechanisms.includes(m))).forEach(m => tokens.push("mech-" + m));
["Alu", "L1", "SVA", "Other"].forEach(c => tokens.push("element-" + c));
Object.keys(GENES).forEach(g => tokens.push("gene-" + g));
EVENTS.forEach(e => tokens.push("case-" + e.id));
const pages = [];
for (const t of tokens) {
  for (const [re, fn] of ROUTES) {
    const m = t.match(re);
    if (!m) continue;
    const o = fn(m);
    const meta = pageMeta(t);
    pages.push({ token: t, path: L(t).slice(BASE.length), title: meta.title, desc: meta.desc, html: typeof o === "string" ? o : o.html });
    break;
  }
}
const links = {};
["home", "browse", "mechanisms", "genes", "elements", "methods", "about", "methods-scope", "methods-caveats"].forEach(t => links[t] = L(t));
process.stdout.write(JSON.stringify({ links, pages, notFound: pageNotFound() }));
`;
global.__DATA__ = data;
eval(code);
