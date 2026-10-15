// Now ON: 画面遷移・色を選ぶ・曲を探して置く・通報・設定などの操作
// index.html から順番に読み込みます(前のファイルで決めた名前を使います)。

// ---------- screens follow the address (#, #cal, #d=...) ----------
window.addEventListener("hashchange", () => { stopPreview(); render(); window.scrollTo(0, 0); });
document.addEventListener("click", e => { if (e.target.closest("[data-reload]")) location.reload(); });

// ---------- sheets ----------
let lastFocus = null;
function openSheet(id){
  lastFocus = document.activeElement;
  $(id).hidden = false; document.body.classList.add("sheet-open");
  const f = $(id).querySelector("button:not([disabled])");
  if (f) f.focus();
}
function closeSheets(){
  document.querySelectorAll(".sheet").forEach(s => { s.hidden = true; });
  document.body.classList.remove("sheet-open");
  if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch {}
}
document.querySelectorAll(".sheet").forEach(s => s.addEventListener("click", e => {
  if (e.target === s || e.target.closest("[data-close]")) closeSheets();
}));
document.addEventListener("keydown", e => { if (e.key === "Escape") closeSheets(); });

let cfAction = null;
function confirmSheet(title, body, okLabel, fn){
  $("cfTitle").textContent = title;
  $("cfBody").replaceChildren(...[].concat(body));
  $("cfOk").textContent = okLabel;
  cfAction = fn;
  openSheet("shConfirm");
  $("cfOk").focus();
}
$("cfOk").addEventListener("click", () => { const fn = cfAction; cfAction = null; closeSheets(); if (fn) fn(); });

// ---------- choose 3 colors ----------
$("swatches").addEventListener("click", e => {
  const b = e.target.closest(".sw");
  if (!b || b.disabled) return;
  const i = Number(b.dataset.i);
  S.draft = S.draft.includes(i) ? S.draft.filter(x => x !== i) : S.draft.length < 3 ? [...S.draft, i] : S.draft;
  render();
});
$("pickGo").addEventListener("click", () => {
  if (S.draft.length !== 3) return;
  const combo = comboKey(S.draft);
  confirmSheet("今日はこの3色",
    [h("div", { class:"jacket cf-j", style:{ background:jacketBg(combo) }, "aria-hidden":"true" }),
     h("p", { class:"cf-names", text:comboNames(combo) }),
     h("p", { class:"muted small", text:"今日はあとから変えられません。朝5時に新しい1日になります。" })],
    "この3色で決める", () => joinToday(combo));
});

// ---------- find a song and put it ----------
let findSeq = 0;
async function find(text){
  text = String(text || "").trim();
  if (!text) return;
  const seq = ++findSeq;
  S.add = { status:"loading" }; render();
  const r = await findSongs(text);
  if (seq !== findSeq) return;
  S.add = r; render();
}
$("addForm").addEventListener("submit", e => { e.preventDefault(); find($("addInput").value); });
// a pasted link is looked up right away
$("addInput").addEventListener("paste", () => setTimeout(() => { if (parseMusicLink($("addInput").value)) find($("addInput").value); }, 0));
$("pasteBtn").addEventListener("click", async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (!t || !t.trim()) return toast("コピーされたものがありません", true);
    $("addInput").value = t.trim().slice(0, 500);
    find(t);
  } catch { toast("貼り付けできませんでした。入力欄を長押しして貼り付けてください", true); }
});
function confirmPut(song){
  confirmSheet("この曲を置きますか?",
    [candRow(song, () => {}), h("p", { class:"muted small", text:"置けるのは1日1曲で、あとから変えられません。" })],
    "プレイリストに置く", () => putSong(song));
  const c = $("cfBody").querySelector(".cand");
  if (c){ c.disabled = true; c.classList.add("static"); }
}

// ---------- report ----------
function openReport(s, day, g){
  $("rpSong").textContent = s.t + (s.a ? " / " + s.a : "");
  $("rpWhy").replaceChildren(...Object.keys(REPORT_WHY).map(k => h("button", { type:"button", class:"btn", onclick:() => {
    closeSheets(); reportSong(day, g, s.id, k);
  } }, REPORT_WHY[k])));
  openSheet("shReport");
}

// ---------- calendar ----------
function moveMonth(d){
  const { y, m } = S.calMonth, t = new Date(Date.UTC(y, m - 1 + d, 1));
  S.calMonth = { y:t.getUTCFullYear(), m:t.getUTCMonth() + 1 };
  render();
}
$("calPrev").addEventListener("click", () => moveMonth(-1));
$("calNext").addEventListener("click", () => moveMonth(1));

// ---------- settings ----------
$("setBtn").addEventListener("click", () => { renderSettings(); openSheet("shSet"); });
function renderSettings(){
  const a = ls.get("app", "");
  document.querySelectorAll("#appPick button").forEach(b => { const on = b.dataset.a === a; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
  const bl = blindOn() ? "on" : "off";
  document.querySelectorAll("#blindPick button").forEach(b => { const on = b.dataset.b === bl; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
}
$("blindPick").addEventListener("click", e => {
  const b = e.target.closest("button[data-b]"); if (!b) return;
  ls.set("blind", b.dataset.b === "on"); renderSettings(); render(); toast("保存しました");
});
$("appPick").addEventListener("click", e => {
  const b = e.target.closest("button[data-a]"); if (!b) return;
  ls.set("app", b.dataset.a); renderSettings(); render(); toast("保存しました");
});
$("reloadBtn").addEventListener("click", () => location.reload());
