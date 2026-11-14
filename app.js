"use strict";
/* =====================================================================
   Admission Enquiry Tracker – lead capture & follow-up for schools
   Data lives in this browser (localStorage) and, when connected,
   is shared through a Google Sheet (see SETUP.md / apps-script/Code.gs)
   ===================================================================== */

/* ---------- constants ---------- */
const KEY = "schoolEnquiryCRM.v1";
const STAGES = [
  ["New","#2563eb"],["Contacted","#4f46e5"],["No Response","#d97706"],["Interested","#0d9488"],
  ["Visit Scheduled","#7c3aed"],["Visited","#a21caf"],["Application","#0891b2"],["Assessment","#0e7490"],
  ["Documents","#0369a1"],["Fee Paid","#15803d"],["Admitted","#16a34a"],
  ["Next Year","#475569"],["Lost","#dc2626"],["Not Reachable","#78716c"],["Invalid","#6b7280"],["Closed","#6b7280"]
];
const STAGE_COLOR = Object.fromEntries(STAGES);
const STAGE_NAMES = STAGES.map(s => s[0]);
const CLOSED = new Set(["Admitted","Lost","Not Reachable","Invalid","Closed"]);
const RANK = { "New":0, "No Response":0, "Contacted":1, "Interested":2, "Visit Scheduled":3, "Visited":4, "Application":5, "Assessment":6, "Documents":7, "Fee Paid":8, "Admitted":9 };
const FUNNEL = [["Enquired",0],["Contacted",1],["Interested",2],["Visit booked",3],["Visited",4],["Applied",5],["Fee paid",8],["Admitted",9]];
const NO_ANSWER = new Set(["No answer","Busy / call back","Switched off"]);
const OUTCOMES = ["Answered","No answer","Busy / call back","Switched off","Wrong number","Message sent","Visited campus","Other"];
const CHANNELS = ["Call","WhatsApp","Email","Walk-in","Visit","SMS"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

/* access roles (enforced by the Google Sheet server; the app hides what a role can't use) */
const ROLES = {
  Admin:      ["edit","viewAll","delete","export","import","reports","activity","assign","bulk","settings","users"],
  Manager:    ["edit","viewAll","delete","export","import","reports","activity","assign","bulk"],
  Counsellor: ["edit","reports","bulk"],
  Reception:  ["edit","viewAll","assign"],
  Partner:    ["viewAll","reports"]
};
const ROLE_INFO = {
  Admin: "Everything, including users, settings, import and delete",
  Manager: "All enquiries, reports, activity log, assign, export and delete",
  Counsellor: "Only their own and unassigned enquiries. Cannot delete or export",
  Reception: "Capture enquiries, book visits and assign them to counsellors",
  Partner: "View only: see and filter all enquiries, their details and reports. Cannot add, edit, delete, message or export. Can change their own password"
};
// actions that change data or contact families – blocked for view-only roles
const EDIT_ACTS = new Set(["new","paste","paste-go","paste-clip","bulk-save","fr-send","resched","fresched","edit","log","call","wa","wa-send","book","visited","noshow","snooze","stage","to-adm","to-job",
  "mark-job","add-kid","rm-kid","delete","sel","sel-all","bulk-sel","bulk-ids","bulk-send","daily-lists","import","restore","clear-all","spend-add","spend-del"]);
const mq = window.matchMedia("(max-width: 860px)");
const isMobile = () => mq.matches;
const ICON = {
  call: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>`,
  wa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z"/></svg>`
};

const DEFAULT_SETTINGS = {
  schoolName: "Our School", country: "971", academicYear: "2027-28", currency: "AED",
  schoolWhatsApp: "", hrEmail: "", formUrl: "", alertEmail: "",
  counsellors: "Admissions Desk",
  sources: "Social Media, Instagram, Facebook, Website, Online form, QR code, WhatsApp, Walk-in, Referral, Phone call, Newspaper, Banner / Hoarding, Event, Other",
  classes: "Pre-KG, KG1, KG2, G1, G2, G3, G4, G5, G6, G7, G8, G9, G10, G11, G12",
  lostReasons: "Fees too high, Distance / transport, Curriculum preference, Chose another school, No response, Seat not available, Age / eligibility, Relocating, Other",
  docsList: "Birth certificate, Passport & visa copy, Emirates ID copy, Previous report card, Transfer certificate, Photographs, Vaccination record",
  jobKeywords: "job, jobs, vacancy, vacancies, teacher post, teaching post, cv, resume, career, careers, hiring, recruitment, salary, apply for teacher, staff requirement",
  visitDays: [1,2,3,4,5], visitSlots: "09:00, 10:00, 11:00, 12:00, 13:00", slotCapacity: 2,
  seats: {},
  swapDates: true,
  blockPastFollowUp: true,
  avgFee: "", stuckDays: 10, reportEmails: "", reportRecipients: [], spend: [], stageProb: {},
  tpl: {
    "First reply": "Dear {name}, thank you for your admission enquiry{for_class} at {school}. We would be happy to share details and invite you for a school visit. When would be a convenient time to talk?",
    "No response": "Dear {name}, we tried to reach you regarding your admission enquiry at {school}. Please let us know a convenient time to call you back.",
    "Visit confirmation": "Dear {name}, your school visit to {school} is confirmed for {visit}{at_time}. We look forward to meeting you and {student}!",
    "Visit reminder": "Dear {name}, a gentle reminder of your school visit to {school} tomorrow, {visit}{at_time}. See you soon!",
    "Thank you after visit": "Dear {name}, thank you for visiting {school}. Please let us know if you have any questions about admission, fees or transportation.",
    "Documents pending": "Dear {name}, thank you for applying to {school}. Kindly share the pending documents: {docs_pending}.",
    "Next year": "Dear {name}, admissions for the {year} academic year are now open at {school}. We would love to welcome {student}{for_class}. Shall we schedule a visit?",
    "Job reply": "Dear {name}, thank you for your interest in working at {school}. Please email your CV to {hr_email}. Our HR team will contact you if there is a suitable opening."
  }
};

/* ---------- state ---------- */
let db = load();
let local = readJSON(KEY + ".local", { syncUrl:"", session:null, me:"", lastSync:"", notifiedDay:"" });
const ui = Object.assign({ view:"dashboard", q:"", status:"All", type:"All", stage:"", source:"", owner:"", heat:"", sort:"date-desc",
  range:"all", calWeek:0, rep:"month", repTab:"overview", repFrom:"", repTo:"", seatYear:"", filtersOpen:false, actRange:"7", actUser:"", actType:"", actQ:"" }, readJSON(KEY + ".ui", {}));
let sel = new Set();
let drawerId = null;
let bulk = null;
const syncState = { busy:false, timer:null, status:"local", msg:"" };

/* ---------- persistence ---------- */
function readJSON(k, def){ try { const v = localStorage.getItem(k); return v ? Object.assign({}, def, JSON.parse(v)) : def; } catch(e){ return def; } }
function load(){
  let d = null;
  try { const s = localStorage.getItem(KEY); if (s) d = JSON.parse(s); } catch(e){}
  if (!d) d = { leads: [], settings: {}, seeded: false };
  d.settings = mergeSettings(d.settings);
  d.leads = (d.leads || []).map(migrateLead);
  d.dirty = d.dirty || []; d.deletedQ = d.deletedQ || [];
  d.activity = d.activity || []; d.actQ = d.actQ || [];
  return d;
}
function mergeSettings(s){
  s = s || {};
  const out = Object.assign({}, JSON.parse(JSON.stringify(DEFAULT_SETTINGS)), s);
  out.tpl = Object.assign({}, DEFAULT_SETTINGS.tpl, s.tpl || {});
  out.seats = Object.assign({}, s.seats || {});
  out.spend = Array.isArray(s.spend) ? s.spend : [];
  out.reportRecipients = Array.isArray(s.reportRecipients) ? s.reportRecipients
    : list(s.reportEmails).map(email => ({ email, freq: "weekly", sections: ["all"] }));
  out.stageProb = Object.assign({}, s.stageProb || {});
  if (!Array.isArray(out.visitDays)) out.visitDays = DEFAULT_SETTINGS.visitDays.slice();
  if (out.counsellors && !/[\n|]/.test(out.counsellors) && out.counsellors.includes(",")) out.counsellors = list(out.counsellors).join("\n");
  return out;
}
function migrateLead(l){
  if (!Array.isArray(l.children)) {
    const cls = list(l.classes), names = list(l.student), n = Math.max(cls.length, names.length);
    l.children = [];
    for (let i = 0; i < n; i++) l.children.push({ id: uid(), name: names[i] || "", cls: normCls(cls[i] || "") });
  }
  delete l.classes; delete l.student;
  const defs = { email:"", campaign:"", transport:"", lostReason:"", visitTime:"", assessmentDate:"", feePaidDate:"", feeAmount:"",
    assignedTo:"", academicYear:"", notes:"", location:"", name:"", phone:"", phoneRaw:"", nextFollowUp:"", visitDate:"", type:"Admission", stage:"New" };
  for (const [k, v] of Object.entries(defs)) if (l[k] == null) l[k] = v;
  if (!l.docs || typeof l.docs !== "object") l.docs = {};
  if (!Array.isArray(l.history)) l.history = [];
  if (!l.updatedAt) l.updatedAt = l.createdAt || new Date().toISOString();
  if (!l.lostReason && l.stage === "Not Reachable") l.lostReason = "No response";
  if (!l.transport && /transport/i.test(l.notes)) l.transport = "Yes";
  return l;
}
function save(){
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){ toast("Could not save – browser storage is blocked or full"); }
  if (syncOn()) scheduleFlush();
}
function saveLocal(){ try { localStorage.setItem(KEY + ".local", JSON.stringify(local)); } catch(e){} }
function saveUI(){ try { localStorage.setItem(KEY + ".ui", JSON.stringify(ui)); } catch(e){} }
function touch(l){
  // always newer than the version this edit is based on (protects against clock differences between devices)
  const now = Date.now(), prev = Date.parse(l.updatedAt || "") || 0;
  l.updatedAt = new Date(Math.max(now, prev + 1)).toISOString();
  if (!db.dirty.includes(l.id)) db.dirty.push(l.id); }
function settingsChanged(){
  db.settingsUpdatedAt = new Date().toISOString(); db.settingsDirty = true; save();
  clearTimeout(settingsChanged.t); settingsChanged.t = setTimeout(() => { logAct("Settings changed"); save(); }, 4000);
}

/* ---------- users, roles, activity ---------- */
const role = () => (syncOn() && local.session && local.session.user.role) || "Admin";
const can = p => !syncOn() || (ROLES[role()] || []).includes(p);
const meName = () => (syncOn() && local.session ? local.session.user.name : local.me) || "";
// whose work to focus on: counsellors always see their own; others can pick a person ("Showing")
const focusName = () => syncOn() && role() === "Counsellor" ? meName() : (local.me || "");
function logAct(type, l, details){
  const e = { id: uid(), at: new Date().toISOString(), user: meName(), type, leadId: l ? l.id : "", lead: l ? plainName(l) : "", details: details || "" };
  db.activity.push(e);
  if (db.activity.length > 3000) db.activity.splice(0, db.activity.length - 3000);
  if (syncOn()) db.actQ.push(e);
}

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
const pad = n => String(n).padStart(2, "0");
const isoOf = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const todayISO = () => isoOf(new Date());
function addDays(iso, n){ const [y,m,d] = iso.split("-").map(Number); return isoOf(new Date(y, m-1, d+n)); }
function daysBetween(a, b){ const p = s => { const [y,m,d] = s.split("-").map(Number); return Date.UTC(y, m-1, d); }; return Math.round((p(b) - p(a)) / 86400000); }
function dowOf(iso){ const [y,m,d] = iso.split("-").map(Number); return new Date(y, m-1, d).getDay(); }
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function fmtDate(iso){ if (!iso) return ""; const [y,m,d] = iso.split("-").map(Number); return `${d} ${MON[m-1]} ${y}`; }
function fmtShort(iso){ const [, m, d] = iso.split("-").map(Number); return `${DOW[dowOf(iso)]} ${d} ${MON[m-1]}`; }
function relDue(iso){
  if (!iso) return `<span class="muted">—</span>`;
  const n = daysBetween(todayISO(), iso);
  if (n < 0) return `<span class="due-over">${fmtDate(iso)} · ${-n}d overdue</span>`;
  if (n === 0) return `<span class="due-today">Today</span>`;
  if (n === 1) return `Tomorrow`;
  return fmtDate(iso);
}
function list(s){ return String(s || "").split(",").map(x => x.trim()).filter(Boolean); }
function normCls(c){ c = String(c || "").trim(); const m = c.match(/^(kg|g|grade|pre-?kg|fs)\s*(\d*)$/i); if (!m) return c; const p = m[1].toLowerCase(); if (p === "grade") return "G" + m[2]; if (p.startsWith("pre")) return "Pre-KG"; return p.toUpperCase() + m[2]; }
const classesOf = l => l.children.map(c => c.cls).filter(Boolean).join(", ");
const kidNames = l => l.children.map(c => c.name).filter(Boolean).join(", ");
const isOpen = l => !CLOSED.has(l.stage);
const isActive = l => l.type === "Admission" && isOpen(l);
const displayName = l => l.name ? esc(l.name) : (kidNames(l) ? esc(kidNames(l)) : `<span class="muted">Unnamed</span>`);
const plainName = l => l.name || kidNames(l) || "Unnamed";
const chip = st => `<span class="chip" style="color:${STAGE_COLOR[st]||"#64748b"};background:color-mix(in srgb, ${STAGE_COLOR[st]||"#64748b"} 14%, transparent)">${esc(st)}</span>`;
function toast(msg){ const t = $("#toast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2800); }
function staff(){
  if (syncOn() && Array.isArray(db.users) && db.users.length)
    return db.users.filter(u => u.active && u.role !== "Reception" && u.role !== "Partner").map(u => ({ name: u.name, phone: normPhone(u.phone), email: u.email || "" }));
  return String(db.settings.counsellors || "").split(/\n/).map(s => s.trim()).filter(Boolean).map(line => {
    const [name, phone, email] = line.split("|").map(x => (x || "").trim());
    return { name, phone: normPhone(phone), email: email || "" };
  }).filter(s => s.name);
}
const staffNames = () => staff().map(s => s.name);
const slotList = () => list(db.settings.visitSlots);
const docList = () => list(db.settings.docsList);
function isJobText(s){
  s = String(s || ""); if (!s) return false;
  return list(db.settings.jobKeywords).some(k => new RegExp("\\b" + k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(s));
}
function guessLostReason(s){
  s = String(s || "");
  if (/curriculum|british|cbse|icse|\bib\b|american|kerala syllabus/i.test(s)) return "Curriculum preference";
  if (/another school|other school|prefer a school|joined/i.test(s)) return "Chose another school";
  if (/\bfee|expensive|costly|afford/i.test(s)) return "Fees too high";
  if (/distance|too far|location/i.test(s)) return "Distance / transport";
  return "";
}
function owns(l, name){ if (!name) return true; if (l.assignedTo === name) return true; return !l.assignedTo && staffNames()[0] === name; }

function normPhone(raw, cc){
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  cc = cc || db.settings.country || "971";
  if (cc === "971") {
    if (d.length === 9 && d[0] === "5") return "971" + d;
    if (d.length === 10 && d.startsWith("05")) return "971" + d.slice(1);
    if (d.length === 10 && /^[6-9]/.test(d)) return "91" + d;
  } else if (cc === "91") {
    if (d.length === 10) return "91" + d;
    if (d.length === 11 && d[0] === "0") return "91" + d.slice(1);
  } else if (d.length <= 10 && d[0] === "0") return cc + d.slice(1);
  return d;
}
function fmtPhone(d){
  if (!d) return "";
  if (d.startsWith("971") && d.length === 12) return `+971 ${d.slice(3,5)} ${d.slice(5,8)} ${d.slice(8)}`;
  if (d.startsWith("91") && d.length === 12) return `+91 ${d.slice(2,7)} ${d.slice(7)}`;
  return "+" + d;
}

/* ---------- scoring / progress ---------- */
function consecutiveNoAnswer(l){ let n = 0; for (let i = l.history.length - 1; i >= 0; i--) { const h = l.history[i]; if (h.kind !== "followup") continue; if (NO_ANSWER.has(h.outcome)) n++; else break; } return n; }
function maxRank(l){
  let r = RANK[l.stage] ?? 0;
  for (const h of l.history) {
    if (h.stageTo && RANK[h.stageTo] != null) r = Math.max(r, RANK[h.stageTo]);
    if (h.kind === "followup" && h.outcome === "Answered") r = Math.max(r, 1);
  }
  return r;
}
function firstContactDays(l){ const h = l.history.find(h => h.kind === "followup"); return h ? Math.max(0, daysBetween(l.date, h.date)) : null; }
function scoreOf(l){
  if (!isActive(l)) return null;
  const t = todayISO();
  let s = 10 + (RANK[l.stage] ?? 0) * 8;
  const age = daysBetween(l.date, t);
  if (age <= 3) s += 10; else if (age > 30) s -= 10;
  if (l.history.some(h => h.kind === "followup" && h.outcome === "Answered" && daysBetween(h.date, t) <= 7)) s += 15;
  s -= consecutiveNoAnswer(l) * 8;
  if (l.stage === "Next Year") s -= 20;
  if (l.children.length > 1) s += 5;
  if (l.visitDate && l.visitDate >= t) s += 10;
  return s;
}
const heatOf = l => { const s = scoreOf(l); return s == null ? "" : s >= 45 ? "Hot" : s >= 20 ? "Warm" : "Cold"; };
const heatTag = l => { const h = heatOf(l); return h ? `<span class="heat ${h.toLowerCase()}" title="Lead score ${scoreOf(l)}">${h}</span>` : ""; };
function slotLoad(date, time, exceptId){
  return db.leads.filter(l => l.id !== exceptId && l.visitDate === date && (l.visitTime || "") === (time || "") && !["Lost","Invalid","Closed","Not Reachable"].includes(l.stage)).length;
}

/* ---------- stage changes ---------- */
function changeStage(l, to, opts = {}){
  if (!l || to === l.stage) return;
  if (to === "Lost" && !opts.reason) { lostReasonForm([l.id], r => changeStage(l, to, Object.assign({}, opts, { reason: r }))); return; }
  if (opts.reason) l.lostReason = opts.reason;
  if (to === "Not Reachable" && !l.lostReason) l.lostReason = "No response";
  if (!CLOSED.has(to)) l.lostReason = "";
  logAct("Stage changed", l, `${l.stage} \u2192 ${to}${opts.reason ? " (" + opts.reason + ")" : ""}`);
  l.history.push({ id: uid(), at: new Date().toISOString(), date: todayISO(), kind: "stage", stageFrom: l.stage, stageTo: to, by: meName(),
    note: `Stage: ${l.stage} → ${to}${opts.reason ? ` (${opts.reason})` : ""}` });
  const reopened = CLOSED.has(l.stage) && !CLOSED.has(to);
  l.stage = to;
  // closed → no date; a reopened admission lead gets a date in 2 days; otherwise a deliberate "Not scheduled" is kept
  if (CLOSED.has(to) || l.type !== "Admission") l.nextFollowUp = ""; else if (reopened && !l.nextFollowUp) l.nextFollowUp = addDays(todayISO(), 2);
  if (to === "Fee Paid" && !l.feePaidDate) l.feePaidDate = todayISO();
  touch(l);
  if (!opts.silent) { save(); render(); }
}

/* =====================================================================
   SYNC (Google Sheet via Apps Script web app)
   ===================================================================== */
const syncOn = () => !!(local.syncUrl && local.session && local.session.token);
async function api(action, payload = {}){
  const body = Object.assign({ action, session: local.session ? local.session.token : "" }, payload);
  const res = await fetch(local.syncUrl, { method: "POST", body: JSON.stringify(body) });
  if (!res.ok) throw new Error("Server responded " + res.status);
  const j = await res.json();
  if (!j.ok) {
    const err = new Error(j.error || "Request failed"); err.code = j.code;
    if (j.code === "AUTH" && local.session) onAuthLost();
    throw err;
  }
  return j;
}
function setSync(status, msg){ syncState.status = status; syncState.msg = msg || ""; renderSyncBadge(); }
function scheduleFlush(ms = 1200){ clearTimeout(syncState.timer); syncState.timer = setTimeout(flush, ms); }
async function flush(){
  if (!syncOn()) return;
  if (syncState.busy) return scheduleFlush(1500);
  const ids = db.dirty.slice(), del = db.deletedQ.slice(), acts = db.actQ.slice();
  const leads = ids.map(id => db.leads.find(l => l.id === id)).filter(Boolean);
  const sentAt = Object.fromEntries(leads.map(l => [l.id, l.updatedAt]));
  const withSettings = !!db.settingsDirty && can("settings");
  if (!leads.length && !del.length && !withSettings && !acts.length) return;
  syncState.busy = true; setSync("busy");
  try {
    const r = await api("save", { leads, deleted: del, activity: acts, settings: withSettings ? db.settings : null, settingsUpdatedAt: db.settingsUpdatedAt || "" });
    db.dirty = db.dirty.filter(id => { const l = db.leads.find(x => x.id === id); return l && sentAt[id] !== undefined ? l.updatedAt !== sentAt[id] : !ids.includes(id); });
    db.deletedQ = db.deletedQ.filter(id => !del.includes(id));
    const sentActs = new Set(acts.map(a => a.id)); db.actQ = db.actQ.filter(a => !sentActs.has(a.id));
    if (withSettings) db.settingsDirty = false;
    if (!can("settings")) db.settingsDirty = false;
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){}
    local.lastSync = new Date().toISOString(); saveLocal();
    setSync("ok");
    if ((r.denied || []).length) toast(`${r.denied.length} change${r.denied.length === 1 ? " was" : "s were"} not allowed for your role and were undone`);
    if ((r.stale || []).length || (r.denied || []).length) { syncState.busy = false; await pull(true); }
  } catch(e){ if (e.code !== "AUTH") { setSync("error", e.message); scheduleFlush(30000); } }
  finally { syncState.busy = false; }
}
async function pull(quiet){
  if (!syncOn() || syncState.busy) return;
  syncState.busy = true; setSync("busy");
  try {
    const r = await api("list");
    const dirty = new Set(db.dirty), map = new Map(db.leads.map(l => [l.id, l]));
    const remoteIds = new Set();
    let added = 0;
    for (const raw of r.leads || []) {
      const rl = migrateLead(raw), loc = map.get(rl.id);
      remoteIds.add(rl.id);
      if (!loc) { map.set(rl.id, rl); added++; }
      else if (!dirty.has(rl.id) && (rl.updatedAt || "") > (loc.updatedAt || "")) map.set(rl.id, rl);
    }
    for (const id of r.deleted || []) map.delete(id);
    // leads this user can no longer see (e.g. reassigned to another counsellor) are removed from this device
    if (r.scoped) for (const id of [...map.keys()]) if (!remoteIds.has(id) && !dirty.has(id)) map.delete(id);
    db.leads = [...map.values()];
    if (Array.isArray(r.users)) db.users = r.users;
    if (r.me && local.session) { local.session.user = r.me; saveLocal(); }
    if (r.settings && (r.settingsUpdatedAt || "") > (db.settingsUpdatedAt || "") && !db.settingsDirty) {
      db.settings = mergeSettings(r.settings); db.settingsUpdatedAt = r.settingsUpdatedAt;
    }
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch(e){}
    local.lastSync = new Date().toISOString(); saveLocal();
    setSync("ok");
    if (added && !quiet && pull.done) { toast(`${added} new enquir${added === 1 ? "y" : "ies"} received`); notify(`${added} new admission enquir${added === 1 ? "y" : "ies"}`, "Open the tracker to follow up."); }
    pull.done = true;
    safeRender();
  } catch(e){ if (e.code !== "AUTH") setSync("error", e.message); }
  finally { syncState.busy = false; }
  if (db.dirty.length || db.deletedQ.length || db.actQ.length || (db.settingsDirty && can("settings"))) flush();
}
function safeRender(){
  const a = document.activeElement;
  const typing = a && /INPUT|TEXTAREA|SELECT/.test(a.tagName) && a.closest("main,#drawer");
  if ($("#dlg").open || typing) { renderBadges(); return; }
  render();
}
function syncLabel(){
  if (!local.syncUrl) return `<span class="dot off"></span>This device only`;
  if (!syncOn()) return `<span class="dot err"></span>Signed out`;
  const t = local.lastSync ? new Date(local.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
  const pend = db.dirty.length + db.deletedQ.length;
  if (syncState.status === "busy") return `<span class="dot busy"></span>Syncing…`;
  if (syncState.status === "error") return `<span class="dot err"></span>Offline · ${pend} unsent`;
  return `<span class="dot ok"></span>Synced ${t}${pend ? ` · ${pend} pending` : ""}`;
}
function renderSyncBadge(){
  for (const id of ["#sync", "#sync2"]) { const el = $(id); if (el) { el.innerHTML = syncLabel(); el.title = syncState.msg || ""; } }
}

/* ---------- sign-in ---------- */
function startSession(r, username){
  // a different person signing in on this device must not see the previous person's cached data
  const sameUser = db.cacheUser === r.user.username;
  if (!sameUser && db.cacheUser) { db.leads = []; db.dirty = []; db.deletedQ = []; db.activity = []; db.actQ = []; }
  if (!db.cacheUser && db.leads.length && r.user.role !== "Counsellor") {
    if (confirm(`Signed in. This device has ${db.leads.length} enquiries that were saved before the shared database was connected.\n\nUpload them to the shared Google Sheet now?\n\nOK = upload · Cancel = remove them from this device`)) {
      db.leads.forEach(l => { if (!db.dirty.includes(l.id)) db.dirty.push(l.id); });
      db.settingsDirty = r.user.role === "Admin";
    } else { db.leads = []; db.dirty = []; }
  } else if (!db.cacheUser) { db.leads = []; db.dirty = []; }
  db.cacheUser = r.user.username;
  local.session = { token: r.session, user: r.user };
  saveLocal(); save();
  hideLogin();
  setSync("busy");
  pull(true).then(flush);
  render();
  toast(`Welcome, ${r.user.name}`);
  if (typeof handleShare === "function") setTimeout(handleShare, 400);
}
function onAuthLost(){
  local.session = null; saveLocal();
  showLogin("login", "Your session has ended. Please sign in again.");
}
async function logout(){
  if (db.dirty.length || db.actQ.length) { try { await flush(); } catch(e){} }
  if ((db.dirty.length || db.deletedQ.length) && !confirm("Some changes have not reached the shared sheet yet (no internet?). Sign out anyway and lose them?")) return;
  try { await api("logout"); } catch(e){}
  local.session = null; local.me = ""; saveLocal();
  db.leads = []; db.dirty = []; db.deletedQ = []; db.activity = []; db.actQ = []; db.users = [];
  save(); closeDrawer(); closeDialog();
  showLogin("login", "You have signed out. Enquiry data has been removed from this device.");
}
async function connectServer(url){
  url = String(url || "").trim();
  if (!/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) { alert("That doesn't look like a Google Apps Script web app address. It should start with https://script.google.com/"); return; }
  const prev = local.syncUrl; local.syncUrl = url;
  try {
    const r = await api("status");
    saveLocal();
    showLogin(r.needsSetup ? "setup" : "login", r.needsSetup ? "Connected. Create the first administrator account." : "Connected. Sign in with your user name and password.");
  } catch(e){ local.syncUrl = prev; saveLocal(); alert("Could not connect: " + e.message + "\n\nCheck the web app address (see SETUP.md)."); }
}
function showLogin(mode, msg){
  document.body.classList.add("locked");
  const box = $("#login");
  const school = esc(db.settings.schoolName);
  const field = (name, label, type = "text", extra = "") => `<label>${label}<input name="${name}" type="${type}" ${extra} required></label>`;
  box.innerHTML = `<form class="loginbox" id="loginform" autocomplete="on">
    <svg width="48" height="48" viewBox="0 0 512 512" aria-hidden="true"><rect width="512" height="512" rx="96" fill="var(--accent)"/><path d="M256 112 96 192l160 80 160-80z" fill="#fff"/><path d="M160 236v76c0 28 43 56 96 56s96-28 96-56v-76l-96 48z" fill="#fff" opacity=".9"/></svg>
    <h1>${school}</h1><p class="hint" style="margin-top:0">Admission Enquiry Tracker</p>
    ${msg ? `<div class="note">${esc(msg)}</div>` : ""}
    ${mode === "setup" ? `
      ${field("setupKey", "Setup key (from the Apps Script log)")}
      ${field("name", "Your full name", "text", 'autocomplete="name"')}
      ${field("username", "Choose a user name", "text", 'autocomplete="username" autocapitalize="none"')}
      ${field("password", "Choose a password (8+ characters)", "password", 'autocomplete="new-password" minlength="8"')}
      <button class="btn primary big" type="submit">Create administrator</button>`
    : `
      ${field("username", "User name", "text", 'autocomplete="username" autocapitalize="none" autofocus')}
      ${field("password", "Password", "password", 'autocomplete="current-password"')}
      <button class="btn primary big" type="submit">Sign in</button>`}
    <div class="err" id="loginerr" role="alert"></div>
    <p class="hint" style="margin-bottom:0">Forgot your password? Ask your administrator to reset it.<br>
    <a href="manual.html" target="_blank" rel="noopener">User manual &amp; workflow</a><br>
    <a href="#" data-act="login-local">Use without the shared database (this device only)</a></p>
  </form>`;
  const f = $("#loginform");
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f).entries());
    const btn = f.querySelector("button[type=submit]"); btn.disabled = true; $("#loginerr").textContent = "";
    try {
      const r = mode === "setup"
        ? await api("bootstrap", { setupKey: fd.setupKey.trim(), name: fd.name.trim(), username: fd.username.trim().toLowerCase(), password: fd.password })
        : await api("login", { username: fd.username.trim().toLowerCase(), password: fd.password });
      startSession(r, fd.username);
    } catch(err){ $("#loginerr").textContent = err.message; btn.disabled = false; }
  });
}
function hideLogin(){ document.body.classList.remove("locked"); $("#login").innerHTML = ""; }

