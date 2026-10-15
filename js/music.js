// Now ON: 音楽リンクの見分け・曲の確認(Apple の曲検索・Spotify / YouTube の公開情報)・試聴
// index.html から順番に読み込みます(前のファイルで決めた名前を使います)。
//
// サーバーを使わずに、ブラウザから直接呼べる公開の仕組みだけを使います。
// - Apple Music の曲: iTunes Search API(曲名・アーティスト・ジャケット・30秒の試聴)
// - Spotify の曲:     oEmbed(曲名とジャケットだけ)→ Apple の検索で同じ曲を選んでもらう
// - YouTube Music:   oEmbed(題名とチャンネル名)→ 同じく Apple の検索で選んでもらう
// 曲だと確かめられないリンク(アルバム・プレイリスト・ふつうのサイト)は追加できません。

const ITUNES = "https://itunes.apple.com";
const COUNTRY = "jp";

function firstUrl(text){
  const m = String(text || "").match(/https?:\/\/[^\s<>"'「」()（）]+/);
  if (m) return m[0];
  const u = String(text || "").match(/spotify:track:[A-Za-z0-9]{22}/);
  return u ? u[0] : null;
}

// what a pasted text points to
function parseMusicLink(text){
  const raw = firstUrl(text);
  if (!raw) return null;
  const uri = raw.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  if (uri) return { kind:"spotify", id:uri[1] };
  let u;
  try { u = new URL(raw); } catch { return { kind:"other" }; }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const path = u.pathname;
  if (host === "open.spotify.com" || host === "play.spotify.com"){
    const m = path.match(/^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/([A-Za-z0-9]{22})\/?$/i);
    return m ? { kind:"spotify", id:m[1] } : { kind:"notsong", app:"Spotify" };
  }
  if (host === "spotify.link" || host === "spoti.fi") return { kind:"short" };
  if (host === "music.apple.com" || host === "geo.music.apple.com" || host === "itunes.apple.com"){
    const i = u.searchParams.get("i");
    if (i && /^\d{1,15}$/.test(i)) return { kind:"apple", id:i };
    const m = path.match(/\/song\/(?:[^/]+\/)?(\d{1,15})\/?$/);
    return m ? { kind:"apple", id:m[1] } : { kind:"notsong", app:"Apple Music" };
  }
  if (host === "music.youtube.com"){
    const v = u.searchParams.get("v");
    return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? { kind:"ytmusic", id:v } : { kind:"notsong", app:"YouTube Music" };
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "youtu.be"){
    const v = host === "youtu.be" ? path.slice(1).split("/")[0] : u.searchParams.get("v");
    return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? { kind:"youtube", id:v } : { kind:"other" };
  }
  return { kind:"other" };
}

async function fetchJson(url, ms = 9000){
  const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
  try {
    const r = await fetch(url, { signal:ac.signal });
    if (r.status === 404 || r.status === 400) return null;
    if (!r.ok) throw new Error("http " + r.status);
    return await r.json();
  } finally { clearTimeout(t); }
}

// artwork the app may show (keep in step with validSong() in firestore.rules)
const ART_RE = /^https:\/\/(is[0-9]+-ssl\.mzstatic\.com|i\.scdn\.co|image-cdn-[a-z0-9-]+\.spotifycdn\.com|i\.ytimg\.com)\/[A-Za-z0-9\/._%-]+$/;
const cleanArt = u => typeof u === "string" && u.length <= 400 && ART_RE.test(u) ? u : "";

const preview = new Map();   // apple id -> 30-second preview URL
function fromItunes(r){
  if (!r || r.kind !== "song" || !r.trackId || !r.trackName) return null;
  if (r.previewUrl) preview.set(String(r.trackId), r.previewUrl);
  return { t:str(r.trackName, 200), a:str(r.artistName, 200), al:str(r.collectionName, 200), am:String(r.trackId), sp:"", yt:"",
    art:cleanArt(String(r.artworkUrl100 || "").replace(/\/100x100bb\./, "/300x300bb.")) };
}
async function itunesLookup(id){
  const j = await fetchJson(`${ITUNES}/lookup?id=${encodeURIComponent(id)}&country=${COUNTRY}&entity=song`);
  return j && Array.isArray(j.results) ? j.results.map(fromItunes).find(s => s && s.am === String(id)) || null : null;
}
async function itunesSearch(term, limit = 8){
  term = String(term || "").trim().slice(0, 120);
  if (!term) return [];
  const j = await fetchJson(`${ITUNES}/search?term=${encodeURIComponent(term)}&entity=song&country=${COUNTRY}&limit=${limit}`);
  const seen = new Set();
  return (j && Array.isArray(j.results) ? j.results.map(fromItunes) : []).filter(s => s && !seen.has(s.am) && seen.add(s.am));
}
async function spotifyInfo(id){
  const j = await fetchJson(`https://open.spotify.com/oembed?url=${encodeURIComponent("https://open.spotify.com/track/" + id)}`);
  return j && j.title ? { t:str(j.title, 200), art:cleanArt(j.thumbnail_url) } : null;
}
async function youtubeInfo(id){
  const j = await fetchJson(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://music.youtube.com/watch?v=" + id)}`);
  if (!j || !j.title) return null;
  const author = str(j.author_name, 200).replace(/\s*-\s*Topic$/i, "").trim();
  return { t:str(j.title, 200), author, art:cleanArt(String(j.thumbnail_url || "").replace(/^https?:/, "https:")) };
}
// "Artist - Title (Official Video) [4K]" -> words worth searching for
function searchWords(title, author){
  let t = String(title || "").replace(/[\(\[【（][^\)\]】）]*[\)\]】）]/g, " ").replace(/\b(official|music|video|mv|lyric|lyrics|audio|hd|4k)\b/gi, " ");
  if (author && !t.toLowerCase().includes(author.toLowerCase())) t = author + " " + t;
  return t.replace(/\s+/g, " ").trim();
}

// A pasted text or a search word -> what to show next.
//   { status:"one", song }                       a single song, ready to add
//   { status:"pick", src, results }              choose the same song among Apple's results
//   { status:"error", msg }
async function findSongs(text){
  const link = parseMusicLink(text);
  try {
    if (!link){
      const results = await itunesSearch(text);
      return results.length ? { status:"pick", src:null, results } : { status:"error", msg:"見つかりませんでした。別のことばで探すか、音楽アプリの曲のリンクを貼ってください" };
    }
    if (link.kind === "apple"){
      const song = await itunesLookup(link.id);
      return song ? { status:"one", song } : { status:"error", msg:"Apple Music の曲として確認できませんでした" };
    }
    if (link.kind === "spotify"){
      const info = await spotifyInfo(link.id);
      if (!info) return { status:"error", msg:"Spotify の曲として確認できませんでした" };
      const src = { kind:"spotify", id:link.id, t:info.t, a:"", art:info.art };
      const results = await itunesSearch(info.t).catch(() => []);
      return { status:"pick", src, results };
    }
    if (link.kind === "ytmusic" || link.kind === "youtube"){
      const info = await youtubeInfo(link.id);
      if (!info) return { status:"error", msg:"YouTube の曲として確認できませんでした" };
      const src = { kind:link.kind, id:link.id, t:info.t, a:info.author, art:info.art };
      const results = await itunesSearch(searchWords(info.t, info.author)).catch(() => []);
      if (link.kind === "youtube" && !results.length) return { status:"error", msg:"曲として確認できませんでした。YouTube の動画は、曲として見つかったものだけ追加できます" };
      return { status:"pick", src, results };
    }
    if (link.kind === "short") return { status:"error", msg:"短いリンク(spotify.link)は使えません。Spotify で曲を開き、「共有」→「リンクをコピー」で出るリンクを貼ってください" };
    if (link.kind === "notsong") return { status:"error", msg:`${link.app} のアルバムやプレイリストは追加できません。1曲のリンクを貼ってください` };
    return { status:"error", msg:"音楽のリンク(Spotify・Apple Music・YouTube Music)だけ追加できます" };
  } catch {
    return { status:"error", msg:"曲を確認できませんでした。通信を確認して、もう一度試してください" };
  }
}
// the song to save, from what the person chose
function songFrom(src, cand){
  if (cand) return { t:cand.t, a:cand.a, am:cand.am, art:cand.art || (src && src.art) || "",
    sp:src && src.kind === "spotify" ? src.id : "", yt:src && src.kind === "ytmusic" ? src.id : "" };
  // the link alone (Apple's search didn't have it)
  return { t:src.t, a:src.a || "", am:"", art:src.art || "", sp:src.kind === "spotify" ? src.id : "", yt:src.kind === "ytmusic" ? src.id : "" };
}

function cleanSong(id, d){
  if (!d || !str(d.t, 200)) return null;
  const am = /^\d{1,15}$/.test(d.am) ? d.am : "", sp = /^[A-Za-z0-9]{22}$/.test(d.sp) ? d.sp : "", yt = /^[A-Za-z0-9_-]{11}$/.test(d.yt) ? d.yt : "";
  if (!am && !sp && !yt) return null;
  return { id, t:str(d.t, 200), a:str(d.a, 200), am, sp, yt, art:cleanArt(d.art), at:num(d.at) || 0 };
}

// where to open a song in each app: the exact song when known, otherwise a search
function openUrl(s, app){
  const q = encodeURIComponent((s.t + " " + s.a).trim());
  if (app === "spotify") return s.sp ? `https://open.spotify.com/track/${s.sp}` : `https://open.spotify.com/search/${q}`;
  if (app === "apple") return s.am ? `https://music.apple.com/${COUNTRY}/song/${s.am}` : `https://music.apple.com/${COUNTRY}/search?term=${q}`;
  return s.yt ? `https://music.youtube.com/watch?v=${s.yt}` : `https://music.youtube.com/search?q=${q}`;
}
const exactIn = (s, app) => app === "spotify" ? !!s.sp : app === "apple" ? !!s.am : !!s.yt;

// ---------- songs Now ON picks for a day's 3 colors (while few people are here) ----------
// The same day and 3 colors always give the same picks, so everyone in the playlist hears the same songs.
function seeded(text){
  let x = 2166136261;
  for (let i = 0; i < text.length; i++) x = Math.imul(x ^ text.charCodeAt(i), 16777619);
  return () => {
    x = Math.imul(x ^ (x >>> 15), 2246822507); x = Math.imul(x ^ (x >>> 13), 3266489909); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };
}
async function pickMoodSongs(day, combo, n){
  const rnd = seeded(day + "|" + combo), ids = comboIds(combo), out = [], seen = new Set();
  for (let i = 0; i < n * 3 && out.length < n; i++){
    const mood = ids[out.length % 3], words = COLORS[mood].q;
    const term = words[Math.floor(rnd() * words.length)];
    const pool = (await itunesSearch(term, 25).catch(() => [])).filter(s => !seen.has(s.am));
    if (!pool.length) continue;
    const s = pool[Math.floor(rnd() * pool.length)];
    seen.add(s.am);
    out.push({ id:"bot_" + s.am, t:s.t, a:s.a, am:s.am, sp:"", yt:"", art:s.art, at:0, mood });
  }
  return out;
}

// ---------- 30-second previews (Apple only) ----------
const player = new Audio();
player.preload = "none";
let playingId = null;   // the song (its id in the playlist) being previewed
async function togglePreview(am, sid){
  if (playingId === sid){ player.pause(); playingId = null; renderPlaying(); return; }
  playingId = sid; renderPlaying();
  try {
    if (!preview.has(am)) await itunesLookup(am);
    const url = preview.get(am);
    if (!url){ playingId = null; renderPlaying(); return toast("この曲は試聴できません", true); }
    if (playingId !== sid) return;
    player.src = url;
    await player.play();
  } catch {
    if (playingId === sid){ playingId = null; renderPlaying(); toast("試聴できませんでした", true); }
  }
}
// listened to the end: a hidden song's title comes out
player.addEventListener("ended", () => { const sid = playingId; playingId = null; renderPlaying(); if (sid){ listened(sid); reveal(sid); } });
player.addEventListener("timeupdate", () => renderProgress());
function stopPreview(){ if (playingId){ player.pause(); playingId = null; renderPlaying(); } }
