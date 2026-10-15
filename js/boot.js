// Now ON: Firebase との接続・新しい版の確認・テーマ・共有で開いたとき・起動
// index.html から順番に読み込みます(前のファイルで決めた名前を使います)。

// ---------- Firebase adapter: the small doc/collection API the page uses ----------
const ERR = { "permission-denied":"invalid_argument", "invalid-argument":"invalid_argument", "failed-precondition":"invalid_argument",
  "not-found":"invalid_argument", "resource-exhausted":"quota_exceeded", "unavailable":"unavailable", "deadline-exceeded":"unavailable",
  "aborted":"unavailable", "unauthenticated":"revoked" };
const wrapErr = e => ({ code: ERR[e && e.code] || "unavailable", message: String((e && e.message) || e) });
const rethrow = p => p.catch(e => { throw wrapErr(e); });
const wrapDoc = d => ({ id:d.id, exists:d.exists, data:() => d.exists ? d.data() : undefined, metadata:d.metadata });
const wrapQuery = q => ({ docs:q.docs.map(wrapDoc), size:q.size, empty:q.empty, metadata:q.metadata });
function makeDb(fsdb){
  const docRef = r => ({ id:r.id, path:r.path,
    get: () => rethrow(r.get().then(wrapDoc)),
    set: d => rethrow(r.set(d)),
    onSnapshot: (next, err) => r.onSnapshot(x => next(wrapDoc(x)), e => err && err(wrapErr(e))) });
  const query = q => ({
    where: (f, op, v) => query(q.where(f, op, v)),
    orderBy: (f, dir) => query(q.orderBy(f, dir)),
    limit: n => query(q.limit(n)),
    get: () => rethrow(q.get().then(wrapQuery)),
    onSnapshot: (next, err) => q.onSnapshot(x => next(wrapQuery(x)), e => err && err(wrapErr(e))) });
  // several writes that succeed or fail together: [path, data]
  const commit = async ops => {
    const batch = fsdb.batch();
    ops.forEach(([p, d]) => batch.set(fsdb.doc(p), d));
    await rethrow(batch.commit());
  };
  // read then write, retried by Firestore when someone else wrote in between (the per-color count)
  const tx = fn => rethrow(fsdb.runTransaction(t => fn({
    get: p => t.get(fsdb.doc(p)).then(wrapDoc),
    set: (p, d) => { t.set(fsdb.doc(p), d); },
  })));
  return { doc: p => docRef(fsdb.doc(p)), collection: p => query(fsdb.collection(p)), commit, tx };
}

// ---------- new-version check (GitHub Pages) ----------
let pageSig = null;
const sigOf = t => { let x = 0; for (let i = 0; i < t.length; i++) x = (x * 31 + t.charCodeAt(i)) | 0; return t.length + ":" + x; };
const pageFiles = () => [location.pathname, ...[...document.querySelectorAll('script[src^="js/"], link[href^="css/"]')].map(e => e.getAttribute("src") || e.getAttribute("href"))];
async function fetchSig(){
  const texts = await Promise.all(pageFiles().map(async f => { const r = await fetch(f, { cache:"no-store" }); if (!r.ok) throw new Error(f); return r.text(); }));
  return sigOf(texts.join("\n"));
}
async function checkVersion(){
  try {
    const now = await fetchSig();
    if (pageSig && now && now !== pageSig){ $("updating").hidden = false; setTimeout(() => location.reload(), 600); }
  } catch {}
}

// ---------- theme ----------
function applyTheme(){
  const t = ls.get("theme", "auto");
  if (t === "auto") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  document.querySelectorAll("#themePick button").forEach(b => { const on = b.dataset.t === t; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on)); });
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#121218";
}
$("themePick").addEventListener("click", e => { const b = e.target.closest("button[data-t]"); if (!b) return; ls.set("theme", b.dataset.t); applyTheme(); toast("保存しました"); });
matchMedia("(prefers-color-scheme: light)").addEventListener("change", applyTheme);
applyTheme();

// ---------- connection banner ----------
function updateOnline(){ $("offline").hidden = navigator.onLine !== false; }
window.addEventListener("online", updateOnline);
window.addEventListener("offline", updateOnline);
updateOnline();

// ---------- opened from a music app's share button (Android, after adding to the home screen) ----------
function takeIncoming(){
  const q = new URLSearchParams(location.search);
  const text = ["url", "text", "title"].map(k => q.get(k) || "").join(" ").trim();
  if (!text) return;
  S.incoming = text.slice(0, 500);
  try { history.replaceState(null, "", location.pathname + location.hash); } catch {}
}
// once today's playlist is open and I haven't put a song yet, look the shared link up
function useIncoming(){
  if (!S.incoming || !S.pick || !S.songsLoaded || mySong() || S.view !== "today") return;
  const t = S.incoming; S.incoming = null;
  $("addInput").value = t;
  find(t);
}

// ---------- the clock: 5:00 starts a new day; the countdown ticks ----------
setInterval(() => {
  if (!S.db || S.fatal) return;
  if (todayKey() !== S.day){ startDay(); toast("新しい1日になりました"); return; }
  if (S.view === "today" && S.pick) $("todayClose").textContent = `朝5時に閉じます(${untilText(dayEndMs(S.day) - Date.now())})`;
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !S.db) return;
  if (todayKey() !== S.day){ startDay(); return; }
  checkVersion();
});

// ---------- boot ----------
async function boot(){
  // local testing against the Firebase emulators: http://localhost:8080/?emu (read before the shared link is cleared from the address)
  const emu = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /(^|[?&])emu\b/.test(location.search);
  fetchSig().then(x => { pageSig = x; }).catch(() => {});
  takeIncoming();
  render();
  const slow = setTimeout(() => { $("slowNote").hidden = false; }, 8000);
  const cfg = window.FIREBASE_CONFIG;
  if (!window.firebase || !cfg || (!cfg.apiKey && !emu)){
    clearTimeout(slow);
    return fail("Firebaseの設定が読み込めませんでした。firebase-config.js に設定を貼り付けたか確認してください。");
  }
  try {
    firebase.initializeApp(emu ? { apiKey:"demo-key", projectId:"demo-nowon", authDomain:"localhost" } : cfg);
    const siteKey = window.APPCHECK_SITE_KEY;
    if (siteKey && firebase.appCheck && !emu){
      if (/^(localhost|127.0.0.1)$/.test(location.hostname)) self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
      firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(siteKey), true);
    }
    const auth = firebase.auth(), fs = firebase.firestore();
    if (emu){ auth.useEmulator("http://127.0.0.1:9099", { disableWarnings:true }); fs.useEmulator("127.0.0.1", 8085); }
    // each browser gets a hidden anonymous account, kept between visits
    const u = await new Promise((resolve, reject) => {
      const stop = auth.onAuthStateChanged(x => {
        if (x){ stop(); resolve(x); }
        else auth.signInAnonymously().catch(reject);
      }, reject);
    });
    S.uid = u.uid;
    S.db = makeDb(fs);
  } catch (e){
    clearTimeout(slow);
    return fail("サーバーにつながりませんでした。通信を確認して再読み込みしてください。");
  }
  clearTimeout(slow);
  startDay();
}
boot();
