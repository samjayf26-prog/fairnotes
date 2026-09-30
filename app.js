"use strict";

// ---------- storage ----------
const KEY = "fairnotes.v1";
const UIKEY = "fairnotes.ui";
let db = read(KEY, { notes: {}, custom: [] });
let ui = Object.assign({ view: "fair", filter: "all", sort: "priority", q: "" }, read(UIKEY, {}));
ui.q = "";

function read(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k)) || fallback; } catch { return fallback; }
}
function write(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}
function save() { write(KEY, db); flashSaved(); }
function saveUi() { write(UIKEY, { view: ui.view, filter: ui.filter, sort: ui.sort }); }

// ---------- model ----------
const BLANK = { status: "todo", interest: 0, notes: "", rep: "", contact: "", how: "", howDetail: "", tags: [], applyBy: null, tasks: {}, talkedAt: null };
const RATE = [["Meh"], ["Maybe"], ["Solid"], ["Want"], ["Dream"]];
const TAGS = ["Took my resume", "Got a card", "Interview offered", "Wants follow-up", "Great culture", "Relocation / housing", "Return offers", "US citizens only", "Not a fit"];
const HOW = ["Handshake", "Company site", "Email the rep", "QR / link given", "Applied at booth", "Referral"];
const TASKS = [["apply", "Apply"], ["thanks", "Thank-you email"], ["linkedin", "LinkedIn"], ["followup", "Follow up"]];
const ROUTE = ["A", "C", "D", "E", "F", "H", "J", "K", "L", "B", "I"];

const companies = () => SEED.concat(db.custom);
const byId = (id) => companies().find((c) => c.id === id);
const peek = (id) => db.notes[id] || BLANK;
function note(id) {
  if (!db.notes[id]) db.notes[id] = JSON.parse(JSON.stringify(BLANK));
  return db.notes[id];
}
const applyBy = (c) => peek(c.id).applyBy ?? c.applyBy ?? "";
const talked = (n) => n.status === "talked" || n.status === "applied";

// ---------- helpers ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
const stars = (n) => (n ? `<span class="stars">${"★".repeat(n)}</span>` : "");

function today() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function daysUntil(iso) { return Math.round((new Date(iso + "T00:00") - today()) / 86400000); }
function fmtDate(iso, long) {
  return new Date(iso + "T00:00").toLocaleDateString(undefined, long ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric" });
}
function due(iso) {
  if (!iso) return "";
  const d = daysUntil(iso);
  const label = d < 0 ? "Closed " + fmtDate(iso) : d === 0 ? "Due today" : d === 1 ? "Due tomorrow" : d < 7 ? `${d} days` : fmtDate(iso);
  const cls = d < 0 ? "urgent past" : d <= 2 ? "urgent" : d <= 7 ? "soon" : "";
  return `<span class="due ${cls}">${label}</span>`;
}
function boothKey(c) {
  const m = /^([A-Za-z])\s*(\d*)/.exec(c.booth || "");
  if (!m) return [99, 0];
  const r = ROUTE.indexOf(m[1].toUpperCase());
  return [r < 0 ? 98 : r, +m[2] || 0];
}
let toastT;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 1800);
}
let savedT;
function flashSaved() {
  const s = $("#saved"); if (!s) return;
  s.classList.add("show"); clearTimeout(savedT); savedT = setTimeout(() => s.classList.remove("show"), 900);
}
function openTasks(c) {
  const n = peek(c.id);
  return talked(n) ? TASKS.filter(([k]) => !n.tasks[k]).length : 0;
}
function needsApply(c) { const n = peek(c.id); return talked(n) && n.status !== "applied" && !n.tasks.apply; }

// ---------- top-level render ----------
function render() {
  document.querySelectorAll(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.view === ui.view));
  $("#fab").hidden = ui.view !== "fair";
  const all = companies();
  const nTalked = all.filter((c) => talked(peek(c.id))).length;
  const nApply = all.filter(needsApply).length;
  $("#stats").innerHTML = `${nTalked} of ${all.length} talked` + (nApply ? `<br>${nApply} to apply` : "");
  $("#todoBadge").textContent = nApply || "";
  ({ fair: renderFair, todo: renderTodo, review: renderReview })[ui.view]();
}