/* =====================================================================
   EXCEL IMPORT / EXPORT
   ===================================================================== */
function parseDateCell(v, swap){
  if (v === null || v === undefined || v === "") return "";
  if (v instanceof Date && !isNaN(v)) return isoOf(v);
  const s = String(v).trim();
  if (typeof v === "number" || /^\d{5}(\.\d+)?$/.test(s)) {
    const dt = new Date(Math.round((Number(s) - 25569) * 86400000));
    let y = dt.getUTCFullYear(), m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
    if (swap && d <= 12) { const t = m; m = d; d = t; }
    return `${y}-${pad(m)}-${pad(d)}`;
  }
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; const d = +m[1], mo = +m[2]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`; }
  return "";
}
const HEADERS = {
  date:["date","enquiry date"], name:["name","parent name","parent","contact name"], student:["student","student name","student name(s)","child","child name","children"],
  location:["location","area","place"], phone:["contact number","phone","mobile","contact","phone number","mobile number","whatsapp"],
  email:["email","e-mail"], job:["job enquiry"], type:["enquiry type","type"], classes:["class","grade","classes"], invalid:["invalid"], source:["source"],
  campaign:["campaign"], transport:["transport","transport needed"], open:["open"], end:["end"], response:["response"], remarks:["remarks","notes","note"],
  followup:["followup","follow up","follow-up","next follow-up","next followup"], stage:["stage","status"], visit:["visit date"], visitTime:["visit time"],
  assigned:["assigned to","counsellor","counselor"], year:["academic year"], lost:["lost reason"]
};
function mapHeader(hdr){
  const idx = {};
  hdr.forEach((h, i) => {
    const k = String(h == null ? "" : h).trim().toLowerCase();
    if (!k) return;
    for (const [field, names] of Object.entries(HEADERS)) {
      if (names.includes(k)) {
        if (field === "response" && idx.response != null) { if (idx.remarks == null) idx.remarks = i; }
        else if (idx[field] == null) idx[field] = i;
        break;
      }
    }
  });
  if (idx.followup != null && !String(hdr[idx.followup + 1] == null ? "" : hdr[idx.followup + 1]).trim()) idx.followupNote = idx.followup + 1;
  return idx;
}
function importRows(hdr, rows, swap){
  const idx = mapHeader(hdr);
  if (idx.phone == null && idx.name == null) throw new Error("Could not find a NAME or CONTACT NUMBER column.");
  const S = v => v == null ? "" : String(v).trim();
  const nill = v => /^(nil+|na|n\/a|-+|none)$/i.test(S(v)) ? "" : S(v);
  const tick = v => /^(p|yes|y|true|✓|✔|1|x)$/i.test(S(v));
  const existing = new Set(db.leads.map(l => l.phone).filter(Boolean));
  const thisFile = new Map();
  let added = 0, dupes = 0, skipped = 0, merged = 0;
  for (const row of rows) {
    const get = k => idx[k] != null ? row[idx[k]] : "";
    const name = nill(get("name")), phoneRaw = S(get("phone"));
    if (!name && !phoneRaw) { skipped++; continue; }
    const phone = normPhone(phoneRaw);
    if (phone && existing.has(phone) && !thisFile.has(phone)) { dupes++; continue; }
    const date = parseDateCell(get("date"), swap) || todayISO();
    const typeCol = S(get("type")), jobCol = nill(get("job"));
    const type = typeCol ? (/job/i.test(typeCol) ? "Job" : /other/i.test(typeCol) ? "Other" : "Admission") : (/job/i.test(jobCol) ? "Job" : "Admission");
    const invalid = tick(get("invalid"));
    const openT = tick(get("open")), endT = tick(get("end"));
    const response = nill(get("response"));
    let notes = nill(get("remarks"));
    let source = S(get("source"));
    if (/social/i.test(source)) source = "Social Media";
    else if (/ref+er+/i.test(source)) { const who = source.replace(/.*by\s*/i, "").trim(); source = "Referral"; if (who) notes = [`Referred by ${who}`, notes].filter(Boolean).join("; "); }
    else if (/^other$/i.test(source)) source = "Other";
    const fuDate = parseDateCell(get("followup"), swap), fuNote = nill(get("followupNote"));
    let visitDate = parseDateCell(get("visit"), swap);
    const vm = response.match(/visit\s*(\d{1,2})\b/i);
    if (!visitDate && vm) { const [y, mo] = date.split("-").map(Number); let v = `${y}-${pad(mo)}-${pad(+vm[1])}`; if (v < date) v = isoOf(new Date(y, mo, +vm[1])); visitDate = v; }

    let stage = "", lostReason = nill(get("lost"));
    const stageCol = S(get("stage"));
    if (stageCol) stage = STAGE_NAMES.find(s => s.toLowerCase() === stageCol.toLowerCase()) || "";
    if (!stage) {
      if (invalid) stage = "Invalid";
      else if (type !== "Admission") stage = "Closed";
      else if (endT && !openT) { const g = guessLostReason(notes); if (g) { stage = "Lost"; lostReason = lostReason || g; } else stage = "Not Reachable"; }
      else if (/visit/i.test(response)) stage = "Visit Scheduled";
      else if (/next\s*year/i.test(response)) stage = "Next Year";
      else if (/^nr$/i.test(response)) stage = "No Response";
      else if (response) stage = "Interested";
      else stage = "New";
    }
    let transport = S(get("transport"));
    transport = /^y/i.test(transport) ? "Yes" : /^n/i.test(transport) ? "No" : "";
    if (/transport/i.test(response + " " + notes) && !/no transport/i.test(response + " " + notes)) transport = transport || "Yes";
    if (/transport/i.test(response) && !/transport/i.test(notes)) notes = [notes, "Needs transportation"].filter(Boolean).join("; ");

    const history = [{ id: uid(), at: new Date().toISOString(), date, kind: "note", note: "Imported from Excel" + (response ? ` — response: ${response}` : "") }];
    if (fuNote) history.push({ id: uid(), at: new Date().toISOString(), date: fuDate || date, kind: "followup", channel: "Call", outcome: "Answered", note: fuNote });

    let next = "";
    if (!CLOSED.has(stage)) {
      if (fuDate && !fuNote) next = fuDate;
      else if (fuNote) next = addDays(fuDate || date, 3);
      else if (visitDate) next = visitDate;
      else if (stage === "Next Year") next = addDays(date, 14);
      else next = addDays(date, 1);
    }
    const cls = list(nill(get("classes"))).map(normCls), kids = list(nill(get("student")));
    const children = [];
    for (let i = 0; i < Math.max(cls.length, kids.length); i++) children.push({ id: uid(), name: kids[i] || "", cls: cls[i] || "" });
    const lead = migrateLead({
      id: uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      date, name, location: nill(get("location")), phone, phoneRaw, email: nill(get("email")),
      type, children, academicYear: nill(get("year")), source, campaign: nill(get("campaign")), transport,
      stage, lostReason, nextFollowUp: next, visitDate: visitDate || "", visitTime: nill(get("visitTime")),
      assignedTo: nill(get("assigned")), notes, history
    });
    const prev = phone && thisFile.get(phone);
    if (prev) {
      lead.name = lead.name || prev.name; lead.location = lead.location || prev.location;
      lead.notes = [prev.notes, lead.notes].filter(Boolean).join("; ");
      lead.history = [...prev.history, { id: uid(), at: new Date().toISOString(), date, kind: "note", note: `Repeat enquiry (earlier enquiry on ${fmtDate(prev.date)} was ${prev.stage})` }, ...history];
      db.leads = db.leads.filter(x => x !== prev);
      db.dirty = db.dirty.filter(id => id !== prev.id);
      merged++;
    } else added++;
    db.leads.push(lead); touch(lead);
    if (phone) { existing.add(phone); thisFile.set(phone, lead); }
  }
  return { added, dupes, skipped, merged };
}
function readWorkbook(file){
  if (typeof XLSX === "undefined") { toast("Excel reader needs an internet connection"); return; }
  const r = new FileReader();
  r.onload = () => {
    try {
      const wb = XLSX.read(new Uint8Array(r.result), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: "" });
      const hi = aoa.findIndex(row => row.some(c => /contact|phone|mobile/i.test(String(c))));
      if (hi < 0) throw new Error("No header row with a phone / contact number column was found.");
      const res = importRows(aoa[hi], aoa.slice(hi + 1), db.settings.swapDates);
      logAct("Imported from Excel", null, `${file.name}: ${res.added} added, ${res.merged} merged, ${res.dupes} already in system`);
      save(); render();
      toast(`Imported ${res.added} · merged ${res.merged} repeats · skipped ${res.dupes} already in system`);
    } catch(e){ alert("Import failed: " + e.message); }
  };
  r.readAsArrayBuffer(file);
}
function exportRows(leads){
  return (leads || db.leads).slice().sort((a, b) => a.date.localeCompare(b.date)).map((l, i) => ({
    "Sl No": i + 1, "Date": l.date, "Parent Name": l.name, "Student Name": kidNames(l), "Class": classesOf(l), "Phone": fmtPhone(l.phone) || l.phoneRaw,
    "Email": l.email, "Location": l.location, "Transport": l.transport, "Enquiry Type": l.type, "Academic Year": l.academicYear,
    "Source": l.source, "Campaign": l.campaign, "Stage": l.stage, "Lead Score": heatOf(l), "Lost Reason": l.lostReason,
    "Next Follow-up": l.nextFollowUp, "Visit Date": l.visitDate, "Visit Time": l.visitTime, "Assessment Date": l.assessmentDate,
    "Documents": `${docList().filter(d => l.docs[d]).length}/${docList().length}`, "Fee Paid Date": l.feePaidDate, "Fee Amount": l.feeAmount,
    "Assigned To": l.assignedTo, "Notes": l.notes, "Follow-ups Done": l.history.filter(h => h.kind === "followup").length,
    "Last Activity": (() => { const h = l.history[l.history.length - 1]; return h ? `${h.date}: ${[h.channel, h.outcome, h.note].filter(Boolean).join(" – ")}` : ""; })()
  }));
}
function download(name, blob){ const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500); }
function exportXLSX(){
  if (typeof XLSX === "undefined") { exportCSV(); toast("Excel library unavailable offline – exported CSV instead"); return; }
  const ws = XLSX.utils.json_to_sheet(exportRows()); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Enquiries");
  XLSX.writeFile(wb, `admission-enquiries-${todayISO()}.xlsx`);
}
function exportCSV(){
  const rows = exportRows(); if (!rows.length) return toast("Nothing to export");
  const cols = Object.keys(rows[0]); const q = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
  download(`admission-enquiries-${todayISO()}.csv`, new Blob(["﻿" + [cols.map(q).join(","), ...rows.map(r => cols.map(c => q(r[c])).join(","))].join("\r\n")], { type: "text/csv" }));
}

/* =====================================================================
   TEXT: templates, daily lists, pasted enquiries
   ===================================================================== */
function fillTpl(tpl, l){
  const s = db.settings, cls = classesOf(l), kids = kidNames(l);
  const pending = docList().filter(d => !l.docs[d]);
  const map = { name: l.name || "Parent", student: kids || "your child", class: cls, for_class: cls ? ` for ${cls}` : "", school: s.schoolName,
    visit: l.visitDate ? fmtDate(l.visitDate) : "the scheduled date", at_time: l.visitTime ? ` at ${l.visitTime}` : "", time: l.visitTime || "",
    year: l.academicYear || s.academicYear, hr_email: s.hrEmail || "our HR email", docs_pending: pending.join(", ") || "none" };
  return String(tpl || "").replace(/\{(\w+)\}/g, (m, k) => k in map ? map[k] : m);
}
function waLink(phone, msg){ return `https://wa.me/${phone || ""}?text=${encodeURIComponent(msg)}`; }
function myLists(name){
  const t = todayISO(), tm = addDays(t, 1);
  const mine = db.leads.filter(l => owns(l, name));
  const act = mine.filter(isActive);
  return {
    overdue: act.filter(l => l.nextFollowUp && l.nextFollowUp < t).sort((a, b) => a.nextFollowUp.localeCompare(b.nextFollowUp)),
    today: act.filter(l => l.nextFollowUp === t),
    visitsToday: mine.filter(l => l.stage === "Visit Scheduled" && l.visitDate === t).sort((a, b) => (a.visitTime || "").localeCompare(b.visitTime || "")),
    visitsTomorrow: mine.filter(l => l.stage === "Visit Scheduled" && l.visitDate === tm).sort((a, b) => (a.visitTime || "").localeCompare(b.visitTime || "")),
    hot: act.filter(l => heatOf(l) === "Hot"),
    toSchedule: act.filter(l => !l.nextFollowUp)
  };
}
function dailyText(name){
  const L = myLists(name);
  const line = l => `• ${plainName(l)} – ${fmtPhone(l.phone) || l.phoneRaw}${classesOf(l) ? ` – ${classesOf(l)}` : ""} – ${l.stage}`;
  const vline = l => `• ${l.visitTime || "Any time"} ${plainName(l)}${classesOf(l) ? ` – ${classesOf(l)}` : ""} – ${fmtPhone(l.phone)}`;
  const parts = [`Good morning${name ? " " + name : ""}! Admission follow-ups for ${fmtDate(todayISO())} – ${db.settings.schoolName}`];
  if (L.visitsToday.length) parts.push(`\nVISITS TODAY (${L.visitsToday.length})\n` + L.visitsToday.map(vline).join("\n"));
  if (L.overdue.length) parts.push(`\nOVERDUE (${L.overdue.length})\n` + L.overdue.map(line).join("\n"));
  if (L.today.length) parts.push(`\nDUE TODAY (${L.today.length})\n` + L.today.map(line).join("\n"));
  if (L.visitsTomorrow.length) parts.push(`\nVISITS TOMORROW – send reminders (${L.visitsTomorrow.length})\n` + L.visitsTomorrow.map(vline).join("\n"));
  if (parts.length === 1) parts.push("\nNo follow-ups due today. 🎉");
  return parts.join("\n");
}
// parseEnquiryText / pasteForm live in paste.js

/* =====================================================================
   RENDERING
   ===================================================================== */
function renderBadges(){
  document.body.classList.toggle("readonly", !can("edit"));
  const ts = $("#theme-slot"); if (ts && !ts.firstChild) ts.innerHTML = themeSelect();
  const t = todayISO();
  const due = db.leads.filter(l => isActive(l) && l.nextFollowUp && l.nextFollowUp <= t).length;
  const setB = (id, n) => { const b = $(id); if (!b) return; b.textContent = n || ""; b.style.display = n ? "" : "none"; };
  setB("#b-due", due); setB("#b-due2", due);
  document.querySelectorAll("[data-perm]").forEach(b => { b.style.display = can(b.dataset.perm) ? "" : "none"; });
  const who = $("#who");
  if (who) who.innerHTML = syncOn() ? `<b>${esc(meName())}</b> · ${esc(role())}<br><a href="#" data-act="logout">Sign out</a>` : "";
  const meWrap = $("#me-wrap"); if (meWrap) meWrap.style.display = syncOn() && role() === "Counsellor" ? "none" : "";
  setB("#b-all", db.leads.length);
  setB("#b-vis", db.leads.filter(l => l.stage === "Visit Scheduled" && l.visitDate >= t).length);
  setB("#b-job", db.leads.filter(l => l.type !== "Admission" && isOpen(l)).length);
  $("#brand").innerHTML = `${esc(db.settings.schoolName)}<small>Admission enquiries</small>`;
  const me = $("#me");
  if (me) me.innerHTML = `<option value="">${syncOn() ? "Everyone" : "Everyone"}</option>` + staffNames().map(n => `<option ${n === local.me ? "selected" : ""}>${esc(n)}</option>`).join("");
  renderSyncBadge();
}
const VIEW_PERM = { reports: "reports", activity: "activity" };
function render(){
  if (VIEW_PERM[ui.view] && !can(VIEW_PERM[ui.view])) ui.view = "dashboard";
  document.querySelectorAll(".nav button[data-view], .tabbar button[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === ui.view));
  const tm = $("#tab-more"); if (tm) tm.classList.toggle("active", ["seats","reports","jobs","settings","activity"].includes(ui.view));
  renderBadges();
  const v = { dashboard: renderDashboard, followups: renderFollowups, leads: renderLeads, calendar: renderCalendar, seats: renderSeats,
    reports: renderReports, jobs: renderJobs, settings: renderSettings, activity: renderActivity }[ui.view] || renderDashboard;
  $("#main").innerHTML = v();
  if (ui.view === "settings") drawQR();
  if (drawerId) renderDrawer();
  saveUI();
}
const topbar = (title, extra = "") => `<div class="top"><h1>${title}</h1>${extra}<span class="rotag">View only</span><button class="btn noprint" data-act="paste">Paste${isMobile() ? "" : " enquiry"}</button><button class="btn primary noprint desk-only" data-act="new">+ New enquiry</button></div>`;
function inRange(l){
  if (ui.range === "all") return true;
  const t = todayISO();
  if (ui.range === "month") return l.date.slice(0, 7) === t.slice(0, 7);
  return daysBetween(l.date, t) < +ui.range;
}
function bars(entries, colorFn, suffix){
  const max = Math.max(1, ...entries.map(e => e[1]));
  return `<div class="bars">${entries.map(([k, v]) => `<div class="row"><span title="${esc(k)}" class="lbl">${esc(k)}</span><div class="track"><div class="fill" style="width:${v / max * 100}%;background:${colorFn ? colorFn(k) : "var(--accent)"}"></div></div><b>${v}${suffix ? suffix(k, v) : ""}</b></div>`).join("") || `<div class="muted">No data yet</div>`}</div>`;
}
function countBy(arr, fn){ const m = new Map(); arr.forEach(x => [].concat(fn(x)).forEach(k => { if (k) m.set(k, (m.get(k) || 0) + 1); })); return [...m.entries()].sort((a, b) => b[1] - a[1]); }
const pct = (a, b) => b ? Math.round(a / b * 100) + "%" : "—";

/* ----- dashboard ----- */
function renderDashboard(){
  const t = todayISO();
  const L = db.leads.filter(inRange);
  const adm = L.filter(l => l.type === "Admission" && l.stage !== "Invalid");
  const open = adm.filter(isOpen);
  const overdue = db.leads.filter(l => isActive(l) && l.nextFollowUp && l.nextFollowUp < t).length;
  const today = db.leads.filter(l => isActive(l) && l.nextFollowUp === t).length;
  const visits = db.leads.filter(l => l.stage === "Visit Scheduled" && l.visitDate >= t).length;
  const admitted = adm.filter(l => l.stage === "Admitted").length;
  const hot = db.leads.filter(l => heatOf(l) === "Hot").sort((a, b) => scoreOf(b) - scoreOf(a));
  const unassigned = db.leads.filter(l => isActive(l) && !l.assignedTo).length;
  const k = (l, v, act, cls = "") => `<div class="card kpi ${cls}" ${act}><div class="l">${l}</div><div class="v">${v}</div></div>`;
  const days = []; for (let i = 13; i >= 0; i--) days.push(addDays(t, -i));
  const dc = days.map(d => db.leads.filter(l => l.date === d).length); const dmax = Math.max(1, ...dc);
  const rangeSel = `<select style="width:auto" data-ui="range">${[["all","All time"],["month","This month"],["7","Last 7 days"],["30","Last 30 days"]].map(([v, l]) => `<option value="${v}" ${ui.range === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const M = myLists(focusName());
  return topbar("Dashboard", rangeSel) + `
  <div class="card myday">
    <div><h2>${focusName() ? `${esc(focusName())}'s day` : "Today"} · ${fmtDate(t)}</h2>
      <div class="mdstats">
        <span data-act="nav" data-view="followups"><b class="${M.overdue.length ? "due-over" : ""}">${M.overdue.length}</b> overdue</span>
        <span data-act="nav" data-view="followups"><b>${M.today.length}</b> due today</span>
        <span data-act="nav" data-view="calendar"><b>${M.visitsToday.length}</b> visits today</span>
        <span data-act="nav" data-view="calendar"><b>${M.visitsTomorrow.length}</b> visits tomorrow</span>
        <span data-act="goto" data-f='{"heat":"Hot","status":"Open","type":"Admission"}'><b>${M.hot.length}</b> hot leads</span>
        ${M.toSchedule.length ? `<span data-act="nav" data-view="followups"><b>${M.toSchedule.length}</b> to schedule</span>` : ""}
      </div></div>
    <div class="acts"><button class="btn" data-act="daily-lists">Send daily lists</button>${"Notification" in window && Notification.permission !== "granted" ? `<button class="btn" data-act="notif">Turn on reminders</button>` : ""}</div>
  </div>
  ${unassigned && staffNames().length > 1 ? `<div class="warnbox" style="margin:10px 0">${unassigned} open leads are not assigned to anyone. <a href="#" data-act="goto" data-f='{"owner":"__none","status":"Open","type":"Admission"}'>Assign them</a></div>` : ""}
  <div class="grid kpis" style="margin-top:14px">
    ${k("Total enquiries", L.length, `data-act="goto" data-f='{"type":"All","status":"All"}'`)}
    ${k("Admission leads", adm.length, `data-act="goto" data-f='{"type":"Admission","status":"All"}'`)}
    ${k("Open admission leads", open.length, `data-act="goto" data-f='{"type":"Admission","status":"Open"}'`)}
    ${k("Follow-ups overdue", overdue, `data-act="nav" data-view="followups"`, overdue ? "alert" : "")}
    ${k("Follow-ups today", today, `data-act="nav" data-view="followups"`)}
    ${k("Upcoming visits", visits, `data-act="nav" data-view="calendar"`)}
    ${k("Hot leads", hot.length, `data-act="goto" data-f='{"heat":"Hot","status":"Open","type":"Admission"}'`)}
    ${k("Admitted", admitted + `<span class="muted" style="font-size:13px;font-weight:500"> · ${pct(admitted, adm.length)}</span>`, `data-act="goto" data-f='{"stage":"Admitted","status":"All","type":"All"}'`)}
    ${k("Job / other enquiries", L.filter(l => l.type !== "Admission").length, `data-act="nav" data-view="jobs"`)}
  </div>
  <div class="grid two" style="margin-top:14px">
    <div class="card"><h2>Admission pipeline</h2>${bars(STAGE_NAMES.filter(s => s !== "Invalid" && s !== "Closed").map(s => [s, adm.filter(l => l.stage === s).length]).filter(e => e[1]), s => STAGE_COLOR[s])}</div>
    <div class="card"><h2>Hottest leads</h2>${hot.length ? hot.slice(0, 6).map(l => `<div class="hotrow" data-act="open" data-id="${l.id}"><span class="who">${avatar(l)}<span>${heatTag(l)} <b>${displayName(l)}</b> <span class="muted">${esc(classesOf(l))}</span></span></span>${chip(l.stage)}</div>`).join("") : `<div class="muted">No hot leads right now. Leads become hot when they answer, book or attend a visit.</div>`}</div>
    <div class="card"><h2>Enquiries per day (last 14 days)</h2>
      <div class="daily">${days.map((d, i) => `<div class="d" title="${fmtDate(d)}: ${dc[i]}"><span class="n">${dc[i] || ""}</span><div class="b" style="height:${dc[i] / dmax * 85}%"></div><span>${+d.slice(8)}</span></div>`).join("")}</div>
    </div>
    <div class="card"><h2>Lead source</h2>${bars(countBy(L, l => l.source || "Unknown"))}</div>
    <div class="card"><h2>Class demand (admission leads)</h2>${bars(countBy(adm, l => l.children.map(c => c.cls)))}</div>
    <div class="card"><h2>Seats filled</h2>${seatMini()}</div>
  </div>`;
}

/* ----- cards / follow-ups ----- */
function leadCard(l, extra = ""){
  const last = [...l.history].reverse().find(h => h.kind !== "stage");
  const wa = l.phone ? `<button class="btn sm wa" data-act="wa" data-id="${l.id}">WhatsApp</button>` : "";
  const call = l.phone ? `<a class="btn sm" href="tel:+${l.phone}" data-act="call" data-id="${l.id}">Call</a>` : "";
  return `<div class="lc">
    <div class="h"><div class="who">${avatar(l)}<div style="min-width:0"><div class="nm" data-act="open" data-id="${l.id}">${heatTag(l)} ${displayName(l)}</div>
      <div class="meta">${esc(fmtPhone(l.phone) || l.phoneRaw)}${classesOf(l) ? ` · ${esc(classesOf(l))}` : ""}${l.location ? ` · ${esc(l.location)}` : ""}${l.transport === "Yes" ? ` · 🚌` : ""}${l.assignedTo ? ` · ${esc(l.assignedTo)}` : ""}</div></div></div>${chip(l.stage)}</div>
    <div class="meta">${isActive(l) ? "Follow-up: " : ""}${followLabel(l)}${l.visitDate ? ` · Visit: <b>${fmtDate(l.visitDate)}${l.visitTime ? " " + esc(l.visitTime) : ""}</b>` : ""} · Enquired ${fmtDate(l.date)}</div>
    ${last ? `<div class="last"><span class="muted">${fmtDate(last.date)}:</span> ${esc([last.channel, last.outcome].filter(Boolean).join(" · "))}${last.note ? ` — ${esc(last.note)}` : ""}</div>` : ""}
    <div class="acts">${call}${wa}<button class="btn sm primary" data-act="log" data-id="${l.id}">Log follow-up</button>${extra}${isOpen(l) && l.type === "Admission" ? `<button class="btn sm" data-act="snooze" data-id="${l.id}" title="Move follow-up to tomorrow">+1 day</button>` : ""}</div>
  </div>`;
}
function renderFollowups(){
  const t = todayISO(), wk = addDays(t, 7);
  const open = db.leads.filter(l => isActive(l) && owns(l, focusName())).sort((a, b) => (a.nextFollowUp || "9").localeCompare(b.nextFollowUp || "9") || (scoreOf(b) - scoreOf(a)));
  const sec = (title, arr, extra, hint) => `<h3>${title} <span class="badge soft">${arr.length}</span>${arr.length > 1 ? `<button class="btn sm" data-act="bulk-ids" data-ids="${arr.map(l => l.id).join(",")}">WhatsApp all</button>` : ""}</h3>${hint && arr.length ? `<p class="hint" style="margin:-4px 0 8px">${hint}</p>` : ""}${arr.length ? `<div class="lcards">${arr.map(l => leadCard(l, extra ? extra(l) : "")).join("")}</div>` : `<div class="empty">Nothing here 🎉</div>`}`;
  const resched = l => `<span class="resched">${RESCHED.filter(r => r[0] !== "1").map(([d, lab]) => `<button class="btn sm" data-act="resched" data-days="${d}" data-id="${l.id}">${lab}</button>`).join("")}</span>`;
  const pick = l => `<span class="resched">${RESCHED.filter(r => r[0] !== "none").map(([d, lab]) => `<button class="btn sm" data-act="resched" data-days="${d}" data-id="${l.id}">${lab}</button>`).join("")}</span>`;
  const toSchedule = open.filter(l => !l.nextFollowUp);
  return topbar(`Follow-ups${focusName() ? ` · ${esc(focusName())}` : ""}`) +
    sec("Overdue", open.filter(l => l.nextFollowUp && l.nextFollowUp < t), resched, "Reschedule with one tap, or log the call to set the next date.") +
    sec("Due today", open.filter(l => l.nextFollowUp === t)) +
    (toSchedule.length ? sec("To schedule", toSchedule, pick, "Open enquiries marked “Not scheduled”. They never count as overdue – pick a date when you're ready.") : "") +
    sec("Next 7 days", open.filter(l => l.nextFollowUp > t && l.nextFollowUp <= wk)) +
    sec("Later", open.filter(l => l.nextFollowUp > wk));
}

/* ----- all enquiries ----- */
function filteredLeads(){
  const q = ui.q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
  const L = db.leads.filter(l =>
    (ui.status === "All" || (ui.status === "Open" ? isOpen(l) : !isOpen(l))) &&
    (ui.type === "All" || l.type === ui.type) &&
    (!ui.stage || l.stage === ui.stage) &&
    (!ui.source || l.source === ui.source) &&
    (!ui.owner || (ui.owner === "__none" ? !l.assignedTo : l.assignedTo === ui.owner)) &&
    (!ui.heat || heatOf(l) === ui.heat) &&
    (!q || [l.name, kidNames(l), classesOf(l), l.location, l.notes, l.source, l.campaign, l.assignedTo, l.email].join(" ").toLowerCase().includes(q) || (qd.length >= 3 && (l.phone || "").includes(qd)))
  );
  const s = { "date-desc": (a, b) => b.date.localeCompare(a.date), "date-asc": (a, b) => a.date.localeCompare(b.date),
    "due": (a, b) => (a.nextFollowUp || "9").localeCompare(b.nextFollowUp || "9"), "name": (a, b) => (a.name || "~").localeCompare(b.name || "~"),
    "score": (a, b) => (scoreOf(b) ?? -999) - (scoreOf(a) ?? -999) }[ui.sort] || ((a, b) => b.date.localeCompare(a.date));
  return L.sort(s);
}
function renderLeads(){
  const L = filteredLeads();
  const sources = [...new Set([...list(db.settings.sources), ...db.leads.map(l => l.source).filter(Boolean)])];
  const opt = (arr, cur, all) => `<option value="">${all}</option>` + arr.map(v => `<option ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join("");
  const sel_ = (key, pairs) => `<select data-ui="${key}">${pairs.map(([v, l]) => `<option value="${v}" ${ui[key] === v ? "selected" : ""}>${l}</option>`).join("")}</select>`;
  const allSel = L.length && L.every(l => sel.has(l.id));
  const nf = ["status","type","stage","source","owner","heat"].filter(k => ui[k] && ui[k] !== "All").length;
  return topbar("All enquiries", can("export") ? `<button class="btn noprint desk-only" data-act="export-xlsx">Export Excel</button>` : "") + `
  <div class="filters ${isMobile() && !ui.filtersOpen ? "collapsed" : ""}">
    <input class="q" type="search" placeholder="Search name, phone, area, notes…" value="${esc(ui.q)}" data-ui="q">
    <button class="btn ftoggle" data-act="toggle-filters">${ui.filtersOpen ? "Hide filters" : `Filters${nf ? ` (${nf})` : ""}`}</button>
    ${sel_("status", [["All","Open + closed"],["Open","Open only"],["Closed","Closed only"]])}
    ${sel_("type", [["All","All types"],["Admission","Admission"],["Job","Job enquiry"],["Other","Other"]])}
    <select data-ui="stage">${opt(STAGE_NAMES, ui.stage, "All stages")}</select>
    <select data-ui="source">${opt(sources, ui.source, "All sources")}</select>
    ${can("viewAll") ? sel_("owner", [["","Anyone"], ...staffNames().map(n => [esc(n), esc(n)]), ["__none","Unassigned"]]) : ""}
    ${sel_("heat", [["","Any score"],["Hot","Hot"],["Warm","Warm"],["Cold","Cold"]])}
    ${sel_("sort", [["date-desc","Newest first"],["date-asc","Oldest first"],["due","Follow-up due"],["score","Lead score"],["name","Name A–Z"]])}
  </div>
  ${bulkBar()}
  <p class="hint" style="margin:0 0 8px">${L.length} of ${db.leads.length} enquiries</p>
  ${L.length && isMobile() ? mobileList(L) : ""}
  ${L.length && !isMobile() ? `<table class="leads"><thead><tr><th><input type="checkbox" data-act="sel-all" ${allSel ? "checked" : ""} title="Select all shown"></th><th>Date</th><th>Name</th><th>Phone</th><th>Class</th><th>Source</th><th>Stage</th><th>Next follow-up</th><th></th></tr></thead><tbody>
  ${L.map(l => `<tr data-act="open" data-id="${l.id}">
    <td><input type="checkbox" data-act="sel" data-id="${l.id}" ${sel.has(l.id) ? "checked" : ""}></td>
    <td>${fmtDate(l.date)}</td>
    <td>${heatTag(l)} <b>${displayName(l)}</b>${l.name && kidNames(l) ? `<div class="hint">${esc(kidNames(l))}</div>` : ""}${l.type !== "Admission" ? ` <span class="tag">${esc(l.type)}</span>` : ""}</td>
    <td>${esc(fmtPhone(l.phone) || l.phoneRaw)}</td><td>${esc(classesOf(l))}</td><td>${esc(l.source)}${l.campaign ? `<div class="hint">${esc(l.campaign)}</div>` : ""}</td><td>${chip(l.stage)}</td>
    <td>${followLabel(l)}</td>
    <td><div class="acts">${l.phone ? `<button class="btn sm wa" data-act="wa" data-id="${l.id}">WA</button>` : ""}<button class="btn sm" data-act="log" data-id="${l.id}">Log</button></div></td>
  </tr>`).join("")}</tbody></table>` : ""}
  ${L.length ? "" : `<div class="empty">No enquiries match these filters.</div>`}`;
}
function mobileList(L){
  return `<div class="mlist">${L.map(l => `<div class="mrow" data-act="open" data-id="${l.id}">
    <input type="checkbox" data-act="sel" data-id="${l.id}" ${sel.has(l.id) ? "checked" : ""} aria-label="Select">${avatar(l)}
    <div class="mmain">
      <div class="mtop"><span class="mname">${heatTag(l)} ${displayName(l)}</span>${chip(l.stage)}</div>
      <div class="meta">${esc(fmtPhone(l.phone) || l.phoneRaw)}${classesOf(l) ? ` · ${esc(classesOf(l))}` : ""}${l.type !== "Admission" ? ` · ${esc(l.type)}` : ""}</div>
      <div class="meta">${fmtDate(l.date)} · ${isActive(l) ? "Next: " : ""}${followLabel(l)}</div>
    </div>
    ${l.phone ? `<div class="mbtns"><a class="ibtn" href="tel:+${l.phone}" data-act="call" data-id="${l.id}" aria-label="Call">${ICON.call}</a><button class="ibtn wa" data-act="wa" data-id="${l.id}" aria-label="WhatsApp">${ICON.wa}</button></div>` : ""}
  </div>`).join("")}</div>`;
}
function bulkBar(){
  if (!sel.size) return "";
  return `<div class="bulkbar"><b>${sel.size} selected</b>
    ${can("bulk") ? `<button class="btn sm wa" data-act="bulk-sel">WhatsApp them</button>` : ""}
    ${can("assign") ? `<select data-bulk="assign" style="width:auto"><option value="">Assign to…</option>${staffNames().map(n => `<option>${esc(n)}</option>`).join("")}</select>` : ""}
    <select data-bulk="stage" style="width:auto"><option value="">Move to stage…</option>${STAGE_NAMES.map(s => `<option>${s}</option>`).join("")}</select>
    <button class="btn sm" data-act="sel-clear">Clear</button></div>`;
}

/* ----- visit calendar ----- */
function weekStart(off){ const d = new Date(); const dow = (d.getDay() + 6) % 7; return isoOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + off * 7)); }
function renderCalendar(){
  const t = todayISO(), tm = addDays(t, 1), start = weekStart(ui.calWeek);
  const days = []; for (let i = 0; i < 7; i++) { const d = addDays(start, i); if (db.settings.visitDays.includes(dowOf(d))) days.push(d); }
  const slots = [...slotList(), ""];
  const cap = +db.settings.slotCapacity || 1;
  const booked = (d, s) => db.leads.filter(l => l.visitDate === d && (l.visitTime || "") === s && !["Lost","Invalid","Closed","Not Reachable"].includes(l.stage));
  const cell = (d, s) => {
    const b = booked(d, s);
    const items = b.map(l => `<div class="bk" style="border-color:${STAGE_COLOR[l.stage]}" data-act="open" data-id="${l.id}" title="${esc(l.stage)}"><b>${displayName(l)}</b><span>${esc(classesOf(l))}${l.stage === "Visited" ? " ✓" : ""}</span></div>`).join("");
    const can = d >= t && (s === "" || b.length < cap);
    return `<td class="${d === t ? "today" : ""}">${items}${can ? `<button class="addbk" data-act="book" data-date="${d}" data-time="${esc(s)}">+ Book</button>` : (s && b.length >= cap ? `<span class="hint">Full</span>` : "")}</td>`;
  };
  const sched = db.leads.filter(l => l.stage === "Visit Scheduled");
  const tomorrow = sched.filter(l => l.visitDate === tm).sort((a, b) => (a.visitTime || "").localeCompare(b.visitTime || ""));
  const todays = sched.filter(l => l.visitDate === t).sort((a, b) => (a.visitTime || "").localeCompare(b.visitTime || ""));
  const missed = sched.filter(l => l.visitDate && l.visitDate < t).sort((a, b) => b.visitDate.localeCompare(a.visitDate));
  const nodate = db.leads.filter(l => isActive(l) && !l.visitDate && ["Interested","Contacted","Visit Scheduled"].includes(l.stage));
  const sec = (title, arr, extra, hint = "", btn = "") => `<h3>${title} <span class="badge soft">${arr.length}</span>${btn}</h3>${hint ? `<p class="hint">${hint}</p>` : ""}${arr.length ? `<div class="lcards">${arr.map(l => leadCard(l, extra(l))).join("")}</div>` : `<div class="empty">None</div>`}`;
  const attended = l => `<button class="btn sm" data-act="visited" data-id="${l.id}">✓ Visited</button><button class="btn sm" data-act="noshow" data-id="${l.id}">No-show</button>`;
  const bkItem = l => `<div class="bk" style="border-color:${STAGE_COLOR[l.stage]}" data-act="open" data-id="${l.id}"><b>${displayName(l)}</b><span>${esc(classesOf(l))}${l.stage === "Visited" ? " ✓ visited" : ""}</span></div>`;
  const dayList = `<div class="mcal">${days.map(d => {
    const rows = slots.map(s => {
      const b = booked(d, s), can_ = d >= t && s !== "" && b.length < cap;
      if (!b.length && !can_) return "";
      return `<div class="mslot"><span class="mt">${s ? esc(s) : "Any time"}</span><div class="mslotb">${b.map(bkItem).join("")}${can_ ? `<button class="addbk" data-act="book" data-date="${d}" data-time="${esc(s)}">+ Book ${esc(s)}</button>` : ""}</div></div>`;
    }).join("");
    return `<div class="mday ${d === t ? "today" : ""}"><div class="mdh">${fmtShort(d)}${d === t ? " · Today" : ""}</div>${rows || `<div class="hint">${d < t ? "No visits" : "Fully booked"}</div>`}</div>`;
  }).join("") || `<div class="empty">No visit days this week</div>`}</div>`;
  return topbar("Visit calendar") + `
  <div class="calnav"><button class="btn sm" data-act="cal" data-d="-1">‹ Prev</button><button class="btn sm" data-act="cal" data-d="0">This week</button><button class="btn sm" data-act="cal" data-d="1">Next ›</button>
    <span class="hint">Week of ${fmtDate(start)} · ${cap} famil${cap === 1 ? "y" : "ies"} per slot · change slots in Settings</span></div>
  ${isMobile() ? dayList : `<div class="calwrap"><table class="cal"><thead><tr><th></th>${days.map(d => `<th class="${d === t ? "today" : ""}">${fmtShort(d)}</th>`).join("")}</tr></thead>
  <tbody>${slots.map(s => `<tr><th>${s ? esc(s) : "Any time"}</th>${days.map(d => cell(d, s)).join("")}</tr>`).join("")}</tbody></table></div>`}
  ${sec("Visits today", todays, attended)}
  ${sec("Visits tomorrow – send reminders", tomorrow, l => `<button class="btn sm wa" data-act="wa" data-id="${l.id}" data-tpl="Visit reminder">Send reminder</button>`, "", tomorrow.length > 1 ? `<button class="btn sm" data-act="bulk-ids" data-tpl="Visit reminder" data-ids="${tomorrow.map(l => l.id).join(",")}">Remind all</button>` : "")}
  ${sec("Visit date passed – confirm attendance", missed, attended, "Mark as visited, or record a no-show to reschedule.")}
  ${sec("Interested – visit not booked yet", nodate, l => `<button class="btn sm" data-act="book" data-id="${l.id}">Book visit</button>`)}`;
}

/* ----- seats ----- */
function seatYear(){ return ui.seatYear || db.settings.academicYear; }
function seatStats(){
  const yr = seatYear();
  const inYear = l => l.type === "Admission" && (!l.academicYear || l.academicYear === yr || yr === "__all");
  return list(db.settings.classes).map(c => {
    const kids = st => db.leads.filter(l => inYear(l) && st(l)).reduce((n, l) => n + l.children.filter(k => k.cls === c).length, 0);
    const confirmed = kids(l => l.stage === "Admitted" || l.stage === "Fee Paid");
    const process = kids(l => ["Application","Assessment","Documents"].includes(l.stage));
    const pipeline = kids(l => isOpen(l) && (RANK[l.stage] ?? 0) <= 4 && l.stage !== "Next Year");
    const cap = +db.settings.seats[c] || 0;
    return { c, cap, confirmed, process, pipeline, avail: cap ? cap - confirmed : null };
  });
}
function seatMini(){
  const S = seatStats().filter(s => s.cap);
  if (!S.length) return `<div class="muted">Set seats per class in the <a href="#" data-act="nav" data-view="seats">Seats</a> page.</div>`;
  return bars(S.map(s => [s.c, s.confirmed]), k => { const s = S.find(x => x.c === k); return s.confirmed >= s.cap ? "var(--danger)" : s.confirmed / s.cap >= .9 ? "var(--warn)" : "var(--ok)"; }, k => ` / ${S.find(x => x.c === k).cap}`);
}
function renderSeats(){
  const S = seatStats(), yr = seatYear();
  const years = [...new Set([db.settings.academicYear, ...db.leads.map(l => l.academicYear).filter(Boolean)])];
  const tot = k => S.reduce((n, s) => n + (s[k] || 0), 0);
  return topbar("Seat availability", `<select data-ui="seatYear" style="width:auto">${years.map(y => `<option ${y === yr ? "selected" : ""}>${esc(y)}</option>`).join("")}<option value="__all" ${yr === "__all" ? "selected" : ""}>All years</option></select>`) + `
  <p class="hint">Enter the number of seats for each class. <b>Confirmed</b> = children at Fee Paid or Admitted. <b>In process</b> = Application, Assessment or Documents. <b>Pipeline</b> = open enquiries before application. Enquiries without an academic year are counted in every year.</p>
  <table class="seat"><thead><tr><th>Class</th><th>Seats</th><th>Confirmed</th><th>In process</th><th>Pipeline</th><th>Available</th><th style="width:30%">Filled</th></tr></thead><tbody>
  ${S.map(s => { const p = s.cap ? Math.min(100, s.confirmed / s.cap * 100) : 0; const col = !s.cap ? "var(--border)" : p >= 100 ? "var(--danger)" : p >= 90 ? "var(--warn)" : "var(--ok)";
    return `<tr><td><b>${esc(s.c)}</b></td><td><input type="number" min="0" data-seat="${esc(s.c)}" value="${s.cap || ""}" placeholder="—" style="width:80px"></td>
    <td>${s.confirmed}</td><td>${s.process}</td><td>${s.pipeline}</td>
    <td>${s.avail == null ? `<span class="muted">—</span>` : s.avail <= 0 ? `<span class="chip" style="color:var(--danger);background:color-mix(in srgb,var(--danger) 14%,transparent)">Full${s.avail < 0 ? ` (+${-s.avail})` : ""}</span>` : s.avail <= Math.ceil(s.cap * .1) ? `<b class="due-today">${s.avail} left</b>` : s.avail}</td>
    <td><div class="track"><div class="fill" style="width:${p}%;background:${col}"></div></div></td></tr>`; }).join("")}
  <tr class="totrow"><td>Total</td><td>${tot("cap") || ""}</td><td>${tot("confirmed")}</td><td>${tot("process")}</td><td>${tot("pipeline")}</td><td>${tot("cap") ? tot("cap") - tot("confirmed") : ""}</td><td></td></tr>
  </tbody></table>`;
}

/* ----- reports: see reports.js ----- */
const tbl = (head, rows) => `<table class="rep"><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${head.length}" class="muted">No data</td></tr>`}</tbody></table>`;

/* ----- job enquiries ----- */
function renderJobs(){
  const jobs = db.leads.filter(l => l.type !== "Admission");
  const waiting = jobs.filter(isOpen).sort((a, b) => b.date.localeCompare(a.date));
  const done = jobs.filter(l => !isOpen(l)).sort((a, b) => b.date.localeCompare(a.date));
  const suspects = db.leads.filter(l => l.type === "Admission" && isOpen(l) && isJobText([l.notes, l.name].join(" ")));
  const extra = l => `<button class="btn sm wa" data-act="wa" data-id="${l.id}" data-tpl="Job reply">HR reply</button><button class="btn sm" data-act="to-adm" data-id="${l.id}">It's an admission</button><button class="btn sm" data-act="stage" data-stage="Closed" data-id="${l.id}">Close</button>`;
  return topbar("Job & other enquiries") + `
  <p class="hint">Job seekers often message the admissions number. Keep them out of your admission follow-ups: send the HR reply (set the HR email in Settings) and close them.${db.settings.hrEmail ? "" : ` <b>HR email is not set yet.</b>`}</p>
  <h3>Awaiting reply <span class="badge soft">${waiting.length}</span>${waiting.filter(l => l.phone).length > 1 ? `<button class="btn sm" data-act="bulk-ids" data-tpl="Job reply" data-ids="${waiting.filter(l => l.phone).map(l => l.id).join(",")}">Reply to all</button>` : ""}</h3>
  ${waiting.length ? `<div class="lcards">${waiting.map(l => leadCard(l, extra(l))).join("")}</div>` : `<div class="empty">No job enquiries waiting</div>`}
  ${suspects.length ? `<h3>Admission enquiries that look like job enquiries <span class="badge soft">${suspects.length}</span></h3><div class="lcards">${suspects.map(l => leadCard(l, `<button class="btn sm" data-act="to-job" data-id="${l.id}">Move to job enquiries</button>`)).join("")}</div>` : ""}
  <h3>Closed <span class="badge soft">${done.length}</span></h3>
  ${done.length ? tbl(["Date","Name","Phone","Stage"], done.slice(0, 50).map(l => [fmtDate(l.date), `<a href="#" data-act="open" data-id="${l.id}">${displayName(l)}</a>`, esc(fmtPhone(l.phone)), chip(l.stage)])) : `<div class="empty">None</div>`}`;
}

