"use strict";
/* =====================================================================
   Reports module – loaded BEFORE app.js and uses app.js helpers at run time
   (db, ui, esc, fmtDate, RANK, maxRank, tbl, can, …).
   Every number links to the list of enquiries behind it ("drill-down").
   ===================================================================== */

const REPORT_TABS = [
  ["overview", "Overview"], ["trends", "Trends"], ["followup", "Follow-up speed"], ["visits", "Visits"],
  ["pipeline", "Pipeline speed"], ["staff", "Counsellors"], ["sources", "Sources & cost"], ["forecast", "Fees & forecast"],
  ["classes", "Classes & seats"], ["lost", "Lost families"], ["areas", "Areas & transport"], ["nextyear", "Next-year pool"],
  ["quality", "Data quality"], ["timing", "Enquiry timing"]
];
// chance (%) that a family at this stage will be admitted – editable on the Fees & forecast tab
const DEFAULT_PROB = { "New": 5, "No Response": 3, "Contacted": 10, "Interested": 20, "Visit Scheduled": 30, "Visited": 40,
  "Application": 70, "Assessment": 80, "Documents": 90, "Fee Paid": 100, "Admitted": 100, "Next Year": 10 };

/* ---------- drill-down registry ---------- */
const drillReg = new Map();
let drillSeq = 0;
function dn(label, leads, title){
  if (!leads || !leads.length) return `${label}`;
  const k = "d" + (++drillSeq);
  drillReg.set(k, { title: title || "Enquiries", ids: leads.map(l => l.id) });
  return `<a href="#" class="dn" data-act="drill" data-k="${k}" title="Show these ${leads.length} enquiries">${label}</a>`;
}
function drillDialog(k){
  const d = drillReg.get(k); if (!d) return;
  const L = d.ids.map(id => db.leads.find(l => l.id === id)).filter(Boolean);
  showDialog(`<div class="dlg-h"><b>${esc(d.title)} · ${L.length}</b><button class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="mlist">${L.map(l => `<div class="mrow" data-act="drill-open" data-id="${l.id}"><div class="mmain">
    <div class="mtop"><span class="mname">${heatTag(l)} ${displayName(l)}</span>${chip(l.stage)}</div>
    <div class="meta">${esc(fmtPhone(l.phone) || l.phoneRaw)}${classesOf(l) ? ` · ${esc(classesOf(l))}` : ""}${l.assignedTo ? ` · ${esc(l.assignedTo)}` : ""}</div>
    <div class="meta">Enquired ${fmtDate(l.date)}${isOpen(l) && l.nextFollowUp ? ` · Next: ${relDue(l.nextFollowUp)}` : ""}${l.lostReason && !isOpen(l) ? ` · ${esc(l.lostReason)}` : ""}</div>
  </div></div>`).join("")}</div></div>
  <div class="dlg-f">${can("bulk") && L.some(l => l.phone) ? `<button class="btn wa" data-act="bulk-ids" data-ids="${L.filter(l => l.phone).map(l => l.id).join(",")}">WhatsApp all</button>` : ""}
    ${can("export") ? `<button class="btn" data-act="drill-export" data-k="${k}">Export list</button>` : ""}<button class="btn primary" data-act="close-dlg">Close</button></div>`);
}
function drillExport(k){
  const d = drillReg.get(k); if (!d || typeof XLSX === "undefined") return;
  const ids = new Set(d.ids);
  const rows = exportRows(db.leads.filter(l => ids.has(l.id)));
  const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Enquiries");
  XLSX.writeFile(wb, `${d.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 50)}-${todayISO()}.xlsx`);
  logAct("Exported", null, `Report list "${d.title}", ${rows.length} enquiries`); save();
}