function renderFair() {
  const tools = $("#viewTools");
  if (!$("#q")) {
    ui.q = "";
    tools.innerHTML = `<input id="q" class="search" type="search" placeholder="Search company, booth, notes…" autocomplete="off">
      <div class="filters" id="filters"></div>`;
    $("#q").addEventListener("input", (e) => { ui.q = e.target.value; renderFairList(); });
  }
  const f = [["all", "All"], ["todo", "Not yet"], ["talked", "Talked"], ["soon", "Deadline ≤ 10d"]];
  const s = [["priority", "By priority"], ["route", "By booth"]];
  $("#filters").innerHTML =
    f.map(([k, l]) => `<button data-f="${k}" class="${ui.filter === k ? "on" : ""}">${l}</button>`).join("") +
    `<span class="sep"></span>` +
    s.map(([k, l]) => `<button data-s="${k}" class="${ui.sort === k ? "on" : ""}">${l}</button>`).join("");
  renderFairList();
}

function renderFairList() {
  const q = ui.q.trim().toLowerCase();
  let list = companies().filter((c) => {
    const n = peek(c.id);
    if (ui.filter === "todo" && n.status !== "todo") return false;
    if (ui.filter === "talked" && !talked(n)) return false;
    if (ui.filter === "soon") { const a = applyBy(c); if (!a || daysUntil(a) > 10 || daysUntil(a) < 0) return false; }
    if (!q) return true;
    return [c.name, c.booth, c.role, c.loc, n.notes, n.rep, (n.tags || []).join(" ")].join(" ").toLowerCase().includes(q);
  });

  let groups = [];
  if (ui.sort === "route") {
    list.sort((a, b) => { const x = boothKey(a), y = boothKey(b); return x[0] - y[0] || x[1] - y[1]; });
    for (const c of list) {
      const k = boothKey(c)[0];
      const title = k >= 98 ? "Other" : `Row ${ROUTE[k] === "I" ? "i" : ROUTE[k]}`;
      const g = groups[groups.length - 1];
      if (g && g.title === title) g.items.push(c); else groups.push({ title, items: [c] });
    }
  } else {
    const tiers = [5, 1, 2, 3, 4];
    groups = tiers.map((t) => ({ title: t === 5 ? "Added by you" : TIERS[t], items: list.filter((c) => (c.tier || 5) === t) }))
      .filter((g) => g.items.length);
  }

  $("#main").innerHTML = groups.length
    ? groups.map((g) => `<div class="group-h">${esc(g.title)} · ${g.items.length}</div>` + g.items.map(rowHtml).join("")).join("")
    : `<div class="empty">No companies match.<br><br><button class="btn primary" id="emptyAdd">+ Add “${esc(ui.q || "a company")}”</button></div>`;
}

function rowHtml(c) {
  const n = peek(c.id);
  const mark = { talked: "✓", applied: "✓", skip: "–" }[n.status] || "";
  const sub = talked(n) && n.notes ? n.notes.split("\n")[0] : c.role || c.loc || "";
  return `<button class="row ${n.status}" data-open="${esc(c.id)}">
    <span class="dot ${n.status}">${mark}</span>
    <span class="row-main">
      <span class="row-name">${esc(c.name)}${c.booth ? `<span class="booth">${esc(c.booth)}</span>` : ""}</span>
      <span class="row-sub">${esc(sub)}</span>
    </span>
    <span class="row-side">${due(applyBy(c))}${stars(n.interest)}</span>
  </button>`;
}

