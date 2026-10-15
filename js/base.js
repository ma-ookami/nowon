// Now ON: 定数・状態・日付・色・小さな道具
// index.html から順番に読み込みます(前のファイルで決めた名前を使います)。

const $ = id => document.getElementById(id);

// The 8 colors. A color's number is its place in this list; keep the count in step with comboOk() in firestore.rules.
// name: the mood word shown everywhere (the words can be changed freely; saved data uses only the numbers)
// color: the plain color name, read out by screen readers
// q: words to search Apple's catalog with, for the songs Now ON picks while a playlist has few people
const COLORS = [
  { name:"めらめら",   color:"あか",     hex:"#ef4b4b", q:["ロック 熱い", "パンク", "ラウドロック", "rock anthem", "エモ ロック"] },
  { name:"わくわく",   color:"オレンジ", hex:"#f7923a", q:["ダンス ポップ", "ファンク", "アップテンポ", "disco", "フェス"] },
  { name:"ごきげん",   color:"きいろ",   hex:"#f4cf3a", q:["ハッピー ポップ", "スカ", "サマー ソング", "feel good", "ポップ 元気"] },
  { name:"おだやか",   color:"みどり",   hex:"#45c07a", q:["アコースティック", "フォーク", "ボサノバ", "acoustic", "カフェ"] },
  { name:"すっきり",   color:"みずいろ", hex:"#5ccbea", q:["爽やか", "ギターポップ", "indie pop", "シティポップ", "朝 爽快"] },
  { name:"しんみり",   color:"あお",     hex:"#3d63dd", q:["バラード", "切ない", "失恋", "piano ballad", "泣ける"] },
  { name:"ゆめごこち", color:"むらさき", hex:"#9a62e0", q:["ドリームポップ", "シューゲイザー", "エレクトロニカ", "dream pop", "アンビエント"] },
  { name:"ぼんやり",   color:"グレー",   hex:"#8f96a3", q:["ローファイ", "チル", "lofi hip hop", "ジャズ 夜", "ambient"] },
];
const GROUP_MAX = 30;        // people per playlist; more people with the same 3 colors get a second one (also in firestore.rules)
const NEIGHBOR_UNDER = 3;    // a playlist with fewer people than this gets one song from the nearest playlist
const DAY_START = 5;         // the day changes at 5:00 in Japan (also in firestore.rules)
const DOW = ["日","月","火","水","木","金","土"];
const REPORT_WHY = { notsong:"曲ではない", bad:"不快な内容", other:"その他" };   // keep in step with firestore.rules
const APPS = { spotify:"Spotify", apple:"Apple Music", youtube:"YouTube Music" };

const S = {
  db:null, uid:null, fatal:null,
  day:null,                 // today's key, "2026-10-15"
  pick:null, pickLoaded:false,
  mySid:null,               // my song's id today (a hash of the day and my id)
  count:null,               // how many chose my 3 colors today
  songs:[], songsLoaded:false,
  neighbor:null,            // { g, song } from the nearest playlist, when mine is small
  draft:[],                 // colors being chosen
  joining:false,
  add:{ status:"idle" },    // finding a song to add
  adding:false,
  rank:null,                // yesterday's most chosen
  view:"today", viewDay:null,
  calMonth:null, log:{}, logLoaded:{},
  past:null,                // the day being looked back on
  incoming:null,            // a link shared into the app
  tally:{}, tallyLoaded:false, // per song: { l: listened, c: [count per color] }
  moodOpen:null,            // the song whose color picker is open
  shelf:[], shelfLoaded:false,
  ymine:null,               // yesterday's song of mine and how it was heard
  bots:[], botsKey:null,    // songs Now ON picks for today's 3 colors while few people are here
  unsubs:[],
};

const ls = {
  get(k, d){ try{ const v = localStorage.getItem("nowon." + k); return v == null ? d : JSON.parse(v); }catch{ return d; } },
  set(k, v){ try{ localStorage.setItem("nowon." + k, JSON.stringify(v)); }catch{} },
};

