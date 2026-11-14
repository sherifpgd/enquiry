"use strict";
/* =====================================================================
   Paste / share an enquiry – loaded BEFORE app.js, uses its helpers at run time.
   Understands: WhatsApp copied messages and chat exports, the online form,
   Facebook / Instagram lead ads (text or CSV), emails, free text in English,
   Arabic and Malayalam. Several enquiries in one paste → a review table.
   ===================================================================== */

/* ---------- text clean-up ---------- */
function digitsToLatin(s){
  return String(s || "").replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 0x06F0));
}
const NUM_WORDS = { one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10, eleven:11, twelve:12,
  first:1, second:2, third:3, fourth:4, fifth:5, sixth:6, seventh:7, eighth:8, ninth:9, tenth:10, eleventh:11, twelfth:12 };
const numOf = w => { w = String(w || "").toLowerCase().replace(/(st|nd|rd|th)$/, ""); return /^\d+$/.test(w) ? +w : (NUM_WORDS[w] || NUM_WORDS[w + "th"] || null); };

/* ---------- classes: many ways of writing the same class ---------- */
function classFromWords(raw){
  const s = String(raw || "").toLowerCase().replace(/[._]/g, " ").replace(/\s+/g, " ").trim();
  let m;
  if (/^(pre ?-?kg|pre ?-?k|nursery|fs ?1|foundation stage 1|pre ?school|toddler)$/.test(s)) return "Pre-KG";
  if (/^(kg ?1|lkg|fs ?2|foundation stage 2|kg one|kindergarten 1|روضة أولى|الروضة الأولى|روضة اولى)$/.test(s)) return "KG1";
  if (/^(kg ?2|ukg|kg two|kindergarten 2|روضة ثانية|الروضة الثانية)$/.test(s)) return "KG2";
  if ((m = s.match(/^year ?(\w+)$/))) { const n = numOf(m[1]); if (n === 1) return "KG2"; if (n >= 2 && n <= 13) return "G" + (n - 1); }
  if ((m = s.match(/^(?:grade|class|std|standard|gr|g|الصف|صف|ക്ലാസ്)\s?-?\s?(\w+)$/))) { const n = numOf(m[1]); if (n >= 1 && n <= 12) return "G" + n; }
  if ((m = s.match(/^(\w+) ?(?:grade|class|std|standard|ക്ലാസ്)$/))) { const n = numOf(m[1]); if (n >= 1 && n <= 12) return "G" + n; }
  return normCls(raw);
}
// every class mentioned anywhere in a text, in order, with where it was found
const CLASS_RX = /\b(pre[\s-]?kg|pre[\s-]?k|nursery|fs\s?[12]|foundation stage [12]|lkg|ukg|kg\s?[12]|kg (?:one|two)|year\s?(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)|(?:grade|class|std|standard|gr)\.?\s?-?\s?(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)|(?:\d{1,2}(?:st|nd|rd|th)|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s(?:grade|class|std|standard)|g\d{1,2})\b|(روضة (?:أولى|اولى|ثانية)|الروضة (?:الأولى|الثانية)|(?:الصف|صف)\s?\d{1,2}|ക്ലാസ്\s?\d{1,2}|\d{1,2}\s?ക്ലാസ്)/gi;
function classesIn(text){
  const out = [];
  for (const m of String(text).matchAll(CLASS_RX)) { const c = classFromWords((m[1] || m[2]).replace(/\s+/g, " ")); if (c) out.push({ cls: c, at: m.index }); }
  return out;
}
// UAE school-entry guide: age 3 → Pre-KG, 4 → KG1, 5 → KG2, 6 → G1 … 17 → G12
function classFromAge(age){ age = +age; if (age < 3 || age > 17) return ""; return age === 3 ? "Pre-KG" : age === 4 ? "KG1" : age === 5 ? "KG2" : "G" + (age - 5); }
const AGE_RX = /\b(\d{1,2})\s?(?:-\s?)?(?:years?|yrs?|y\/o|yo)(?:\s?-?\s?old)?\b|\baged?\s?:?\s?(\d{1,2})\b|عمره\s?(\d{1,2})|عمرها\s?(\d{1,2})|(\d{1,2})\s?വയസ്സ്/gi;

/* ---------- one enquiry from one block of text ---------- */
const KEYMAP = [
  [/^(full name|parent|parent name|name|contact name|father|mother|guardian|your name|first name|اسم|الاسم|ولي الأمر|പേര്)/, "name"],
  [/(phone|mobile|whats ?app|contact|number|tel|رقم|الهاتف|ഫോൺ|മൊബൈൽ)/, "phone"],
  [/^(e-?mail|البريد)/, "email"],
  [/(area|location|address|place|city|emirate|community|المنطقة|العنوان|സ്ഥലം)/, "location"],
  [/^(child|student|kid|son|daughter|الطالب|الطفل)/, "child"],
  [/(class|grade|year group|which year|applying for|الصف|ക്ലാസ്)/, "class"],
  [/(age|العمر|വയസ്സ്)/, "age"],
  [/(academic|session|joining year|start year)/, "year"],
  [/(transport|bus|المواصلات)/, "transport"],
  [/(source|hear|platform|how did you)/, "source"],
  [/(campaign|ad name|ad set|form name|adset)/, "campaign"],
  [/^(type|enquiry for|enquiring|regarding|subject)/, "type"],
  [/(created time|created|date|submitted)/, "date"],
  [/(message|note|comment|query|remark|question|details)/, "note"]
];
function parseBlock(txt){
  const raw = digitsToLatin(txt);
  const p = { children: [], notes: "", _found: [] };
  const found = k => { if (!p._found.includes(k)) p._found.push(k); };
  const rest = [];
  let clsField = "", ageField = "";
  const lines = raw.split(/\r?\n/).map(s => s.replace(/^[*_•\-\s>]+|[*_]+$/g, "").replace(/\*/g, "").trim()).filter(Boolean);
  for (const line of lines) {
    if (/^(new )?(admission|job) enquiry/i.test(line)) { if (/^(new )?job/i.test(line)) { p.type = "Job"; found("type"); } continue; }
    // email headers
    let m = line.match(/^from:\s*"?([^"<]+?)"?\s*<([^>]+@[^>]+)>/i);
    if (m) { p.name = p.name || m[1].trim(); p.email = m[2].trim(); found("name"); found("email"); continue; }
    if (/^(to|cc|sent|date|subject):/i.test(line) && /@|\d{4}|subject/i.test(line)) { if (/^subject:/i.test(line)) rest.push(line.replace(/^subject:\s*/i, "")); continue; }
    m = line.match(/^([^:：]{1,40}?)\s*[:：]\s*(.*)$/);
    if (!m || /^https?$/i.test(m[1])) { rest.push(line); continue; }
    const k = m[1].toLowerCase().replace(/[_?]/g, " ").replace(/\s+/g, " ").trim(), v = m[2].trim();
    if (!v) continue;
    const field = (KEYMAP.find(([rx]) => rx.test(k)) || [])[1];
    if (field === "name") { if (!p.name) { p.name = v; found("name"); } }
    else if (field === "phone") { if (!p.phone && /\d{6,}/.test(v.replace(/\D/g, ""))) { p.phone = v; found("phone"); } }
    else if (field === "email") { p.email = v; found("email"); }
    else if (field === "location") { p.location = v; found("location"); }
    else if (field === "child") { const [n, c] = v.split(/\s+[–—-]\s+/); p.children.push({ name: (n || "").replace(/^-$/, "").trim(), cls: c ? classFromWords(c.trim()) : "" }); found("children"); }
    else if (field === "class") clsField = v;
    else if (field === "age") ageField = v;
    else if (field === "year") { p.academicYear = v; found("academicYear"); }
    else if (field === "transport") { p.transport = /^(y|yes|نعم|ശരി)/i.test(v) ? "Yes" : /^(n|no|لا)/i.test(v) ? "No" : ""; if (p.transport) found("transport"); }
    else if (field === "source") { p.source = /^ig$|insta/i.test(v) ? "Instagram" : /^fb$|facebook/i.test(v) ? "Facebook" : v; found("source"); }
    else if (field === "campaign") { if (!p.campaign) { p.campaign = v; found("campaign"); } }
    else if (field === "type") { if (/job|vacanc|career|teach|وظيفة|ജോലി/i.test(v)) { p.type = "Job"; found("type"); } else if (/^type/.test(k)) { p.type = "Admission"; } else rest.push(v); }
    else if (field === "date") { const d = parseDateCell(v.slice(0, 10), false); if (d) { p.date = d; found("date"); } }
    else rest.push(field === "note" ? v : line);
  }
  const all = raw;
  // classes: from a labelled field first, else anywhere in the text; names after "son/daughter"
  if (clsField && !p.children.some(c => c.cls)) {
    const cs = classesIn(clsField).map(x => x.cls); const list_ = cs.length ? cs : list(clsField).map(classFromWords);
    list_.forEach(c => p.children.push({ name: "", cls: c })); found("children");
  }
  if (!p.children.length) {
    const named = [...all.matchAll(/\b(?:my\s+)?(son|daughter|child|kid|boy|girl)\s+(?:is\s+|named\s+|called\s+)?([A-Z][a-z]{2,})(?:\s+([A-Z][a-z]{2,}))?/g)]
      .filter(m => !/^(in|for|and|who|is|age|aged|studying|from)$/i.test(m[2]));
    const cls = classesIn(all);
    if (named.length) {
      named.forEach((m, i) => {
        const near = cls.find(c => c.at > m.index && c.at - m.index < 60 && (!named[i + 1] || c.at < named[i + 1].index));
        p.children.push({ name: m[2] + (m[3] && !/^(In|For|And|Who|Is)$/.test(m[3]) ? " " + m[3] : ""), cls: near ? near.cls : "" });
      });
      cls.filter(c => !p.children.some(k => k.cls === c.cls)).forEach(c => p.children.push({ name: "", cls: c.cls }));
    } else [...new Set(cls.map(c => c.cls))].forEach(c => p.children.push({ name: "", cls: c }));
    if (p.children.length) found("children");
  }
  // ages → suggested class
  const ages = [...(ageField ? (ageField + " years").matchAll(AGE_RX) : all.matchAll(AGE_RX))].map(m => +(m[1] || m[2] || m[3] || m[4] || m[5])).filter(a => a >= 2 && a <= 18);
  if (ages.length) {
    const empty = p.children.filter(k => !k.cls);
    if (!p.children.length) ages.forEach(a => p.children.push({ name: "", cls: classFromAge(a), _age: a }));
    else empty.forEach((k, i) => { if (ages[i] != null) { k.cls = classFromAge(ages[i]); k._age = ages[i]; } });
    if (p.children.some(k => k._age)) { found("children"); p._fromAge = true; }
  }
  // Arabic / Malayalam son & daughter mentions with no class → empty child rows so they are not forgotten
  if (!p.children.length && /(ابني|ابنتي|بنتي|ولدي|മകൻ|മകൾ|my (son|daughter|kid|child))/i.test(all)) p.children.push({ name: "", cls: "" });
  // phone anywhere
  if (!p.phone) { const m = all.match(/(\+?\d[\d\s\-()]{7,}\d)/); if (m) { p.phone = m[1]; found("phone"); } }
  // name from free text
  if (!p.name) {
    const m = all.match(/(?:[Mm]y name is|[Tt]his is|I am|I'm|[Nn]ame:)\s+([A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/) || all.match(/(?:اسمي|انا|أنا)\s+([؀-ۿ]{2,}(?:\s[؀-ۿ]{2,})?)/) || all.match(/(?:എന്റെ പേര്|പേര്)\s+([ഀ-ൿ]{2,}|[A-Z][a-z]+)/);
    if (m) { p.name = m[1].replace(/\s+(and|و)$/i, ""); found("name"); }
  }
  // "Ayesha 0501111111 KG1" – a name at the start of the line, right before the number
  if (!p.name) { const m = (lines[0] || "").match(/^([A-Z][a-zA-Z'’-]+(?:\s[A-Z][a-zA-Z'’-]+){0,2})\s*[,:\-–]?\s*\+?\d[\d\s-]{6,}/); if (m && !/^(Hi|Hello|Dear|Salam|Contact|Phone|Mobile|Tel)$/i.test(m[1])) { p.name = m[1]; found("name"); } }
  if (p.name) p.name = p.name.replace(/[،,.;:!؟?]+$/, "").trim();
  // area from free text: "we live in Shabiya", "staying in Al Reem"
  if (!p.location) { const m = all.match(/\b(?:live in|living in|staying in|located in|we are in|we're in|residing in)\s+((?:Al\s)?[A-Z][a-zA-Z]+(?:\s[A-Z][a-zA-Z]+)?)/); if (m) { p.location = m[1]; found("location"); } }
  // email anywhere
  if (!p.email) { const m = all.match(/[\w.+-]+@[\w-]+\.[\w.-]+/); if (m) { p.email = m[0]; found("email"); } }
  if (!p.type && (isJobText(all) || /(وظيفة|ജോലി|vacancy)/i.test(all))) { p.type = "Job"; p._jobGuess = true; found("type"); }
  if (!p.type && /(تسجيل|قبول|അഡ്മിഷൻ|admission)/i.test(all)) p.type = "Admission";
  p.notes = rest.join("\n");
  p.children = p.children.map(k => ({ name: k.name || "", cls: k.cls || "", _age: k._age }));
  return p;
}

/* ---------- WhatsApp: copied messages and chat exports ---------- */
// [12/11/26, 10:15 am] +971 50 123 4567: Hi   ·   12/11/2026, 10:15 - Ayesha: Hi
const WA_LINE = /^‎?\[?(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4}),?\s+(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([ap]\.?\s?m\.?)?\]?\s*(?:[-–]\s*)?([^:]{1,60}?):\s?(.*)$/i;
function waDate(a, b, y, hh, mm, ap){
  let d = +a, mo = +b; if (mo > 12 && d <= 12) { const t = d; d = mo; mo = t; }   // month/day order fallback
  let yr = +y; if (yr < 100) yr += 2000;
  let h = +hh; if (ap) { const pm = /p/i.test(ap); if (pm && h < 12) h += 12; if (!pm && h === 12) h = 0; }
  const dt = new Date(yr, mo - 1, d, h, +mm);
  return isNaN(dt) ? null : { date: isoOf(dt), at: dt.toISOString() };
}
function parseWhatsApp(text){
  const lines = digitsToLatin(text).split(/\r?\n/);
  const msgs = []; let cur = null, hits = 0;
  for (const line of lines) {
    const m = line.match(WA_LINE);
    if (m) { hits++; const when = waDate(m[1], m[2], m[3], m[4], m[5], m[6]); cur = { sender: m[7].replace(/‎|‪|‬/g, "").trim(), text: m[8], when }; msgs.push(cur); }
    else if (cur && line.trim()) cur.text += "\n" + line;
  }
  if (hits < 1 || hits < lines.filter(l => l.trim()).length * 0.3) return null;
  const me = new Set(["you", "أنت", "നിങ്ങൾ", String(db.settings.schoolName || "").toLowerCase()]);
  const skip = /end-to-end encrypted|<media omitted>|image omitted|this message was deleted|missed voice call|missed video call|security code changed|joined using this group|created group|added you/i;
  const bySender = new Map();
  for (const msg of msgs) {
    if (skip.test(msg.text) || me.has(msg.sender.toLowerCase())) continue;
    if (!bySender.has(msg.sender)) bySender.set(msg.sender, []);
    bySender.get(msg.sender).push(msg);
  }
  const out = [];
  for (const [sender, list_] of bySender) {
    const p = parseBlock(list_.map(x => x.text).join("\n"));
    const senderDigits = sender.replace(/[^\d+]/g, "");
    if (/^\+?\d{8,}$/.test(senderDigits)) { if (!p.phone) { p.phone = sender; } if (!p._found.includes("phone")) p._found.push("phone"); }
    else if (!p.name) { p.name = sender; p._found.push("name"); }
    const first = list_[0].when;
    if (first) { p.date = first.date; p._at = first.at; p._found.push("date"); }
    p.source = p.source || "WhatsApp";
    p.notes = list_.map(x => x.text).join("\n");
    p._format = "WhatsApp";
    if (p.phone || p.name) out.push(p);
  }
  return out;
}

/* ---------- Facebook / Instagram lead-ads CSV ---------- */
function parseLeadCsv(text){
  const rows = digitsToLatin(text).split(/\r?\n/).filter(r => r.trim());
  if (rows.length < 2) return null;
  const sep = rows[0].includes("\t") ? "\t" : ",";
  const split = r => { const o = []; let q = false, c = ""; for (const ch of r) { if (ch === '"') q = !q; else if (ch === sep && !q) { o.push(c); c = ""; } else c += ch; } o.push(c); return o.map(x => x.trim()); };
  const head = split(rows[0]).map(h => h.toLowerCase());
  if (!head.some(h => /phone/.test(h)) || head.length < 3) return null;
  return rows.slice(1).map(r => {
    const cells = split(r);
    const p = parseBlock(head.map((h, i) => `${h}: ${cells[i] || ""}`).join("\n"));
    if (!p.source) { const pf = cells[head.findIndex(h => /platform/.test(h))] || ""; p.source = /ig|insta/i.test(pf) ? "Instagram" : /fb|face/i.test(pf) ? "Facebook" : "Lead ad"; }
    p._format = "Lead ad";
    return p;
  }).filter(p => p.phone);
}

/* ---------- everything: returns a list of enquiries ---------- */
function parseEnquiries(text){
  text = String(text || "").trim();
  if (!text) return [];
  const wa = parseWhatsApp(text); if (wa && wa.length) return wa;
  const csv = parseLeadCsv(text); if (csv && csv.length) return csv;
  // several enquiries separated by blank lines / dividers, each with its own phone number
  const blocks = text.split(/\n\s*(?:-{3,}|={3,}|_{3,})?\s*\n(?=\s*\S)/).map(b => b.trim()).filter(Boolean);
  if (blocks.length > 1) {
    const parsed = blocks.map(parseBlock);
    const phones = parsed.map(p => normPhone(p.phone)).filter(Boolean);
    if (phones.length > 1 && new Set(phones).size === phones.length && parsed.every(p => p.phone)) return parsed.map(p => Object.assign(p, { _format: "List" }));
  }
  const p = parseBlock(text);
  if (/(full name|phone number|form name|ad name|campaign name)\s*:/i.test(text)) { p._format = "Lead ad"; if (!p.source) p.source = /instagram|\big\b/i.test(text) ? "Instagram" : "Facebook"; }
  else if (/^from:.+@/im.test(text)) p._format = "Email";
  return p.phone || p.name ? [p] : [];
}
// kept for older calls
function parseEnquiryText(txt){ return parseEnquiries(txt)[0] || parseBlock(txt); }

/* ---------- the dialog ---------- */
function pasteForm(prefill){
  const canClip = !!(navigator.clipboard && navigator.clipboard.readText);
  showDialog(`<div class="dlg-h"><b>Paste an enquiry</b><button class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b">
    <p class="hint" style="margin-top:0">Paste a WhatsApp message or chat, an online-form message, an email, or a Facebook/Instagram lead (text or CSV). Several enquiries at once are fine. English, Arabic and Malayalam are understood.</p>
    ${canClip ? `<button class="btn" data-act="paste-clip" style="margin-bottom:8px">${ICON_CLIP} Paste from clipboard</button>` : ""}
    <textarea id="paste-t" style="min-height:190px" placeholder="[12/11/26, 10:15] +971 50 123 4567: Hi, I want admission for my son Adam in KG2…">${esc(prefill || "")}</textarea>
    <p class="hint" style="margin-bottom:0">On Android you can also <b>Share</b> a message from WhatsApp straight to the installed tracker.</p>
  </div>
  <div class="dlg-f"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="paste-go">Read enquiry</button></div>`);
  setTimeout(() => { const t = $("#paste-t"); if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); } }, 30);
}
const ICON_CLIP = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></svg>`;

async function pasteFromClipboard(){
  try { const t = await navigator.clipboard.readText(); if (!t) { toast("The clipboard is empty"); return; } const ta = $("#paste-t"); ta.value = t; pasteGo(); }
  catch (e) { toast("Allow clipboard access, or long-press the box and choose Paste"); }
}

function prefillFor(p){
  const base = { date: todayISO(), stage: "New", nextFollowUp: todayISO(), academicYear: db.settings.academicYear, assignedTo: focusName() || staffNames()[0] || "" };
  const out = Object.assign(base, p);
  if (out.type && out.type !== "Admission") out.nextFollowUp = "";
  return out;
}
function pasteGo(){
  const text = $("#paste-t").value;
  const list_ = parseEnquiries(text);
  if (!list_.length) { toast("Couldn't find a name or phone number in that text"); return; }
  list_.forEach(p => { if (!p.source) p.source = /\bweb|online form/i.test(text) ? "Online form" : "WhatsApp"; });
  if (list_.length > 1) { bulkReview(list_); return; }
  const p = list_[0];
  const jobGuess = p._jobGuess; delete p._jobGuess;
  leadForm(null, prefillFor(p));
  if (jobGuess) toast("Looks like a job enquiry – type set to Job");
}

/* ---------- highlight what was read from the message ---------- */
function markFound(form, p){
  if (!p || !p._found || !p._found.length) return;
  const map = { name: "name", phone: "phone", email: "email", location: "location", academicYear: "academicYear", transport: "transport", source: "source", campaign: "campaign", type: "type", date: "date" };
  p._found.forEach(k => { const el = map[k] && form.elements[map[k]]; if (el) el.classList.add("found"); });
  if (p._found.includes("children")) form.querySelectorAll(".kid input").forEach(i => { if (i.value) i.classList.add("found"); });
  const kids = (p.children || []).filter(k => k.cls);
  const parts = p._found.filter(k => k !== "children").map(k => ({ name: "name", phone: "phone", email: "email", location: "area", academicYear: "year", transport: "transport", source: "source", campaign: "campaign", type: "type", date: "date & time" }[k])).filter(Boolean);
  if (kids.length) parts.push(`${kids.length} child${kids.length > 1 ? "ren" : ""}${p._fromAge ? " (class suggested from age)" : ""}`);
  const banner = document.createElement("div");
  banner.className = "foundnote full";
  banner.innerHTML = `${ICON_SPARK} Read from the ${esc(p._format || "message")}: <b>${esc(parts.join(", "))}</b>. Highlighted fields – please check them.`;
  form.querySelector(".form").prepend(banner);
}
const ICON_SPARK = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z"/></svg>`;

/* ---------- several enquiries: review table ---------- */
let bulkParsed = [];
function bulkReview(list_){
  bulkParsed = list_;
  const row = (p, i) => {
    const phone = normPhone(p.phone), dup = phone && db.leads.find(l => l.phone === phone);
    return `<tr>
      <td><input type="checkbox" class="br-on" data-i="${i}" checked aria-label="Save this enquiry"></td>
      <td><input type="text" class="br-name" data-i="${i}" value="${esc(p.name || "")}" placeholder="Name"></td>
      <td><input type="tel" class="br-phone" data-i="${i}" value="${esc(p.phone || "")}" placeholder="Phone">${dup ? `<div class="hint">Already in system: <b>${esc(dup.stage)}</b> – adds a repeat note</div>` : ""}</td>
      <td><input type="text" class="br-cls" data-i="${i}" value="${esc(p.children.map(k => k.cls).filter(Boolean).join(", "))}" placeholder="Class"></td>
      <td class="hint">${p.date ? fmtDate(p.date) : "Today"}<br>${esc(p.type === "Job" ? "Job" : p.source || "")}</td>
      <td class="hint br-note">${esc((p.notes || "").slice(0, 90))}${(p.notes || "").length > 90 ? "…" : ""}</td></tr>`;
  };
  showDialog(`<div class="dlg-h"><b>${list_.length} enquiries found</b><button class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><p class="hint" style="margin-top:0">Read from the ${esc(list_[0]._format || "text")}. Check or correct each row, untick any you don't want, then save them all.</p>
  <div class="calwrap"><table class="rep bulkrev"><thead><tr><th></th><th>Name</th><th>Phone</th><th>Class</th><th>Date / source</th><th>Message</th></tr></thead><tbody>${list_.map(row).join("")}</tbody></table></div></div>
  <div class="dlg-f"><button class="btn" data-act="close-dlg">Cancel</button><button class="btn primary" data-act="bulk-save">Save selected</button></div>`);
}
function bulkSave(){
  const made = [], repeats = [];
  document.querySelectorAll(".br-on").forEach(cb => {
    if (!cb.checked) return;
    const i = +cb.dataset.i, p = Object.assign({}, bulkParsed[i]);
    p.name = document.querySelector(`.br-name[data-i="${i}"]`).value.trim();
    p.phone = document.querySelector(`.br-phone[data-i="${i}"]`).value.trim();
    const cls = list(document.querySelector(`.br-cls[data-i="${i}"]`).value).map(classFromWords);
    const named = (p.children || []).filter(k => k.name);
    p.children = cls.map((c, j) => ({ name: (named[j] || {}).name || "", cls: c }));
    const r = createLeadFromParsed(p);
    if (r) (r.repeat ? repeats : made).push(r.lead);
  });
  save(); closeDialog(); render();
  toast(`${made.length} added${repeats.length ? ` · ${repeats.length} repeat${repeats.length > 1 ? "s" : ""} noted` : ""}`);
  const fresh = made.filter(l => l.phone && l.type === "Admission");
  if (fresh.length && can("bulk")) setTimeout(() => offerFirstReply(fresh), 250);
}
function createLeadFromParsed(p){
  const t = todayISO(), now = new Date().toISOString();
  const phone = normPhone(p.phone); if (!phone) return null;
  const children = (p.children || []).map(k => ({ id: uid(), name: k.name || "", cls: normCls(k.cls || "") })).filter(k => k.name || k.cls);
  const dup = db.leads.find(x => x.phone === phone);
  if (dup) {
    logAct("Repeat enquiry", dup, children.map(k => k.cls).filter(Boolean).join(", "));
    dup.history.push({ id: uid(), at: now, date: p.date || t, kind: "note", by: meName(), note: `Repeat enquiry (pasted)${p.notes ? ": " + p.notes.slice(0, 300) : ""}` });
    children.forEach(k => { if (!dup.children.some(c => c.cls === k.cls && (c.name || "") === (k.name || ""))) dup.children.push(k); });
    if (!isOpen(dup) && dup.stage !== "Admitted") changeStage(dup, "New", { silent: true });
    dup.nextFollowUp = t; touch(dup);
    return { lead: dup, repeat: true };
  }
  const nl = migrateLead({ id: uid(), createdAt: p._at || now, date: p.date || t, name: p.name || "", email: p.email || "", phone, phoneRaw: p.phone,
    children, academicYear: p.academicYear || db.settings.academicYear, location: p.location || "", transport: p.transport || "", source: p.source || "WhatsApp",
    campaign: p.campaign || "", type: p.type || "Admission", assignedTo: focusName() || staffNames()[0] || "", stage: "New", nextFollowUp: (p.type || "Admission") === "Admission" ? t : "",
    notes: p.notes || "", history: [{ id: uid(), at: now, date: p.date || t, kind: "note", by: meName(), note: "Enquiry captured from a pasted message" }] });
  db.leads.push(nl); touch(nl);
  logAct("Enquiry added", nl, [classesOf(nl), nl.source, "pasted"].filter(Boolean).join(" · "));
  return { lead: nl, repeat: false };
}

/* ---------- send the first reply straight after saving ---------- */
function offerFirstReply(leads){
  leads = [].concat(leads).filter(l => l && l.phone);
  if (!leads.length) return;
  const one = leads.length === 1 ? leads[0] : null;
  const job = one && one.type !== "Admission";
  showDialog(`<div class="dlg-h"><b>Saved ✓</b><button class="x" data-act="close-dlg">×</button></div>
  <div class="dlg-b"><p style="margin:0 0 6px;font-size:15px">${one ? `Send <b>${esc(plainName(one))}</b> the <b>${job ? "HR reply" : "First reply"}</b> on WhatsApp now?` : `Send the <b>First reply</b> on WhatsApp to these <b>${leads.length}</b> families now?`}</p>
  <p class="hint" style="margin:0">Families who get an answer within minutes are far more likely to visit.</p></div>
  <div class="dlg-f"><button class="btn" data-act="close-dlg">Not now</button>
  ${one ? `<button class="btn primary" data-act="fr-send" data-id="${one.id}" data-tpl="${job ? "Job reply" : "First reply"}">Send ${job ? "HR" : "first"} reply</button>`
        : `<button class="btn primary" data-act="bulk-ids" data-tpl="First reply" data-ids="${leads.map(l => l.id).join(",")}">Send to all ${leads.length}</button>`}</div>`);
}

/* ---------- Share from WhatsApp (Android, installed app) ---------- */
function handleShare(){
  const q = new URLSearchParams(location.search);
  const shared = [q.get("title"), q.get("text"), q.get("url")].filter(Boolean).join("\n").trim();
  if (shared) { try { sessionStorage.setItem("pendingShare", shared); } catch(e){} history.replaceState(null, "", location.pathname); }
  let pending = ""; try { pending = sessionStorage.getItem("pendingShare") || ""; } catch(e){}
  if (!pending || document.body.classList.contains("locked") || !can("edit")) return;
  try { sessionStorage.removeItem("pendingShare"); } catch(e){}
  pasteForm(pending);
  setTimeout(() => { if ($("#paste-t")) pasteGo(); }, 60);
}

/* ---------- actions (called from app.js click handler) ---------- */
function pasteAction(act, el){
  switch (act) {
    case "paste": pasteForm(); return true;
    case "paste-go": pasteGo(); return true;
    case "paste-clip": pasteFromClipboard(); return true;
    case "bulk-save": bulkSave(); return true;
    case "fr-send": closeDialog(); waForm(el.dataset.id, el.dataset.tpl); return true;
  }
  return false;
}