/* ---------- shared helpers ---------- */
const repValid = l => l.type === "Admission" && l.stage !== "Invalid";
const feeNum = l => parseFloat(String(l.feeAmount || "").replace(/[^\d.]/g, "")) || 0;
const money = n => `${esc(db.settings.currency || "")} ${Math.round(n).toLocaleString()}`;
const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
const median = arr => { if (!arr.length) return null; const s = arr.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const fmtD = n => n == null ? "—" : `${n.toFixed(1)} d`;
const probOf = st => { const p = (db.settings.stageProb || {})[st]; return (p != null && p !== "" ? +p : (DEFAULT_PROB[st] ?? 0)) / 100; };
const isImported = l => /^Imported from Excel/.test((l.history[0] || {}).note || "");
function groupBy(arr, keyFn){ const m = new Map(); for (const x of arr) for (const k of [].concat(keyFn(x))) { const key = k || "(not recorded)"; if (!m.has(key)) m.set(key, []); m.get(key).push(x); } return m; }
function titleCase(s){ return String(s || "").trim().toLowerCase().replace(/\b\w/g, c => c.toUpperCase()); }
// first date a lead reached a pipeline rank (null when not recorded, e.g. imported leads)
function firstReach(l, rank){
  if (rank <= 0) return l.date;
  for (const h of l.history) {
    if (h.stageTo && (RANK[h.stageTo] ?? -1) >= rank && h.stageTo !== h.stageFrom) return h.date;
    if (rank <= 1 && h.kind === "followup" && h.outcome === "Answered") return h.date;
    if (rank <= 4 && rank >= 4 && h.kind === "followup" && h.outcome === "Visited campus") return h.date;
  }
  return null;
}
function stageSince(l){ for (let i = l.history.length - 1; i >= 0; i--) { const h = l.history[i]; if (h.stageTo && h.stageTo !== h.stageFrom) return h.date; } return l.date; }
function lastActivity(l){ const h = l.history[l.history.length - 1]; return h ? h.date : l.date; }
function attendedDate(l){ const h = l.history.find(h => h.kind === "followup" && h.outcome === "Visited campus") || l.history.find(h => h.stageTo === "Visited"); return h ? h.date : null; }
function noShowDates(l){ return l.history.filter(h => /^No-show/.test(h.note || "")).map(h => h.date); }
function workdays(a, b){ let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (db.settings.visitDays.includes(dowOf(d))) n++; return Math.max(1, n); }
function lostAt(l){ const r = maxRank(l); return r <= 0 ? "Before contact" : r <= 2 ? "After contact" : r === 3 ? "Visit booked" : r === 4 ? "After visit" : "After application"; }

/* ---------- report period ---------- */
function repRange(){
  const t = todayISO(); const [y, m] = t.split("-").map(Number);
  switch (ui.rep) {
    case "week": { const ws = weekStart(0); return [ws, addDays(ws, 6)]; }
    case "month": return [`${y}-${pad(m)}-01`, isoOf(new Date(y, m, 0))];
    case "lastmonth": return [isoOf(new Date(y, m - 2, 1)), isoOf(new Date(y, m - 1, 0))];
    case "30": return [addDays(t, -29), t];
    case "90": return [addDays(t, -89), t];
    case "year": return [`${y}-01-01`, `${y}-12-31`];
    case "custom": return [ui.repFrom || addDays(t, -29), ui.repTo || t];
    default: return ["0000-01-01", "9999-12-31"];
  }
}
function repCtx(){
  const t = todayISO();
  let [from, to] = repRange();
  if (ui.rep === "all") { const ds = db.leads.map(l => l.date).filter(Boolean).sort(); from = ds[0] || t; to = t; }
  const span = daysBetween(from, to) + 1;
  let pf = null, pt = null, prevLabel = "";
  if (ui.rep === "month" || ui.rep === "lastmonth") { const [y, m] = from.split("-").map(Number); pf = isoOf(new Date(y, m - 2, 1)); pt = isoOf(new Date(y, m - 1, 0)); prevLabel = "previous month"; }
  else if (ui.rep === "week") { pf = addDays(from, -7); pt = addDays(to, -7); prevLabel = "last week"; }
  else if (ui.rep === "year") { const y = +from.slice(0, 4) - 1; pf = `${y}-01-01`; pt = `${y}-12-31`; prevLabel = "last year"; }
  else if (ui.rep !== "all") { pf = addDays(from, -span); pt = addDays(from, -1); prevLabel = `previous ${span} days`; }
  const inR = d => !!d && d >= from && d <= to;
  const inP = d => !!pf && !!d && d >= pf && d <= pt;
  const L = db.leads.filter(l => inR(l.date)), PL = pf ? db.leads.filter(l => inP(l.date)) : [];
  const acts = [];
  db.leads.forEach(l => l.history.forEach(h => { if (h.kind === "followup") acts.push({ l, h }); }));
  return { t, from, to, span, pf, pt, prevLabel, hasPrev: !!pf, inR, inP, L, PL, valid: L.filter(repValid), pvalid: PL.filter(repValid), acts };
}

/* ---------- small building blocks ---------- */
function kpiD(c, label, val, cur, prev, o = {}){
  let d = "";
  if (c.hasPrev && prev != null && cur != null) {
    if (o.pp) { const ch = Math.round(cur - prev); d = ch === 0 ? `<span class="delta flat">● same</span>` : `<span class="delta ${(ch > 0) !== !!o.lowerBetter ? "good" : "bad"}">${ch > 0 ? "▲" : "▼"} ${Math.abs(ch)} pts</span>`; }
    else if (prev === 0) d = cur === 0 ? `<span class="delta flat">● same</span>` : `<span class="delta ${o.lowerBetter ? "bad" : "good"}">▲ new</span>`;
    else { const ch = Math.round((cur - prev) / prev * 100); d = ch === 0 ? `<span class="delta flat">● same</span>` : `<span class="delta ${(ch > 0) !== !!o.lowerBetter ? "good" : "bad"}">${ch > 0 ? "▲" : "▼"} ${Math.abs(ch)}%</span>`; }
  }
  return `<div class="card kpi rk"><div class="l">${label}</div><div class="v">${val}</div>${d ? `<div class="dl">${d} <span class="muted">vs ${c.prevLabel}</span></div>` : ""}${o.hint ? `<div class="dl muted">${o.hint}</div>` : ""}</div>`;
}
function barsD(entries, colorFn, total, title){
  const max = Math.max(1, ...entries.map(e => e[1].length));
  return `<div class="bars">${entries.map(([k, arr]) => `<div class="row"><span class="lbl" title="${esc(k)}">${esc(k)}</span><div class="track"><div class="fill" style="width:${arr.length / max * 100}%;background:${colorFn ? colorFn(k) : "var(--s1)"}"></div></div><b>${dn(arr.length, arr, (title ? title + ": " : "") + k)}${total ? ` <span class="muted">${pct(arr.length, total)}</span>` : ""}</b></div>`).join("") || `<div class="muted">No data yet</div>`}</div>`;
}
function card(title, body, hint){ return `<div class="card rc"><h2>${title}</h2>${body}${hint ? `<p class="hint">${hint}</p>` : ""}</div>`; }
function niceMax(m){ if (m <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(m))), n = m / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; }
// vertical bar chart (1–3 series). series: [{ name, color: "var(--s1)", values: [] }]
function barChart(cats, series, o = {}){
  const W = 640, H = o.h || 210, pl = 34, pr = 6, pt = 10, pb = 24, ih = H - pt - pb;
  const max = niceMax(Math.max(1, ...series.flatMap(s => s.values)));
  const cw = (W - pl - pr) / Math.max(1, cats.length), gap = 2;
  const gw = cw * (series.length > 1 ? 0.8 : 0.66), bw = Math.max(2, (gw - gap * (series.length - 1)) / series.length);
  const y = v => pt + ih - v / max * ih, base = pt + ih;
  const grid = [0, max / 2, max].map(v => `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}" class="cg"/><text x="${pl - 6}" y="${y(v) + 3}" text-anchor="end" class="ct">${Math.round(v)}</text>`).join("");
  const every = Math.ceil(cats.length / (o.maxLabels || 12));
  let marks = "";
  cats.forEach((cat, i) => {
    const x0 = pl + i * cw + (cw - gw) / 2;
    series.forEach((s, j) => {
      const v = s.values[i] || 0; if (!v) return;
      const x = x0 + j * (bw + gap), yy = y(v), r = Math.min(4, bw / 2, base - yy);
      marks += `<path class="cb" style="fill:${s.color}" d="M${x},${base}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + bw - r}Q${x + bw},${yy} ${x + bw},${yy + r}V${base}Z"><title>${esc(cat)}${series.length > 1 ? ` · ${esc(s.name)}` : ""}: ${v}</title></path>`;
    });
    if (i % every === 0) marks += `<text x="${pl + i * cw + cw / 2}" y="${H - 7}" text-anchor="middle" class="ct">${esc(cat)}</text>`;
  });
  const legend = series.length > 1 ? `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join("")}</div>` : "";
  return `<div class="chart">${legend}<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.label || "Chart")}">${grid}<line x1="${pl}" x2="${W - pr}" y1="${base}" y2="${base}" class="ca"/>${marks}</svg></div>`;
}
function rangeLabel(c){ return ui.rep === "all" ? "All time" : `${fmtDate(c.from)} – ${fmtDate(c.to)}`; }
function groupStatsD(L, keyFn, title){
  return [...groupBy(L, keyFn).entries()].sort((a, b) => b[1].length - a[1].length).map(([k, arr]) => {
    const c = arr.filter(l => maxRank(l) >= 1), v = arr.filter(l => maxRank(l) >= 4), a = arr.filter(l => maxRank(l) >= 9);
    return [esc(k), dn(arr.length, arr, `${title}: ${k}`), `${dn(c.length, c, `${title} ${k} – contacted`)} <span class="muted">${pct(c.length, arr.length)}</span>`,
      `${dn(v.length, v, `${title} ${k} – visited`)} <span class="muted">${pct(v.length, arr.length)}</span>`, dn(a.length, a, `${title} ${k} – admitted`), `<b>${pct(a.length, arr.length)}</b>`];
  });
}

/* =====================================================================
   THE REPORTS
   ===================================================================== */