// ---------- days: a day runs from 5:00 to 5:00 in Japan, whatever the phone's time zone ----------
const pad2 = n => String(n).padStart(2, "0");
const SHIFT = (9 - DAY_START) * 3600e3;   // UTC+9, then back 5 hours
function dayKeyAt(t){ const d = new Date(t + SHIFT); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; }
const todayKey = () => dayKeyAt(Date.now());
function dayParts(key){ const [y, m, d] = key.split("-").map(Number); return { y, m, d }; }
function dayStartMs(key){ const { y, m, d } = dayParts(key); return Date.UTC(y, m - 1, d) - SHIFT; }
const dayEndMs = key => dayStartMs(key) + 86400e3;
const addDays = (key, n) => dayKeyAt(dayStartMs(key) + n * 86400e3 + 3600e3);
function dayLabel(key){ const { y, m, d } = dayParts(key); return `${m}/${d}(${DOW[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`; }
function untilText(ms){
  const m = Math.max(0, Math.ceil(ms / 60000));
  if (m < 60) return `あと${m}分`;
  return `あと${Math.floor(m / 60)}時間${m % 60 ? (m % 60) + "分" : ""}`;
}

// ---------- 3 colors: "1-4-6", always smallest first, so the order of choosing doesn't matter ----------
const comboKey = ids => [...ids].sort((a, b) => a - b).join("-");
const comboIds = key => key.split("-").map(Number);
function comboOk(key){
  if (typeof key !== "string" || !/^[0-7]-[0-7]-[0-7]$/.test(key)) return false;
  const [a, b, c] = comboIds(key);
  return a < b && b < c && c < COLORS.length;
}
const comboNames = key => comboIds(key).map(i => COLORS[i].name).join("・");
const groupCombo = g => String(g).split("_")[0];
// a soft 3-color gradient: the playlist's cover
function jacketBg(key){
  const [a, b, c] = comboIds(key).map(i => COLORS[i].hex);
  return `radial-gradient(110% 90% at 0% 0%, ${a} 0%, transparent 64%),`
    + `radial-gradient(100% 100% at 100% 15%, ${b} 0%, transparent 62%),`
    + `radial-gradient(130% 95% at 35% 105%, ${c} 0%, transparent 68%),`
    + `linear-gradient(135deg, ${a}, ${b} 50%, ${c})`;
}
// how many colors two combos share
const shared = (x, y) => comboIds(x).filter(i => comboIds(y).includes(i)).length;

// ---------- helpers ----------
function h(tag, attrs, ...kids){
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs){
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "style" && typeof v === "object") for (const p in v) el.style.setProperty(p.replace(/[A-Z]/g, c => "-" + c.toLowerCase()), v[p]);
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()){ if (c == null || c === false) continue; el.append(c.nodeType ? c : document.createTextNode(String(c))); }
  return el;
}
const str = (v, n) => typeof v === "string" ? v.slice(0, n) : "";
const num = v => typeof v === "number" && isFinite(v) ? v : null;
async function sha256Hex(text){
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, "0")).join("");
}
// my song's id on a day: the rules check the same hash, and it can't be traced back to me across days
const songIdFor = (day, uid) => sha256Hex(day + ":" + uid);

// ---------- toast ----------
let toastT;
function toast(msg, err){
  const t = $("toast");
  t.textContent = msg;
  t.classList.toggle("err", !!err); t.classList.add("show");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), err ? 3600 : 2200);
}
function writeErrorText(e){
  const code = e && e.code;
  if (code === "quota_exceeded") return "今日はこれ以上保存できません(無料枠の上限)。明日また試してください";
  if (code === "invalid_argument") return "保存できませんでした。ページを再読み込みしてから、もう一度試してください";
  return "保存に失敗しました。通信を確認して、もう一度試してください";
}
function fail(msg){ S.fatal = msg; render(); }
