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
    neighbor:null, draft:[], add:{ status:"idle" }, rank:null, fresh:new Set(), tally:{}, tallyLoaded:false, ymine:null, moodOpen:null, bots:[], botsKey:null });
  groupWatched = null; neighborFor = null; compared = false;
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
  loadYesterdayMine();
  watchShelf();
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
    noteChanges(); render(); maybeNeighbor();
  }, onSubError));
  S.unsubs.push(S.db.collection(`days/${day}/groups/${p.g}/songs`).orderBy("at").onSnapshot(snap => {
    if (S.day !== day) return;
    S.songs = snap.docs.map(d => cleanSong(d.id, d.data())).filter(Boolean);
    S.songsLoaded = true;
    noteChanges(); render(); maybeNeighbor();
  }, onSubError));
  loadBots();
  S.unsubs.push(S.db.collection(`days/${day}/groups/${p.g}/tally`).onSnapshot(snap => {
    if (S.day !== day) return;
    const t = { ...S.tally };
    snap.docs.forEach(d => { t[d.id] = cleanTally(d.data()); });
    S.tally = t; S.tallyLoaded = true;
    noteChanges(); render();
  }, onSubError));
}

// ---------- what changed since I last looked: "前回から3人増えて、2曲増えました" and NEW on those songs ----------
let compared = false;
function noteChanges(){
  if (!S.pick || S.count == null || !S.songsLoaded || !S.tallyLoaded) return;
  const others = S.songs.filter(s => s.id !== S.mySid);
  const mineT = mySong() ? S.tally[S.mySid] || cleanTally(null) : null;
  const colored = t => t ? t.c.reduce((a, b) => a + b, 0) : 0;
  if (!compared){
    if (document.visibilityState !== "visible") return;
    compared = true;
    const seen = ls.get("seen", null);
    if (seen && seen.day === S.day && Array.isArray(seen.ids)){
      const people = Math.max(0, S.count - (num(seen.count) || 0));
      const songs = others.filter(s => !seen.ids.includes(s.id));
      songs.forEach(s => S.fresh.add(s.id));
      const lines = [];
      const msg = people && songs.length ? `前回から${people}人増えて、${songs.length}曲増えました`
        : people ? `前回から${people}人増えました` : songs.length ? `前回から${songs.length}曲増えました` : "";
      if (msg) lines.push(msg);
      // what came back to my song
      if (mineT && seen.mine){
        const heard = mineT.l - (num(seen.mine.l) || 0), cols = colored(mineT) - (num(seen.mine.n) || 0);
        if (heard > 0) lines.push(`あなたの曲を${heard}人が聴きました`);
        else if (cols > 0) lines.push(`あなたの曲に${cols}人が色を付けました`);
      }
      if (lines.length) setTimeout(() => toast(lines.join("\n")), 400);
    }
  } else if (S.seenIds) {
    // songs that arrive while I am looking are NEW too
    others.forEach(s => { if (!S.seenIds.includes(s.id)) S.fresh.add(s.id); });
  }
  saveSeen();
}
function saveSeen(){
  if (!compared || document.visibilityState !== "visible") return;
  S.seenIds = S.songs.map(s => s.id);
  const t = mySong() ? S.tally[S.mySid] || cleanTally(null) : null;
  ls.set("seen", { day:S.day, count:S.count, ids:S.seenIds, mine:t ? { l:t.l, n:t.c.reduce((a, b) => a + b, 0) } : null });
}
// coming back to the app counts as "opening it again"
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && S.pick){ compared = false; noteChanges(); render(); }
});

// ---------- songs Now ON picks: 3 while the playlist has up to 4 people, 1 up to 10, none after that ----------
function botCount(){
  const size = groupSize();
  return size == null ? 0 : size <= 4 ? 3 : size <= 10 ? 1 : 0;
}
async function loadBots(){
  if (!S.pick) return;
  const key = S.day + "|" + S.pick.combo;
  if (S.botsKey === key) return;
  S.botsKey = key;
  const cached = ls.get("bots", null);
  if (cached && cached.key === key && Array.isArray(cached.songs)){ S.bots = cached.songs; render(); return; }
  const songs = await pickMoodSongs(S.day, S.pick.combo, 3);
  if (S.botsKey !== key) return;
  S.bots = songs;
  if (songs.length) ls.set("bots", { key, songs });
  render();
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
      if (song && S.day === day){
        const t = await S.db.doc(`days/${day}/groups/${g}/tally/${song.id}`).get().catch(() => null);
        S.tally = { ...S.tally, [song.id]:cleanTally(t && t.exists ? t.data() : null) };
        S.neighbor = { g, song }; render(); return;
      }
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
    const [mySid, c, s, t] = await Promise.all([
      songIdFor(day, S.uid),
      S.db.doc(`days/${day}/combos/${entry.combo}`).get(),
      S.db.collection(`days/${day}/groups/${entry.g}/songs`).orderBy("at").get(),
      S.db.collection(`days/${day}/groups/${entry.g}/tally`).get().catch(() => ({ docs:[] })),
    ]);
    if (!S.past || S.past.day !== day) return;
    const tally = {};
    t.docs.forEach(d => { tally[d.id] = cleanTally(d.data()); });
    Object.assign(S.past, { mySid, tally, count:c.exists ? num(c.data().n) : null, songs:s.docs.map(d => cleanSong(d.id, d.data())).filter(Boolean), loaded:true });
  } catch { if (S.past && S.past.day === day) S.past.error = true; }
  render();
}