/* ----- activity log ----- */
let actCache = { key: "", rows: null, loading: false, error: "" };
function actFrom(){ return ui.actRange === "all" ? "" : addDays(todayISO(), -(+ui.actRange - 1)); }
async function loadActivity(){
  const key = actFrom();
  if (actCache.loading) return;
  actCache.loading = true; actCache.error = "";
  try { const r = await api("activity", { from: key }); actCache = { key, rows: r.rows || [], loading: false, error: "" }; }
  catch(e){ actCache = { key, rows: actCache.rows, loading: false, error: e.message }; }
  if (ui.view === "activity") render();
}
function activityRows(){
  if (!syncOn()) { const f = actFrom(); return db.activity.filter(a => !f || a.at.slice(0, 10) >= f).slice().reverse(); }
  if (actCache.key !== actFrom() || !actCache.rows) { loadActivity(); return null; }
  return actCache.rows;
}
function renderActivity(){
  const rows = activityRows();
  const users = rows ? [...new Set(rows.map(r => r.user).filter(Boolean))].sort() : [];
  const types = rows ? [...new Set(rows.map(r => r.type))].sort() : [];
  const q = ui.actQ.trim().toLowerCase();
  const R = (rows || []).filter(r => (!ui.actUser || r.user === ui.actUser) && (!ui.actType || r.type === ui.actType) &&
    (!q || [r.user, r.type, r.lead, r.details].join(" ").toLowerCase().includes(q)));
  const opt = (arr, cur, all) => `<option value="">${all}</option>` + arr.map(v => `<option ${v === cur ? "selected" : ""}>${esc(v)}</option>`).join("");
  const when = iso => { const d = new Date(iso); return `${fmtDate(isoOf(d))} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`; };
  const body = rows === null ? `<div class="empty">${actCache.error ? "Could not load: " + esc(actCache.error) : "Loading activity…"}</div>`
    : !R.length ? `<div class="empty">No activity for these filters</div>`
    : isMobile() ? `<div class="mlist">${R.slice(0, 400).map(r => `<div class="mrow" ${r.leadId ? `data-act="open-act" data-id="${esc(r.leadId)}"` : ""}><div class="mmain"><div class="mtop"><b>${esc(r.type)}</b><span class="hint">${when(r.at)}</span></div><div class="meta">${esc(r.user || "—")}${r.lead ? ` · ${esc(r.lead)}` : ""}</div>${r.details ? `<div class="meta">${esc(r.details)}</div>` : ""}</div></div>`).join("")}</div>`
    : tbl(["When", "Who", "Action", "Enquiry", "Details"], R.slice(0, 1000).map(r => [`<span style="white-space:nowrap">${when(r.at)}</span>`, esc(r.user || "—"), `<b>${esc(r.type)}</b>`,
        r.leadId && db.leads.some(l => l.id === r.leadId) ? `<a href="#" data-act="open-act" data-id="${esc(r.leadId)}">${esc(r.lead || "open")}</a>` : esc(r.lead), esc(r.details)]));
  return `<div class="top"><h1>Activity log</h1>
    <select data-ui="actRange" style="width:auto">${[["1","Today"],["7","Last 7 days"],["30","Last 30 days"],["90","Last 90 days"],["all","All"]].map(([v, l]) => `<option value="${v}" ${ui.actRange === v ? "selected" : ""}>${l}</option>`).join("")}</select>
    ${syncOn() ? `<button class="btn" data-act="act-refresh">Refresh</button>` : ""}${can("export") ? `<button class="btn desk-only" data-act="act-export">Export</button>` : ""}</div>
  <p class="hint">${syncOn() ? "Every change by every user is recorded on the server and cannot be edited, including sign-ins and failed sign-in attempts." : "Activity on this device. Connect the shared Google Sheet to record every user's activity centrally."}</p>
  <div class="filters"><input class="q" type="search" placeholder="Search…" value="${esc(ui.actQ)}" data-ui="actQ">
    <select data-ui="actUser">${opt(users, ui.actUser, "All users")}</select><select data-ui="actType">${opt(types, ui.actType, "All actions")}</select></div>
  ${rows ? `<p class="hint" style="margin:0 0 8px">${R.length} entries${R.length > 1000 ? " (showing latest 1000)" : ""}</p>` : ""}${body}`;
}