const REPORTS = {
  overview(c){
    const V = c.valid, P = c.pvalid, r = (arr, n) => arr.filter(l => maxRank(l) >= n);
    const quick = arr => arr.filter(l => { const d = firstContactDays(l); return d != null && d <= 1; });
    const fees = db.leads.filter(l => c.inR(l.feePaidDate)), pfees = db.leads.filter(l => c.inP(l.feePaidDate));
    const acts = c.acts.filter(a => c.inR(a.h.date)).length, pacts = c.acts.filter(a => c.inP(a.h.date)).length;
    const overdue = db.leads.filter(l => isActive(l) && l.nextFollowUp && l.nextFollowUp < c.t);
    const conv = arr => arr.length ? r(arr, 9).length / arr.length * 100 : 0;
    const lost = V.filter(l => l.stage === "Lost" || l.stage === "Not Reachable");
    return `<div class="grid kpis">
      ${kpiD(c, "Enquiries", dn(c.L.length, c.L, "Enquiries"), c.L.length, c.PL.length)}
      ${kpiD(c, "Valid admission leads", dn(V.length, V, "Valid admission leads"), V.length, P.length)}
      ${kpiD(c, "Contacted", `${dn(r(V, 1).length, r(V, 1), "Contacted")} <small class="muted">${pct(r(V, 1).length, V.length)}</small>`, r(V, 1).length, r(P, 1).length)}
      ${kpiD(c, "Called within 1 day", `${pct(quick(V).length, V.length)}`, V.length ? quick(V).length / V.length * 100 : null, P.length ? quick(P).length / P.length * 100 : null, { pp: true })}
      ${kpiD(c, "Visits booked", dn(r(V, 3).length, r(V, 3), "Visits booked"), r(V, 3).length, r(P, 3).length)}
      ${kpiD(c, "Visited", dn(r(V, 4).length, r(V, 4), "Visited"), r(V, 4).length, r(P, 4).length)}
      ${kpiD(c, "Admitted", dn(r(V, 9).length, r(V, 9), "Admitted"), r(V, 9).length, r(P, 9).length)}
      ${kpiD(c, "Enquiry → admission", `${conv(V).toFixed(1)}%`, conv(V), conv(P), { pp: true })}
      ${kpiD(c, "Fees collected", dn(money(fees.reduce((s, l) => s + feeNum(l), 0)), fees, "Fees collected"), fees.reduce((s, l) => s + feeNum(l), 0), pfees.reduce((s, l) => s + feeNum(l), 0))}
      ${kpiD(c, "Follow-ups logged", acts, acts, pacts)}
      ${kpiD(c, "Overdue right now", dn(overdue.length, overdue, "Overdue follow-ups"), null, null, { hint: "all periods" })}
    </div>
    <div class="grid two" style="margin-top:14px">
      ${card("Conversion funnel", barsD(FUNNEL.map(([lab, n]) => [lab, r(V, n)]), () => "var(--s1)", V.length, "Funnel"))}
      ${card("Why families were lost", barsD([...groupBy(lost, l => l.lostReason || "Not recorded").entries()].sort((a, b) => b[1].length - a[1].length), () => "var(--s2)", lost.length, "Lost"))}
    </div>
    ${card("By source", tbl(["Source", "Enquiries", "Contacted", "Visited", "Admitted", "Conversion"], groupStatsD(V, l => l.source, "Source")))}`;
  },

  trends(c){
    const t = c.t, [ty, tm] = t.split("-").map(Number);
    const months = []; for (let i = 11; i >= 0; i--) { const d = new Date(ty, tm - 1 - i, 1); months.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`); }
    const valid = db.leads.filter(repValid);
    const byM = k => valid.filter(l => l.date.slice(0, 7) === k);
    const lyKey = k => `${+k.slice(0, 4) - 1}${k.slice(4)}`;
    const ml = k => `${MON[+k.slice(5) - 1]} ${k.slice(2, 4)}`;
    const mrows = months.map(k => { const a = byM(k), ly = byM(lyKey(k)), v = a.filter(l => maxRank(l) >= 4), ad = a.filter(l => maxRank(l) >= 9);
      const ch = ly.length ? Math.round((a.length - ly.length) / ly.length * 100) : null;
      return [ml(k), dn(a.length, a, `Enquiries ${ml(k)}`), ly.length ? dn(ly.length, ly, `Enquiries ${ml(lyKey(k))}`) : "—", ch == null ? "—" : `<span class="delta ${ch >= 0 ? "good" : "bad"}">${ch >= 0 ? "▲" : "▼"} ${Math.abs(ch)}%</span>`,
        dn(v.length, v, `Visited – enquired ${ml(k)}`), dn(ad.length, ad, `Admitted – enquired ${ml(k)}`), pct(ad.length, a.length)]; });
    const weeks = []; for (let i = 11; i >= 0; i--) weeks.push(weekStart(-i));
    const byW = w => valid.filter(l => l.date >= w && l.date <= addDays(w, 6));
    const actW = w => c.acts.filter(a => a.h.date >= w && a.h.date <= addDays(w, 6)).length;
    return card("Monthly – last 12 months", barChart(months.map(ml), [
        { name: "Enquiries", color: "var(--s1)", values: months.map(k => byM(k).length) },
        { name: "Visited", color: "var(--s2)", values: months.map(k => byM(k).filter(l => maxRank(l) >= 4).length) },
        { name: "Admitted", color: "var(--s3)", values: months.map(k => byM(k).filter(l => maxRank(l) >= 9).length) }], { label: "Monthly enquiries, visits and admissions" }) +
      tbl(["Month", "Enquiries", "Same month last year", "Change", "Visited", "Admitted", "Conversion"], mrows.reverse()),
      "Visited and admitted are counted against the month the family first enquired. This tab ignores the period selector.") +
      `<div class="grid two" style="margin-top:14px">${card("Enquiries per week – last 12 weeks", barChart(weeks.map(w => fmtDate(w).slice(0, -5)), [{ name: "Enquiries", color: "var(--s1)", values: weeks.map(w => byW(w).length) }], { label: "Weekly enquiries", h: 180, maxLabels: 6 }))}
      ${card("Follow-ups logged per week", barChart(weeks.map(w => fmtDate(w).slice(0, -5)), [{ name: "Follow-ups", color: "var(--s3)", values: weeks.map(actW) }], { label: "Weekly follow-ups", h: 180, maxLabels: 6 }))}</div>`;
  },

  followup(c){
    const V = c.valid;
    const b = { "Same day": [], "Next day": [], "2–3 days": [], "4+ days": [], "Not contacted yet": [] };
    V.forEach(l => { const d = firstContactDays(l); b[d == null ? "Not contacted yet" : d === 0 ? "Same day" : d === 1 ? "Next day" : d <= 3 ? "2–3 days" : "4+ days"].push(l); });
    const open = db.leads.filter(isActive);
    const od = { "1–3 days late": [], "4–7 days late": [], "8–14 days late": [], "15+ days late": [] };
    open.forEach(l => { if (!l.nextFollowUp || l.nextFollowUp >= c.t) return; const n = daysBetween(l.nextFollowUp, c.t); od[n <= 3 ? "1–3 days late" : n <= 7 ? "4–7 days late" : n <= 14 ? "8–14 days late" : "15+ days late"].push(l); });
    const never = open.filter(l => !l.history.some(h => h.kind === "followup"));
    const att = { "0": [], "1": [], "2": [], "3": [], "4+": [] };
    V.forEach(l => { const n = l.history.filter(h => h.kind === "followup").length; att[n >= 4 ? "4+" : String(n)].push(l); });
    const streak = open.filter(l => consecutiveNoAnswer(l) >= 3);
    const noNext = open.filter(l => !l.nextFollowUp);
    const people = [...staffNames(), ""];
    const rows = people.map(n => { const mine = V.filter(l => (l.assignedTo || "") === n); if (!mine.length) return null;
      const f = mine.map(firstContactDays).filter(x => x != null), q = mine.filter(l => { const d = firstContactDays(l); return d != null && d <= 1; });
      const late = open.filter(l => (l.assignedTo || "") === n && l.nextFollowUp && l.nextFollowUp < c.t);
      return [n ? esc(n) : `<span class="muted">Unassigned</span>`, dn(mine.length, mine, `${n || "Unassigned"} – leads`), fmtD(avg(f)), `${dn(q.length, q, `${n || "Unassigned"} – called within 1 day`)} <span class="muted">${pct(q.length, mine.length)}</span>`, dn(late.length, late, `${n || "Unassigned"} – overdue`)]; }).filter(Boolean);
    const quick = b["Same day"].length + b["Next day"].length;
    return `<div class="grid kpis">
      ${kpiD(c, "Called within 1 day", pct(quick, V.length), null, null)}
      ${kpiD(c, "Average days to first call", fmtD(avg(V.map(firstContactDays).filter(x => x != null))), null, null)}
      ${kpiD(c, "Average attempts per lead", (avg(V.map(l => l.history.filter(h => h.kind === "followup").length)) || 0).toFixed(1), null, null)}
      ${kpiD(c, "Open leads never contacted", dn(never.length, never, "Open leads never contacted"), null, null, { hint: "all periods" })}
      ${kpiD(c, "3+ unanswered calls", dn(streak.length, streak, "3+ unanswered calls in a row"), null, null, { hint: "consider Not Reachable" })}
      ${kpiD(c, "Open leads with no next date", dn(noNext.length, noNext, "Open leads with no next follow-up date"), null, null)}
    </div><div class="grid two" style="margin-top:14px">
      ${card("How quickly new enquiries were first contacted", barsD(Object.entries(b), k => k === "Not contacted yet" ? "var(--s2)" : "var(--s1)", V.length, "First contact"), "Target: every enquiry contacted the same or next day.")}
      ${card("Overdue follow-ups right now – by how late", barsD(Object.entries(od), () => "var(--s2)", null, "Overdue"))}
      ${card("Follow-up attempts per lead", barsD(Object.entries(att).map(([k, v]) => [`${k} attempt${k === "1" ? "" : "s"}`, v]), () => "var(--s3)", V.length, "Attempts"))}
      ${card("Response speed by counsellor", tbl(["Staff", "Leads", "Avg days to first call", "Within 1 day", "Overdue now"], rows))}
    </div>`;
  },

  visits(c){
    const all = db.leads.filter(l => l.type === "Admission");
    const att = all.filter(l => c.inR(attendedDate(l)) || (maxRank(l) >= 4 && !attendedDate(l) && c.inR(l.visitDate)));
    const ns = all.filter(l => noShowDates(l).some(c.inR));
    const booked = all.filter(l => c.inR(l.visitDate) || att.includes(l) || ns.includes(l));
    const upcoming = all.filter(l => l.stage === "Visit Scheduled" && l.visitDate >= c.t);
    const pending = all.filter(l => l.stage === "Visit Scheduled" && l.visitDate && l.visitDate < c.t);
    const conv = att.filter(l => maxRank(l) >= 5), adm = att.filter(l => maxRank(l) >= 9);
    const pAtt = all.filter(l => c.inP(attendedDate(l))), pNs = all.filter(l => noShowDates(l).some(c.inP));
    const nsRate = x => (x.a + x.n) ? x.n / (x.a + x.n) * 100 : null;
    const dayMap = groupBy(booked.filter(l => l.visitDate || attendedDate(l)), l => DOW[dowOf(attendedDate(l) || l.visitDate)]);
    const slotMap = groupBy(booked.filter(l => l.visitTime), l => l.visitTime);
    const dayE = DOW.map(d => [d, dayMap.get(d) || []]).filter(e => db.settings.visitDays.includes(DOW.indexOf(e[0])) || e[1].length);
    return `<div class="grid kpis">
      ${kpiD(c, "Visits booked", dn(booked.length, booked, "Visits in period"), booked.length, null)}
      ${kpiD(c, "Attended", dn(att.length, att, "Visits attended"), att.length, pAtt.length)}
      ${kpiD(c, "No-shows", dn(ns.length, ns, "No-shows"), ns.length, pNs.length, { lowerBetter: true })}
      ${kpiD(c, "No-show rate", nsRate({ a: att.length, n: ns.length }) == null ? "—" : nsRate({ a: att.length, n: ns.length }).toFixed(0) + "%", nsRate({ a: att.length, n: ns.length }), nsRate({ a: pAtt.length, n: pNs.length }), { pp: true, lowerBetter: true })}
      ${kpiD(c, "Visit → application", `${dn(conv.length, conv, "Applied after visit")} <small class="muted">${pct(conv.length, att.length)}</small>`, null, null)}
      ${kpiD(c, "Visit → admission", `${dn(adm.length, adm, "Admitted after visit")} <small class="muted">${pct(adm.length, att.length)}</small>`, null, null)}
      ${kpiD(c, "Upcoming visits", dn(upcoming.length, upcoming, "Upcoming visits"), null, null, { hint: "from today" })}
      ${kpiD(c, "Awaiting confirmation", dn(pending.length, pending, "Visit date passed – not confirmed"), null, null, { hint: "mark Visited or No-show" })}
    </div><div class="grid two" style="margin-top:14px">
      ${card("Busiest visit days", barsD(dayE, () => "var(--s1)", null, "Visits on"))}
      ${card("Busiest time slots", barsD([...slotMap.entries()].sort((a, b) => a[0].localeCompare(b[0])), () => "var(--s3)", null, "Visits at"))}
    </div>`;
  },

  pipeline(c){
    const V = c.valid;
    const step = (label, a, b) => { const ds = [], used = []; V.forEach(l => { const x = firstReach(l, a), y = firstReach(l, b); if (x && y && y >= x) { ds.push(daysBetween(x, y)); used.push(l); } });
      return [label, fmtD(avg(ds)), fmtD(median(ds)), dn(used.length, used, `${label} – leads measured`)]; };
    const limit = +db.settings.stuckDays || 10;
    const stuck = db.leads.filter(l => isActive(l) && l.stage !== "Next Year" && daysBetween(stageSince(l), c.t) > limit && daysBetween(lastActivity(l), c.t) > 3)
      .sort((a, b) => daysBetween(stageSince(b), c.t) - daysBetween(stageSince(a), c.t));
    const byStage = [...groupBy(stuck, l => l.stage).entries()].sort((a, b) => (RANK[a[0]] ?? 0) - (RANK[b[0]] ?? 0));
    return card("Average time between stages", tbl(["Step", "Average", "Median", "Based on"], [
        step("Enquiry → first answered call", 0, 1), step("Enquiry → visit", 0, 4), step("Visit → application", 4, 5),
        step("Application → fee paid", 5, 8), step("Enquiry → admitted", 0, 9)]),
      "Measured on enquiries in the selected period whose stage changes were recorded in the tracker (enquiries imported from Excel don't have stage dates).") +
      `<div class="grid two" style="margin-top:14px">${card(`Stuck leads – no stage change for ${limit}+ days`, barsD(byStage, k => STAGE_COLOR[k] || "var(--s1)", null, "Stuck at"),
        "Open leads (all periods) that haven't moved stage for a while and had no activity in the last 3 days. Change the number of days in Settings → Reports.")}
      ${card("Longest waiting", tbl(["Family", "Stage", "Days in stage", "Last activity", "Assigned"], stuck.slice(0, 15).map(l => [
        `<a href="#" data-act="drill-open" data-id="${l.id}">${displayName(l)}</a>`, chip(l.stage), daysBetween(stageSince(l), c.t), fmtDate(lastActivity(l)), esc(l.assignedTo || "—")])))}</div>`;
  },

  staff(c){
    const V = c.valid, acts = c.acts.filter(a => c.inR(a.h.date));
    const end = c.to < c.t ? c.to : c.t, wd = workdays(c.from, end);
    const people = [...staffNames(), ""];
    const stats = people.map(n => {
      const mine = V.filter(l => (l.assignedTo || "") === n), my = acts.filter(a => (a.h.by || "") === n);
      if (!n && !mine.length && !my.length) return null;
      const calls = my.filter(a => a.h.channel === "Call"), wa = my.filter(a => a.h.channel === "WhatsApp");
      const ans = my.filter(a => a.h.outcome === "Answered" || a.h.outcome === "Visited campus");
      const q = mine.filter(l => { const d = firstContactDays(l); return d != null && d <= 1; });
      const vis = mine.filter(l => maxRank(l) >= 4), adm = mine.filter(l => maxRank(l) >= 9);
      return { n, mine, my, calls, wa, ans, q, vis, adm, conv: mine.length ? adm.length / mine.length : 0, fc: avg(mine.map(firstContactDays).filter(x => x != null)) };
    }).filter(Boolean).sort((a, b) => b.adm.length - a.adm.length || b.conv - a.conv || b.my.length - a.my.length);
    const nm = s => s.n ? esc(s.n) : `<span class="muted">Unassigned / not recorded</span>`;
    const medal = i => ["🥇", "🥈", "🥉"][i] || `${i + 1}.`;
    return card("Counsellor scorecard", tbl(["Rank", "Staff", "Leads", "Calls", "WhatsApp", "Per working day", "Answered", "Avg days to first call", "Within 1 day", "Visited", "Admitted", "Conversion"],
        stats.map((s, i) => [s.n ? medal(i) : "", nm(s), dn(s.mine.length, s.mine, `${s.n || "Unassigned"} – leads`), s.calls.length, s.wa.length, (s.my.length / wd).toFixed(1),
          pct(s.ans.length, s.my.length), fmtD(s.fc), pct(s.q.length, s.mine.length), dn(s.vis.length, s.vis, `${s.n} – visited`), dn(s.adm.length, s.adm, `${s.n} – admitted`), `<b>${(s.conv * 100).toFixed(0)}%</b>`])),
      `Ranked by admissions, then conversion. Calls and WhatsApp count follow-ups each person logged in the period (${wd} working days). "Answered" = calls/messages that got a reply.`) +
      `<div class="grid two" style="margin-top:14px">${card("Follow-ups logged per person", barChart(stats.map(s => s.n || "Not recorded"), [
        { name: "Calls", color: "var(--s1)", values: stats.map(s => s.calls.length) }, { name: "WhatsApp", color: "var(--s3)", values: stats.map(s => s.wa.length) },
        { name: "Other", color: "var(--s2)", values: stats.map(s => s.my.length - s.calls.length - s.wa.length) }], { label: "Follow-ups per person", h: 190 }))}
      ${card("Admissions per person", barsD(stats.map(s => [s.n || "Unassigned", s.adm]), () => "var(--s3)", null, "Admitted"))}</div>`;
  },

  sources(c){
    const V = c.valid, fm = c.from.slice(0, 7), tm = c.to.slice(0, 7);
    const spend = (db.settings.spend || []).filter(s => s.month >= fm && s.month <= tm);
    const costOf = (kind, name) => spend.filter(s => s.kind === kind && s.name === name).reduce((a, s) => a + (+s.amount || 0), 0);
    const rows = (kind, keyFn) => [...groupBy(V.filter(l => keyFn(l)), keyFn).entries()].sort((a, b) => b[1].length - a[1].length).map(([k, arr]) => {
      const v = arr.filter(l => maxRank(l) >= 4), a = arr.filter(l => maxRank(l) >= 9), cost = costOf(kind, k);
      return [esc(k), dn(arr.length, arr, `${kind}: ${k}`), dn(v.length, v, `${kind} ${k} – visited`), dn(a.length, a, `${kind} ${k} – admitted`), `<b>${pct(a.length, arr.length)}</b>`,
        cost ? money(cost) : "—", cost && arr.length ? money(cost / arr.length) : "—", cost && a.length ? `<b>${money(cost / a.length)}</b>` : (cost ? "no admissions yet" : "—")];
    });
    // spend for sources/campaigns with no enquiries still shows
    const extra = kind => [...new Set(spend.filter(s => s.kind === kind).map(s => s.name))].filter(n => !V.some(l => (kind === "Source" ? l.source : l.campaign) === n))
      .map(n => [esc(n), 0, 0, 0, "—", money(costOf(kind, n)), "—", "no enquiries"]);
    const head = k => [k, "Enquiries", "Visited", "Admitted", "Conversion", "Spend", "Cost / enquiry", "Cost / admission"];
    const total = spend.reduce((a, s) => a + (+s.amount || 0), 0), adm = V.filter(l => maxRank(l) >= 9).length;
    const editor = can("settings") ? `<details class="noprint" style="margin-top:12px"><summary class="btn sm">+ Record advertising spend</summary>
      <div class="form" style="margin-top:10px">
        <label>Month<input type="month" id="sp-month" value="${c.t.slice(0, 7)}"></label>
        <label>For a<select id="sp-kind"><option>Source</option><option>Campaign</option></select></label>
        <label>Name<input type="text" id="sp-name" list="dl-spn" placeholder="e.g. Instagram"><datalist id="dl-spn">${[...new Set([...list(db.settings.sources), ...db.leads.map(l => l.source), ...db.leads.map(l => l.campaign)].filter(Boolean))].map(s => `<option value="${esc(s)}">`).join("")}</datalist></label>
        <label>Amount (${esc(db.settings.currency)})<input type="number" id="sp-amt" min="0" step="1"></label>
      </div><button class="btn primary" data-act="spend-add" style="margin-top:8px">Add</button></details>
      ${spend.length ? tbl(["Month", "Type", "Name", "Amount", ""], spend.map(s => [s.month, s.kind, esc(s.name), money(+s.amount || 0), `<button class="btn sm danger noprint" data-act="spend-del" data-id="${s.id}">Remove</button>`])) : ""}` : "";
    return `<div class="grid kpis">
      ${kpiD(c, "Advertising spend", total ? money(total) : "—", null, null, { hint: "months in this period" })}
      ${kpiD(c, "Cost per enquiry", total && V.length ? money(total / V.length) : "—", null, null)}
      ${kpiD(c, "Cost per admission", total && adm ? money(total / adm) : "—", null, null)}
    </div>
    ${card("By source", tbl(head("Source"), [...rows("Source", l => l.source || "(not recorded)"), ...extra("Source")]))}
    ${card("By campaign", tbl(head("Campaign"), [...rows("Campaign", l => l.campaign), ...extra("Campaign")]), "Give each ad, poster or banner its own campaign name or QR code (Settings) so it can be measured here.")}
    ${card("Advertising spend", editor || `<p class="hint">Your administrator records advertising spend here.</p>`, "Enter what each source or campaign cost per month. Spend is matched to enquiries by source or campaign name.")}`;
  },

  forecast(c){
    const fees = db.leads.filter(l => c.inR(l.feePaidDate));
    const total = fees.reduce((s, l) => s + feeNum(l), 0);
    const fm = [...groupBy(fees, l => l.feePaidDate.slice(0, 7)).entries()].sort();
    const fc = [...groupBy(fees, l => l.children.map(k => k.cls).filter(Boolean)[0] || "(class not set)").entries()].sort((a, b) => b[1].length - a[1].length);
    const avgFee = +db.settings.avgFee || 0;
    const open = db.leads.filter(l => isActive(l));
    const stages = STAGE_NAMES.filter(s => !CLOSED.has(s) || s === "Fee Paid");
    let expAdm = 0;
    const rows = stages.map(st => { const arr = open.filter(l => l.stage === st); if (!arr.length) return null; const kids = arr.reduce((n, l) => n + Math.max(1, l.children.length), 0);
      const e = kids * probOf(st); expAdm += e;
      return [chip(st), dn(arr.length, arr, `Open at ${st}`), kids,
        can("settings") ? `<input type="number" min="0" max="100" class="probin noprint" data-prob="${esc(st)}" value="${Math.round(probOf(st) * 100)}"> <span class="printonly">${Math.round(probOf(st) * 100)}</span>%` : `${Math.round(probOf(st) * 100)}%`,
        e.toFixed(1), avgFee ? money(e * avgFee) : "—"]; }).filter(Boolean);
    const recorded = fees.filter(l => feeNum(l) > 0), missing = db.leads.filter(l => l.feePaidDate && !feeNum(l));
    return `<div class="grid kpis">
      ${kpiD(c, "Fees collected", dn(money(total), fees, "Fees collected"), total, db.leads.filter(l => c.inP(l.feePaidDate)).reduce((s, l) => s + feeNum(l), 0))}
      ${kpiD(c, "Families paid", dn(fees.length, fees, "Families who paid fees"), fees.length, db.leads.filter(l => c.inP(l.feePaidDate)).length)}
      ${kpiD(c, "Average fee per family", recorded.length ? money(total / recorded.length) : "—", null, null)}
      ${kpiD(c, "Expected admissions", expAdm.toFixed(1), null, null, { hint: "from today's open pipeline" })}
      ${kpiD(c, "Expected fees", avgFee ? money(expAdm * avgFee) : "set fee in Settings", null, null)}
      ${kpiD(c, "Fee paid, amount missing", dn(missing.length, missing, "Fee paid date without amount"), null, null)}
    </div><div class="grid two" style="margin-top:14px">
      ${card("Fees collected by month", barChart(fm.map(([k]) => `${MON[+k.slice(5) - 1]} ${k.slice(2, 4)}`), [{ name: "Fees", color: "var(--s3)", values: fm.map(([, a]) => Math.round(a.reduce((s, l) => s + feeNum(l), 0))) }], { label: "Fees by month", h: 190 }))}
      ${card("Fees collected by class", tbl(["Class", "Families", "Amount"], fc.map(([k, a]) => [esc(k), dn(a.length, a, `Fees – ${k}`), money(a.reduce((s, l) => s + feeNum(l), 0))])))}
    </div>
    ${card("Admissions forecast – open pipeline", tbl(["Stage", "Families", "Children", "Chance of joining", "Expected admissions", "Expected fees"], rows) +
      `<p><b>Total expected: ${expAdm.toFixed(1)} admissions${avgFee ? ` · ${money(expAdm * avgFee)}` : ""}</b></p>`,
      `Each open family counts as (number of children × chance of joining for its stage). ${can("settings") ? "Adjust the chances to match your school's experience; " : ""}Expected fees use the average annual fee per child from Settings → Reports${avgFee ? ` (${money(avgFee)})` : " (not set yet)"}.`)}`;
  },

  classes(c){
    const V = c.valid, classes = list(db.settings.classes);
    const kidsAt = (arr, cls) => arr.filter(l => l.children.some(k => k.cls === cls));
    const fr = classes.map(cls => { const a = kidsAt(V, cls); if (!a.length) return null;
      const st = n => a.filter(l => maxRank(l) >= n);
      return [esc(cls), dn(a.length, a, `${cls} – enquiries`), dn(st(1).length, st(1), `${cls} – contacted`), dn(st(4).length, st(4), `${cls} – visited`), dn(st(5).length, st(5), `${cls} – applied`), dn(st(9).length, st(9), `${cls} – admitted`), `<b>${pct(st(9).length, a.length)}</b>`]; }).filter(Boolean);
    const yr = db.settings.academicYear;
    const inYear = l => l.type === "Admission" && (!l.academicYear || l.academicYear === yr);
    const seat = classes.map(cls => {
      const cap = +db.settings.seats[cls] || 0;
      const kids = st => db.leads.filter(l => inYear(l) && st(l)).reduce((n, l) => n + l.children.filter(k => k.cls === cls).length, 0);
      const conf = kids(l => l.stage === "Admitted" || l.stage === "Fee Paid");
      const exp = db.leads.filter(l => inYear(l) && isActive(l) && l.stage !== "Fee Paid").reduce((n, l) => n + l.children.filter(k => k.cls === cls).length * probOf(l.stage), 0);
      if (!cap && !conf && exp < 0.05) return null;
      const proj = conf + exp, status = !cap ? "—" : conf >= cap ? "Full" : proj >= cap ? "Likely to fill" : proj >= cap * 0.75 ? "Filling up" : "Space available";
      return [esc(cls), cap || "—", conf, exp.toFixed(1), proj.toFixed(1), cap ? Math.max(0, cap - proj).toFixed(1) : "—", status === "Full" ? `<b class="due-over">Full</b>` : status === "Likely to fill" ? `<b class="due-today">${status}</b>` : status];
    }).filter(Boolean);
    return card("Funnel by class", tbl(["Class", "Enquiries", "Contacted", "Visited", "Applied", "Admitted", "Conversion"], fr), "Families enquiring for several children are counted under each class.") +
      card(`Seat forecast – ${esc(yr)}`, tbl(["Class", "Seats", "Confirmed", "Expected from pipeline", "Projected total", "Projected free", "Status"], seat),
        "Confirmed = Fee Paid or Admitted. Expected uses the chances on the Fees & forecast tab. Set seats per class on the Seats page.");
  },

  lost(c){
    const lost = c.valid.filter(l => l.stage === "Lost" || l.stage === "Not Reachable");
    const reasons = [...groupBy(lost, l => l.lostReason || "Not recorded").entries()].sort((a, b) => b[1].length - a[1].length);
    const cols = ["Before contact", "After contact", "Visit booked", "After visit", "After application"];
    const matrix = reasons.map(([r, arr]) => [esc(r), ...cols.map(cn => { const x = arr.filter(l => lostAt(l) === cn); return x.length ? dn(x.length, x, `Lost ${cn.toLowerCase()}: ${r}`) : `<span class="muted">·</span>`; }), `<b>${dn(arr.length, arr, `Lost: ${r}`)}</b>`]);
    const by = (keyFn, label) => [...groupBy(c.valid, keyFn).entries()].map(([k, all]) => { const l = all.filter(x => lost.includes(x)); if (!l.length) return null;
      const top = [...groupBy(l, x => x.lostReason || "Not recorded").entries()].sort((a, b) => b[1].length - a[1].length)[0];
      return [esc(k), dn(l.length, l, `Lost – ${label} ${k}`), `${pct(l.length, all.length)} of ${all.length}`, esc(top[0])]; }).filter(Boolean).sort((a, b) => parseInt(b[2]) - parseInt(a[2]));
    return `<div class="grid kpis">${kpiD(c, "Families lost", dn(lost.length, lost, "Families lost"), lost.length, c.pvalid.filter(l => l.stage === "Lost" || l.stage === "Not Reachable").length, { lowerBetter: true })}
      ${kpiD(c, "Lost rate", pct(lost.length, c.valid.length), null, null)}
      ${kpiD(c, "Lost after visiting", dn(lost.filter(l => maxRank(l) >= 4).length, lost.filter(l => maxRank(l) >= 4), "Lost after visiting"), null, null, { hint: "most costly losses" })}</div>
      ${card("Why, and at which stage, families were lost", tbl(["Reason", ...cols, "Total"], matrix), "Families lost after visiting are usually the most valuable to win back; check fees and curriculum reasons.")}
      <div class="grid two" style="margin-top:14px">
        ${card("By source", tbl(["Source", "Lost", "Rate", "Main reason"], by(l => l.source || "(not recorded)", "source")))}
        ${card("By class", tbl(["Class", "Lost", "Rate", "Main reason"], by(l => l.children.map(k => k.cls).filter(Boolean), "class")))}
        ${card("By counsellor", tbl(["Staff", "Lost", "Rate", "Main reason"], by(l => l.assignedTo || "Unassigned", "counsellor")))}
      </div>`;
  },

  areas(c){
    const V = c.valid;
    const g = [...groupBy(V, l => titleCase(l.location) || "(area not recorded)").entries()].sort((a, b) => b[1].length - a[1].length);
    const rows = g.map(([k, a]) => { const ad = a.filter(l => maxRank(l) >= 9), tr = a.filter(l => l.transport === "Yes");
      return [esc(k), dn(a.length, a, `Area: ${k}`), dn(a.filter(l => maxRank(l) >= 4).length, a.filter(l => maxRank(l) >= 4), `${k} – visited`), dn(ad.length, ad, `${k} – admitted`), `<b>${pct(ad.length, a.length)}</b>`, dn(tr.length, tr, `${k} – needs transport`)]; });
    const trans = [...groupBy(V.filter(l => l.transport === "Yes"), l => titleCase(l.location) || "(area not recorded)").entries()].sort((a, b) => b[1].length - a[1].length);
    const noArea = V.filter(l => !l.location);
    const tY = V.filter(l => l.transport === "Yes"), tN = V.filter(l => l.transport === "No"), tU = V.filter(l => !l.transport);
    return `<div class="grid kpis">${kpiD(c, "Need transport", dn(tY.length, tY, "Need transport"), null, null)}${kpiD(c, "No transport", dn(tN.length, tN, "Do not need transport"), null, null)}
      ${kpiD(c, "Transport not asked", dn(tU.length, tU, "Transport not asked"), null, null)}${kpiD(c, "Area not recorded", dn(noArea.length, noArea, "Area not recorded"), null, null, { hint: "ask families their area" })}</div>
      ${card("Enquiries and admissions by area", tbl(["Area", "Enquiries", "Visited", "Admitted", "Conversion", "Need transport"], rows))}
      ${card("Bus demand by area (admission leads needing transport)", barsD(trans, () => "var(--s1)", tY.length, "Transport"), "Use this to plan bus routes. Children who are admitted and need transport matter most; click a number to see them.")}`;
  },

  nextyear(c){
    const pool = db.leads.filter(l => l.type === "Admission" && l.stage === "Next Year");
    const byClass = [...groupBy(pool, l => l.children.map(k => k.cls).filter(Boolean)).entries()].sort((a, b) => b[1].length - a[1].length);
    const byMonth = [...groupBy(pool, l => l.date.slice(0, 7)).entries()].sort();
    return `<div class="grid kpis">${kpiD(c, "Families waiting for next year", dn(pool.length, pool, "Next-year pool"), null, null, { hint: "all periods" })}
      ${kpiD(c, "Children", pool.reduce((n, l) => n + Math.max(1, l.children.length), 0), null, null)}
      ${kpiD(c, "With phone number", pool.filter(l => l.phone).length, null, null)}</div>
      ${can("bulk") && pool.some(l => l.phone) ? `<p class="noprint"><button class="btn wa" data-act="bulk-ids" data-tpl="Next year" data-ids="${pool.filter(l => l.phone).map(l => l.id).join(",")}">WhatsApp all ${pool.filter(l => l.phone).length} families ("Next year" message)</button></p>` : ""}
      <div class="grid two">
        ${card("By class", barsD(byClass, () => "var(--s1)", null, "Next year"))}
        ${card("By month they enquired", barsD(byMonth.map(([k, a]) => [`${MON[+k.slice(5) - 1]} ${k.slice(0, 4)}`, a]), () => "var(--s3)", null, "Next year – enquired"))}
      </div>
      ${card("Families in the pool", tbl(["Family", "Class", "Enquired", "Phone", "Next contact"], pool.slice().sort((a, b) => b.date.localeCompare(a.date)).map(l => [
        `<a href="#" data-act="drill-open" data-id="${l.id}">${displayName(l)}</a>`, esc(classesOf(l)), fmtDate(l.date), esc(fmtPhone(l.phone)), relDue(l.nextFollowUp)])))}`;
  },

  quality(){
    const open = db.leads.filter(isActive), adm = db.leads.filter(l => l.type === "Admission");
    const dupMap = groupBy(db.leads.filter(l => l.phone), l => l.phone);
    const dups = [...dupMap.values()].filter(a => a.length > 1).flat();
    const odd = db.leads.filter(l => l.phone && (l.phone.length < 11 || l.phone.length > 13));
    const issues = [
      ["Open leads with no next follow-up date", open.filter(l => !l.nextFollowUp), "They will never show in Follow-ups."],
      ["Open leads not assigned to anyone", open.filter(l => !l.assignedTo), "Nobody is responsible for them."],
      ["Overdue by more than 14 days", open.filter(l => l.nextFollowUp && daysBetween(l.nextFollowUp, todayISO()) > 14), "Probably forgotten – follow up or close."],
      ["Visit scheduled but no date", db.leads.filter(l => l.stage === "Visit Scheduled" && !l.visitDate), "Won't appear on the visit calendar."],
      ["Admission leads without a class", adm.filter(l => isOpen(l) && !classesOf(l)), "Breaks class demand and seat forecasts."],
      ["Leads without a parent name", db.leads.filter(l => isOpen(l) && !l.name), "Harder to personalise messages."],
      ["Leads without a source", db.leads.filter(l => !l.source), "Can't measure which advertising works."],
      ["Leads without an area", adm.filter(l => isOpen(l) && !l.location), "Needed for transport planning."],
      ["Lost without a reason", db.leads.filter(l => l.stage === "Lost" && !l.lostReason), "Hides why families choose other schools."],
      ["Fee paid but no amount", db.leads.filter(l => l.feePaidDate && !feeNum(l)), "Fee reports will be understated."],
      ["Same phone number on several records", dups, "Merge or delete duplicates."],
      ["Unusual phone numbers", odd, "Check the number and country code."],
      ["Invalid numbers", db.leads.filter(l => l.stage === "Invalid"), "Unreachable enquiries."]
    ];
    const fields = l => [l.name, l.phone, classesOf(l), l.source, l.location, l.assignedTo, l.nextFollowUp].filter(Boolean).length / 7;
    const score = open.length ? Math.round(avg(open.map(fields)) * 100) : 100;
    return `<div class="grid kpis">${kpiD({ hasPrev: false }, "Completeness of open leads", `${score}%`, null, null, { hint: "name, phone, class, source, area, owner, next date" })}
      ${kpiD({ hasPrev: false }, "Issues found", issues.filter(i => i[1].length).length, null, null)}</div>
      ${card("Data checks (all enquiries)", tbl(["Check", "Count", "Why it matters"], issues.map(([k, arr, why]) => [esc(k), arr.length ? `<b>${dn(arr.length, arr, k)}</b>` : `<span class="delta good">✓ 0</span>`, `<span class="hint">${esc(why)}</span>`])),
        "Click a number to open the list and fix each record.")}`;
  },

  timing(c){
    const timed = c.L.filter(l => !isImported(l) && l.createdAt);
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    timed.forEach(l => { const d = new Date(l.createdAt); grid[d.getDay()][d.getHours()]++; });
    const max = Math.max(1, ...grid.flat());
    const hours = []; for (let h = 7; h <= 22; h++) hours.push(h);
    const order = [1, 2, 3, 4, 5, 6, 0];
    const cell = v => { const p = v ? 18 + v / max * 82 : 0; return `<td class="hm" style="background:${v ? `color-mix(in srgb, var(--s1) ${p.toFixed(0)}%, var(--surface))` : "var(--surface2)"};color:${p > 55 ? "#fff" : "var(--text)"}" title="${v} enquir${v === 1 ? "y" : "ies"}">${v || ""}</td>`; };
    const heat = `<div class="calwrap"><table class="heatmap"><thead><tr><th></th>${hours.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${order.map(d => `<tr><th>${DOW[d]}</th>${hours.map(h => cell(grid[d][h])).join("")}</tr>`).join("")}</tbody></table></div>
      <div class="hint" style="display:flex;gap:6px;align-items:center;margin-top:6px">Fewer <span class="hmkey"></span> More · hours ${hours[0]}:00–${hours[hours.length - 1]}:59${grid.flat().reduce((a, b) => a + b, 0) - hours.reduce((n, h) => n + order.reduce((m, d) => m + grid[d][h], 0), 0) ? " (some enquiries outside these hours)" : ""}</div>`;
    const dowL = order.map(d => [DOW[d], c.L.filter(l => dowOf(l.date) === d)]);
    return `${card("When enquiries arrive – day and hour", timed.length >= 5 ? heat : `<div class="empty">Only ${timed.length} enquiries in this period have an exact time. Times are recorded for online-form enquiries and ones added in the tracker (not Excel imports), so this fills up over time.</div>`,
        "Based on the time each enquiry was received or added. Use it to plan when staff should be ready to respond.")}
      ${card("Enquiries by day of week", barsD(dowL, () => "var(--s1)", c.L.length, "Enquired on"))}`;
  }
};

/* ---------- page ---------- */
function renderReports(){
  drillReg.clear();
  if (!REPORT_TABS.some(t => t[0] === ui.repTab)) ui.repTab = "overview";
  const c = repCtx();
  const pr = [["week", "This week"], ["month", "This month"], ["lastmonth", "Last month"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["year", "This year"], ["all", "All time"], ["custom", "Custom…"]];
  const tabName = REPORT_TABS.find(t => t[0] === ui.repTab)[1];
  let body;
  try { body = REPORTS[ui.repTab](c); } catch (e) { console.error(e); body = `<div class="warnbox">This report could not be built: ${esc(e.message)}</div>`; }
  return `<div class="top"><h1>Reports</h1>
    <select data-ui="rep" style="width:auto" class="noprint" aria-label="Report period">${pr.map(([v, l]) => `<option value="${v}" ${ui.rep === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    ${ui.rep === "custom" ? `<input type="date" data-ui="repFrom" value="${c.from}" style="width:auto" class="noprint"><input type="date" data-ui="repTo" value="${c.to}" style="width:auto" class="noprint">` : ""}
    ${can("export") ? `<button class="btn noprint" data-act="rep-export">Excel</button><button class="btn noprint desk-only" data-act="rep-export-all">All reports to Excel</button>` : ""}
    <button class="btn noprint" data-act="print">PDF</button></div>
  <div class="reptabs noprint" role="tablist">${REPORT_TABS.map(([k, l]) => `<button role="tab" aria-selected="${k === ui.repTab}" class="${k === ui.repTab ? "on" : ""}" data-act="rep-tab" data-tab="${k}">${l}</button>`).join("")}</div>
  <div class="printhead"><b>${esc(db.settings.schoolName)}</b> – ${esc(tabName)} report · ${rangeLabel(c)} · printed ${fmtDate(todayISO())}</div>
  <p class="hint noprint" style="margin:0 0 10px">${rangeLabel(c)}${c.hasPrev ? ` · compared with the ${c.prevLabel}` : ""} · click any underlined number to see the families behind it.</p>
  <div id="repbody">${body}</div>`;
}

/* ---------- Excel export ---------- */
function tablesToBook(wb, root, prefix, used){
  root.querySelectorAll(".rc, .card").forEach(cardEl => {
    const tables = cardEl.querySelectorAll("table.rep");
    const title = (cardEl.querySelector("h2") || {}).textContent || "Report";
    tables.forEach((t, i) => {
      const clone = t.cloneNode(true);
      clone.querySelectorAll("input").forEach(inp => { inp.replaceWith(document.createTextNode(inp.value)); });
      clone.querySelectorAll(".noprint, button").forEach(b => b.remove());
      let name = `${prefix ? prefix + " - " : ""}${title}${tables.length > 1 ? " " + (i + 1) : ""}`.replace(/[\\/?*[\]:]/g, "").slice(0, 31);
      let n = 2; while (used.has(name)) name = name.slice(0, 28) + " " + n++;
      used.add(name);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.table_to_sheet(clone, { raw: true }), name);
    });
  });
  // KPI tiles → one summary sheet
  const k = [...root.querySelectorAll(".kpi")].map(el => [el.querySelector(".l")?.textContent || "", el.querySelector(".v")?.textContent.trim() || "", el.querySelector(".dl")?.textContent.trim() || ""]);
  if (k.length) { let name = `${prefix ? prefix + " - " : ""}Summary`.slice(0, 31); while (used.has(name)) name = name.slice(0, 29) + "_"; used.add(name);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Measure", "Value", "Change"], ...k]), name); }
}
function exportReports(all){
  if (typeof XLSX === "undefined") { toast("Excel export needs an internet connection"); return; }
  const c = repCtx(), wb = XLSX.utils.book_new(), used = new Set(), tmp = document.createElement("div");
  const tabs = all ? REPORT_TABS : REPORT_TABS.filter(t => t[0] === ui.repTab);
  for (const [k, label] of tabs) {
    try { tmp.innerHTML = REPORTS[k](c); } catch (e) { continue; }
    tablesToBook(wb, tmp, all ? label.slice(0, 14) : "", used);
  }
  if (!wb.SheetNames.length) { toast("No tables in this report to export"); return; }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["School", db.settings.schoolName], ["Report", all ? "All reports" : REPORT_TABS.find(t => t[0] === ui.repTab)[1]], ["Period", rangeLabel(c)], ["Exported", new Date().toLocaleString()], ["By", meName()]]), "About");
  XLSX.writeFile(wb, `${all ? "all-reports" : ui.repTab + "-report"}-${todayISO()}.xlsx`);
  logAct("Exported", null, `${all ? "All reports" : REPORT_TABS.find(t => t[0] === ui.repTab)[1] + " report"} (${rangeLabel(c)})`); save();
  // drill links created while exporting must not replace the ones on screen
  render();
}

/* ---------- report-specific actions (called from app.js click/change handlers) ---------- */
function reportAction(act, el){
  switch (act) {
    case "rep-tab": ui.repTab = el.dataset.tab; render(); window.scrollTo(0, 0); return true;
    case "rep-export": exportReports(false); return true;
    case "rep-export-all": exportReports(true); return true;
    case "drill": drillDialog(el.dataset.k); return true;
    case "drill-open": closeDialog(); openDrawer(el.dataset.id); return true;
    case "drill-export": drillExport(el.dataset.k); return true;
    case "spend-add": {
      const month = $("#sp-month").value, kind = $("#sp-kind").value, name = $("#sp-name").value.trim(), amount = +$("#sp-amt").value;
      if (!month || !name || !(amount > 0)) { toast("Enter month, name and amount"); return true; }
      db.settings.spend = [...(db.settings.spend || []), { id: uid(), month, kind, name, amount }];
      logAct("Advertising spend added", null, `${month} · ${kind} ${name} · ${amount}`); settingsChanged(); render(); return true; }
    case "spend-del":
      db.settings.spend = (db.settings.spend || []).filter(s => s.id !== el.dataset.id);
      logAct("Advertising spend removed"); settingsChanged(); render(); return true;
  }
  return false;
}
function reportChange(el){
  if (el.dataset.prob == null) return false;
  const v = Math.max(0, Math.min(100, +el.value || 0));
  db.settings.stageProb = Object.assign({}, db.settings.stageProb || {}, { [el.dataset.prob]: v });
  settingsChanged(); render(); return true;
}