function renderTodo() {
  $("#viewTools").innerHTML = "";
  const all = companies();
  const byDue = (a, b) => (applyBy(a) || "9999").localeCompare(applyBy(b) || "9999") || peek(b.id).interest - peek(a.id).interest;
  const mine = all.filter((c) => talked(peek(c.id))).sort((a, b) => (openTasks(b) > 0) - (openTasks(a) > 0) || byDue(a, b));
  const upcoming = all.filter((c) => peek(c.id).status === "todo" && applyBy(c) && daysUntil(applyBy(c)) >= 0).sort(byDue);

  let html = `<div class="group-h">Companies you talked to · ${mine.length}</div>`;
  html += mine.length ? mine.map(todoHtml).join("") : `<div class="empty">Nobody yet. Tap a company and hit “I talked to them.”</div>`;
  if (upcoming.length) {
    html += `<div class="group-h">Deadlines, not visited yet</div>` + upcoming.map(rowHtml).join("");
  }
  $("#main").innerHTML = html;
}

function todoHtml(c) {
  const n = peek(c.id);
  const how = [n.how, n.howDetail].filter(Boolean).join(" · ") || (c.link ? "No method noted; posting link in prep" : "How to apply not noted yet");
  return `<div class="todo">
    <div class="todo-head"><button data-open="${esc(c.id)}">${esc(c.name)} ${stars(n.interest)}</button>${due(applyBy(c))}</div>
    <div class="todo-how">${esc(how)}</div>
    <div class="checks">${TASKS.map(([k, l]) => `<button class="check ${n.tasks[k] ? "on" : ""}" data-task="${k}" data-id="${esc(c.id)}">${n.tasks[k] ? "✓ " : ""}${l}</button>`).join("")}</div>
  </div>`;
}

