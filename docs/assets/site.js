let ATLAS = /*__ATLAS_DATA__*/null;
const STATIC = !!window.ATLAS_STATIC;              // public multi-page build (real paths) vs single-file preview (#routes)
const BASE = STATIC ? window.ATLAS_STATIC.base : "";
const SITE_URL = STATIC ? window.ATLAS_STATIC.url : "";
let EVENTS = [], BY_ID = {};
/* link for a route token: "gene-F8" -> "#gene-F8" (preview) or "/base/gene/F8/" (public site) */
function L(t) {
  if (!STATIC) return "#" + t;
  const [k, ...r] = t.split("-"), v = r.join("-");
  const map = { home: "", browse: v ? "browse/?q=" + v : "browse/", case: `case/${v}/`, mech: `mechanism/${v}/`, mechanisms: "mechanisms/",
                gene: `gene/${v}/`, genes: "genes/", element: `element/${v}/`, elements: "elements/", about: "about/",
                methods: v ? `methods/#${v}` : "methods/" };
  return BASE + (k in map ? map[k] : t + "/");
}
function tokenFromLocation() {
  if (!STATIC) return location.hash.replace(/^#/, "");
  const p = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : location.pathname.replace(/^\//, "");
  const seg = p.split("/").filter(Boolean);
  const q = new URLSearchParams(location.search).get("q");
  if (!seg.length) return "home";
  const names = { mechanism: "mech", case: "case", gene: "gene", element: "element" };
  if (seg[0] === "browse") return q ? "browse-" + encodeURIComponent(q) : "browse";
  if (names[seg[0]] && seg[1]) return names[seg[0]] + "-" + decodeURIComponent(seg[1]);
  if (seg[0] === "methods" && location.hash) return "methods-" + location.hash.slice(1);
  return seg[0];
}
function go(url) {
  if (!STATIC) { location.hash = url; return; }
  history.pushState(null, "", url);
  route();
}
function initData(data) { ATLAS = data; EVENTS = data.events; BY_ID = Object.fromEntries(EVENTS.map(e => [e.id, e])); }
if (ATLAS) initData(ATLAS);

const MECH = {
  coding_disruption: ["Coding disruption", "The insertion lands in coding sequence and causes a frameshift, premature stop or disrupted protein."],
  exon_skipping: ["Exon skipping", "The insertion makes the spliceosome skip one or more exons."],
  exonization: ["Exonization", "Sequence from the inserted element is spliced into the mRNA as a new exon or an exon extension."],
  aberrant_splicing: ["Aberrant splicing", "Other splice changes: cryptic splice sites, altered splice-site choice, pseudo-exons from flanking sequence."],
  intron_retention: ["Intron retention", "An intron is kept in the mature mRNA."],
  iralu_structure: ["Inverted-Alu structure", "The new Alu pairs with a nearby inverted Alu (IRAlu); the RNA hairpin disrupts splicing."],
  premature_polyadenylation: ["Premature polyadenylation", "A polyA signal or terminator inside the element cuts the transcript short."],
  expression_loss: ["Expression loss", "Reduced or absent transcript or protein, without a more specific mechanism."],
  epigenetic_silencing: ["Epigenetic silencing", "Methylation or chromatin changes spreading from the element silence the gene."],
  utr_effect: ["UTR effect", "Insertion in a 5′ or 3′ UTR changes mRNA stability or translation."],
  insertion_associated_deletion: ["Insertion-associated deletion", "A genomic deletion or rearrangement made during the insertion causes the defect."],
  transduction_effect: ["Transduction", "Co-mobilised flanking DNA carried with the element is the functional cause."],
  aberrant_transcript_other: ["Other aberrant transcript", "Antisense, read-through, fusion or other described transcript effects."],
  unknown: ["Not described", "The paper did not investigate or describe the molecular mechanism."]
};
const CLASSES = [["Alu", "--alu"], ["L1", "--l1"], ["SVA", "--sva"], ["Other", "--other"]];
const ELEMENT_INFO = {
  Alu: "Primate SINE, about 300 bp. Non-autonomous: mobilised by L1 machinery. The most frequent class of disease insertion.",
  L1: "LINE-1, up to 6 kb full length and the only autonomous human retrotransposon. Disease insertions are usually 5′-truncated.",
  SVA: "SINE-VNTR-Alu composite, up to ~3 kb. Hominid-specific; several founder insertions cause recessive disease.",
  Other: "HERV, processed pseudogenes (retrocopies of mRNAs), polyA-only insertions, and insertions whose element the paper did not name."
};
const clsOf = c => (c === "Alu" || c === "L1" || c === "SVA") ? c : "Other";
const clsVar = c => CLASSES.find(x => x[0] === clsOf(c))[1];
const CLASS_NAME = { processed_pseudogene: "Processed pseudogene", polyA_only: "PolyA only", unknown: "Unclassified" };
const REGION = { coding_exon: "Coding exon", exon_unspecified: "Exon", exon_UTR5: "5′ UTR", exon_UTR3: "3′ UTR", intron: "Intron", promoter: "Promoter", intergenic: "Intergenic", multiple: "Multiple", unknown: "Not stated" };
const ORIGIN = { de_novo: "De novo", inherited: "Inherited", founder: "Founder", unknown: "Not stated" };
const EVID = { rna_rt_pcr: "RT-PCR", rna_seq: "RNA-seq", minigene: "Minigene", protein: "Protein", segregation: "Segregation", de_novo_confirmed: "De novo confirmed", functional_assay: "Functional assay", long_read: "Long-read", none_stated: "None stated" };
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const mName = m => (MECH[m] || [m])[0];
const cName = c => CLASS_NAME[c] || c;
const loc = e => {
  if (["coding_exon", "exon_UTR5", "exon_UTR3", "exon_unspecified"].includes(e.region)) return REGION[e.region] + (e.exon_number ? ` · exon ${e.exon_number}` : "");
  if (e.region === "intron") return "Intron" + (e.intron_number ? ` ${e.intron_number}` : "");
  return REGION[e.region] || "Not stated";
};
const elLabel = e => `${e.subfamily || cName(e.mei_class)}${e.insertion_length_bp ? ` · ${e.insertion_length_bp.toLocaleString()} bp` : ""}`;
const sw = c => `<i class="sw" style="background:var(${clsVar(c)})"></i>`;
const mechTags = (ms, link = true) => ms.map((m, i) => link
  ? `<a class="tag${i === 0 ? " primary" : ""}" href="${L(`mech-${m}`)}" title="${esc(MECH[m][1])}">${esc(mName(m))}</a>`
  : `<span class="tag${i === 0 ? " primary" : ""}">${esc(mName(m))}</span>`).join("");
const app = document.getElementById("app");

/* ---------- indexes ---------- */
let GENES = {}, PAPERS = new Set();
function buildIndexes() { GENES = {}; EVENTS.forEach(e => (GENES[e.gene] ||= []).push(e)); PAPERS = new Set(EVENTS.flatMap(e => e.pmids)); }

/* ---------- shared components ---------- */
function legend() { return `<div class="legend">${CLASSES.map(c => `<span><i class="sw" style="background:var(${c[1]})"></i>${c[0]}</span>`).join("")}</div>`; }

function mechBars(list, { link = true } = {}) {
  const rows = Object.keys(MECH).map(m => {
    const evs = list.filter(e => e.mechanisms.includes(m));
    return { m, n: evs.length, by: CLASSES.map(c => [c, evs.filter(e => clsOf(e.mei_class) === c[0]).length]) };
  }).filter(r => r.n).sort((a, b) => (a.m === "unknown") - (b.m === "unknown") || b.n - a.n);
  const max = Math.max(1, ...rows.map(r => r.n));
  return `<div class="bars">${rows.map(r => `
    <${link ? `a href="${L(`mech-${r.m}`)}"` : "div"} class="bar-row" data-tip="<b>${esc(mName(r.m))}</b>: ${r.n} events<br>${r.by.filter(b => b[1]).map(b => `${b[0][0]} ${b[1]}`).join(" · ")}">
      <span class="bar-label">${esc(mName(r.m))}</span>
      <span class="bar-track" style="width:${(r.n / max * 100).toFixed(1)}%">${r.by.filter(b => b[1]).map(b => `<span class="seg" style="flex:${b[1]};background:var(${b[0][1]})"></span>`).join("")}</span>
      <span class="bar-n">${r.n}</span>
    </${link ? "a" : "div"}>`).join("")}</div>`;
}

function decadeCols(list) {
  const d = {};
  list.forEach(e => { if (e.first_year) (d[Math.floor(e.first_year / 10) * 10] ||= []).push(e); });
  const ks = Object.keys(d).map(Number).sort((a, b) => a - b);
  if (!ks.length) return `<p class="faint">No dated reports.</p>`;
  const max = Math.max(...ks.map(k => d[k].length));
  return `<div class="cols">${ks.map(k => `<div class="col" data-tip="<b>${k}s</b>: ${d[k].length} events<br>${CLASSES.map(c => `${c[0]} ${d[k].filter(e => clsOf(e.mei_class) === c[0]).length}`).join(" · ")}">${CLASSES.map(c => {
    const n = d[k].filter(e => clsOf(e.mei_class) === c[0]).length;
    return n ? `<div style="height:${(n / max * 100).toFixed(1)}%;background:var(${c[1]})"></div>` : ""; }).join("")}</div>`).join("")}</div>
    <div class="col-labels">${ks.map(k => `<div>${String(k).slice(2)}s</div>`).join("")}</div>`;
}

function countList(list, keyFn, labelFn = x => x) {
  const c = {};
  list.forEach(e => { const k = keyFn(e); if (k !== null && k !== undefined) c[k] = (c[k] || 0) + 1; });
  return `<div class="kv">${Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, n]) => `<div><span>${labelFn(k)}</span><span class="mono">${n}</span></div>`).join("")}</div>`;
}

function eventTile(e) {
  return `<a class="tile" href="${L(`case-${e.id}`)}">
    <h3>${sw(e.mei_class)}<span class="gene">${esc(e.gene)}</span></h3>
    <div class="muted" style="font-size:14px">${esc(e.disease)}</div>
    <div>${mechTags(e.mechanisms.slice(0, 2), false)}</div>
    <div class="meta"><span>${esc(elLabel(e))}</span><span>${esc(loc(e))}</span><span>${e.pmids.length} paper${e.pmids.length > 1 ? "s" : ""}</span></div>
  </a>`;
}

/* table with filters + paging; state kept per page instance */
function caseTable(list, opts = {}) {
  const st = opts.state || { q: "", cls: new Set(), mech: "", origin: "", conf: "", sort: ["gene", 1], page: 0 };
  const id = opts.id || "tbl";
  const per = opts.per || 25;
  const showFilters = opts.filters !== false;
  function rows() {
    const q = st.q.trim().toLowerCase();
    return list.filter(e => {
      if (st.cls.size && !st.cls.has(clsOf(e.mei_class))) return false;
      if (st.mech && !e.mechanisms.includes(st.mech)) return false;
      if (st.origin && e.origin !== st.origin) return false;
      if (st.conf === "high" && e.confidence !== "high") return false;
      if (st.conf === "medium" && e.confidence === "low") return false;
      if (q && ![e.gene, e.disease, e.subfamily, e.mei_class, e.case_label, e.ancestry_or_population, ...e.pmids].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  }
  const key = (e, k) => k === "mech" ? mName(e.mechanisms[0]) : k === "loc" ? loc(e) : k === "npap" ? e.pmids.length : (e[k] ?? "");
  function draw() {
    const [k, dir] = st.sort;
    const all = rows().sort((a, b) => { const x = key(a, k), y = key(b, k); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
    const pages = Math.max(1, Math.ceil(all.length / per));
    st.page = Math.min(st.page, pages - 1);
    const shown = all.slice(st.page * per, st.page * per + per);
    const box = document.getElementById(id);
    if (!box) return;
    box.querySelector("tbody").innerHTML = shown.length ? shown.map(e => `
      <tr tabindex="0" data-href="${L(`case-${e.id}`)}">
        <td class="gene">${esc(e.gene)}</td>
        <td class="${e.confidence === "low" ? "conf-low" : ""}">${esc(e.disease)}</td>
        <td><span class="cls">${sw(e.mei_class)}${esc(cName(e.mei_class))}${e.subfamily ? ` <span class="mono faint">${esc(e.subfamily)}</span>` : ""}</span></td>
        <td>${mechTags(e.mechanisms, false)}</td>
        <td>${esc(loc(e))}</td>
        <td>${esc(ORIGIN[e.origin] || "")}</td>
        <td class="mono">${e.first_year ?? ""}</td>
        <td class="mono">${e.pmids.length}</td>
      </tr>`).join("") : `<tr><td colspan="8" class="empty">No insertions match these filters.</td></tr>`;
    box.querySelectorAll("th").forEach(th => th.setAttribute("aria-sort", th.dataset.k === k ? (dir > 0 ? "ascending" : "descending") : "none"));
    const pg = box.querySelector(".pager");
    const win = [...Array(pages).keys()].filter(i => i < 2 || i >= pages - 2 || Math.abs(i - st.page) <= 1);
    let last = -1;
    pg.innerHTML = `<span>${all.length} of ${list.length} insertions${opts.note ? ` · ${opts.note}` : ""}</span><span style="flex:1"></span>` + (pages > 1 ? `<button data-p="${st.page - 1}" ${st.page === 0 ? "disabled" : ""}>Previous</button>` +
      win.map(i => { const gap = i - last > 1 ? `<span>…</span>` : ""; last = i; return gap + `<button data-p="${i}" aria-current="${i === st.page}">${i + 1}</button>`; }).join("") +
      `<button data-p="${st.page + 1}" ${st.page >= pages - 1 ? "disabled" : ""}>Next</button>` : "");
  }
  const html = `<div id="${id}">
    ${showFilters ? `<div class="filters" style="margin-bottom:12px">
      <input class="field" type="search" id="${id}-q" placeholder="Filter by gene, disease, subfamily, PMID…" value="${esc(st.q)}" aria-label="Filter table">
      <span class="filters">${CLASSES.map(c => `<button class="chip" type="button" data-cls="${c[0]}" aria-pressed="${st.cls.has(c[0])}"><i class="sw" style="background:var(${c[1]})"></i>${c[0]}</button>`).join("")}</span>
      ${opts.lockMech ? "" : `<label for="${id}-mech">Mechanism <select class="field" id="${id}-mech"><option value="">Any</option>${Object.keys(MECH).filter(m => list.some(e => e.mechanisms.includes(m))).map(m => `<option value="${m}"${st.mech === m ? " selected" : ""}>${esc(mName(m))}</option>`).join("")}</select></label>`}
      <label for="${id}-origin">Origin <select class="field" id="${id}-origin"><option value="">Any</option>${Object.keys(ORIGIN).map(o => `<option value="${o}"${st.origin === o ? " selected" : ""}>${ORIGIN[o]}</option>`).join("")}</select></label>
      <label for="${id}-conf">Confidence <select class="field" id="${id}-conf"><option value="">Any</option><option value="high"${st.conf === "high" ? " selected" : ""}>High only</option><option value="medium"${st.conf === "medium" ? " selected" : ""}>High + medium</option></select></label>
    </div>` : ""}
    <div class="table-wrap"><table>
      <thead><tr><th data-k="gene">Gene</th><th data-k="disease">Disease</th><th data-k="mei_class">Element</th><th data-k="mech">Mechanism</th><th data-k="loc">Location</th><th data-k="origin">Origin</th><th data-k="first_year">First reported</th><th data-k="npap">Papers</th></tr></thead>
      <tbody></tbody></table></div>
    <div class="pager"></div>
  </div>`;
  function bind() {
    const box = document.getElementById(id);
    if (!box) return;
    box.addEventListener("click", ev => {
      const chip = ev.target.closest("[data-cls]");
      if (chip) { const c = chip.dataset.cls; st.cls.has(c) ? st.cls.delete(c) : st.cls.add(c); chip.setAttribute("aria-pressed", st.cls.has(c)); st.page = 0; draw(); return; }
      const th = ev.target.closest("th[data-k]");
      if (th) { st.sort = [th.dataset.k, st.sort[0] === th.dataset.k ? -st.sort[1] : 1]; draw(); return; }
      const b = ev.target.closest(".pager button");
      if (b && !b.disabled) { st.page = +b.dataset.p; draw(); box.scrollIntoView({ block: "start" }); return; }
      const tr = ev.target.closest("tr[data-href]");
      if (tr) go(tr.dataset.href);
    });
    box.addEventListener("keydown", ev => { if (ev.key === "Enter" && ev.target.matches("tr[data-href]")) go(ev.target.dataset.href); });
    const on = (sfx, fn) => { const el = document.getElementById(id + sfx); if (el) el.addEventListener(sfx === "-q" ? "input" : "change", e => { fn(e.target.value); st.page = 0; draw(); }); };
    on("-q", v => st.q = v); on("-mech", v => st.mech = v); on("-origin", v => st.origin = v); on("-conf", v => st.conf = v);
    draw();
  }
  return { html, bind, state: st };
}

/* ---------- gene model: one or many insertions ---------- */
function geneModel(gene, evs, { focus = null, height } = {}) {
  const g = ATLAS.genes[gene];
  if (!g) return `<p class="diagram-note">No GENCODE v38 model is available for ${esc(gene)}.</p>`;
  const plus = g.strand === "+";
  const ex = g.exons.map(([s, t], i) => ({ i: i + 1, s, t, len: t - s + 1 }));
  const introns = ex.slice(0, -1).map((x, i) => { const y = ex[i + 1]; return { i: i + 1, len: plus ? y.s - x.t - 1 : x.s - y.t - 1, gs: plus ? x.t + 1 : y.t + 1, ge: plus ? y.s - 1 : x.s - 1 }; });
  const exW = x => Math.max(6, Math.sqrt(x.len) * 1.7);
  const inW = x => Math.max(12, Math.min(80, Math.log10(Math.max(10, x.len)) * 17));
  const padL = 40;
  let x = padL + 30;
  const exPos = [], inPos = [];
  ex.forEach((xx, i) => { const w = exW(xx); exPos.push({ ...xx, x, w }); x += w; if (i < introns.length) { const iw = inW(introns[i]); inPos.push({ ...introns[i], x, w: iw }); x += iw; } });
  const endX = x;
  // markers
  const marks = evs.map(e => {
    const pl = e.placement; let mx = null;
    if (pl) {
      if (pl.kind === "exon" && exPos[pl.index - 1]) mx = exPos[pl.index - 1].x + exPos[pl.index - 1].w * pl.frac;
      else if (pl.kind === "intron" && inPos[pl.index - 1]) mx = inPos[pl.index - 1].x + inPos[pl.index - 1].w * pl.frac;
      else if (pl.kind === "promoter") mx = padL + 12;
    }
    return { e, mx };
  }).filter(m => m.mx !== null).sort((a, b) => a.mx - b.mx);
  // lane assignment so labels don't collide
  const laneEnd = [];
  marks.forEach(m => {
    const label = evs.length > 1 ? (m.e.subfamily || cName(m.e.mei_class)) : elLabel(m.e);
    const w = label.length * 6.4 + 22;
    let lane = laneEnd.findIndex(end => m.mx > end + 6);
    if (lane < 0) { lane = laneEnd.length; laneEnd.push(0); }
    laneEnd[lane] = m.mx + w; m.lane = lane; m.label = label;
  });
  const lanes = Math.max(1, laneEnd.length);
  const top = 14 + lanes * 20;
  const mid = top + 30;
  const H = height || mid + 58;
  const W = Math.max(680, endX + 60);
  const focusE = focus ? evs.find(e => e.id === focus) : evs.length === 1 ? evs[0] : null;
  const affected = new Set(focusE ? (focusE.affected_exons || []) : []);
  const fcolor = focusE ? `var(${clsVar(focusE.mei_class)})` : "var(--accent)";
  const cds = g.cds;
  let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Gene model of ${esc(gene)}${marks.length ? ` with ${marks.length} insertion${marks.length > 1 ? "s" : ""} marked` : ""}">
    <defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--surface-solid)"/><line x1="0" y1="0" x2="0" y2="5" stroke="${fcolor}" stroke-width="2"/></pattern></defs>
    <text x="${padL}" y="${mid + 4}" text-anchor="end">5′</text><text x="${endX + 10}" y="${mid + 4}">3′</text>
    <line x1="${padL + 6}" y1="${mid}" x2="${endX}" y2="${mid}" stroke="var(--intron)" stroke-width="1.5"/>`;
  inPos.forEach(p => { s += `<rect class="hit" x="${p.x}" y="${mid - 9}" width="${p.w}" height="18" fill="var(--surface)" fill-opacity="0" data-tip="<b>Intron ${p.i}</b><br>${g.chrom}:${p.gs.toLocaleString()}–${p.ge.toLocaleString()}<br>${p.len.toLocaleString()} bp"/>`; });
  exPos.forEach(p => {
    let y = mid - 14, h = 28, fill = "var(--exon)";
    if (cds && (p.t < cds[0] || p.s > cds[1])) { y = mid - 8; h = 16; fill = "var(--utr)"; }
    const hit = affected.has(p.i);
    s += `<rect class="hit" x="${p.x}" y="${y}" width="${p.w}" height="${h}" rx="1.5" fill="${hit ? "url(#hatch)" : fill}" stroke="${hit ? fcolor : "none"}" stroke-width="${hit ? 1.5 : 0}"
      data-tip="<b>Exon ${p.i}</b>${hit ? " · affected in this case" : ""}<br>${g.chrom}:${p.s.toLocaleString()}–${p.t.toLocaleString()}<br>${p.len.toLocaleString()} bp${cds && (p.t < cds[0] || p.s > cds[1]) ? " · non-coding" : ""}"/>`;
    if (exPos.length <= 30 || p.i === 1 || p.i % 5 === 0 || p.i === exPos.length || hit) s += `<text x="${p.x + p.w / 2}" y="${mid + 30}" text-anchor="middle">${p.i}</text>`;
  });
  marks.forEach(m => {
    const e = m.e, color = `var(${clsVar(e.mei_class)})`;
    const ty = 10 + m.lane * 20;
    const dim = focus && e.id !== focus;
    const arrow = e.orientation_vs_gene === "antisense" ? " ◀" : e.orientation_vs_gene === "sense" ? " ▶" : "";
    const tip = `<b>${esc(e.gene)} · ${esc(elLabel(e))}</b><br>${esc(loc(e))}${e.hgvs ? `<br>${esc(e.hgvs)}` : ""}<br>${esc(e.disease)}<br>Mechanism: ${e.mechanisms.map(x => esc(mName(x))).join(", ")}` +
      (e.reports[0] && e.reports[0].mechanism_detail ? `<br><span style="opacity:.85">${esc(e.reports[0].mechanism_detail)}</span>` : "") + (evs.length > 1 ? `<br><i>Click to open this case</i>` : "");
    s += `<g class="hit" ${evs.length > 1 ? `data-href="${L(`case-${e.id}`)}"` : ""} data-tip="${esc(tip)}" opacity="${dim ? 0.35 : 1}">
      <line x1="${m.mx}" y1="${ty + 14}" x2="${m.mx}" y2="${mid - 15}" stroke="${color}" stroke-width="2"/>
      <path d="M ${m.mx - 7} ${ty + 2} L ${m.mx + 7} ${ty + 2} L ${m.mx} ${ty + 14} Z" fill="${color}" stroke="var(--surface-solid)" stroke-width="1.5"/>
      <rect x="${m.mx - 9}" y="${ty}" width="${m.label.length * 6.4 + 26}" height="18" fill="var(--surface)" fill-opacity="0"/>
      <text x="${m.mx + 10}" y="${ty + 11}" style="fill:var(--ink);font-size:11px">${esc(m.label)}${arrow}</text></g>`;
    if (e.mechanisms.includes("exonization") && e.placement && e.placement.kind === "intron" && (!focus || e.id === focus)) {
      s += `<rect class="hit" x="${m.mx + 5}" y="${mid - 10}" width="15" height="20" rx="1.5" fill="${color}" fill-opacity="0.35" stroke="${color}" stroke-dasharray="3 2" data-tip="<b>MEI-derived exon</b><br>Element sequence spliced into the mRNA"/>`;
    }
  });
  s += `<text x="${padL}" y="${H - 8}">${esc(g.transcript)} · ${g.chrom}:${g.tx_start.toLocaleString()}–${g.tx_end.toLocaleString()} (${g.strand}) · drawn 5′→3′, introns compressed</text></svg>`;
  return `<div class="diagram-wrap">${s}</div>
    <div class="legend-diag"><span><svg width="18" height="10"><rect width="18" height="10" rx="1.5" fill="var(--exon)"/></svg>Coding exon</span><span><svg width="18" height="10"><rect y="2" width="18" height="6" rx="1" fill="var(--utr)"/></svg>UTR</span><span><svg width="12" height="12"><path d="M 0 1 L 12 1 L 6 11 Z" fill="var(--accent)"/></svg>Insertion (▶ sense, ◀ antisense)</span>${affected.size ? `<span><svg width="18" height="10"><rect width="18" height="10" fill="url(#hatch)" stroke="${fcolor}"/></svg>Exon affected in this case</span>` : ""}</div>`;
}

/* ---------- pages ---------- */
function crumbs(items) { return `<nav class="crumbs" aria-label="Breadcrumb">${items.map((it, i) => i < items.length - 1 ? `<a href="${it[1]}">${esc(it[0])}</a><span>/</span>` : `<span>${esc(it[0])}</span>`).join("")}</nav>`; }

function pageHome() {
  const featured = [...EVENTS].filter(e => !e.review_only && e.placement).sort((a, b) => b.pmids.length - a.pmids.length).slice(0, 6);
  const heroE = EVENTS.find(e => e.gene === "FKTN" && e.mei_class === "SVA" && e.placement) || featured[0];
  const genes = Object.keys(GENES).length;
  const classCount = c => EVENTS.filter(e => clsOf(e.mei_class) === c).length;
  return `
  <section class="hero">
    <span class="eyebrow">Germline retrotransposon insertions in human disease</span>
    <h1>How <span class="grad">jumping genes</span> break human genes</h1>
    <p class="lede">A curated atlas of every published germline Alu, L1 and SVA insertion reported to cause disease, coded from the papers themselves: which gene, which element, where it landed and how it broke the gene.</p>
    <div class="stepper" id="helix-steps" aria-label="The insertion mechanism shown in the background animation">
      <span>Live: <span class="el-name">Alu</span> inserting by target-primed reverse transcription</span>
      <span class="s" data-step="nick"><i></i>Nick</span>
      <span class="s" data-step="rt"><i></i>Reverse transcription</span>
      <span class="s" data-step="tsd"><i></i>Target-site duplication</span>
    </div>
    <div class="hero-actions"><a class="btn" href="${L(`browse`)}">Browse all insertions</a><a class="btn ghost" href="${L(`mechanisms`)}">Explore mechanisms</a></div>
    <div class="statrow">
      <div class="stat"><b>${EVENTS.length}</b><span>insertion events</span></div>
      <div class="stat"><b>${genes}</b><span>genes</span></div>
      <div class="stat"><b>${PAPERS.size}</b><span>papers with cases</span></div>
      <div class="stat"><b>${ATLAS.stats.papers_screened.toLocaleString()}</b><span>papers screened</span></div>
    </div>
  </section>

  ${heroE ? `<section class="card">
    <div class="card-head"><h2>Featured case: <a href="${L(`case-${heroE.id}`)}" class="gene">${esc(heroE.gene)}</a> ${esc(cName(heroE.mei_class))}</h2><span class="faint" style="font-size:13px">${esc(heroE.disease)}</span></div>
    ${geneModel(heroE.gene, [heroE])}
    <p class="diagram-note">${esc((heroE.reports.find(r => r.text_source === "full_text") || heroE.reports[0]).mechanism_detail || "")}</p>
  </section>` : ""}

  <section class="grid-2">
    <div class="card">
      <div class="card-head"><h2>How the insertion breaks the gene</h2>${legend()}</div>
      ${mechBars(EVENTS)}
      <p class="faint" style="font-size:13px;margin-top:12px">Insertion events by mechanism; one event can have several. Click a mechanism for its page.</p>
    </div>
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Reported per decade</h2></div>${decadeCols(EVENTS)}</div>
      <div class="card"><div class="card-head"><h2>Where insertions land</h2></div>${countList(EVENTS, e => REGION[e.region] || "Not stated")}</div>
    </div>
  </section>

  <section class="stack" style="gap:14px">
    <div class="card-head" style="margin:0"><h2>By element</h2><a href="${L(`elements`)}">All elements →</a></div>
    <div class="grid-3" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">${CLASSES.map(c => `
      <a class="tile" href="${L(`element-${c[0]}`)}">
        <h3>${`<i class="sw" style="background:var(${c[1]})"></i>`}${c[0]}</h3>
        <div class="big">${classCount(c[0])}</div>
        <p class="muted" style="font-size:13.5px">${esc(ELEMENT_INFO[c[0]])}</p>
      </a>`).join("")}</div>
  </section>

  <section class="stack" style="gap:14px">
    <div class="card-head" style="margin:0"><h2>Most-reported insertions</h2><a href="${L(`browse`)}">Browse all →</a></div>
    <div class="grid-3">${featured.map(eventTile).join("")}</div>
  </section>`;
}

const browseState = { q: "", cls: new Set(), mech: "", origin: "", conf: "", sort: ["gene", 1], page: 0 };
function pageBrowse(arg) {
  if (arg) { browseState.q = decodeURIComponent(arg); browseState.page = 0; }
  const t = caseTable(EVENTS, { id: "browse-tbl", state: browseState, note: "low-confidence records in italics" });
  return { html: `
    <div class="page-head">${crumbs([["Overview", L("home")], ["Browse", L("browse")]])}
      <h1>All insertions</h1>
      <p class="lede">Every insertion event in the atlas. Filter by element, mechanism, origin or confidence, sort any column, and click a row to open its case page.</p></div>
    <div class="card">${t.html}</div>`, after: t.bind };
}

function pageCase(id) {
  const e = BY_ID[id];
  if (!e) return pageNotFound();
  const idx = EVENTS.indexOf(e);
  const prev = EVENTS[idx - 1], next = EVENTS[idx + 1];
  const same = GENES[e.gene].filter(x => x !== e);
  const related = EVENTS.filter(x => x !== e && x.gene !== e.gene && x.mechanisms[0] === e.mechanisms[0] && clsOf(x.mei_class) === clsOf(e.mei_class) && !x.review_only).slice(0, 3);
  const fact = (k, v) => v === null || v === undefined || v === "" ? "" : `<div class="fact"><span class="eyebrow">${k}</span><span class="v">${v}</span></div>`;
  const pl = e.placement;
  const note = !pl ? "The paper does not give an exon or intron position, so the insertion is not drawn."
    : `Insertion placed by ${esc(pl.source)}${pl.source.includes("number") ? "; papers may number exons on a different transcript than this canonical one" : ""}.`;
  return `
  <div class="case-head">
    ${crumbs([["Overview", L("home")], ["Genes", L("genes")], [e.gene, L(`gene-${e.gene}`)], [e.id, "#"]])}
    <span class="eyebrow">${esc(cName(e.mei_class))} insertion · ${esc(e.id)}${e.review_only ? " · from review table" : ""}</span>
    <div class="case-title"><h1><a href="${L(`gene-${esc(e.gene)}`)}" class="gene" style="color:inherit;text-decoration:none">${esc(e.gene)}</a></h1><h2 class="muted" style="font-weight:500">${esc(e.disease)}</h2></div>
    <div>${mechTags(e.mechanisms)}</div>
  </div>

  <section class="card">
    <div class="card-head"><h2>Gene model</h2><span class="faint" style="font-size:13px">Hover exons, introns and the insertion for details</span></div>
    ${geneModel(e.gene, [e])}
    <p class="diagram-note">${note}</p>
  </section>

  <section class="grid-2">
    <div class="card">
      <div class="card-head"><h2>The insertion</h2></div>
      <div class="facts">
        ${fact("Element", `<span class="cls">${sw(e.mei_class)}<a href="${L(`element-${clsOf(e.mei_class)}`)}">${esc(cName(e.mei_class))}</a>${e.subfamily ? ` <span class="mono">${esc(e.subfamily)}</span>` : ""}</span>`)}
        ${fact("Size", e.insertion_length_bp ? `<span class="mono">${e.insertion_length_bp.toLocaleString()} bp</span>${e.full_length === true ? " (full length)" : e.full_length === false ? " (truncated)" : ""}` : "")}
        ${fact("Location", esc(loc(e)))}
        ${fact("Orientation", e.orientation_vs_gene ? esc(e.orientation_vs_gene) + " to the gene" : "")}
        ${fact("HGVS", e.hgvs ? `<span class="mono">${esc(e.hgvs)}</span>` : "")}
        ${fact("Coordinates", e.chrom && e.pos ? `<span class="mono">${esc(e.genome_build || "")} ${esc(e.chrom)}:${e.pos.toLocaleString()}</span>` : "")}
        ${fact("Target-site duplication", e.tsd ? `<span class="mono">${esc(e.tsd)}</span>` : "")}
        ${fact("Origin", esc(ORIGIN[e.origin]))}
        ${fact("Inheritance", e.inheritance && e.inheritance !== "unknown" ? esc(e.inheritance) : "")}
        ${fact("Patients / families", [e.n_patients, e.n_families].some(Boolean) ? `${e.n_patients ?? "–"} / ${e.n_families ?? "–"}` : "")}
        ${fact("Population", esc(e.ancestry_or_population))}
        ${fact("Evidence", (e.evidence || []).map(v => `<span class="tag">${esc(EVID[v] || v)}</span>`).join(""))}
        ${fact("Confidence", esc(e.confidence))}
      </div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Mechanism</h2></div>
      <div class="stack" style="gap:12px">${e.mechanisms.map((m, i) => `<div><a href="${L(`mech-${m}`)}" style="font-weight:600">${esc(mName(m))}</a>${i === 0 ? ` <span class="faint" style="font-size:12px">primary</span>` : ""}<p class="muted" style="font-size:14px">${esc(MECH[m][1])}</p></div>`).join("")}</div>
    </div>
  </section>

  <section class="card">
    <div class="card-head"><h2>What the papers report</h2><span class="faint" style="font-size:13px">${e.reports.length} report${e.reports.length > 1 ? "s" : ""}</span></div>
    <div class="reports">${e.reports.map(r => { const p = ATLAS.papers[r.pmid] || {}; return `
      <div class="report${r.text_source === "full_text" ? " full" : ""}">
        <div><a href="https://pubmed.ncbi.nlm.nih.gov/${r.pmid}/" target="_blank" rel="noopener">${esc(p.first_author || "")}${p.first_author ? " et al. " : ""}${esc(p.year || "")}</a>
          <span class="muted">· ${esc(p.journal || "")}</span> <span class="mono faint">· PMID ${r.pmid}</span>
          <span class="faint">· ${r.text_source === "full_text" ? "coded from full text" : r.text_source === "review_table" ? "from review table" : "coded from abstract"}</span>${r.confidence === "low" ? ` <span class="conf-low">· low confidence</span>` : ""}</div>
        <div style="font-weight:500">${esc(p.title || "")}</div>
        <div>${mechTags(r.mechanisms, false)} <span class="muted">${esc(r.mechanism_detail || "")}</span></div>
        ${r.quote ? `<blockquote>“${esc(r.quote)}”</blockquote>` : ""}
      </div>`; }).join("")}</div>
  </section>

  ${same.length ? `<section class="stack" style="gap:14px"><div class="card-head" style="margin:0"><h2>Other insertions in ${esc(e.gene)}</h2><a href="${L(`gene-${esc(e.gene)}`)}">Gene page →</a></div><div class="grid-3">${same.slice(0, 6).map(eventTile).join("")}</div></section>` : ""}
  ${related.length ? `<section class="stack" style="gap:14px"><div class="card-head" style="margin:0"><h2>Similar cases in other genes</h2><a href="${L(`mech-${e.mechanisms[0]}`)}">${esc(mName(e.mechanisms[0]))} →</a></div><div class="grid-3">${related.map(eventTile).join("")}</div></section>` : ""}
  <nav class="prevnext">${prev ? `<a href="${L(`case-${prev.id}`)}">← ${esc(prev.gene)} (${esc(prev.id)})</a>` : "<span></span>"}${next ? `<a href="${L(`case-${next.id}`)}">${esc(next.gene)} (${esc(next.id)}) →</a>` : ""}</nav>`;
}

function pageMechanisms() {
  const keys = Object.keys(MECH).filter(m => EVENTS.some(e => e.mechanisms.includes(m)));
  return `
  <div class="page-head">${crumbs([["Overview", L("home")], ["Mechanisms", L("mechanisms")]])}
    <h1>Mechanisms</h1>
    <p class="lede">Each insertion is coded with the molecular mechanisms its papers describe, using a fixed set of categories. The first listed is the primary mechanism, weighted toward full-text, high-confidence reports.</p></div>
  <section class="card"><div class="card-head"><h2>All mechanisms by element</h2>${legend()}</div>${mechBars(EVENTS)}</section>
  <section class="grid-3">${keys.map(m => {
    const evs = EVENTS.filter(e => e.mechanisms.includes(m));
    const prim = evs.filter(e => e.mechanisms[0] === m).length;
    return `<a class="tile" href="${L(`mech-${m}`)}">
      <h3>${esc(mName(m))}</h3>
      <div class="minibar">${CLASSES.map(c => { const n = evs.filter(e => clsOf(e.mei_class) === c[0]).length; return n ? `<i style="flex:${n};background:var(${c[1]})"></i>` : ""; }).join("")}</div>
      <p class="muted" style="font-size:13.5px">${esc(MECH[m][1])}</p>
      <div class="meta"><span><b class="mono">${evs.length}</b> events</span><span>${prim} as primary</span></div>
    </a>`; }).join("")}</section>`;
}

function pageMechanism(m) {
  if (!MECH[m]) return pageNotFound();
  const evs = EVENTS.filter(e => e.mechanisms.includes(m));
  const ex = evs.filter(e => e.placement && !e.review_only).sort((a, b) => (b.confidence === "high") - (a.confidence === "high") || b.pmids.length - a.pmids.length)[0];
  const t = caseTable(evs, { id: "mech-tbl", lockMech: true });
  return { html: `
  <div class="page-head">${crumbs([["Overview", L("home")], ["Mechanisms", L("mechanisms")], [mName(m), "#"]])}
    <span class="eyebrow">Mechanism</span><h1>${esc(mName(m))}</h1><p class="lede">${esc(MECH[m][1])}</p>
    <div class="statrow"><div class="stat"><b>${evs.length}</b><span>insertion events</span></div><div class="stat"><b>${new Set(evs.map(e => e.gene)).size}</b><span>genes</span></div>${CLASSES.map(c => `<div class="stat"><b>${evs.filter(e => clsOf(e.mei_class) === c[0]).length}</b><span>${c[0]}</span></div>`).join("")}</div></div>
  ${ex ? `<section class="card"><div class="card-head"><h2>Example: <a href="${L(`case-${ex.id}`)}" class="gene">${esc(ex.gene)}</a></h2><span class="faint" style="font-size:13px">${esc(ex.disease)}</span></div>${geneModel(ex.gene, [ex])}<p class="diagram-note">${esc((ex.reports.find(r => r.mechanisms.includes(m) && r.text_source === "full_text") || ex.reports.find(r => r.mechanisms.includes(m)) || ex.reports[0]).mechanism_detail || "")}</p></section>` : ""}
  <section class="grid-2">
    <div class="card"><div class="card-head"><h2>Where these insertions land</h2></div>${countList(evs, e => REGION[e.region] || "Not stated")}</div>
    <div class="card"><div class="card-head"><h2>Reported per decade</h2>${legend()}</div>${decadeCols(evs)}</div>
  </section>
  <section class="card"><div class="card-head"><h2>Insertions with this mechanism</h2></div>${t.html}</section>`, after: t.bind };
}

function pageGenes() {
  const gs = Object.keys(GENES).filter(g => g !== "UNKNOWN").sort();
  const letters = [...new Set(gs.map(g => g[0]))];
  const top = [...gs].sort((a, b) => GENES[b].length - GENES[a].length).slice(0, 8);
  return { html: `
  <div class="page-head">${crumbs([["Overview", L("home")], ["Genes", L("genes")]])}
    <h1>Genes</h1><p class="lede">${gs.length} genes carry at least one disease-causing insertion. Each gene page draws every insertion on the gene's canonical transcript.</p></div>
  <section class="stack" style="gap:14px"><h2>Genes with the most insertions</h2>
    <div class="gene-grid">${top.map(g => geneChip(g)).join("")}</div></section>
  <section class="card">
    <div class="filters" style="margin-bottom:12px"><input class="field" type="search" id="gene-filter" placeholder="Filter genes…" aria-label="Filter genes"><div class="az">${letters.map(l => `<a href="${L(`genes`)}" data-letter="${l}">${l}</a>`).join("")}</div></div>
    <div id="gene-list">${letters.map(l => `<div class="letter" id="L-${l}">${l}</div><div class="gene-grid">${gs.filter(g => g[0] === l).map(geneChip).join("")}</div>`).join("")}</div>
  </section>`, after: () => {
    document.getElementById("gene-filter").addEventListener("input", ev => {
      const q = ev.target.value.trim().toUpperCase();
      document.querySelectorAll("#gene-list .gene-chip").forEach(c => c.hidden = q && !c.dataset.gene.includes(q));
      document.querySelectorAll("#gene-list .letter").forEach(l => { const grid = l.nextElementSibling; l.hidden = grid.hidden = ![...grid.children].some(c => !c.hidden); });
    });
    document.querySelectorAll("[data-letter]").forEach(a => a.addEventListener("click", ev => { ev.preventDefault(); document.getElementById("L-" + a.dataset.letter).scrollIntoView({ block: "start" }); }));
  } };
}
function geneChip(g) {
  const evs = GENES[g];
  return `<a class="gene-chip" href="${L(`gene-${esc(g)}`)}" data-gene="${esc(g)}"><span class="row"><span class="gene">${esc(g)}</span><span class="mono faint" style="font-size:12px">${evs.length}</span></span>
    <span class="minibar">${CLASSES.map(c => { const n = evs.filter(e => clsOf(e.mei_class) === c[0]).length; return n ? `<i style="flex:${n};background:var(${c[1]})"></i>` : ""; }).join("")}</span>
    <span class="faint" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(evs[0].disease)}</span></a>`;
}

function pageGene(g) {
  const evs = GENES[g];
  if (!evs) return pageNotFound();
  const m = ATLAS.genes[g];
  const drawn = evs.filter(e => e.placement).length;
  const t = caseTable(evs, { id: "gene-tbl", filters: evs.length > 8, per: 50 });
  const diseases = [...new Set(evs.map(e => e.disease))];
  return { html: `
  <div class="page-head">${crumbs([["Overview", L("home")], ["Genes", L("genes")], [g, "#"]])}
    <span class="eyebrow">Gene</span><h1 class="gene">${esc(g)}</h1>
    <p class="lede">${esc(diseases.slice(0, 3).join(" · "))}${diseases.length > 3 ? ` and ${diseases.length - 3} more` : ""}</p>
    <div class="statrow"><div class="stat"><b>${evs.length}</b><span>insertion event${evs.length > 1 ? "s" : ""}</span></div><div class="stat"><b>${new Set(evs.flatMap(e => e.pmids)).size}</b><span>papers</span></div>${m ? `<div class="stat"><b>${m.exons.length}</b><span>exons (canonical)</span></div><div class="stat"><b class="mono" style="font-size:20px">${esc(m.chrom)}</b><span>${m.strand === "+" ? "plus" : "minus"} strand</span></div>` : ""}</div></div>
  <section class="card"><div class="card-head"><h2>All insertions on the gene</h2><span class="faint" style="font-size:13px">${drawn} of ${evs.length} have a position to draw · click a marker to open its case</span></div>${geneModel(g, evs)}</section>
  <section class="grid-2">
    <div class="card"><div class="card-head"><h2>Mechanisms in this gene</h2>${legend()}</div>${mechBars(evs)}</div>
    <div class="card"><div class="card-head"><h2>Elements</h2></div>${countList(evs, e => cName(e.mei_class))}</div>
  </section>
  <section class="card"><div class="card-head"><h2>Insertions</h2></div>${t.html}</section>`, after: t.bind };
}

function pageElements() {
  return `
  <div class="page-head">${crumbs([["Overview", L("home")], ["Elements", L("elements")]])}
    <h1>Elements</h1><p class="lede">The mobile element classes behind disease insertions. Alu, L1 and SVA are active in the human genome today; the "Other" group collects rarer insertion types.</p></div>
  <section class="grid-2" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">${CLASSES.map(c => {
    const evs = EVENTS.filter(e => clsOf(e.mei_class) === c[0]);
    const top = Object.entries(evs.reduce((a, e) => (a[e.mechanisms[0]] = (a[e.mechanisms[0]] || 0) + 1, a), {})).sort((a, b) => b[1] - a[1]).filter(x => x[0] !== "unknown").slice(0, 3);
    return `<a class="tile" href="${L(`element-${c[0]}`)}" style="padding:20px">
      <h3 style="font-size:20px"><i class="sw" style="background:var(${c[1]});width:14px;height:14px"></i>${c[0]}</h3>
      <div class="big">${evs.length}<span class="faint" style="font-size:14px;font-family:var(--font-body);font-weight:400"> events in ${new Set(evs.map(e => e.gene)).size} genes</span></div>
      <p class="muted" style="font-size:14px">${esc(ELEMENT_INFO[c[0]])}</p>
      <div>${top.map(([m]) => `<span class="tag">${esc(mName(m))}</span>`).join("")}</div>
    </a>`; }).join("")}</section>`;
}

function pageElement(c) {
  const ci = CLASSES.find(x => x[0] === c);
  if (!ci) return pageNotFound();
  const evs = EVENTS.filter(e => clsOf(e.mei_class) === c);
  const sizes = evs.map(e => e.insertion_length_bp).filter(Boolean);
  const bins = c === "Alu" ? [[0, 100], [100, 200], [200, 280], [280, 300], [300, 400], [400, 1e9]] : [[0, 500], [500, 1000], [1000, 2000], [2000, 3000], [3000, 5000], [5000, 1e9]];
  const fmt = n => n >= 1e9 ? "+" : n >= 1000 ? (n / 1000) + " kb" : n + " bp";
  const hist = bins.map(([a, b]) => [a, b, sizes.filter(s => s >= a && s < b).length]);
  const hmax = Math.max(1, ...hist.map(h => h[2]));
  const t = caseTable(evs, { id: "el-tbl" });
  return { html: `
  <div class="page-head">${crumbs([["Overview", L("home")], ["Elements", L("elements")], [c, "#"]])}
    <span class="eyebrow">Element</span><h1 style="display:flex;align-items:center;gap:12px"><i class="sw" style="background:var(${ci[1]});width:20px;height:20px;border-radius:4px"></i>${c}</h1>
    <p class="lede">${esc(ELEMENT_INFO[c])}</p>
    <div class="statrow"><div class="stat"><b>${evs.length}</b><span>insertion events</span></div><div class="stat"><b>${new Set(evs.map(e => e.gene)).size}</b><span>genes</span></div><div class="stat"><b>${evs.filter(e => e.origin === "de_novo").length}</b><span>de novo</span></div><div class="stat"><b>${evs.filter(e => e.origin === "founder").length}</b><span>founder</span></div></div></div>
  <section class="grid-2">
    <div class="card"><div class="card-head"><h2>Mechanisms</h2></div>${mechBars(evs)}</div>
    <div class="stack">
      <div class="card"><div class="card-head"><h2>Subfamilies</h2></div>${countList(evs.filter(e => e.subfamily), e => e.subfamily.replace(/\s.*$/, ""), k => `<span class="mono">${esc(k)}</span>`) || ""}${evs.some(e => !e.subfamily) ? `<p class="faint" style="font-size:12.5px;margin-top:8px">${evs.filter(e => !e.subfamily).length} events without a reported subfamily</p>` : ""}</div>
      <div class="card"><div class="card-head"><h2>Insertion size</h2><span class="faint" style="font-size:12.5px">${sizes.length} with size reported</span></div>
        <div class="cols" style="height:110px">${hist.map(h => `<div class="col" data-tip="${fmt(h[0])}–${fmt(h[1])}: ${h[2]} events">${h[2] ? `<div style="height:${(h[2] / hmax * 100).toFixed(1)}%;background:var(${ci[1]})"></div>` : ""}</div>`).join("")}</div>
        <div class="col-labels">${hist.map(h => `<div>${h[1] >= 1e9 ? "&gt;" + fmt(h[0]) : fmt(h[1]).replace(" ", "")}</div>`).join("")}</div></div>
    </div>
  </section>
  <section class="card"><div class="card-head"><h2>${c} insertions</h2></div>${t.html}</section>`, after: t.bind };
}

function pageMethods(anchor) {
  const s = ATLAS.stats;
  return { html: `
  <div class="page-head">${crumbs([["Overview", L("home")], ["Methods", L("methods")]])}
    <h1>How the atlas was built</h1><p class="lede">Papers were found in PubMed, screened, and read by Claude, which coded each insertion with a fixed schema. Reports of the same insertion were then merged into one event.</p></div>
  <section class="card"><div class="card-head"><h2>Pipeline</h2></div><div class="steps">
    <div class="step"><div><h3>Search</h3><p>Four PubMed queries (MeSH retroelement terms, mobile-element and retrotransposon insertion wording, older "retrotransposal" wording, reviews), plus every paper cited in the disease table of Hancks &amp; Kazazian 2016 and every paper citing that review: <b class="mono">${s.papers_screened.toLocaleString()}</b> candidates.</p></div></div>
    <div class="step"><div><h3>Screen</h3><p>Each title and abstract was labelled include, maybe or exclude for "a human germline insertion that causes or likely causes disease". ${s.papers_extracted} papers went forward.</p></div></div>
    <div class="step"><div><h3>Read</h3><p>Open-access full text was retrieved from PubMed Central for ${s.with_full_text ?? "–"} papers; the rest were read from the abstract. Each case was coded with gene, element, subfamily, size, location, orientation, origin, mechanisms (14 fixed categories), evidence and a verbatim supporting sentence.</p></div></div>
    <div class="step"><div><h3>Merge</h3><p>Records were grouped into insertion events when gene, element class and location agreed and size, HGVS, coordinates and subfamily did not conflict. ${s.case_records} case records became ${s.events} events. Rows of the Hancks &amp; Kazazian 2016 table were attached to the event from the paper they cite, or added as low-confidence review-only events.</p></div></div>
    <div class="step"><div><h3>Draw</h3><p>Gene models are GENCODE v38 canonical transcripts on hg38. An insertion is placed by hg38 coordinate when given, otherwise by the paper's exon or intron number, or by the exon computed from its cDNA position.</p></div></div>
  </div></section>
  <section class="grid-2">
    <div class="card" id="methods-scope"><div class="card-head"><h2>Scope</h2></div><div class="prose">
      <p>Included: new (non-reference) germline insertions of Alu, L1, SVA, HERV, processed pseudogenes or polyA-only sequence, inherited, de novo or constitutional mosaic, reported as causing or likely causing disease.</p>
      <p>Excluded: somatic insertions found only in tumours; deletions from recombination between existing repeats; association studies of common insertion polymorphisms without a causal patient; reviews, except for the Hancks &amp; Kazazian 2016 table described above.</p></div></div>
    <div class="card"><div class="card-head"><h2>Completeness check</h2></div><div class="prose">
      <p>Hancks &amp; Kazazian 2016 list ${s.review_rows ?? 124} disease insertions. Counting only events found from the papers themselves (not the review rows), the atlas matches <b>${s.review_found ?? "–"}</b> by gene and element, <b>${s.review_gene_only ?? "–"}</b> more by gene only, and misses <b>${s.review_missing ?? "–"}</b>, mostly papers whose abstract does not mention the insertion.</p></div></div>
  </section>
  <section class="card" id="methods-caveats"><div class="card-head"><h2>Caveats</h2></div><div class="prose">
    <p>Mechanism and location are coded from each paper's own description. Many older papers are available only as abstracts, so ${EVENTS.filter(e => e.mechanisms[0] === "unknown").length} events have no described mechanism.</p>
    <p>Exon numbers come from the papers and may follow a different transcript than the canonical one drawn; each case page says how its insertion was placed. Events marked low confidence include candidate insertions the authors did not prove causal and review-table rows.</p>
    <p>Event identifiers are assigned at build time and can change when the atlas is rebuilt.</p></div></section>
  <section class="card"><div class="card-head"><h2>Mechanism categories</h2></div><dl class="glossary">${Object.entries(MECH).map(([k, [n, d]]) => `<div><dt style="font-weight:600"><a href="${L(`mech-${k}`)}">${esc(n)}</a></dt><dd class="muted" style="margin:0;font-size:14px">${esc(d)}</dd></div>`).join("")}</dl></section>`,
    after: () => { if (anchor) { const el = document.getElementById(anchor); if (el) el.scrollIntoView({ block: "start" }); } } };
}

function pageNotFound() {
  return `<div class="page-head"><h1>Page not found</h1><p class="lede">That page doesn't exist in the atlas. <a href="${L(`home`)}">Go to the overview</a> or <a href="${L(`browse`)}">browse all insertions</a>.</p></div>`;
}

/* ---------- page titles & descriptions (used for the browser tab and by search engines) ---------- */
function pageMeta(t) {
  const site = "MEI Disease Atlas";
  let m;
  if (t === "home" || t === "") return { title: `${site}: germline mobile element insertions in human disease`, desc: `Curated atlas of ${EVENTS.length} published germline Alu, L1 and SVA insertions that cause human disease in ${Object.keys(GENES).length} genes, coded by mechanism: exon skipping, exonization, coding disruption and more.` };
  if ((m = t.match(/^case-(.+)$/)) && BY_ID[m[1]]) { const e = BY_ID[m[1]]; return { title: `${e.gene} ${cName(e.mei_class)} insertion in ${e.disease} · ${site}`, desc: `${elLabel(e)} in ${e.gene} (${loc(e)}) causing ${e.disease}. Mechanism: ${e.mechanisms.map(mName).join(", ")}. ${e.pmids.length} paper${e.pmids.length > 1 ? "s" : ""}.` }; }
  if ((m = t.match(/^gene-(.+)$/)) && GENES[m[1]]) { const ev = GENES[m[1]]; return { title: `${m[1]}: mobile element insertions (Alu, L1, SVA) causing disease · ${site}`, desc: `${ev.length} disease-causing retrotransposon insertion${ev.length > 1 ? "s" : ""} in ${m[1]}: ${[...new Set(ev.map(e => e.disease))].slice(0, 3).join("; ")}. Gene model with every insertion marked.` }; }
  if ((m = t.match(/^mech-(.+)$/)) && MECH[m[1]]) return { title: `${mName(m[1])}: mobile element insertions in disease · ${site}`, desc: `${MECH[m[1]][1]} ${EVENTS.filter(e => e.mechanisms.includes(m[1])).length} published germline insertions with this mechanism.` };
  if ((m = t.match(/^element-(.+)$/)) && ELEMENT_INFO[m[1]]) return { title: `${m[1]} insertions in human disease · ${site}`, desc: `${ELEMENT_INFO[m[1]]} ${EVENTS.filter(e => clsOf(e.mei_class) === m[1]).length} disease-causing insertions.` };
  const fixed = { browse: ["All insertions", "Browse and filter every published germline mobile element insertion that causes disease."],
    mechanisms: ["Mechanisms", "How Alu, L1 and SVA insertions break genes: coding disruption, exon skipping, exonization, aberrant splicing and more."],
    genes: ["Genes", "Genes with disease-causing mobile element insertions, A to Z."], elements: ["Elements", "Alu, L1, SVA and other retrotransposon insertions in human disease."],
    methods: ["How the atlas was built", "Literature search, screening, AI-assisted extraction and merging behind the MEI Disease Atlas."],
    about: ["About and citation", "Authorship, citation, licence and disclaimer for the MEI Disease Atlas."] };
  const f = fixed[t.split("-")[0]] || ["Page not found", ""];
  return { title: `${f[0]} · ${site}`, desc: f[1] };
}

function pageAbout() {
  const s = ATLAS.stats;
  return `
  <div class="page-head">${crumbs([["Overview", L("home")], ["About", "#"]])}
    <h1>About the atlas</h1><p class="lede">The MEI Disease Atlas collects published germline mobile element insertions that cause human disease and codes how each one breaks its gene, so the literature can be searched by gene, element and mechanism in one place.</p></div>
  <section class="grid-2">
    <div class="card"><div class="card-head"><h2>Author</h2></div><div class="prose">
      <p><b style="color:var(--ink)">Juliana Yue</b><br>Baylor College of Medicine</p>
      <p>Corrections and missing cases are welcome: open an issue on the <a href="https://github.com/julianayuebcm/mei-disease-atlas/issues" target="_blank" rel="noopener">GitHub repository</a>.</p></div></div>
    <div class="card"><div class="card-head"><h2>How to cite</h2></div><div class="prose">
      <p class="mono" style="font-size:13px;color:var(--ink)">Yue J. MEI Disease Atlas: germline mobile element insertions in human disease (version ${esc(ATLAS.built || "")}). https://julianayuebcm.github.io/mei-disease-atlas/</p>
      <p>Please also cite the original papers for any case you use; each case page links to them on PubMed.</p></div></div>
  </section>
  <section class="card"><div class="card-head"><h2>Disclaimer</h2></div><div class="prose">
    <p>Records were extracted from ${s.papers_extracted} papers with the help of a large language model (Claude, Anthropic) and merged automatically. They have been only partly checked by hand and may contain errors. Always confirm details in the original publication.</p>
    <p>This resource is for research and education. It is not a clinical database and must not be used for diagnosis or patient care decisions.</p>
    <p>The atlas contains only information from published literature and public gene annotation (GENCODE v38). It contains no patient data.</p></div></section>
  <section class="grid-2">
    <div class="card"><div class="card-head"><h2>Licence</h2></div><div class="prose">
      <p>Data: <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>. Code: MIT. Short quotations are reproduced from the cited papers for scholarly reference; copyright remains with their publishers.</p></div></div>
    <div class="card"><div class="card-head"><h2>Sources</h2></div><div class="prose">
      <p>PubMed and PubMed Central (NCBI); Hancks &amp; Kazazian (2016) <i>Mobile DNA</i> 7:9, Table 1; GENCODE release 38 (hg38) gene models.</p></div></div>
  </section>`;
}

/* ---------- router ---------- */
const ROUTES = [
  [/^$|^home$/, () => pageHome(), "home"],
  [/^browse(?:-(.+))?$/, m => pageBrowse(m[1]), "browse"],
  [/^case-(MEI\d+)$/, m => pageCase(m[1]), "browse"],
  [/^mechanisms$/, () => pageMechanisms(), "mechanisms"],
  [/^mech-([a-z_]+)$/, m => pageMechanism(m[1]), "mechanisms"],
  [/^genes$/, () => pageGenes(), "genes"],
  [/^gene-(.+)$/, m => pageGene(decodeURIComponent(m[1])), "genes"],
  [/^elements$/, () => pageElements(), "elements"],
  [/^element-(Alu|L1|SVA|Other)$/, m => pageElement(m[1]), "elements"],
  [/^methods(?:-(scope|caveats))?$/, m => pageMethods(m[1] ? "methods-" + m[1] : null), "methods"],
  [/^about$/, () => pageAbout(), "about"],
];
function route() {
  const h = tokenFromLocation();
  let out = pageNotFound(), nav = null;
  for (const [re, fn, n] of ROUTES) { const m = h.match(re); if (m) { out = fn(m); nav = n; break; } }
  const res = typeof out === "string" ? { html: out } : out;
  app.innerHTML = res.html;
  const meta = pageMeta(h || "home");
  document.title = meta.title;
  document.querySelectorAll("#nav a").forEach(a => a.setAttribute("aria-current", (a.getAttribute("href") === L(nav) || a.getAttribute("href") === "#" + nav) ? "page" : "false"));
  tip.hidden = true;
  window.scrollTo(0, 0);
  if (res.after) res.after();
  window.dispatchEvent(new Event("helix:route"));
}

/* ---------- global interactions ---------- */
const tip = document.getElementById("tip");
document.addEventListener("mouseover", ev => {
  const t = ev.target.closest("[data-tip]");
  if (!t) { tip.hidden = true; return; }
  tip.innerHTML = t.getAttribute("data-tip"); tip.hidden = false;
});
document.addEventListener("mousemove", ev => {
  if (tip.hidden) return;
  const r = tip.getBoundingClientRect();
  let x = ev.clientX + 14, y = ev.clientY + 14;
  if (x + r.width > innerWidth - 8) x = ev.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = ev.clientY - r.height - 14;
  tip.style.left = x + "px"; tip.style.top = y + "px";
});
document.addEventListener("click", ev => {
  const g = ev.target.closest("svg [data-href]");
  if (g) go(g.getAttribute("data-href"));
});

const gs = document.getElementById("gsearch"), sug = document.getElementById("suggest");
let sel = -1;
function suggestions(q) {
  q = q.trim().toLowerCase();
  if (!q) return [];
  const out = [];
  Object.keys(GENES).filter(g => g.toLowerCase().startsWith(q)).slice(0, 6).forEach(g => out.push(["Gene", g, `${GENES[g].length}`, L(`gene-${g}`)]));
  Object.keys(MECH).filter(m => mName(m).toLowerCase().includes(q)).slice(0, 3).forEach(m => out.push(["Mechanism", mName(m), "", L(`mech-${m}`)]));
  const dis = {};
  EVENTS.forEach(e => { if (e.disease.toLowerCase().includes(q)) (dis[e.disease] ||= []).push(e); });
  Object.entries(dis).slice(0, 5).forEach(([d, es]) => out.push(["Disease", d, es.length === 1 ? es[0].gene : `${es.length}`, es.length === 1 ? L(`case-${es[0].id}`) : L(`browse-${encodeURIComponent(d)}`)]));
  out.push(["Search", `All results for “${q}”`, "", L(`browse-${encodeURIComponent(q)}`)]);
  return out;
}
function drawSuggest() {
  const items = suggestions(gs.value);
  sug.hidden = !items.length;
  sug.innerHTML = items.map((it, i) => `<a href="${it[3]}" class="${i === sel ? "is-sel" : ""}"><span class="kind">${it[0]}</span><span>${esc(it[1])}</span><span class="mono faint" style="font-size:12px">${esc(it[2])}</span></a>`).join("");
}
gs.addEventListener("input", () => { sel = -1; drawSuggest(); });
gs.addEventListener("keydown", ev => {
  const n = sug.querySelectorAll("a").length;
  if (ev.key === "ArrowDown") { sel = Math.min(n - 1, sel + 1); drawSuggest(); ev.preventDefault(); }
  else if (ev.key === "ArrowUp") { sel = Math.max(-1, sel - 1); drawSuggest(); ev.preventDefault(); }
  else if (ev.key === "Enter") { const a = sug.querySelectorAll("a")[sel >= 0 ? sel : n - 1]; if (a) { go(a.getAttribute("href")); gs.blur(); sug.hidden = true; } }
  else if (ev.key === "Escape") { sug.hidden = true; }
});
gs.addEventListener("blur", () => setTimeout(() => { sug.hidden = true; }, 150));
sug.addEventListener("click", () => { sug.hidden = true; gs.value = ""; });

function boot() {
  buildIndexes();
  document.getElementById("foot-note").textContent = `${EVENTS.length} germline mobile element insertions in ${Object.keys(GENES).length} genes, coded from ${PAPERS.size} papers. Built ${ATLAS.built || ""} from ${ATLAS.stats.papers_screened.toLocaleString()} PubMed records. Research use only; not for clinical decisions.`;
  if (STATIC) {
    document.querySelectorAll('header a[href^="#"], footer a[href^="#"]').forEach(a => a.setAttribute("href", L(a.getAttribute("href").slice(1))));
    document.addEventListener("click", ev => {
      const a = ev.target.closest("a[href]");
      if (!a || a.target === "_blank" || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
      const href = a.getAttribute("href");
      if (href.startsWith(BASE) && !href.startsWith("//")) { ev.preventDefault(); go(href); }
    });
    window.addEventListener("popstate", route);
  } else {
    window.addEventListener("hashchange", route);
  }
  route();
}
if (typeof window.__PRERENDER__ === "undefined") {
  if (ATLAS) boot();
  else if (STATIC) fetch(BASE + "atlas.json").then(r => r.json()).then(d => { initData(d); boot(); });
}