/* ----- users (admin) ----- */
let usersCache = null;
async function loadUsers(){
  try { const r = await api("users"); usersCache = r.users || []; db.users = usersCache.map(u => ({ name: u.name, role: u.role, phone: u.phone, email: u.email, active: u.active })); }
  catch(e){ usersCache = { error: e.message }; }
  if (ui.view === "settings") render();
}
function usersSection(){
  if (!syncOn()) return `<p class="hint">User sign-in and access roles work once the shared Google Sheet is connected (see the left card). Until then, anyone using this device has full access.</p>`;
  if (!can("users")) return "";
  if (!usersCache) { loadUsers(); return `<div class="empty">Loading users…</div>`; }
  if (usersCache.error) return `<div class="warnbox">Could not load users: ${esc(usersCache.error)}</div>`;
  return `${tbl(["Name", "User name", "Role", "Contact", "Status", ""], usersCache.map(u => [
    `<b>${esc(u.name)}</b>`, esc(u.username), esc(u.role), `${esc(u.phone || "")}${u.email ? `<div class="hint">${esc(u.email)}</div>` : ""}`,
    u.active ? `<span class="chip" style="color:var(--ok);background:color-mix(in srgb,var(--ok) 14%,transparent)">Active</span>` : `<span class="chip" style="color:var(--muted);background:var(--surface2)">Disabled</span>`,
    `<button class="btn sm" data-act="user-edit" data-u="${esc(u.username)}">Edit</button>`]))}
    <div class="acts" style="margin-top:10px"><button class="btn primary" data-act="user-edit">+ Add user</button></div>
    <details style="margin-top:12px"><summary class="hint">What each role can do</summary>${Object.entries(ROLE_INFO).map(([r, d]) => `<p class="hint" style="margin:6px 0"><b>${r}</b>: ${d}</p>`).join("")}</details>`;
}
function userForm(username){
  const u = username && Array.isArray(usersCache) ? usersCache.find(x => x.username === username) : null;
  showDialog(`<form method="dialog" id="userform">
  <div class="dlg-h"><b>${u ? "Edit user" : "Add user"}</b><button type="button" class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="form">
    <label>Full name<input type="text" name="name" required value="${esc(u ? u.name : "")}"></label>
    <label>User name (for signing in)<input type="text" name="username" required autocapitalize="none" value="${esc(u ? u.username : "")}" ${u ? "readonly" : ""} pattern="[a-z0-9._-]{3,30}" title="3–30 lowercase letters, numbers, dot, dash"></label>
    <label>Role<select name="role">${Object.keys(ROLES).map(r => `<option ${u && u.role === r ? "selected" : (!u && r === "Counsellor" ? "selected" : "")}>${r}</option>`).join("")}</select></label>
    <label>Status<select name="active"><option value="1" ${!u || u.active ? "selected" : ""}>Active</option><option value="0" ${u && !u.active ? "selected" : ""}>Disabled (cannot sign in)</option></select></label>
    <label>WhatsApp number<input type="tel" name="phone" value="${esc(u ? u.phone || "" : "")}" placeholder="for daily lists"></label>
    <label>Email<input type="email" name="email" value="${esc(u ? u.email || "" : "")}" placeholder="for the 7 AM email"></label>
    <label class="full">${u ? "New password (leave empty to keep the current one)" : "Temporary password (8+ characters)"}<input type="text" name="password" ${u ? "" : "required"} minlength="8" autocomplete="off"></label>
    <p class="hint full" style="margin:0" id="roleinfo"></p>
  </div></div>
  <div class="dlg-f"><button type="button" class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" type="submit">Save user</button></div></form>`);
  const f = $("#userform");
  const info = () => { $("#roleinfo").textContent = ROLE_INFO[f.role.value]; }; f.role.addEventListener("change", info); info();
  f.addEventListener("submit", async e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f).entries());
    const btn = f.querySelector("[type=submit]"); btn.disabled = true;
    try {
      await api("saveUser", { user: { username: fd.username.trim().toLowerCase(), name: fd.name.trim(), role: fd.role, active: fd.active === "1", phone: fd.phone.trim(), email: fd.email.trim() }, password: fd.password, isNew: !u });
      closeDialog(); toast(u ? "User updated" : `User added. Share the user name and temporary password with ${fd.name.trim()}.`);
      usersCache = null; render();
    } catch(err){ alert(err.message); btn.disabled = false; }
  });
}
function passwordForm(){
  showDialog(`<form method="dialog" id="pwform"><div class="dlg-h"><b>Change password</b><button type="button" class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="form">
    <label class="full">Current password<input type="password" name="old" required autocomplete="current-password"></label>
    <label class="full">New password (8+ characters)<input type="password" name="pw" required minlength="8" autocomplete="new-password"></label>
    <label class="full">Repeat new password<input type="password" name="pw2" required minlength="8" autocomplete="new-password"></label>
  </div></div>
  <div class="dlg-f"><button type="button" class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" type="submit">Change password</button></div></form>`);
  $("#pwform").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target;
    if (f.pw.value !== f.pw2.value) { toast("The new passwords don't match"); return; }
    try {
      const r = await api("changePassword", { oldPassword: f.old.value, newPassword: f.pw.value });
      if (r.session) { local.session.token = r.session; saveLocal(); }
      closeDialog(); toast("Password changed. Other devices will need to sign in again.");
    }
    catch(err){ alert(err.message); }
  });
}