// ---------- moods on songs: listened (-1) or one of the 8 colors; the tally per song is what everyone sees ----------
// my reaction id on a day: a different hash from my song id (the rules check the same)
const reactIdFor = (day, uid) => sha256Hex("r:" + day + ":" + uid);
const songCtx = new Map();   // song id -> { day, g, mine } (filled while drawing)
function myReacts(){ const r = ls.get("reacts", null); return r && r.day === S.day && r.m ? r.m : {}; }
function setMyReact(sid, c){ ls.set("reacts", { day:S.day, m:{ ...myReacts(), [sid]:c } }); }
function cleanTally(d){
  const c = COLORS.map((_, i) => Math.max(0, num(d && d["c" + i]) || 0));
  return { l:Math.max(0, num(d && d.l) || 0), c };
}
let reacting = false;
async function react(sid, c){
  const ctx = songCtx.get(sid);
  if (!ctx || ctx.mine || ctx.bot || ctx.day !== S.day || reacting) return;
  if (todayKey() !== S.day) return;
  const known = myReacts()[sid];
  if (known !== undefined && (c === -1 || c === known)) return;
  reacting = true;
  const prev = S.tally[sid];
  try {
    const rid = sid + "_" + await reactIdFor(S.day, S.uid);
    const base = `days/${S.day}/groups/${ctx.g}`;
    let given = c;
    await S.db.tx(async tx => {
      const r = await tx.get(`${base}/reacts/${rid}`), t = await tx.get(`${base}/tally/${sid}`);
      const old = r.exists ? num(r.data().c) : null;
      given = c;
      if (old != null && (c === -1 || c === old)){ given = old; return; }
      const next = t.exists ? { ...t.data() } : {};
      if (old == null) next.l = (num(next.l) || 0) + 1;
      if (c >= 0) next["c" + c] = (num(next["c" + c]) || 0) + 1;
      if (old != null && old >= 0) next["c" + old] = (num(next["c" + old]) || 0) - 1;
      tx.set(`${base}/reacts/${rid}`, { sid, c });
      tx.set(`${base}/tally/${sid}`, next);
    });
    setMyReact(sid, given);
    if (c >= 0) toast(`「${COLORS[c].name}」を付けました`);
  } catch (e){
    S.tally[sid] = prev;
    if (c >= 0) toast(writeErrorText(e), true);
  } finally { reacting = false; S.moodOpen = null; render(); }
}
// listened to the end, or opened it in a music app: counts once as "聴いた"
function listened(sid){
  const ctx = songCtx.get(sid);
  if (ctx && !ctx.mine && !ctx.bot && ctx.day === S.day && myReacts()[sid] === undefined) react(sid, -1);
}

// ---------- my shelf: songs to keep, from any day ----------
let shelfUnsub = null;
function watchShelf(){
  if (shelfUnsub) return;
  shelfUnsub = S.db.collection(`users/${S.uid}/shelf`).orderBy("at", "desc").limit(300).onSnapshot(snap => {
    S.shelf = snap.docs.map(d => {
      const x = d.data(), s = cleanSong(d.id, x);
      return s && { ...s, day:str(x.day, 10), combo:comboOk(x.combo) ? x.combo : "" };
    }).filter(Boolean);
    S.shelfLoaded = true;
    render();
  }, () => { S.shelfLoaded = true; render(); });
}
const onShelf = sid => S.shelf.some(s => s.id === sid);
async function toggleShelf(s){
  const ctx = songCtx.get(s.id) || {};
  const ref = S.db.doc(`users/${S.uid}/shelf/${s.id}`);
  try {
    if (onShelf(s.id)){
      S.shelf = S.shelf.filter(x => x.id !== s.id); render();
      await ref.delete();
      toast("ボードから外しました");
    } else {
      const day = ctx.day || s.day, combo = ctx.g ? groupCombo(ctx.g) : s.combo;
      await ref.set({ t:s.t, a:s.a, am:s.am, sp:s.sp, yt:s.yt, art:s.art, at:Date.now(), day, combo });
      toast("ボードに貼りました");
    }
  } catch (e){ toast(writeErrorText(e), true); }
}

// ---------- yesterday's song of mine: how it was heard (final after 5:00, so it is kept) ----------
async function loadYesterdayMine(){
  const y = addDays(S.day, -1);
  const cached = ls.get("ymine", null);
  if (cached && cached.day === y){ S.ymine = cached.v; render(); return; }
  try {
    const log = await S.db.doc(`users/${S.uid}/log/${y}`).get();
    const g = log.exists ? str(log.data().g, 20) : "";
    let v = null;
    if (g){
      const sid = await songIdFor(y, S.uid);
      const [song, t] = await Promise.all([
        S.db.doc(`days/${y}/groups/${g}/songs/${sid}`).get(),
        S.db.doc(`days/${y}/groups/${g}/tally/${sid}`).get(),
      ]);
      const s = song.exists ? cleanSong(sid, song.data()) : null;
      if (s) v = { song:s, g, tally:cleanTally(t.exists ? t.data() : null) };
    }
    S.ymine = v;
    ls.set("ymine", { day:y, v });
    render();
  } catch {}
}