function renderReview() {
  $("#viewTools").innerHTML = "";
  const list = companies().filter((c) => talked(peek(c.id)))
    .sort((a, b) => peek(b.id).interest - peek(a.id).interest || (peek(a.id).talkedAt || 0) - (peek(b.id).talkedAt || 0));
  let html = `<div class="tools">
      <button class="btn primary" id="copyAll">Copy all notes</button>
      <button class="btn" id="backup">Download backup</button>
      <button class="btn" id="restore">Restore</button>
      <input type="file" id="restoreFile" accept="application/json,.json" hidden>
    </div>`;
  html += list.length ? list.map((c) => {
    const n = peek(c.id);
    const meta = [c.booth && "Booth " + c.booth, n.rep, n.contact, applyBy(c) && "Apply by " + fmtDate(applyBy(c)), [n.how, n.howDetail].filter(Boolean).join(": ")].filter(Boolean);
    return `<div class="review" data-open="${esc(c.id)}">
      <h3><span>${esc(c.name)}</span>${stars(n.interest)}</h3>
      <div class="meta">${meta.map(esc).join(" · ")}</div>
      ${n.notes ? `<div class="body">${esc(n.notes)}</div>` : ""}
      ${n.tags?.length ? `<div class="tags">${n.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    </div>`;
  }).join("") : `<div class="empty">Your notes will show up here, ranked by interest.</div>`;
  $("#main").innerHTML = html;
}

function exportText() {
  return companies().filter((c) => talked(peek(c.id)))
    .sort((a, b) => peek(b.id).interest - peek(a.id).interest)
    .map((c) => {
      const n = peek(c.id);
      const lines = [`${c.name}${c.booth ? ` (${c.booth})` : ""}  ${"★".repeat(n.interest)}${n.status === "applied" ? "  [applied]" : ""}`];
      if (n.rep || n.contact) lines.push("Rep: " + [n.rep, n.contact].filter(Boolean).join(", "));
      if (applyBy(c)) lines.push("Apply by: " + fmtDate(applyBy(c), true));
      if (n.how || n.howDetail) lines.push("How: " + [n.how, n.howDetail].filter(Boolean).join(": "));
      if (n.tags?.length) lines.push("Tags: " + n.tags.join(", "));
      if (n.notes) lines.push(n.notes);
      const open = TASKS.filter(([k]) => !n.tasks[k]).map(([, l]) => l);
      if (open.length) lines.push("To do: " + open.join(", "));
      return lines.join("\n");
    }).join("\n\n---\n\n");
}

// ---------- detail sheet ----------
let current = null;

function openSheet(id, focusNotes) {
  const c = byId(id); if (!c) return;
  current = id;
  const n = peek(id);
  const a = applyBy(c);
  const prepRows = [
    ["Role", c.role], ["Where", c.loc], ["Pay", c.pay],
    ["Apply by", c.applyBy ? fmtDate(c.applyBy, true) : "Not listed, so ask"],
    ["Posting", c.link ? `<a href="${esc(c.link)}" target="_blank" rel="noopener">Open ↗</a>` : ""],
    ["Know", c.info],
  ].filter(([, v]) => v);

  const sheet = $("#sheet");
  sheet.innerHTML = `
    <div class="sheet-top">
      <button class="back" id="back">‹ Back</button>
      <h2>${esc(c.name)}</h2>
      <span class="saved" id="saved">Saved ✓</span>
    </div>
    <div class="sheet-body">
      <details class="prep" ${n.status === "todo" || n.status === "skip" ? "open" : ""}>
        <summary><span>${c.booth ? "Booth " + esc(c.booth) + " · " : ""}Prep</span></summary>
        <dl>${prepRows.map(([k, v]) => `<dt>${k}</dt><dd>${k === "Posting" ? v : esc(v)}</dd>`).join("")}</dl>
      </details>

      <div id="gate" ${talked(n) ? "hidden" : ""}>
        <button class="talk-btn" id="talk">✓ I talked to them</button>
        <button class="skip-btn" id="skip">${n.status === "skip" ? "Un-skip" : "Skip this one"}</button>
      </div>

      <div id="form" ${talked(n) ? "" : "hidden"}>
        <div class="field">
          <span class="label">Interest</span>
          <div class="rate">${RATE.map(([l], i) => `<button data-rate="${i + 1}" class="${n.interest === i + 1 ? "on" : ""}"><b>${i + 1}</b><small>${l}</small></button>`).join("")}</div>
        </div>

        <div class="field">
          <label class="label" for="notes">Notes <span class="hint">· tap the mic on your keyboard to dictate</span></label>
          <textarea id="notes" class="inp" placeholder="What did they say? Teams, projects, what they look for, questions they asked you…">${esc(n.notes)}</textarea>
          <div class="chips" id="tags" style="margin-top:8px">${TAGS.map((t) => `<button data-tag="${esc(t)}" class="${n.tags.includes(t) ? "on" : ""}">${esc(t)}</button>`).join("")}</div>
        </div>

        <div class="field two">
          <div><label class="label" for="rep">Rep name</label><input id="rep" class="inp" value="${esc(n.rep)}" autocomplete="off" placeholder="Who you met"></div>
          <div><label class="label" for="contact">Contact</label><input id="contact" class="inp" value="${esc(n.contact)}" autocomplete="off" inputmode="email" placeholder="Email / LinkedIn"></div>
        </div>

        <div class="field">
          <span class="label">How to apply</span>
          <div class="chips" id="how">${HOW.map((h) => `<button data-how="${esc(h)}" class="${n.how === h ? "on" : ""}">${esc(h)}</button>`).join("")}</div>
          <input id="howDetail" class="inp" style="margin-top:8px" value="${esc(n.howDetail)}" autocomplete="off" placeholder="Special instructions, link, req #, who to email…">
        </div>

        <div class="field">
          <label class="label" for="applyBy">Apply by</label>
          <div class="date-row"><input id="applyBy" type="date" class="inp" value="${esc(a)}"><span id="dueBadge">${due(a)}</span></div>
        </div>

        <div class="field">
          <span class="label">Next steps</span>
          <div class="checks" id="tasks">${TASKS.map(([k, l]) => `<button class="check ${n.tasks[k] ? "on" : ""}" data-task="${k}">${n.tasks[k] ? "✓ " : ""}${l}</button>`).join("")}</div>
        </div>

        <div class="field">
          <span class="label">Status</span>
          <div class="status-seg" id="status">${[["talked", "Talked"], ["applied", "Applied"], ["skip", "Not for me"]].map(([k, l]) => `<button data-status="${k}" class="${n.status === k ? "on" : ""}">${l}</button>`).join("")}</div>
        </div>

        <button class="done-btn" id="done">Done</button>
        <button class="danger" id="clear">${c.custom ? "Delete this company" : "Clear my notes for this company"}</button>
      </div>
    </div>`;
  sheet.hidden = false;
  sheet.scrollTop = 0;
  document.body.style.overflow = "hidden";
  if (history.state?.sheet !== id) history.pushState({ sheet: id }, "");
  grow($("#notes"));
  if (focusNotes) $("#notes").focus();
}

function closeSheet(fromPop) {
  if ($("#sheet").hidden) return;
  $("#sheet").hidden = true;
  $("#sheet").innerHTML = "";
  document.body.style.overflow = "";
  current = null;
  if (!fromPop && history.state?.sheet) history.back();
  render();
}

function grow(t) { if (!t) return; t.style.height = "auto"; t.style.height = Math.max(130, t.scrollHeight + 2) + "px"; }

function setTask(id, k) {
  const n = note(id);
  n.tasks[k] = !n.tasks[k];
  if (k === "apply") n.status = n.tasks.apply ? "applied" : n.status === "applied" ? "talked" : n.status;
  save();
}

// sheet events (delegated)
$("#sheet").addEventListener("click", (e) => {
  const t = e.target.closest("button"); if (!t || !current) return;
  const id = current, n = note(id);
  if (t.id === "back" || t.id === "done") return closeSheet();
  if (t.id === "talk") {
    n.status = "talked"; n.talkedAt = n.talkedAt || Date.now(); save();
    $("#gate").hidden = true; $("#form").hidden = false;
    $(".prep").open = false;
    syncStatus(n);
    $("#notes").focus();
    return;
  }
  if (t.id === "skip") { n.status = n.status === "skip" ? "todo" : "skip"; save(); return closeSheet(); }
  if (t.id === "clear") {
    const c = byId(id);
    if (!confirm(c.custom ? `Delete ${c.name}?` : `Clear everything you wrote about ${c.name}?`)) return;
    delete db.notes[id];
    if (c.custom) db.custom = db.custom.filter((x) => x.id !== id);
    save(); return closeSheet();
  }
  if (t.dataset.rate) {
    const v = +t.dataset.rate; n.interest = n.interest === v ? 0 : v;
    t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", +b.dataset.rate === n.interest));
    return save();
  }
  if (t.dataset.tag) {
    const tag = t.dataset.tag;
    n.tags = n.tags.includes(tag) ? n.tags.filter((x) => x !== tag) : n.tags.concat(tag);
    t.classList.toggle("on", n.tags.includes(tag));
    return save();
  }
  if (t.dataset.how) {
    n.how = n.how === t.dataset.how ? "" : t.dataset.how;
    t.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.how === n.how));
    if (n.how === "Applied at booth" && !n.tasks.apply) { n.tasks.apply = true; n.status = "applied"; syncTasks(n); syncStatus(n); }
    return save();
  }
  if (t.dataset.task) { setTask(id, t.dataset.task); syncTasks(n); syncStatus(n); return; }
  if (t.dataset.status) {
    n.status = t.dataset.status;
    if (n.status === "applied") n.tasks.apply = true;
    syncTasks(n); syncStatus(n); save();
    if (n.status === "skip") closeSheet();
  }
});

$("#sheet").addEventListener("input", (e) => {
  if (!current) return;
  const n = note(current), t = e.target;
  if (t.id === "notes") { n.notes = t.value; grow(t); }
  else if (t.id === "rep" || t.id === "contact" || t.id === "howDetail") n[t.id] = t.value;
  else if (t.id === "applyBy") {
    const c = byId(current);
    n.applyBy = t.value === (c.applyBy || "") ? null : t.value;
    $("#dueBadge").innerHTML = due(t.value);
  } else return;
  save();
});

function syncTasks(n) {
  document.querySelectorAll("#tasks .check").forEach((b) => {
    const k = b.dataset.task, l = TASKS.find(([x]) => x === k)[1];
    b.classList.toggle("on", !!n.tasks[k]); b.textContent = (n.tasks[k] ? "✓ " : "") + l;
  });
}
function syncStatus(n) {
  document.querySelectorAll("#status button").forEach((b) => b.classList.toggle("on", b.dataset.status === n.status));
}

// ---------- add company ----------
function openAdd(prefill = "") {
  current = null;
  const sheet = $("#sheet");
  sheet.innerHTML = `
    <div class="sheet-top"><button class="back" id="addBack">‹ Back</button><h2>Add a company</h2></div>
    <form class="sheet-body" id="addForm">
      <div class="field"><label class="label" for="aName">Company</label><input id="aName" class="inp" required autocomplete="off" value="${esc(prefill)}"></div>
      <div class="field two">
        <div><label class="label" for="aBooth">Booth</label><input id="aBooth" class="inp" autocomplete="off" placeholder="e.g. K12"></div>
        <div><label class="label" for="aRole">Role</label><input id="aRole" class="inp" autocomplete="off" placeholder="Optional"></div>
      </div>
      <button class="talk-btn" type="submit">✓ Add &amp; take notes</button>
    </form>`;
  sheet.hidden = false;
  document.body.style.overflow = "hidden";
  history.pushState({ sheet: "add" }, "");
  $("#aName").focus();
  $("#addBack").onclick = () => closeSheet();
  $("#addForm").onsubmit = (e) => {
    e.preventDefault();
    const name = $("#aName").value.trim(); if (!name) return;
    const c = { id: "c" + Date.now().toString(36), name, booth: $("#aBooth").value.trim(), role: $("#aRole").value.trim(), tier: 5, custom: true, applyBy: "", loc: "", pay: "", link: "", info: "" };
    db.custom.push(c);
    const n = note(c.id); n.status = "talked"; n.talkedAt = Date.now();
    save();
    history.replaceState({ sheet: c.id }, "");
    openSheet(c.id, true);
  };
}

// ---------- global events ----------
document.addEventListener("click", (e) => {
  const tab = e.target.closest(".tabs button");
  if (tab) { ui.view = tab.dataset.view; saveUi(); window.scrollTo(0, 0); return render(); }
  const f = e.target.closest("[data-f]");
  if (f) { ui.filter = ui.filter === f.dataset.f && f.dataset.f !== "all" ? "all" : f.dataset.f; saveUi(); return renderFair(); }
  const s = e.target.closest("[data-s]");
  if (s) { ui.sort = s.dataset.s; saveUi(); return renderFair(); }
  if (e.target.closest("#sheet")) return;
  const chk = e.target.closest(".check[data-id]");
  if (chk) { setTask(chk.dataset.id, chk.dataset.task); return render(); }
  const o = e.target.closest("[data-open]");
  if (o) return openSheet(o.dataset.open);
  if (e.target.closest("#fab")) return openAdd();
  if (e.target.id === "emptyAdd") return openAdd(ui.q);
  if (e.target.id === "copyAll") {
    const txt = exportText();
    if (!txt) return toast("No notes yet");
    navigator.clipboard?.writeText(txt).then(() => toast("Copied. Paste anywhere."), () => fallbackCopy(txt));
    if (!navigator.clipboard) fallbackCopy(txt);
    return;
  }
  if (e.target.id === "backup") {
    const blob = new Blob([JSON.stringify(db, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `fair-notes-${new Date().toISOString().slice(0, 10)}.json`;
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    return;
  }
  if (e.target.id === "restore") return $("#restoreFile").click();
});

document.addEventListener("change", async (e) => {
  if (e.target.id !== "restoreFile") return;
  const file = e.target.files[0]; if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data.notes !== "object") throw new Error();
    if (!confirm("Replace the notes on this device with the backup?")) return;
    db = { notes: data.notes, custom: data.custom || [] };
    save(); render(); toast("Restored");
  } catch { toast("That file isn't a Fair Notes backup"); }
});

function fallbackCopy(txt) {
  const t = document.createElement("textarea"); t.value = txt; document.body.appendChild(t);
  t.select(); try { document.execCommand("copy"); toast("Copied"); } catch { toast("Copy failed"); } t.remove();
}

window.addEventListener("popstate", () => closeSheet(true));
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });
window.addEventListener("storage", (e) => { if (e.key === KEY) { db = read(KEY, db); if ($("#sheet").hidden) render(); } });

render();