/* ----- phone "More" sheet ----- */
function moreSheet(){
  const jc = db.leads.filter(l => l.type !== "Admission" && isOpen(l)).length;
  const items = [["seats", "Seats"], ["reports", "Reports", "reports"], ["activity", "Activity log", "activity"], ["jobs", `Job enquiries${jc ? ` <span class="badge soft">${jc}</span>` : ""}`], ["settings", can("settings") ? "Settings" : "My account & settings"]]
    .filter(i => !i[2] || can(i[2]));
  showDialog(`<div class="dlg-h"><b>More</b><button class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="morelist">
    ${items.map(([v, l]) => `<button class="btn" data-act="nav-close" data-view="${v}"><span>${l}</span><span class="muted">›</span></button>`).join("")}
    <button class="btn" data-act="paste"><span>Paste an enquiry</span><span class="muted">›</span></button>
    <a class="btn" href="manual.html" target="_blank" rel="noopener"><span>User manual &amp; workflow</span><span class="muted">↗</span></a>
  </div>
  ${syncOn() && role() === "Counsellor" ? "" : `<label class="flabel" style="margin-top:16px">Showing work for<select id="me2"><option value="">Everyone</option>${staffNames().map(n => `<option ${n === local.me ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`}
  <label class="flabel" style="margin-top:16px">Theme${themeSelect("theme2")}</label>
  <div style="margin-top:16px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
    <span id="sync2" class="hint" style="display:flex;align-items:center;gap:6px">${syncLabel()}</span>
    ${syncOn() ? `<span class="acts"><button class="btn sm" data-act="sync-now">Sync now</button><button class="btn sm danger" data-act="logout">Sign out</button></span>` : ""}
  </div>
  ${syncOn() ? `<p class="hint">Signed in as <b>${esc(meName())}</b> (${esc(role())})</p>` : ""}</div>`);
}

/* ----- settings ----- */
function formLink(src, campaign){
  const s = db.settings, base = s.formUrl || "";
  if (!base) return "";
  const p = new URLSearchParams();
  if (src) p.set("src", src); if (campaign) p.set("c", campaign);
  const q = p.toString();
  return base + (q ? (base.includes("?") ? "&" : "?") + q : "");
}
/* ----- past follow-up dates (Settings switch) ----- */
const PAST_MSG = "That date has passed – use today or pick a later date.";
const pastBlocked = d => !!db.settings.blockPastFollowUp && !!d && d < todayISO();
const fuMin = () => db.settings.blockPastFollowUp ? `min="${todayISO()}"` : "";
// live warning under a next-follow-up input, with a one-tap "Use today"
function wirePastCheck(input, box){
  const check = () => {
    box.innerHTML = pastBlocked(input.value) ? `<div class="warnbox">${PAST_MSG} <a href="#" data-act="fu-today">Use today</a></div>` : "";
    const a = box.querySelector("a"); if (a) a.onclick = e => { e.preventDefault(); input.value = todayISO(); check(); };
  };
  input.addEventListener("input", check); input.addEventListener("change", check); check();
  return check;
}

/* ----- follow-up date rules ----- */
// only open admission enquiries are followed up; job / other enquiries just need the HR reply
const isOverdue = l => isActive(l) && !!l.nextFollowUp && l.nextFollowUp < todayISO();
function followLabel(l){
  if (!isOpen(l)) return `<span class="muted">Closed</span>`;
  if (l.type !== "Admission") return `<span class="muted">${esc(l.type)} enquiry – no follow-up</span>`;
  return l.nextFollowUp ? relDue(l.nextFollowUp) : `<span class="tag">Not scheduled</span>`;
}
const RESCHED = [["0", "Today"], ["1", "Tomorrow"], ["7", "Next week"], ["none", "Not scheduled"]];
// "Overdue since 3 Nov" + quick buttons; in a form the buttons fill the date box, in the details panel they save at once
function overdueBanner(l, inForm){
  const n = daysBetween(l.nextFollowUp, todayISO());
  return `<div class="warnbox odbox">Overdue since <b>${fmtDate(l.nextFollowUp)}</b> (${n} day${n === 1 ? "" : "s"}). Reschedule:
    <span class="quick" style="display:inline-flex;margin:4px 0 0">${RESCHED.map(([d, lab]) => `<button type="button" class="btn sm" data-act="${inForm ? "fresched" : "resched"}" data-days="${d}" data-id="${l.id}">${lab}</button>`).join("")}</span></div>`;
}
const reschedDate = d => d === "none" ? "" : addDays(todayISO(), +d);

/* ----- light / dark theme (per device) ----- */
const THEME_KEY = KEY + ".theme";
function currentTheme(){ try { return localStorage.getItem(THEME_KEY) || "auto"; } catch(e){ return "auto"; } }
function applyTheme(t){
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
  try { if (t === "auto") localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, t); } catch(e){}
  const dark = t === "dark" || (t === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0b1120" : "#1d4ed8");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#0a0f1c" : "#2557e8");
  document.querySelectorAll(".seg [data-act='theme']").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === t)));
}
// three icon buttons: Auto (device) · Light · Dark
const THEME_ICONS = {
  auto: `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>`,
  light: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`,
  dark: `<svg viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>`
};
const themeSelect = () => `<span class="seg" role="group" aria-label="Colour theme">${[["auto", "Auto – follow this device"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) =>
  `<button type="button" data-act="theme" data-t="${v}" title="${l}" aria-label="${l}" aria-pressed="${currentTheme() === v}">${THEME_ICONS[v]}</button>`).join("")}</span>`;
// coloured initials for a family
function avatar(l, big){
  const n = (l.name || kidNames(l) || "?").trim();
  const parts = n.split(/[\s/]+/).filter(Boolean);
  const ini = ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  let h = 0; for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `<span class="av${big ? " lg" : ""}" style="--h:${h}" aria-hidden="true">${esc(ini)}</span>`;
}

/* ----- report email recipients (Settings) ----- */
const REPORT_EMAIL_SECTIONS = [["summary","Summary figures"],["followups","Follow-ups due & overdue"],["newlist","New enquiries list"],["visits","School visits"],
  ["sources","Sources"],["counsellors","Counsellors"],["lost","Lost families"],["seats","Seats by class"],["fees","Fees & forecast"],["quality","Data quality"]];
function reportRecipientsEditor(s){
  const R = s.reportRecipients || [];
  const row = (r, i) => {
    const all = !r.sections || !r.sections.length || r.sections.includes("all");
    return `<div class="rrow">
      <div class="rrhead">
        <input type="email" data-rr="email" data-i="${i}" value="${esc(r.email)}" placeholder="name@school.com" aria-label="Email address">
        <select data-rr="freq" data-i="${i}" aria-label="How often">${[["daily","Daily (7:30 AM)"],["weekly","Weekly (Monday 8 AM)"],["both","Daily and weekly"]].map(([v, l]) => `<option value="${v}" ${r.freq === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="btn sm" data-act="rr-test" data-i="${i}" ${syncOn() ? "" : "disabled title='Connect the Google Sheet first'"}>Send test</button>
        <button class="btn sm danger" data-act="rr-del" data-i="${i}" aria-label="Remove">Remove</button>
      </div>
      <div class="rrsecs">
        <label class="rrchip ${all ? "on" : ""}"><input type="checkbox" data-rr="all" data-i="${i}" ${all ? "checked" : ""}> All reports</label>
        ${REPORT_EMAIL_SECTIONS.map(([k, l]) => `<label class="rrchip ${!all && r.sections.includes(k) ? "on" : ""} ${all ? "dim" : ""}"><input type="checkbox" data-rr="sec" data-k="${k}" data-i="${i}" ${all || r.sections.includes(k) ? "checked" : ""} ${all ? "disabled" : ""}> ${esc(l)}</label>`).join("")}
      </div></div>`;
  };
  return `${R.length ? R.map(row).join("") : `<div class="empty" style="margin-bottom:10px">No report emails yet.${syncOn() ? " Until you add one, the weekly report goes to Admins and Managers who have an email." : ""}</div>`}
    <button class="btn primary" data-act="rr-add">+ Add email</button>`;
}
function rrUpdate(el){
  const R = db.settings.reportRecipients = (db.settings.reportRecipients || []).slice();
  const i = +el.dataset.i, r = R[i] = Object.assign({ email: "", freq: "daily", sections: ["all"] }, R[i]);
  if (el.dataset.rr === "email") r.email = el.value.trim();
  if (el.dataset.rr === "freq") r.freq = el.value;
  if (el.dataset.rr === "all") r.sections = el.checked ? ["all"] : REPORT_EMAIL_SECTIONS.map(x => x[0]);
  if (el.dataset.rr === "sec") { const set = new Set(r.sections.filter(x => x !== "all")); el.checked ? set.add(el.dataset.k) : set.delete(el.dataset.k); r.sections = [...set]; }
  settingsChanged();
}
function accountView(){
  return topbar("My account") + `<div class="grid two">
  <div class="card"><h2>${esc(meName())}</h2>
    <p class="hint" style="margin-top:0">Role: <b>${esc(role())}</b> – ${esc(ROLE_INFO[role()] || "")}</p>
    <div class="acts"><button class="btn" data-act="change-pw">Change password</button><button class="btn danger" data-act="logout">Sign out</button></div>
    <p class="hint" style="margin-top:14px">Sync: <span style="display:inline-flex;gap:6px;align-items:center">${syncLabel()}</span></p>
    <button class="btn sm" data-act="sync-now">Sync now</button>
  </div>
  <div class="card"><h2>Reminders on this device</h2>
    <p class="hint">Shows a notification with your due follow-ups, and when new online enquiries arrive.</p>
    <button class="btn" data-act="notif">${"Notification" in window && Notification.permission === "granted" ? "Reminders are on ✓ (test)" : "Turn on reminders"}</button>
    <h2 style="margin-top:18px">Install on your phone</h2>
    <p class="hint">Open this page in Chrome (Android) or Safari (iPhone) and choose <b>Add to Home screen</b>.</p>
    <h2 style="margin-top:18px">Appearance</h2>
    <label class="hint" style="display:flex;flex-direction:column;gap:4px;max-width:240px">Theme on this device${themeSelect("theme2")}</label>
    <h2 style="margin-top:18px">Help</h2>
    <a class="btn" href="manual.html" target="_blank" rel="noopener">Open the user manual &amp; workflow ↗</a>
  </div></div>`;
}
function renderSettings(){
  if (!can("settings")) return accountView();
  const s = db.settings;
  const ta = (key, label, hint = "", rows = 2) => `<label class="full">${label}<textarea data-set="${key}" rows="${rows}" style="min-height:0">${esc(s[key])}</textarea>${hint ? `<span class="hint" style="font-weight:400">${hint}</span>` : ""}</label>`;
  const inp = (key, label, ph = "") => `<label>${label}<input type="text" data-set="${key}" value="${esc(s[key])}" placeholder="${esc(ph)}"></label>`;
  return topbar("Settings & data") + `<div class="grid two settings">
  <div class="card"><h2>School</h2>
    <div class="form">
      <label class="full">School name<input type="text" data-set="schoolName" value="${esc(s.schoolName)}"></label>
      <label>Default country code<select data-set="country">${[["971","UAE (+971)"],["91","India (+91)"],["966","Saudi (+966)"],["974","Qatar (+974)"],["968","Oman (+968)"],["965","Kuwait (+965)"],["973","Bahrain (+973)"]].map(([v, l]) => `<option value="${v}" ${s.country === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${inp("academicYear", "Admission year", "2027-28")}
      ${inp("currency", "Currency", "AED")}
      ${inp("hrEmail", "HR email (for job replies)", "hr@school.com")}
      <label class="full" style="flex-direction:row;align-items:center;gap:8px;font-weight:500"><input type="checkbox" data-set="blockPastFollowUp" ${s.blockPastFollowUp ? "checked" : ""}> Don't allow a <b>next follow-up</b> date in the past (the enquiry date can still be in the past)</label>
      ${syncOn() ? `<p class="hint full" style="margin:0">Staff for assigning leads and daily emails come from <b>Users & access roles</b>. Unassigned leads go to the first counsellor.</p>`
        : ta("counsellors", "Staff – one per line:  Name | WhatsApp number | email", "Phone and email are used to send each person their daily list. Unassigned leads go to the first person.", 4)}
    </div>
  </div>
  <div class="card"><h2>Shared database & sign-in</h2>
    ${syncOn() ? `<p>✅ Connected to the Google Sheet. Signed in as <b>${esc(meName())}</b> (${esc(role())}).</p><p class="hint">Last sync: ${local.lastSync ? new Date(local.lastSync).toLocaleString() : "—"}${db.dirty.length ? ` · ${db.dirty.length} changes waiting to upload` : ""}</p>
      <div class="acts"><button class="btn" data-act="sync-now">Sync now</button><button class="btn" data-act="change-pw">Change password</button><button class="btn danger" data-act="logout">Sign out</button></div>`
    : `<p class="hint">Right now data is stored only in this browser and there is no sign-in. Connect a Google Sheet to share live data with all staff, give each person their own login and role, record an activity log, save online-form enquiries automatically and email everyone their follow-ups at 7 AM. Follow <b>SETUP.md</b> (about 10 minutes), then paste the web app address here.</p>
      <div class="form"><label class="full">Web app address<input type="text" id="sync-url" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(local.syncUrl)}"></label></div>
      <div class="acts" style="margin-top:10px"><button class="btn primary" data-act="sync-connect">Connect</button></div>`}
    <h2 style="margin-top:18px">Users & access roles</h2>
    ${usersSection()}
    <h2 style="margin-top:18px">Reminders on this computer</h2>
    <p class="hint">Shows a desktop notification with your due follow-ups when the tracker is open, and when new online enquiries arrive.</p>
    <button class="btn" data-act="notif">${"Notification" in window && Notification.permission === "granted" ? "Reminders are on ✓ (test)" : "Turn on reminders"}</button>
    <h2 style="margin-top:18px">Install on phones</h2>
    <p class="hint">Open the tracker's web address in Chrome (Android) or Safari (iPhone). Choose <b>Add to Home screen</b>. It then opens like an app, and tapping <b>Call</b> dials the number and then asks you to log the call.</p>
  </div>
  <div class="card"><h2>Online enquiry form & QR codes</h2>
    <div class="form">
      ${inp("schoolWhatsApp", "School WhatsApp number (form fallback)", "05X XXX XXXX")}
      ${inp("alertEmail", "Email alert for new online enquiries", "admissions@school.com")}
      <label class="full">Form web address (after you publish enquiry.html)<input type="text" data-set="formUrl" value="${esc(s.formUrl)}" placeholder="https://yourname.github.io/school-enquiry-crm/enquiry.html"></label>
      <label>Source for this link / QR<select id="qr-src">${["QR code", ...list(s.sources)].map(x => `<option>${esc(x)}</option>`).join("")}</select></label>
      <label>Campaign (optional)<input type="text" id="qr-c" placeholder="e.g. Nov Insta KG ad" list="dl-camp"><datalist id="dl-camp">${[...new Set(db.leads.map(l => l.campaign).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
    </div>
    <div class="qrbox"><div id="qr"></div><div style="flex:1;min-width:0"><div class="hint" id="qr-link" style="word-break:break-all"></div>
      <div class="acts" style="margin-top:8px"><button class="btn sm" data-act="qr-copy">Copy link</button><button class="btn sm" data-act="qr-dl">Download QR (PNG)</button><button class="btn sm" data-act="form-test">Open form</button></div></div></div>
    <p class="hint">Use a different source or campaign for each poster or ad. Reports will then show which one brings admissions. For Instagram or Facebook bios, use source "Instagram" or "Facebook".</p>
  </div>
  <div class="card"><h2>Reports</h2>
    <div class="form">
      <label>Average annual fee per child (${esc(s.currency)})<input type="number" min="0" data-set="avgFee" value="${esc(s.avgFee)}" placeholder="used for the fee forecast"></label>
      <label>Lead is "stuck" after (days without a stage change)<input type="number" min="1" data-set="stuckDays" value="${esc(s.stuckDays)}"></label>
    </div>
  </div>
  <div class="card" style="grid-column:1/-1"><h2>Report emails</h2>
    <p class="hint" style="margin-top:0">The Google Sheet emails these reports automatically: <b>daily</b> at about 7:30 AM (yesterday's figures and today's lists) and/or <b>weekly</b> on Monday at 8 AM (last week vs the week before). Choose for each address which reports it gets.</p>
    ${reportRecipientsEditor(s)}
  </div>
  <div class="card"><h2>Visits</h2>
    <div class="form">
      <div class="full"><span class="hint" style="font-weight:600">Visit days</span><div class="acts" style="margin-top:4px">${DOW.map((d, i) => `<label class="hint" style="flex-direction:row;gap:4px;display:flex;align-items:center"><input type="checkbox" data-vday="${i}" ${s.visitDays.includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div></div>
      <label>Time slots (comma separated)<input type="text" data-set="visitSlots" value="${esc(s.visitSlots)}"></label>
      <label>Families per slot<input type="number" min="1" data-set="slotCapacity" value="${esc(s.slotCapacity)}"></label>
    </div>
    <h2 style="margin-top:18px">Lists</h2>
    <div class="form">
      ${ta("sources", "Lead sources")}${ta("classes", "Classes")}${ta("lostReasons", "Lost reasons")}${ta("docsList", "Admission documents checklist")}
      ${ta("jobKeywords", "Job-enquiry keywords", "Enquiries containing these words are flagged as possible job enquiries.")}
    </div>
  </div>
  <div class="card"><h2>Data</h2>
    <p class="hint">${syncOn() ? "Data is shared through your Google Sheet and also kept in this browser for offline use." : "Data is saved in this browser on this computer. Download a backup regularly."}</p>
    <div class="acts" style="margin-bottom:14px">
      <button class="btn" data-act="export-xlsx">Export to Excel</button><button class="btn" data-act="export-csv">Export CSV</button>
      <button class="btn" data-act="backup">Download backup (.json)</button><button class="btn" data-act="restore">Restore backup</button>
    </div>
    <h2>Import from Excel</h2>
    <p class="hint">Works with your existing enquiry sheet and with files exported from this app. Numbers already in the system are skipped.</p>
    <label class="hint" style="display:flex;gap:8px;align-items:center;margin:8px 0"><input type="checkbox" data-set="swapDates" ${s.swapDates ? "checked" : ""}> Excel dates were typed as day/month (fix swapped dates like 11-Feb → 2-Nov)</label>
    <button class="btn primary" data-act="import">Import Excel / CSV…</button>
    <h2 style="margin-top:20px">Danger zone</h2>
    <button class="btn danger" data-act="clear-all">Delete all enquiries</button>
  </div>
  <div class="card" style="grid-column:1/-1"><h2>WhatsApp message templates</h2>
    <p class="hint">Placeholders: {name} {student} {class} {for_class} {school} {visit} {at_time} {year} {hr_email} {docs_pending}</p>
    <div class="tpl">${Object.entries(s.tpl).map(([k, v]) => `<label class="hint"><b>${esc(k)}</b><textarea data-tpl="${esc(k)}">${esc(v)}</textarea></label>`).join("")}</div>
  </div></div>`;
}
function drawQR(){
  const box = $("#qr"), out = $("#qr-link"); if (!box) return;
  const link = formLink($("#qr-src")?.value, $("#qr-c")?.value.trim());
  box.innerHTML = "";
  if (!link) { out.innerHTML = "Enter the form web address above to generate a link and QR code. Until then, “Open form” opens the local copy for testing."; return; }
  out.textContent = link;
  if (typeof QRCode !== "undefined") new QRCode(box, { text: link, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M });
  else box.innerHTML = `<span class="hint">QR library needs internet</span>`;
}

/* =====================================================================
   DRAWER
   ===================================================================== */
/* phone Back button closes the open panel/sheet instead of leaving the app */
let ignorePop = 0;
function pushOverlay(kind){ if (!(history.state && history.state.ov === kind)) history.pushState({ ov: kind }, ""); }
function popOverlay(kind){
  setTimeout(() => {
    const stillOpen = kind === "dlg" ? dlg.open : !!drawerId;
    if (!stillOpen && history.state && history.state.ov === kind) { ignorePop++; history.back(); }
  }, 0);
}
window.addEventListener("popstate", () => {
  if (ignorePop) { ignorePop--; return; }
  if (dlg.open) { dlg.close(); return; }
  if (drawerId) closeDrawer(true);
});
function openDrawer(id){ if (!drawerId) pushOverlay("drawer"); drawerId = id; renderDrawer(); $("#drawer").classList.add("open"); }
function closeDrawer(fromPop){ if (!drawerId) return; drawerId = null; $("#drawer").classList.remove("open"); if (fromPop !== true) popOverlay("drawer"); }
function renderDrawer(){
  const l = db.leads.find(x => x.id === drawerId); if (!l) return closeDrawer();
  const hist = [...l.history].reverse();
  const nr = consecutiveNoAnswer(l);
  const docs = docList(), got = docs.filter(d => l.docs[d]).length;
  const staffOpts = ["", ...staffNames(), l.assignedTo].filter((v, i, a) => a.indexOf(v) === i);
  const slotOpts = ["", ...slotList(), l.visitTime].filter((v, i, a) => a.indexOf(v) === i);
  const sm = `style="width:auto;padding:3px 6px"`;
  $("#drawer").innerHTML = `
  <div class="dh">${avatar(l, true)}<div style="flex:1;min-width:0"><div style="font-size:17px;font-weight:700;letter-spacing:-.01em">${displayName(l)}</div>
    <div class="hint">${esc(fmtPhone(l.phone) || l.phoneRaw)} · enquired ${fmtDate(l.date)}</div>
    <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">${chip(l.stage)} ${heatTag(l)} ${l.type !== "Admission" ? `<span class="tag">${esc(l.type)}</span>` : ""}${l.lostReason && !isOpen(l) ? `<span class="tag">${esc(l.lostReason)}</span>` : ""}</div></div>
    <button class="x" data-act="close-drawer" aria-label="Close">×</button></div>
  <div class="db">
    ${isMobile() ? `<div class="acts" style="margin-bottom:12px"><button class="btn sm" data-act="edit" data-id="${l.id}">Edit</button>${l.type === "Admission" ? `<button class="btn sm" data-act="book" data-id="${l.id}">Book visit</button>` : ""}</div>` : `<div class="acts" style="margin-bottom:14px">
      ${l.phone ? `<a class="btn" href="tel:+${l.phone}" data-act="call" data-id="${l.id}">Call</a><button class="btn wa" data-act="wa" data-id="${l.id}">WhatsApp</button>` : ""}
      <button class="btn primary" data-act="log" data-id="${l.id}">Log follow-up</button>
      ${l.type === "Admission" ? `<button class="btn" data-act="book" data-id="${l.id}">Book visit</button>` : ""}
      <button class="btn" data-act="edit" data-id="${l.id}">Edit</button>
    </div>`}
    ${isOverdue(l) ? `<div style="margin-bottom:12px">${overdueBanner(l, false)}</div>` : ""}
    ${nr >= 3 && isOpen(l) ? `<div class="warnbox" style="margin-bottom:12px">${nr} unanswered attempts in a row. Consider marking as <b>Not Reachable</b>.</div>` : ""}
    <dl class="kv">
      <dt>Children</dt><dd>${l.children.length ? l.children.map(c => `${esc(c.name || "—")}${c.cls ? ` <span class="tag">${esc(c.cls)}</span>` : ""}`).join("<br>") : "—"}${l.academicYear ? `<div class="hint">Academic year ${esc(l.academicYear)}</div>` : ""}</dd>
      <dt>Location</dt><dd>${esc(l.location) || "—"}</dd>
      <dt>Transport</dt><dd><select data-field="transport" ${sm}>${["", "Yes", "No"].map(v => `<option value="${v}" ${l.transport === v ? "selected" : ""}>${v || "Not asked"}</option>`).join("")}</select></dd>
      ${l.email ? `<dt>Email</dt><dd><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></dd>` : ""}
      <dt>Source</dt><dd>${esc(l.source) || "—"}${l.campaign ? ` · <span class="tag">${esc(l.campaign)}</span>` : ""}</dd>
      <dt>Assigned to</dt><dd><select data-field="assignedTo" ${sm} ${can("assign") ? "" : "disabled"}>${staffOpts.map(v => `<option value="${esc(v)}" ${l.assignedTo === v ? "selected" : ""}>${esc(v) || "Unassigned"}</option>`).join("")}</select></dd>
      ${l.type !== "Admission" ? `<dt>Follow-up</dt><dd class="muted">Not needed – ${esc(l.type)} enquiry${isOpen(l) && l.type === "Job" ? " (send the HR reply)" : ""}</dd>` : `
      <dt>Next follow-up</dt><dd>${followLabel(l)} ${isOpen(l) ? `<input type="date" value="${l.nextFollowUp || ""}" data-field="nextFollowUp" ${fuMin()} ${sm}>${l.nextFollowUp ? ` <button class="btn sm" data-act="resched" data-days="none" data-id="${l.id}">Not scheduled</button>` : ""}` : ""}</dd>`}
      ${l.type !== "Admission" ? "" : `<dt>Visit</dt><dd><input type="date" value="${l.visitDate || ""}" data-field="visitDate" ${sm}> <select data-field="visitTime" ${sm}>${slotOpts.map(v => `<option value="${esc(v)}" ${l.visitTime === v ? "selected" : ""}>${esc(v) || "Any time"}</option>`).join("")}</select></dd>`}
      <dt>Notes</dt><dd style="white-space:pre-wrap">${esc(l.notes) || "—"}</dd>
    </dl>
    ${l.type === "Admission" ? `<h3>Admission progress</h3>
    <dl class="kv">
      <dt>Assessment</dt><dd><input type="date" value="${l.assessmentDate || ""}" data-field="assessmentDate" ${sm}></dd>
      <dt>Documents</dt><dd><div class="hint" style="margin-bottom:4px">${got} of ${docs.length} received</div>${docs.map(d => `<label class="docck"><input type="checkbox" data-doc="${esc(d)}" ${l.docs[d] ? "checked" : ""}> ${esc(d)}</label>`).join("")}</dd>
      <dt>Fee paid</dt><dd><input type="date" value="${l.feePaidDate || ""}" data-field="feePaidDate" ${sm}> <input type="text" inputmode="decimal" placeholder="${esc(db.settings.currency)} amount" value="${esc(l.feeAmount)}" data-field="feeAmount" style="width:120px;padding:3px 6px"></dd>
    </dl>` : ""}
    <h3>Move to stage</h3>
    <div class="stagepick">${STAGE_NAMES.map(s => `<button data-act="stage" data-id="${l.id}" data-stage="${s}" style="${s === l.stage ? `background:${STAGE_COLOR[s]};color:#fff;border-color:${STAGE_COLOR[s]}` : ""}">${s}</button>`).join("")}</div>
    <h3>History</h3>
    <ul class="timeline">${hist.map(h => `<li><div class="when">${fmtDate(h.date)}${h.channel ? ` · ${esc(h.channel)}` : ""}${h.outcome ? ` · <b>${esc(h.outcome)}</b>` : ""}${h.stageTo && h.stageTo !== h.stageFrom && h.kind !== "stage" ? ` · → ${esc(h.stageTo)}` : ""}${h.by ? ` · ${esc(h.by)}` : ""}</div>${h.note ? `<div>${esc(h.note)}</div>` : ""}</li>`).join("")}</ul>
    ${can("delete") ? `<div style="margin-top:20px"><button class="btn danger sm" data-act="delete" data-id="${l.id}">Delete enquiry</button></div>` : ""}
  </div>
  ${isMobile() ? `<div class="dfoot">
    ${l.phone ? `<a class="btn" href="tel:+${l.phone}" data-act="call" data-id="${l.id}">${ICON.call} Call</a><button class="btn wa" data-act="wa" data-id="${l.id}">${ICON.wa} WhatsApp</button>` : ""}
    <button class="btn primary" data-act="log" data-id="${l.id}">Log</button></div>` : ""}`;
}

/* =====================================================================
   DIALOGS
   ===================================================================== */
const dlg = $("#dlg");
function showDialog(html){ dlg.innerHTML = html; if (!dlg.open) { pushOverlay("dlg"); dlg.showModal(); } }
function closeDialog(){ if (dlg.open) dlg.close(); }
dlg.addEventListener("close", () => popOverlay("dlg"));
const opts = (arr, cur) => arr.map(x => `<option ${x === cur ? "selected" : ""}>${esc(x)}</option>`).join("");
const kidRow = (k = {}) => `<div class="kid"><input type="text" placeholder="Child's name" value="${esc(k.name)}" class="kid-n"><input type="text" placeholder="Class" list="dl-classes" value="${esc(k.cls)}" class="kid-c"><button type="button" class="x" data-act="rm-kid" title="Remove">×</button></div>`;

function leadForm(id, pre){
  const l = id ? db.leads.find(x => x.id === id) : null;
  const s = db.settings, t = todayISO();
  const v = l || Object.assign({ date: t, type: "Admission", stage: "New", nextFollowUp: t, academicYear: s.academicYear, source: "", campaign: "", transport: "",
    assignedTo: focusName() || staffNames()[0] || "", children: [{}], name: "", email: "", location: "", notes: "", visitDate: "", visitTime: "" }, pre || {});
  if (!v.children || !v.children.length) v.children = [{}];
  const sources = [...new Set([...list(s.sources), v.source].filter(Boolean))];
  const staffL = [...new Set(["", ...staffNames(), v.assignedTo || ""])];
  showDialog(`<form method="dialog" id="leadform" novalidate>
  <div class="dlg-h"><b>${l ? "Edit enquiry" : "New admission enquiry"}</b><button type="button" class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="form">
    <label>Phone / WhatsApp *<input type="tel" name="phone" required value="${esc(l ? (fmtPhone(l.phone) || l.phoneRaw) : (pre && pre.phone) || "")}" placeholder="05X XXX XXXX"></label>
    <label>Enquiry date<input type="date" name="date" value="${v.date}"></label>
    <div class="full" id="dupwarn"></div>
    <label>Parent / contact name<input type="text" name="name" value="${esc(v.name)}"></label>
    <label>Email<input type="email" name="email" value="${esc(v.email)}"></label>
    <div class="full"><span class="flabel">Children</span><div id="kids">${v.children.map(kidRow).join("")}</div>
      <button type="button" class="btn sm" data-act="add-kid" style="margin-top:6px">+ Add child</button><datalist id="dl-classes">${list(s.classes).map(c => `<option value="${esc(c)}">`).join("")}</datalist></div>
    <label>Academic year<input type="text" name="academicYear" value="${esc(v.academicYear)}"></label>
    <label>Location / area<input type="text" name="location" value="${esc(v.location)}"></label>
    <label>Transport needed?<select name="transport">${[["", "Not asked"], ["Yes", "Yes"], ["No", "No"]].map(([a, b]) => `<option value="${a}" ${v.transport === a ? "selected" : ""}>${b}</option>`).join("")}</select></label>
    <label>Source<select name="source"><option value=""></option>${opts(sources, v.source)}</select></label>
    <label>Campaign<input type="text" name="campaign" value="${esc(v.campaign)}" list="dl-camp2" placeholder="optional"><datalist id="dl-camp2">${[...new Set(db.leads.map(x => x.campaign).filter(Boolean))].map(c => `<option value="${esc(c)}">`).join("")}</datalist></label>
    <label>Enquiry type<select name="type">${opts(["Admission", "Job", "Other"], v.type)}</select></label>
    <label>Assigned to<select name="assignedTo" ${can("assign") ? "" : "disabled"}>${staffL.map(x => `<option value="${esc(x)}" ${x === (v.assignedTo || "") ? "selected" : ""}>${esc(x) || "Unassigned"}</option>`).join("")}</select></label>
    <label>Stage<select name="stage">${opts(STAGE_NAMES, v.stage)}</select></label>
    <div class="full adm-only" id="odwarn">${l && isOverdue(l) ? overdueBanner(l, true) : ""}</div>
    <label class="adm-only">Next follow-up<input type="date" name="nextFollowUp" value="${v.nextFollowUp || ""}" ${fuMin()}>
      <span class="quick">${RESCHED.map(([d, lab]) => `<button type="button" class="btn sm" data-act="fresched" data-days="${d}">${lab}</button>`).join("")}</span>
      <span class="hint" id="fu-state" style="font-weight:500"></span></label>
    <label class="adm-only">Visit date<input type="date" name="visitDate" value="${v.visitDate || ""}"></label>
    <label class="adm-only">Visit time<select name="visitTime">${["", ...slotList()].map(x => `<option value="${esc(x)}" ${x === (v.visitTime || "") ? "selected" : ""}>${esc(x) || "Any time"}</option>`).join("")}</select></label>
    <div class="full" id="fuwarn"></div>
    <div class="full" id="typenote"></div>
    <label class="full">Notes / requirements<textarea name="notes" placeholder="Curriculum preference, siblings, fee questions…">${esc(v.notes)}</textarea></label>
    <div class="full" id="jobwarn"></div>
  </div></div>
  <div class="dlg-f"><button type="button" class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" type="submit">${l ? "Save changes" : "Save enquiry"}</button></div>
  </form>`);
  const f = $("#leadform");
  const checkDup = () => {
    const p = normPhone(f.phone.value); const d = p && db.leads.find(x => x.phone === p && x.id !== id);
    $("#dupwarn").innerHTML = d ? `<div class="warnbox">This number already exists: <b>${displayName(d)}</b> (${esc(d.stage)}, enquired ${fmtDate(d.date)}). <a href="#" data-act="open-dup" data-id="${d.id}">Open existing</a>${!id ? ` · or save to add as a repeat enquiry on that record.` : ""}</div>` : "";
  };
  const checkJob = () => {
    const isJ = f.type.value === "Admission" && isJobText([f.notes.value, f.name.value].join(" "));
    $("#jobwarn").innerHTML = isJ ? `<div class="warnbox">This looks like a <b>job enquiry</b>. <a href="#" data-act="mark-job">Mark as job enquiry</a></div>` : "";
  };
  f.phone.addEventListener("input", checkDup); f.notes.addEventListener("input", checkJob); f.name.addEventListener("input", checkJob); f.type.addEventListener("change", checkJob);
  checkDup(); checkJob();
  const checkPast = wirePastCheck(f.nextFollowUp, $("#fuwarn"));
  // job / other enquiries need no follow-up date or visit
  const syncType = () => {
    const adm = f.type.value === "Admission";
    f.querySelectorAll(".adm-only").forEach(e => { e.style.display = adm ? "" : "none"; });
    $("#typenote").innerHTML = adm ? "" : `<div class="note">${f.type.value === "Job" ? "Job enquiries need no follow-up date – just send the <b>HR reply</b> from the Job enquiries page." : "Other enquiries need no follow-up date."}</div>`;
  };
  const fuState = () => { $("#fu-state").textContent = f.nextFollowUp.value ? "" : "Not scheduled – it will show under Follow-ups → To schedule, never as overdue."; };
  f.type.addEventListener("change", syncType); f.nextFollowUp.addEventListener("input", fuState); f.nextFollowUp.addEventListener("change", fuState);
  syncType(); fuState();
  if (pre && typeof markFound === "function") markFound(f, pre);
  setTimeout(() => f.phone.focus(), 30);
  f.addEventListener("submit", e => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f).entries());
    const phone = normPhone(fd.phone);
    if (!phone) { toast("Please enter a phone number"); f.phone.focus(); return; }
    const followed = fd.type === "Admission" && !CLOSED.has(fd.stage);
    if (followed && l && isOverdue(l) && fd.nextFollowUp === l.nextFollowUp) {
      toast("This enquiry is overdue – choose a new follow-up date or “Not scheduled”"); $("#odwarn").scrollIntoView({ block: "center" }); $("#odwarn .warnbox")?.classList.add("pulse"); return;
    }
    if (followed && pastBlocked(fd.nextFollowUp)) { checkPast(); toast(PAST_MSG); f.nextFollowUp.focus(); return; }
    const children = [...f.querySelectorAll(".kid")].map(r => ({ id: uid(), name: r.querySelector(".kid-n").value.trim(), cls: normCls(r.querySelector(".kid-c").value) })).filter(k => k.name || k.cls);
    const now = new Date().toISOString();
    let created = null;
    const data = { date: fd.date || t, name: fd.name.trim(), email: fd.email.trim(), phone, phoneRaw: fd.phone.trim(), children, academicYear: fd.academicYear.trim(),
      location: fd.location.trim(), transport: fd.transport, source: fd.source, campaign: fd.campaign.trim(), type: fd.type,
      assignedTo: can("assign") ? fd.assignedTo : (l ? l.assignedTo : meName()),
      nextFollowUp: followed ? fd.nextFollowUp : "", visitDate: fd.type === "Admission" ? fd.visitDate : "", visitTime: fd.type === "Admission" ? fd.visitTime : "", notes: fd.notes.trim() };
    if (l) {
      const to = fd.stage;
      const kidStr = c => (c || []).map(k => (k.name || "") + "/" + (k.cls || "")).join(",");
      const changed = Object.keys(data).filter(k => k !== "phoneRaw" && (k === "children" ? kidStr(l.children) !== kidStr(data.children) : String(l[k] ?? "") !== String(data[k] ?? "")));
      if (changed.length) logAct("Enquiry edited", l, "Changed: " + changed.join(", "));
      Object.assign(l, data); touch(l);
      if (to !== l.stage) {
        if (to === "Lost") { save(); render(); lostReasonForm([l.id], r => changeStage(l, "Lost", { reason: r })); return; }
        changeStage(l, to, { silent: true });
      }
    } else {
      const dup = db.leads.find(x => x.phone === phone);
      if (dup) {
        logAct("Repeat enquiry", dup, classesOf({ children }));
        dup.history.push({ id: uid(), at: now, date: data.date, kind: "note", by: meName(), note: `Repeat enquiry${classesOf({ children }) ? ` for ${classesOf({ children })}` : ""}${data.notes ? ": " + data.notes : ""}` });
        children.forEach(k => { if (!dup.children.some(c => c.cls === k.cls && (c.name || "") === (k.name || ""))) dup.children.push(k); });
        if (!isOpen(dup) && dup.stage !== "Admitted") { changeStage(dup, "New", { silent: true }); }
        dup.nextFollowUp = t; touch(dup); drawerId = dup.id;
      } else {
        const nl = migrateLead(Object.assign({ id: uid(), createdAt: (pre && pre._at) || now, stage: fd.stage, history: [{ id: uid(), at: now, date: data.date, kind: "note", by: meName(), note: pre && pre._found ? "Enquiry captured from a pasted message" : "Enquiry captured" }] }, data));
        db.leads.push(nl); touch(nl); drawerId = nl.id; created = nl;
        logAct("Enquiry added", nl, [classesOf(nl), nl.source, nl.assignedTo ? "\u2192 " + nl.assignedTo : ""].filter(Boolean).join(" · "));
      }
    }
    save(); closeDialog(); render(); if (drawerId) openDrawer(drawerId);
    toast(l ? "Saved" : "Enquiry added");
    if (created && created.phone && !CLOSED.has(created.stage) && typeof offerFirstReply === "function") setTimeout(() => offerFirstReply(created), 250);
  });
}

function logForm(id, channel){
  const l = db.leads.find(x => x.id === id); if (!l) return;
  const t = todayISO();
  const nr = consecutiveNoAnswer(l);
  showDialog(`<form method="dialog" id="logform" novalidate>
  <div class="dlg-h"><b>Log follow-up · ${displayName(l)}</b><button type="button" class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="form">
    <label>Date<input type="date" name="date" value="${t}"></label>
    <label>Channel<select name="channel">${CHANNELS.map(c => `<option ${c === (channel || "Call") ? "selected" : ""}>${c}</option>`).join("")}</select></label>
    <label class="full">Outcome<select name="outcome">${OUTCOMES.map(o => `<option>${o}</option>`).join("")}</select></label>
    <label class="full">What was discussed?<textarea name="note" placeholder="e.g. Interested in KG1, wants fee details, will visit Saturday"></textarea></label>
    <label>Move to stage<select name="stage">${STAGE_NAMES.map(s => `<option ${s === l.stage ? "selected" : ""}>${s}</option>`).join("")}</select></label>
    <label id="lr-wrap" style="display:none">Lost reason<select name="lostReason"><option value=""></option>${opts(list(db.settings.lostReasons), l.lostReason)}</select></label>
    <label>Visit date<input type="date" name="visitDate" value="${l.visitDate || ""}"></label>
    <label>Visit time<select name="visitTime">${["", ...slotList()].map(x => `<option value="${esc(x)}" ${x === (l.visitTime || "") ? "selected" : ""}>${esc(x) || "Any time"}</option>`).join("")}</select></label>
    <div class="full" id="slotwarn"></div>
    ${l.type === "Admission" ? `<label class="full">Next follow-up<input type="date" name="next" value="${addDays(t, 2)}" ${fuMin()}>
      <div class="quick">${[[1, "Tomorrow"], [2, "+2 days"], [3, "+3 days"], [7, "1 week"], [30, "1 month"]].map(([n, lab]) => `<button type="button" class="btn sm" data-act="qnext" data-days="${n}">${lab}</button>`).join("")}<button type="button" class="btn sm" data-act="qnext" data-days="">Not scheduled</button></div></label>`
      : `<input type="hidden" name="next" value=""><div class="full note">${esc(l.type)} enquiries need no follow-up date.</div>`}
    <div class="full" id="fuwarn"></div>
    <div class="full">${nr >= 2 ? `<div class="warnbox">${nr} unanswered attempts so far. If this one is also unanswered, consider <b>Not Reachable</b>.</div>` : ""}</div>
  </div></div>
  <div class="dlg-f"><button type="button" class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" type="submit">Save follow-up</button></div>
  </form>`);
  const f = $("#logform");
  const lrSync = () => { $("#lr-wrap").style.display = f.stage.value === "Lost" ? "" : "none"; };
  const slotSync = () => {
    const d = f.visitDate.value, tm = f.visitTime.value, cap = +db.settings.slotCapacity || 1;
    const n = d && tm ? slotLoad(d, tm, l.id) : 0;
    $("#slotwarn").innerHTML = d && tm && n >= cap ? `<div class="warnbox">${fmtDate(d)} ${esc(tm)} already has ${n} famil${n === 1 ? "y" : "ies"} booked (limit ${cap}).</div>` : (d && !db.settings.visitDays.includes(dowOf(d)) ? `<div class="warnbox">${DOW[dowOf(d)]} is not a visit day.</div>` : "");
  };
  const sync = () => {
    const o = f.outcome.value, st = l.stage;
    if (NO_ANSWER.has(o)) { if (["New", "Contacted"].includes(st)) f.stage.value = "No Response"; f.next.value = addDays(t, 1); }
    else if (o === "Answered") { if (["New", "No Response"].includes(st)) f.stage.value = "Contacted"; f.next.value = addDays(t, 3); }
    else if (o === "Wrong number") { f.stage.value = "Invalid"; f.next.value = ""; }
    else if (o === "Visited campus") { f.stage.value = "Visited"; f.visitDate.value = f.date.value; f.next.value = addDays(t, 2); }
    else if (o === "Message sent") { f.next.value = addDays(t, 2); }
    lrSync();
  };
  f.outcome.addEventListener("change", sync);
  f.stage.addEventListener("change", () => {
    if (CLOSED.has(f.stage.value)) f.next.value = "";
    if (f.stage.value === "Visit Scheduled" && !f.visitDate.value) f.visitDate.focus();
    lrSync();
  });
  f.visitDate.addEventListener("change", () => { slotSync(); if (f.visitDate.value && (RANK[f.stage.value] ?? 0) < 3 && !CLOSED.has(f.stage.value)) f.stage.value = "Visit Scheduled"; });
  f.visitTime.addEventListener("change", slotSync);
  if (channel === "WhatsApp") { f.outcome.value = "Message sent"; sync(); }
  const checkPast = wirePastCheck(f.next, $("#fuwarn"));
  f.addEventListener("submit", e => {
    e.preventDefault();
    if (!CLOSED.has(f.stage.value) && pastBlocked(f.next.value)) { checkPast(); toast(PAST_MSG); f.next.focus(); return; }
    const fd = Object.fromEntries(new FormData(f).entries());
    if (fd.stage === "Lost" && !fd.lostReason) { toast("Please choose why this lead was lost"); f.lostReason.focus(); return; }
    const now = new Date().toISOString();
    logAct("Follow-up logged", l, [fd.channel, fd.outcome, fd.stage !== l.stage ? `${l.stage} \u2192 ${fd.stage}` : "", fd.note.trim().slice(0, 100)].filter(Boolean).join(" · "));
    l.history.push({ id: uid(), at: now, date: fd.date || t, kind: "followup", channel: fd.channel, outcome: fd.outcome, note: fd.note.trim(), stageFrom: l.stage, stageTo: fd.stage, by: meName() });
    if (fd.stage === "Lost") l.lostReason = fd.lostReason;
    if (fd.stage === "Not Reachable" && !l.lostReason) l.lostReason = "No response";
    if (fd.stage === "Fee Paid" && !l.feePaidDate) l.feePaidDate = fd.date || t;
    l.stage = fd.stage; l.visitDate = fd.visitDate; l.visitTime = fd.visitTime; l.nextFollowUp = CLOSED.has(fd.stage) || l.type !== "Admission" ? "" : fd.next;
    touch(l); save(); closeDialog(); render();
    toast(l.nextFollowUp ? `Logged · next follow-up ${fmtDate(l.nextFollowUp)}` : "Logged");
  });
}

function defaultTpl(l){
  if (l.type !== "Admission") return "Job reply";
  return { "Visit Scheduled": l.visitDate === addDays(todayISO(), 1) ? "Visit reminder" : "Visit confirmation", "Next Year": "Next year", "Visited": "Thank you after visit",
    "No Response": "No response", "Application": "Documents pending", "Assessment": "Documents pending", "Documents": "Documents pending" }[l.stage] || "First reply";
}
function waForm(id, tplName){
  const l = db.leads.find(x => x.id === id); if (!l) return;
  const tpls = db.settings.tpl;
  const def = tplName && tpls[tplName] ? tplName : defaultTpl(l);
  showDialog(`<div class="dlg-h"><b>WhatsApp · ${displayName(l)}</b><button class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="form">
    <label class="full">Template<select id="wa-t">${Object.keys(tpls).map(k => `<option ${k === def ? "selected" : ""}>${esc(k)}</option>`).join("")}</select></label>
    <label class="full">Message (you can edit)<textarea id="wa-m" style="min-height:130px">${esc(fillTpl(tpls[def] || "", l))}</textarea></label>
    <p class="hint full" style="margin:0">Opens WhatsApp with this message for ${esc(fmtPhone(l.phone))}. You still press Send in WhatsApp. It is then logged as a follow-up.</p>
  </div></div>
  <div class="dlg-f"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="wa-send" data-id="${l.id}">Open WhatsApp</button></div>`);
  $("#wa-t").addEventListener("change", e => { $("#wa-m").value = fillTpl(tpls[e.target.value] || "", l); });
}

function bookVisitForm(id, date, time){
  const t = todayISO();
  const pick = !id;
  const l = id && db.leads.find(x => x.id === id);
  const d0 = date || (l && l.visitDate >= t ? l.visitDate : "") || (() => { let d = addDays(t, 1); for (let i = 0; i < 14 && !db.settings.visitDays.includes(dowOf(d)); i++) d = addDays(d, 1); return d; })();
  const cands = db.leads.filter(x => x.type === "Admission" && isOpen(x)).sort((a, b) => plainName(a).localeCompare(plainName(b)));
  showDialog(`<form method="dialog" id="bookform">
  <div class="dlg-h"><b>Book school visit${l ? ` · ${displayName(l)}` : ""}</b><button type="button" class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="form">
    ${pick ? `<label class="full">Family<input type="search" id="bk-q" placeholder="Search name or phone…"><select name="lead" size="6" required style="margin-top:6px">${cands.map(x => `<option value="${x.id}">${esc(plainName(x))} · ${esc(fmtPhone(x.phone))}${classesOf(x) ? " · " + esc(classesOf(x)) : ""}</option>`).join("")}</select></label>` : ""}
    <label>Date<input type="date" name="date" value="${d0}" min="${t}" required></label>
    <label>Time<select name="time"></select></label>
    <div class="full" id="bk-warn"></div>
    <label class="full" style="flex-direction:row;align-items:center;gap:8px;font-weight:500"><input type="checkbox" name="wa" checked> Send WhatsApp confirmation after saving</label>
  </div></div>
  <div class="dlg-f"><button type="button" class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" type="submit">Book visit</button></div></form>`);
  const f = $("#bookform"), cap = +db.settings.slotCapacity || 1;
  const fillTimes = () => {
    const d = f.date.value, cur = f.time.value || time || (l && l.visitTime) || "";
    f.time.innerHTML = ["", ...slotList()].map(s => { const n = d ? slotLoad(d, s, id) : 0; const full = s && n >= cap; return `<option value="${esc(s)}" ${s === cur ? "selected" : ""}>${s || "Any time"}${s ? ` (${n}/${cap}${full ? " full" : ""})` : ""}</option>`; }).join("");
    $("#bk-warn").innerHTML = d && !db.settings.visitDays.includes(dowOf(d)) ? `<div class="warnbox">${DOW[dowOf(d)]} is not a visit day.</div>` : "";
  };
  f.date.addEventListener("change", fillTimes); fillTimes();
  if (pick) $("#bk-q").addEventListener("input", e => { const q = e.target.value.toLowerCase(), qd = q.replace(/\D/g, ""); [...f.lead.options].forEach(o => { const x = db.leads.find(y => y.id === o.value); o.hidden = !!q && !(plainName(x).toLowerCase().includes(q) || (qd.length >= 3 && x.phone.includes(qd))); }); });
  f.addEventListener("submit", e => {
    e.preventDefault();
    const L = l || db.leads.find(x => x.id === f.lead.value); if (!L) { toast("Choose a family"); return; }
    const d = f.date.value, tm = f.time.value;
    if (tm && slotLoad(d, tm, L.id) >= cap && !confirm("That slot is full. Book anyway?")) return;
    L.visitDate = d; L.visitTime = tm;
    logAct("Visit booked", L, `${fmtDate(d)}${tm ? " " + tm : ""}`);
    L.history.push({ id: uid(), at: new Date().toISOString(), date: t, kind: "note", by: meName(), note: `Visit booked for ${fmtDate(d)}${tm ? " " + tm : ""}` });
    if ((RANK[L.stage] ?? 0) < 3 || L.stage === "Next Year") changeStage(L, "Visit Scheduled", { silent: true });
    const before = addDays(d, -1); L.nextFollowUp = before >= t ? before : d;
    touch(L); save(); closeDialog(); render();
    toast(`Visit booked · ${fmtDate(d)}${tm ? " " + tm : ""}`);
    if (f.wa.checked && L.phone) waForm(L.id, "Visit confirmation");
  });
}

function lostReasonForm(ids, cb){
  showDialog(`<form method="dialog" id="lostform"><div class="dlg-h"><b>Why was this lead lost?</b><button type="button" class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><div class="form"><label class="full">Reason<select name="r" required><option value=""></option>${opts(list(db.settings.lostReasons), "")}</select></label>
  <p class="hint full" style="margin:0">${ids.length > 1 ? `Applies to ${ids.length} enquiries. ` : ""}Lost reasons show up in Reports, so you can see why families choose other schools.</p></div></div>
  <div class="dlg-f"><button type="button" class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" type="submit">Mark as lost</button></div></form>`);
  $("#lostform").addEventListener("submit", e => { e.preventDefault(); const r = e.target.r.value; if (!r) return; closeDialog(); cb(r); });
}

function dailyListsForm(){
  const S = staff();
  const rows = (S.length ? S : [{ name: "", phone: "", email: "" }]).map(s => {
    const L = myLists(s.name); const txt = dailyText(s.name);
    return `<tr><td><b>${esc(s.name || "Everyone")}</b><div class="hint">${L.overdue.length} overdue · ${L.today.length} today · ${L.visitsToday.length} visits</div></td>
      <td><div class="acts"><a class="btn sm wa" target="_blank" rel="noopener" href="${waLink(s.phone, txt)}">WhatsApp${s.phone ? "" : " (choose chat)"}</a>
      ${s.email ? `<a class="btn sm" href="mailto:${esc(s.email)}?subject=${encodeURIComponent("Admission follow-ups " + fmtDate(todayISO()))}&body=${encodeURIComponent(txt)}">Email</a>` : ""}
      <button class="btn sm" data-act="copy-text" data-who="${esc(s.name)}">Copy</button></div></td></tr>`;
  }).join("");
  showDialog(`<div class="dlg-h"><b>Daily follow-up lists</b><button class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><p class="hint" style="margin-top:0">${syncOn() ? "With the Google Sheet connected, each staff member with an email also gets this list automatically at 7 AM." : "Send each person their list for today. Connect the Google Sheet (Settings) to email these automatically every morning."} Add phone numbers and emails in Settings → Staff.</p>
  <table class="rep">${rows}</table></div>
  <div class="dlg-f"><button class="btn" data-act="close-dlg">Close</button></div>`);
}

/* ----- bulk WhatsApp sender ----- */
function bulkStart(ids, tplName){
  const leads = ids.map(id => db.leads.find(l => l.id === id)).filter(l => l && l.phone);
  if (!leads.length) { toast("None of these have a phone number"); return; }
  const name = tplName && db.settings.tpl[tplName] ? tplName : defaultTpl(leads[0]);
  bulk = { ids: leads.map(l => l.id), i: 0, sent: 0, tplName: name, text: db.settings.tpl[name] };
  renderBulk();
}
function renderBulk(){
  const b = bulk; if (!b) return;
  const done = b.i >= b.ids.length;
  const l = !done && db.leads.find(x => x.id === b.ids[b.i]);
  showDialog(`<div class="dlg-h"><b>Bulk WhatsApp · ${b.ids.length} families</b><button class="x" data-act="bulk-close">×</button></div>
  <div class="dlg-b">${done ? `<p style="font-size:15px">✅ Done. ${b.sent} message${b.sent === 1 ? "" : "s"} opened and logged.</p>` : `
    <div class="form">
      <label>Template<select data-bulk-tpl>${Object.keys(db.settings.tpl).map(k => `<option ${k === b.tplName ? "selected" : ""}>${esc(k)}</option>`).join("")}</select></label>
      <div class="progress"><span>${b.i + 1} of ${b.ids.length}</span><div class="track"><div class="fill" style="width:${b.i / b.ids.length * 100}%;background:var(--ok)"></div></div></div>
      <label class="full">Message template (placeholders are filled for each family)<textarea data-bulk-text style="min-height:90px">${esc(b.text)}</textarea></label>
      <div class="full"><span class="flabel">Next: ${displayName(l)} · ${esc(fmtPhone(l.phone))}</span><div class="last" id="bulk-prev" style="white-space:pre-wrap;margin-top:4px">${esc(fillTpl(b.text, l))}</div></div>
    </div>
    <p class="hint">WhatsApp opens one chat at a time. Press Send there, come back here, and click again for the next family.</p>`}</div>
  <div class="dlg-f">${done ? `<button class="btn primary" data-act="bulk-close">Close</button>` : `<button class="btn" data-act="bulk-skip">Skip</button><button class="btn primary wa-solid" data-act="bulk-send">Open WhatsApp for ${esc(plainName(l))}</button>`}</div>`);
}

/* ---------- notifications ---------- */
function notify(title, body){
  try { if ("Notification" in window && Notification.permission === "granted") new Notification(title, { body, icon: "icon.svg" }); } catch(e){}
}
function notifyDue(force){
  const t = todayISO();
  if (!force && local.notifiedDay === t) return;
  const L = myLists(focusName());
  const n = L.overdue.length + L.today.length;
  if (!n && !L.visitsToday.length && !force) return;
  notify(`${db.settings.schoolName}: ${n} follow-up${n === 1 ? "" : "s"} due`, `${L.overdue.length} overdue · ${L.today.length} due today · ${L.visitsToday.length} visits today`);
  local.notifiedDay = t; saveLocal();
}

/* =====================================================================
   EVENTS
   ===================================================================== */
document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const id = el.dataset.id, act = el.dataset.act;
  const lead = id && db.leads.find(x => x.id === id);
  if (el.tagName === "A" && el.getAttribute("href") === "#") e.preventDefault();
  if (!can("edit") && EDIT_ACTS.has(act)) { e.preventDefault(); toast("Your role is view-only"); return; }
  if (act === "theme") { applyTheme(el.dataset.t); return; }
  if (act === "fresched") {           // quick date buttons inside a form
    if (!can("edit")) return;
    const form = el.closest("form"), input = form && (form.elements.nextFollowUp || form.elements.next);
    if (!input) return;
    input.value = reschedDate(el.dataset.days);
    input.dispatchEvent(new Event("input")); input.dispatchEvent(new Event("change"));
    const od = form.querySelector("#odwarn"); if (od && od.innerHTML) od.innerHTML = `<div class="note">New follow-up: <b>${input.value ? fmtDate(input.value) : "Not scheduled"}</b> – save to keep it.</div>`;
    return;
  }
  if (act === "resched") {            // quick buttons on cards and in the details panel – saved at once
    if (!can("edit")) { toast("Your role is view-only"); return; }
    const l = db.leads.find(x => x.id === el.dataset.id); if (!l) return;
    const nd = reschedDate(el.dataset.days);
    logAct("Follow-up rescheduled", l, `${l.nextFollowUp ? fmtDate(l.nextFollowUp) : "Not scheduled"} → ${nd ? fmtDate(nd) : "Not scheduled"}`);
    l.nextFollowUp = nd; touch(l); save(); render();
    toast(nd ? `Follow-up set for ${fmtDate(nd)}` : "Marked Not scheduled – it's in Follow-ups → To schedule");
    return;
  }
  if (typeof pasteAction === "function" && pasteAction(act, el)) return;
  if (typeof reportAction === "function" && reportAction(act, el)) return;
  switch (act) {
    case "nav": ui.view = el.dataset.view; closeDrawer(); render(); window.scrollTo(0, 0); break;
    case "goto": Object.assign(ui, { stage: "", source: "", q: "", owner: "", heat: "" }, JSON.parse(el.dataset.f)); ui.view = "leads"; render(); break;
    case "new": leadForm(); break;
    case "edit": leadForm(id); break;
    case "open": openDrawer(id); break;
    case "open-dup": closeDialog(); openDrawer(id); break;
    case "close-drawer": closeDrawer(); break;
    case "close-dlg": closeDialog(); break;
    case "log": logForm(id); break;
    case "call": setTimeout(() => logForm(id, "Call"), 400); break;
    case "wa": waForm(id, el.dataset.tpl); break;
    case "wa-send": {
      const msg = $("#wa-m").value, tplName = $("#wa-t").value;
      window.open(waLink(lead.phone, msg), "_blank", "noopener");
      closeDialog();
      if (tplName === "Job reply" && lead.type !== "Admission") {
        lead.history.push({ id: uid(), at: new Date().toISOString(), date: todayISO(), kind: "followup", channel: "WhatsApp", outcome: "Message sent", note: "HR reply sent", by: meName() }); logAct("WhatsApp sent", lead, "HR reply");
        changeStage(lead, "Closed", { silent: true }); save(); render(); toast("HR reply logged and enquiry closed");
      } else {
        logForm(id, "WhatsApp");
        const f = $("#logform"); if (f) f.note.value = `WhatsApp (${tplName}): ${msg.slice(0, 120)}${msg.length > 120 ? "…" : ""}`;
      }
      break; }
    case "book": bookVisitForm(id, el.dataset.date, el.dataset.time); break;
    case "visited":
      lead.history.push({ id: uid(), at: new Date().toISOString(), date: todayISO(), kind: "followup", channel: "Visit", outcome: "Visited campus", note: "Attended school visit", by: meName(), stageFrom: lead.stage, stageTo: "Visited" }); logAct("Visit attended", lead);
      lead.stage = "Visited"; lead.nextFollowUp = addDays(todayISO(), 2); touch(lead); save(); render(); toast("Marked as visited – follow up in 2 days"); break;
    case "noshow":
      lead.history.push({ id: uid(), at: new Date().toISOString(), date: todayISO(), kind: "followup", channel: "Visit", outcome: "Other", note: `No-show for visit on ${fmtDate(lead.visitDate)}`, by: meName(), stageFrom: lead.stage, stageTo: "Interested" }); logAct("Visit no-show", lead, fmtDate(lead.visitDate));
      lead.stage = "Interested"; lead.visitDate = ""; lead.visitTime = ""; lead.nextFollowUp = todayISO(); touch(lead); save(); render(); toast("No-show recorded – call to reschedule"); break;
    case "cal": ui.calWeek = el.dataset.d === "0" ? 0 : ui.calWeek + +el.dataset.d; render(); break;
    case "qnext": { const f = el.closest("form"); f.next.value = el.dataset.days ? addDays(todayISO(), +el.dataset.days) : ""; f.next.dispatchEvent(new Event("input")); break; }
    case "snooze": logAct("Follow-up moved", lead, "to tomorrow"); lead.nextFollowUp = addDays(todayISO(), 1); touch(lead); save(); render(); toast("Moved to tomorrow"); break;
    case "stage": changeStage(lead, el.dataset.stage); break;
    case "to-adm": logAct("Type changed", lead, "Job \u2192 Admission"); lead.type = "Admission"; changeStage(lead, "New", { silent: true }); lead.nextFollowUp = todayISO(); touch(lead); save(); render(); toast("Moved to admission enquiries"); break;
    case "to-job": logAct("Type changed", lead, "Admission \u2192 Job"); lead.type = "Job"; touch(lead); save(); render(); toast("Moved to job enquiries"); break;
    case "mark-job": { const f = $("#leadform"); f.type.value = "Job"; f.type.dispatchEvent(new Event("change")); break; }
    case "add-kid": $("#kids").insertAdjacentHTML("beforeend", kidRow()); break;
    case "rm-kid": { const rows = document.querySelectorAll("#kids .kid"); if (rows.length > 1) el.closest(".kid").remove(); else el.closest(".kid").querySelectorAll("input").forEach(i => i.value = ""); break; }
    case "delete": if (confirm("Delete this enquiry permanently? This cannot be undone.")) { logAct("Enquiry deleted", lead, fmtPhone(lead.phone)); db.leads = db.leads.filter(x => x.id !== id); db.dirty = db.dirty.filter(x => x !== id); db.deletedQ.push(id); closeDrawer(); save(); render(); toast("Deleted"); } break;
    case "sel": e.stopPropagation(); if (el.checked) sel.add(id); else sel.delete(id); render(); break;
    case "sel-all": { const L = filteredLeads(); if (el.checked) L.forEach(l => sel.add(l.id)); else L.forEach(l => sel.delete(l.id)); render(); break; }
    case "sel-clear": sel.clear(); render(); break;
    case "bulk-sel": bulkStart([...sel]); break;
    case "bulk-ids": bulkStart(el.dataset.ids.split(","), el.dataset.tpl); break;
    case "bulk-send": {
      const l = db.leads.find(x => x.id === bulk.ids[bulk.i]);
      const msg = fillTpl(bulk.text, l);
      window.open(waLink(l.phone, msg), "_blank", "noopener");
      l.history.push({ id: uid(), at: new Date().toISOString(), date: todayISO(), kind: "followup", channel: "WhatsApp", outcome: "Message sent", note: `Bulk message (${bulk.tplName})`, by: meName() }); logAct("WhatsApp sent", l, `Bulk: ${bulk.tplName}`);
      if (bulk.tplName === "Job reply" && l.type !== "Admission") changeStage(l, "Closed", { silent: true });
      else if (isOpen(l) && (!l.nextFollowUp || l.nextFollowUp <= todayISO())) l.nextFollowUp = addDays(todayISO(), 2);
      touch(l); save(); bulk.i++; bulk.sent++; renderBulk(); break; }
    case "bulk-skip": bulk.i++; renderBulk(); break;
    case "bulk-close": bulk = null; closeDialog(); sel.clear(); render(); break;
    case "daily-lists": dailyListsForm(); break;
    case "copy-text": navigator.clipboard?.writeText(dailyText(el.dataset.who)).then(() => toast("Copied")); break;
    case "notif":
      if (!("Notification" in window)) { toast("This browser doesn't support notifications"); break; }
      if (Notification.permission === "granted") { notifyDue(true); break; }
      Notification.requestPermission().then(p => { if (p === "granted") { notifyDue(true); toast("Reminders turned on"); } else toast("Notifications were blocked in the browser"); render(); });
      break;
    case "print": window.print(); break;
    case "export-xlsx": exportXLSX(); logAct("Exported", null, `Excel, ${db.leads.length} enquiries`); save(); break;
    case "export-csv": exportCSV(); logAct("Exported", null, `CSV, ${db.leads.length} enquiries`); save(); break;
    case "backup": logAct("Backup downloaded", null, `${db.leads.length} enquiries`); save(); download(`enquiry-backup-${todayISO()}.json`, new Blob([JSON.stringify({ leads: db.leads, settings: db.settings }, null, 1)], { type: "application/json" })); break;
    case "restore": $("#f-restore").click(); break;
    case "import": $("#f-import").click(); break;
    case "clear-all":
      if (confirm(`Delete ALL ${db.leads.length} enquiries${syncOn() ? " from the shared Google Sheet for everyone" : " from this browser"}? Download a backup first. This cannot be undone.`)) {
        logAct("All enquiries deleted", null, `${db.leads.length} enquiries`); db.deletedQ.push(...db.leads.map(l => l.id)); db.leads = []; db.dirty = []; save(); render(); toast("All enquiries deleted");
      } break;
    case "sync-connect": connectServer($("#sync-url").value); break;
    case "sync-now": await pull(); await flush(); toast("Synced"); break;
    case "logout": closeDialog(); logout(); break;
    case "change-pw": passwordForm(); break;
    case "login-local":
      if (confirm("Use the tracker on this device only, without signing in? Enquiries will not be shared with other staff. You can connect again from Settings.")) {
        local.syncUrl = ""; local.session = null; saveLocal(); hideLogin(); setSync("local"); render();
      } break;
    case "more": moreSheet(); break;
    case "nav-close": closeDialog(); ui.view = el.dataset.view; closeDrawer(); render(); window.scrollTo(0, 0); break;
    case "toggle-filters": ui.filtersOpen = !ui.filtersOpen; render(); break;
    case "open-act": if (db.leads.some(l => l.id === id)) openDrawer(id); else toast("That enquiry is no longer available"); break;
    case "act-refresh": actCache.key = ""; actCache.rows = null; render(); break;
    case "act-export": {
      const rows = (activityRows() || []).map(r => ({ When: new Date(r.at).toLocaleString(), User: r.user, Action: r.type, Enquiry: r.lead, Details: r.details }));
      if (!rows.length) { toast("Nothing to export"); break; }
      if (typeof XLSX !== "undefined") { const ws = XLSX.utils.json_to_sheet(rows), wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Activity"); XLSX.writeFile(wb, `activity-log-${todayISO()}.xlsx`); }
      logAct("Exported", null, `Activity log, ${rows.length} entries`); save(); break; }
    case "user-edit": userForm(el.dataset.u); break;
    case "rr-add": db.settings.reportRecipients = [...(db.settings.reportRecipients || []), { email: "", freq: "daily", sections: ["all"] }]; settingsChanged(); render(); setTimeout(() => { const ins = document.querySelectorAll('[data-rr="email"]'); ins[ins.length - 1]?.focus(); }, 30); break;
    case "rr-del": { const R = (db.settings.reportRecipients || []).slice(); const gone = R.splice(+el.dataset.i, 1)[0]; db.settings.reportRecipients = R; logAct("Report email removed", null, gone && gone.email); settingsChanged(); render(); break; }
    case "rr-test": {
      const r = (db.settings.reportRecipients || [])[+el.dataset.i];
      if (!r || !r.email) { toast("Enter the email address first"); break; }
      el.disabled = true; el.textContent = "Sending…";
      try { await flush(); await api("sendTestReport", { email: r.email, freq: r.freq === "weekly" ? "weekly" : "daily", sections: r.sections }); toast(`Test report sent to ${r.email}`); logAct("Test report sent", null, r.email); save(); }
      catch (err) { alert("Could not send: " + err.message); }
      el.disabled = false; el.textContent = "Send test"; break; }
    case "qr-copy": { const t = $("#qr-link").textContent; if (t.startsWith("http")) navigator.clipboard?.writeText(t).then(() => toast("Link copied")); break; }
    case "qr-dl": {
      const c = $("#qr canvas"), img = $("#qr img");
      const url = c ? c.toDataURL("image/png") : img && img.src;
      if (!url) { toast("Enter the form web address first"); break; }
      const a = document.createElement("a"); a.href = url; a.download = `enquiry-qr-${($("#qr-src").value + "-" + $("#qr-c").value).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.png`; a.click(); break; }
    case "form-test": {
      const link = formLink($("#qr-src").value, $("#qr-c").value.trim()) || `enquiry.html?src=${encodeURIComponent($("#qr-src").value)}`;
      window.open(link, "_blank", "noopener"); break; }
  }
});
document.addEventListener("input", e => {
  const el = e.target;
  if (el.dataset.ui === "q" || el.dataset.ui === "actQ") { const k = el.dataset.ui; ui[k] = el.value; const pos = el.selectionStart; render(); const n = document.querySelector(`[data-ui="${k}"]`); if (n) { n.focus(); n.setSelectionRange(pos, pos); } return; }
  if (el.dataset.set && el.type !== "checkbox") { db.settings[el.dataset.set] = el.type === "number" ? +el.value : el.value; settingsChanged(); if (el.dataset.set === "schoolName") $("#brand").innerHTML = `${esc(el.value)}<small>Admission enquiries</small>`; if (el.dataset.set === "formUrl") drawQR(); }
  if (el.dataset.tpl) { db.settings.tpl[el.dataset.tpl] = el.value; settingsChanged(); }
  if (el.dataset.rr === "email") rrUpdate(el);
  if (el.dataset.seat != null) { const v = parseInt(el.value, 10); if (v > 0) db.settings.seats[el.dataset.seat] = v; else delete db.settings.seats[el.dataset.seat]; settingsChanged(); }
  if (el.hasAttribute("data-bulk-text")) { bulk.text = el.value; const l = db.leads.find(x => x.id === bulk.ids[bulk.i]); $("#bulk-prev").textContent = fillTpl(bulk.text, l); }
  if (el.id === "qr-c") drawQR();
});
document.addEventListener("change", e => {
  const el = e.target;
  if (!can("edit") && (el.dataset.field || el.dataset.doc || el.dataset.bulk || el.dataset.prob != null || el.dataset.seat != null)) { toast("Your role is view-only"); render(); return; }
  if (typeof reportChange === "function" && reportChange(el)) return;
  if (el.dataset.rr) { rrUpdate(el); if (el.dataset.rr !== "email") render(); return; }
  if (el.dataset.ui && el.dataset.ui !== "q" && el.dataset.ui !== "actQ") { ui[el.dataset.ui] = el.value; render(); return; }
  if (el.dataset.set) { db.settings[el.dataset.set] = el.type === "checkbox" ? el.checked : el.type === "number" ? +el.value : el.value; settingsChanged(); if (["counsellors", "classes", "visitSlots"].includes(el.dataset.set)) renderBadges(); }
  if (el.dataset.vday != null) { const d = +el.dataset.vday; db.settings.visitDays = el.checked ? [...new Set([...db.settings.visitDays, d])].sort() : db.settings.visitDays.filter(x => x !== d); settingsChanged(); }
  if (el.dataset.seat != null) render();
  if (el.id === "qr-src") drawQR();
  if (el.id === "theme" || el.id === "theme2") { applyTheme(el.value); return; }
  if (el.id === "me" || el.id === "me2") { local.me = el.value; saveLocal(); render(); }
  if (el.hasAttribute("data-bulk-tpl")) { bulk.tplName = el.value; bulk.text = db.settings.tpl[el.value]; renderBulk(); }
  if (el.dataset.bulk) {
    const v = el.value; if (!v) return;
    const leads = [...sel].map(id => db.leads.find(l => l.id === id)).filter(Boolean);
    if (el.dataset.bulk === "assign") { leads.forEach(l => { l.assignedTo = v; touch(l); logAct("Assigned", l, v); }); save(); toast(`Assigned ${leads.length} to ${v}`); render(); }
    if (el.dataset.bulk === "stage") {
      if (v === "Lost") lostReasonForm(leads.map(l => l.id), r => { leads.forEach(l => changeStage(l, v, { silent: true, reason: r })); save(); render(); toast(`${leads.length} marked lost`); });
      else { leads.forEach(l => changeStage(l, v, { silent: true })); save(); render(); toast(`Moved ${leads.length} to ${v}`); }
    }
    el.value = "";
  }
  if (el.dataset.field && drawerId) {
    const l = db.leads.find(x => x.id === drawerId); const f = el.dataset.field;
    if (f === "nextFollowUp" && isOpen(l) && pastBlocked(el.value)) { toast(PAST_MSG); el.value = l.nextFollowUp || ""; return; }
    const FL = { nextFollowUp: "Next follow-up", visitDate: "Visit date", visitTime: "Visit time", transport: "Transport", assessmentDate: "Assessment date", feePaidDate: "Fee paid date", feeAmount: "Fee amount" };
    logAct(f === "assignedTo" ? "Assigned" : "Details updated", l, f === "assignedTo" ? (el.value || "Unassigned") : `${FL[f] || f}: ${el.value || "cleared"}`);
    l[f] = el.value;
    if ((f === "visitDate" || f === "visitTime") && l.visitDate) {
      if (l.visitTime && slotLoad(l.visitDate, l.visitTime, l.id) >= (+db.settings.slotCapacity || 1)) toast("Note: that visit slot is already full");
      if ((RANK[l.stage] ?? 0) < 3 && isOpen(l)) changeStage(l, "Visit Scheduled", { silent: true });
    }
    if (f === "feePaidDate" && l.feePaidDate && (RANK[l.stage] ?? 0) < 8) { changeStage(l, "Fee Paid", { silent: true }); toast("Moved to Fee Paid"); }
    if (f === "assessmentDate" && l.assessmentDate && (RANK[l.stage] ?? 0) < 6) changeStage(l, "Assessment", { silent: true });
    touch(l); save(); render();
  }
  if (el.dataset.doc && drawerId) {
    const l = db.leads.find(x => x.id === drawerId); l.docs[el.dataset.doc] = el.checked; logAct(el.checked ? "Document received" : "Document unmarked", l, el.dataset.doc);
    const all = docList().every(d => l.docs[d]);
    if (el.checked && (RANK[l.stage] ?? 0) >= 5 && (RANK[l.stage] ?? 0) < 7) changeStage(l, "Documents", { silent: true });
    touch(l); save(); render(); if (all) toast("All documents received ✓");
  }
});
document.addEventListener("keydown", e => { if (e.key === "Escape" && drawerId && !dlg.open) closeDrawer(); });
dlg.addEventListener("click", e => { if (e.target === dlg) { if (bulk) { bulk = null; sel.clear(); render(); } closeDialog(); } });
$("#f-import").addEventListener("change", e => { const f = e.target.files[0]; if (f) readWorkbook(f); e.target.value = ""; });
$("#f-restore").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  f.text().then(txt => {
    const d = JSON.parse(txt); if (!Array.isArray(d.leads)) throw new Error("Not a backup file");
    if (!confirm(`Replace current data (${db.leads.length} enquiries) with the backup (${d.leads.length} enquiries)?`)) return;
    db.deletedQ.push(...db.leads.map(l => l.id).filter(id => !d.leads.some(x => x.id === id)));
    db.leads = d.leads.map(migrateLead); db.settings = mergeSettings(d.settings);
    db.leads.forEach(l => touch(l)); logAct("Backup restored", null, `${d.leads.length} enquiries`); settingsChanged(); render(); toast("Backup restored");
  }).catch(err => alert("Restore failed: " + err.message));
  e.target.value = "";
});

/* =====================================================================
   START
   ===================================================================== */
if (!db.seeded && !db.leads.length && !syncOn() && window.SEED_SHEET) {
  try { importRows(window.SEED_SHEET.header, window.SEED_SHEET.rows, true); } catch(e){ console.error(e); }
  db.seeded = true; save();
}
db.seeded = true;
delete local.syncKey;
applyTheme(currentTheme());
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => applyTheme(currentTheme()));
render();
setSync(syncOn() ? "ok" : "local");
if (syncOn()) { pull(true); }
else if (local.syncUrl) showLogin("login");
if (typeof handleShare === "function") handleShare();   // a message shared from WhatsApp (Android)
mq.addEventListener("change", () => render());
setInterval(() => { if (syncOn() && !document.hidden) pull(); }, 45000);
document.addEventListener("visibilitychange", () => { if (!document.hidden && syncOn()) pull(); });
setTimeout(() => notifyDue(false), 3000);
setInterval(() => notifyDue(false), 3600000);
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
