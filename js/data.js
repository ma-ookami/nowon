// Now ON: 今日の購読・3色を決める・曲を置く・となりのグループ・昨日のランキング・きろく
// index.html から順番に読み込みます(前のファイルで決めた名前を使います)。

// ---------- subscriptions ----------
function stopSubs(){ S.unsubs.forEach(u => { try{u();}catch{} }); S.unsubs = []; }
function onSubError(e){
  if (e && e.code === "revoked") return fail("このページへのアクセスが変わりました。再読み込みしてください。");
  fail("データを読み込めませんでした。通信を確認して再読み込みしてください。");
}

// (re)start everything for today; also called when 5:00 passes while the app is open
let groupWatched = null, neighborFor = null;
async function startDay(){
  stopSubs();
  const day = todayKey();
  Object.assign(S, { day, pick:null, pickLoaded:false, mySid:null, count:null, songs:[], songsLoaded:false,
    neighbor:null, draft:[], add:{ status:"idle" }, rank:null });
  groupWatched = null; neighborFor = null;
  render();
  S.mySid = await songIdFor(day, S.uid);
  if (S.day !== day) return;
  S.unsubs.push(S.db.doc(`days/${day}/picks/${S.uid}`).onSnapshot(snap => {
    if (S.day !== day) return;
    S.pick = cleanPick(snap.exists ? snap.data() : null);
    S.pickLoaded = true;
    if (S.pick){
      S.log[day] = { combo:S.pick.combo, g:S.pick.g };
      watchGroup();
    }
    render();
  }, onSubError));
  loadRank();
}
function cleanPick(d){
  if (!d || !comboOk(d.combo) || !num(d.n) || typeof d.g !== "string") return null;
  return { combo:d.combo, n:d.n, g:str(d.g, 20) };
}

function watchGroup(){
  const day = S.day, p = S.pick;
  if (groupWatched === day + p.g) return;
  groupWatched = day + p.g;
  S.unsubs.push(S.db.doc(`days/${day}/combos/${p.combo}`).onSnapshot(snap => {
    if (S.day !== day) return;
    S.count = snap.exists ? num(snap.data().n) : null;
    render(); maybeNeighbor();
  }, onSubError));
  S.unsubs.push(S.db.collection(`days/${day}/groups/${p.g}/songs`).orderBy("at").onSnapshot(snap => {
    if (S.day !== day) return;
    S.songs = snap.docs.map(d => cleanSong(d.id, d.data())).filter(Boolean);
    S.songsLoaded = true;
    render(); maybeNeighbor();
  }, onSubError));
}

// people in my playlist: playlists fill up 30 at a time
function groupSize(){
  if (!S.pick || S.count == null) return null;
  const slot = Number(S.pick.g.split("_")[1]) || 0;
  return Math.max(1, Math.min(GROUP_MAX, S.count - slot * GROUP_MAX));
}

// ---------- the nearest playlist (one color different), only while mine is small ----------
async function maybeNeighbor(){
  const size = groupSize();
  if (size == null || !S.songsLoaded || size >= NEIGHBOR_UNDER) return;
  const day = S.day, p = S.pick;
  if (neighborFor === day + p.g) return;
  neighborFor = day + p.g;
  try {
    const tries = [];
    // a second playlist of the same 3 colors: the first one is full, so ask it first
    const slot = Number(p.g.split("_")[1]) || 0;
    if (slot > 0) tries.push(`${p.combo}_${slot - 1}`);
    const snap = await S.db.collection(`days/${day}/combos`).get();
    snap.docs
      .map(d => ({ combo:d.id, n:num(d.data().n) || 0 }))
      .filter(c => comboOk(c.combo) && c.n > 0 && shared(c.combo, p.combo) === 2)
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .forEach(c => tries.push(c.combo + "_0"));
    for (const g of tries){
      const s = await S.db.collection(`days/${day}/groups/${g}/songs`).orderBy("at").limit(1).get();
      const song = s.docs.map(d => cleanSong(d.id, d.data())).find(Boolean);
      if (song && S.day === day){ S.neighbor = { g, song }; render(); return; }
    }
  } catch {}
}

// ---------- choose today's 3 colors (once) ----------
async function joinToday(combo){
  if (S.joining || S.pick || !comboOk(combo)) return;
  const day = S.day, uid = S.uid;
  if (todayKey() !== day){ startDay(); return toast("新しい1日になりました。もう一度選んでください"); }
  S.joining = true; render();
  try {
    await S.db.tx(async tx => {
      const mine = await tx.get(`days/${day}/picks/${uid}`);
      if (mine.exists) return;
      const c = await tx.get(`days/${day}/combos/${combo}`);
      const n = (c.exists ? num(c.data().n) || 0 : 0) + 1;
      const g = `${combo}_${Math.floor((n - 1) / GROUP_MAX)}`;
      tx.set(`days/${day}/combos/${combo}`, { n });
      tx.set(`days/${day}/picks/${uid}`, { combo, n, g, at:Date.now() });
      tx.set(`users/${uid}/log/${day}`, { combo, g, day });
    });
    S.draft = [];
  } catch (e){
    toast(e && e.code === "invalid_argument" ? "選べませんでした。スマホの時計がずれていないか確認して、再読み込みしてください" : writeErrorText(e), true);
  } finally { S.joining = false; render(); }
}

// ---------- put my song (once a day) ----------
async function putSong(song){
  if (S.adding || !S.pick || !S.mySid || mySong()) return;
  const day = S.day;
  if (todayKey() !== day){ startDay(); return toast("新しい1日になりました", true); }
  S.adding = true; render();
  try {
    const data = { t:str(song.t, 200), a:str(song.a, 200), am:song.am || "", sp:song.sp || "", yt:song.yt || "", art:cleanArt(song.art), at:Date.now() };
    await S.db.commit([
      [`days/${day}/owners/${S.mySid}`, { uid:S.uid }],
      [`days/${day}/groups/${S.pick.g}/songs/${S.mySid}`, data],
    ]);
    S.add = { status:"idle" };
    $("addInput").value = "";
    toast("プレイリストに置きました");
  } catch (e){ toast(writeErrorText(e), true); }
  finally { S.adding = false; render(); }
}
const mySong = () => S.songs.find(s => s.id === S.mySid) || null;

// ---------- report a song ----------
const hidden = new Set(ls.get("hidden", []));
async function reportSong(day, g, sid, why){
  hidden.add(sid); ls.set("hidden", [...hidden].slice(-300));
  render();
  try {
    await S.db.doc(`reports/${sid}_${S.uid}`).set({ day, g, sid, why, by:S.uid, at:Date.now() });
    toast("通報しました。ありがとうございます");
  } catch (e){
    // already reported from this browser counts as done
    toast(e && e.code === "invalid_argument" ? "通報しました" : writeErrorText(e), e && e.code !== "invalid_argument");
  }
}

// ---------- yesterday's most chosen 3 colors (closed at 5:00, so it can be kept) ----------
async function loadRank(){
  const yday = addDays(S.day, -1);
  const cached = ls.get("rank", null);
  if (cached && cached.day === yday && Array.isArray(cached.list)){ S.rank = cached.list; render(); return; }
  try {
    const snap = await S.db.collection(`days/${yday}/combos`).orderBy("n", "desc").limit(3).get();
    const list = snap.docs.map(d => ({ combo:d.id, n:num(d.data().n) || 0 })).filter(x => comboOk(x.combo) && x.n > 0);
    S.rank = list;
    ls.set("rank", { day:yday, list });
    render();
  } catch {}
}

// ---------- my record (calendar) ----------
const monthKey = (y, m) => `${y}-${pad2(m)}`;
async function loadMonth(y, m){
  const key = monthKey(y, m);
  if (S.logLoaded[key] !== undefined) return;   // loaded, loading, or failed (tried again after a reload)
  S.logLoaded[key] = "loading";
  try {
    const snap = await S.db.collection(`users/${S.uid}/log`).where("day", ">=", `${key}-01`).where("day", "<=", `${key}-31`).get();
    snap.docs.forEach(d => { const x = d.data(); if (x && comboOk(x.combo)) S.log[d.id] = { combo:x.combo, g:str(x.g, 20) }; });
    S.logLoaded[key] = true;
  } catch { S.logLoaded[key] = "error"; toast("きろくを読み込めませんでした", true); }
  render();
}

// a past day's playlist: read once (it no longer changes)
async function loadPast(day){
  const entry = S.log[day];
  if (!entry){ S.past = { day, missing:true }; render(); return; }
  S.past = { day, combo:entry.combo, g:entry.g, count:null, songs:[], loaded:false, mySid:null };
  render();
  try {
    const [mySid, c, s] = await Promise.all([
      songIdFor(day, S.uid),
      S.db.doc(`days/${day}/combos/${entry.combo}`).get(),
      S.db.collection(`days/${day}/groups/${entry.g}/songs`).orderBy("at").get(),
    ]);
    if (!S.past || S.past.day !== day) return;
    Object.assign(S.past, { mySid, count:c.exists ? num(c.data().n) : null, songs:s.docs.map(d => cleanSong(d.id, d.data())).filter(Boolean), loaded:true });
  } catch { if (S.past && S.past.day === day) S.past.error = true; }
  render();
}
