// Now ON: 画面の描画
// index.html から順番に読み込みます(前のファイルで決めた名前を使います)。

const SCREENS = ["sLoading", "sError", "sPick", "sToday", "sCal", "sDay", "sShelf"];
function show(id){ SCREENS.forEach(s => { $(s).hidden = s !== id; }); }

// which screen the address asks for: "#cal", "#d=2026-10-12", otherwise today
function route(){
  const hsh = location.hash.slice(1);
  if (hsh === "cal") return { view:"cal" };
  if (hsh === "shelf") return { view:"shelf" };
  const m = hsh.match(/^d=(\d{4}-\d{2}-\d{2})$/);
  if (m && m[1] !== S.day) return { view:"day", day:m[1] };
  return { view:"today" };
}

function render(){
  if (S.fatal){
    show("sError"); $("errMsg").textContent = S.fatal; $("tabs").hidden = true; $("setBtn").hidden = true;
    return;
  }
  const ready = S.uid && S.pickLoaded;
  $("tabs").hidden = !ready; $("setBtn").hidden = !ready;
  if (!ready){ show("sLoading"); return; }
  const r = route();
  S.view = r.view;
  document.querySelectorAll("#tabs a").forEach(a => a.classList.toggle("on", a.dataset.v === (r.view === "day" ? "cal" : r.view)));
  if (r.view === "cal"){ show("sCal"); renderCal(); return; }
  if (r.view === "shelf"){ show("sShelf"); renderShelf(); return; }
  if (r.view === "day"){ show("sDay"); renderDay(r.day); return; }
  if (!S.pick){ show("sPick"); renderPick(); return; }
  show("sToday"); renderToday();
  if (S.incoming) setTimeout(useIncoming, 0);
}

function setJacket(el, combo){ el.style.background = combo ? jacketBg(combo) : ""; }

// ---------- choose 3 colors ----------
function renderPick(){
  $("pickDate").textContent = dayLabel(S.day) + " の気分";
  const box = $("swatches");
  if (!box.children.length) COLORS.forEach((c, i) => box.append(
    h("button", { type:"button", class:"sw", "data-i":i, role:"checkbox", "aria-checked":"false", "aria-label":`${c.name}(${c.color})`, style:{ "--c":c.hex } },
      h("span", { class:"dot", "aria-hidden":"true" }), h("span", { class:"nm", text:c.name }))));
  const full = S.draft.length === 3;
  box.querySelectorAll(".sw").forEach(b => {
    const on = S.draft.includes(Number(b.dataset.i));
    b.classList.toggle("on", on); b.setAttribute("aria-checked", String(on));
    b.disabled = S.joining || (!on && full);
  });
  const j = $("pickJacket");
  j.classList.toggle("ready", full);
  setJacket(j, full ? comboKey(S.draft) : null);
  $("pickDots").replaceChildren(...[0, 1, 2].map(k => {
    const i = [...S.draft].sort((a, b) => a - b)[k];
    return h("span", { class:"pd" + (i == null ? "" : " on"), style:i == null ? null : { background:COLORS[i].hex } });
  }));
  $("pickHint").textContent = full ? comboNames(comboKey(S.draft)) : `あと${3 - S.draft.length}色`;
  $("pickGo").disabled = !full || S.joining;
  $("pickGo").textContent = S.joining ? "グループを探しています…" : "この3色にする";
  $("incomingNote").hidden = !S.incoming;
  renderYesterdayMine($("ymPick"));
  const rk = S.rank || [];
  $("rankCard").hidden = !rk.length;
  $("rankList").replaceChildren(...rk.map((x, i) => h("li", null,
    h("span", { class:"rk-n", text:i + 1 }),
    h("span", { class:"mini-j", style:{ background:jacketBg(x.combo) }, "aria-hidden":"true" }),
    h("span", { class:"rk-name", text:comboNames(x.combo) }),
    h("span", { class:"rk-c", text:`${x.n}人` }))));
}

// ---------- today's playlist ----------
function renderToday(){
  const p = S.pick;
  setJacket($("todayJacket"), p.combo);
  $("todayDate").textContent = dayLabel(S.day);
  $("todayNames").textContent = comboNames(p.combo);
  $("todayCount").textContent = S.count == null ? "–" : S.count;
  const size = groupSize(), list = S.songs.filter(s => !hidden.has(s.id) || s.id === S.mySid);
  $("todaySub").textContent = size == null ? "" :
    (S.count > GROUP_MAX ? `30人ずつに分かれていて、このプレイリストは${size}人` : `このプレイリストは${size}人`);
  $("todayClose").textContent = `朝5時に閉じます(${untilText(dayEndMs(S.day) - Date.now())})`;

  const mine = mySong();
  $("addCard").hidden = !!mine || !S.songsLoaded;
  if (!mine) renderAdd();
  $("songInfo").textContent = S.songs.length ? `${S.songs.length}曲` : "";
  $("songList").replaceChildren(...list.map((s, i) => songRow(s, { n:i + 1, mine:s.id === S.mySid, day:S.day, g:p.g, blind:true, live:true, tally:S.tally[s.id] })));
  $("songEmpty").hidden = !S.songsLoaded || list.length > 0;

  const nb = S.neighbor && size != null && size < NEIGHBOR_UNDER && !hidden.has(S.neighbor.song.id) ? S.neighbor : null;
  $("nbCard").hidden = !nb;
  if (nb){
    const other = groupCombo(nb.g);
    setJacket($("nbJacket"), other);
    const lost = comboIds(p.combo).filter(i => !comboIds(other).includes(i)), got = comboIds(other).filter(i => !comboIds(p.combo).includes(i));
    $("nbWhy").textContent = other === p.combo ? "同じ3色の、もうひとつのプレイリストから"
      : `「${COLORS[lost[0]].name}」のかわりに「${COLORS[got[0]].name}」を選んだ人たちから`;
    $("nbList").replaceChildren(songRow(nb.song, { day:S.day, g:nb.g, blind:true, live:true, tally:S.tally[nb.song.id] }));
  }
  const bots = S.bots.slice(0, botCount()).filter(b => !list.some(s => s.am && s.am === b.am));
  $("botCard").hidden = !bots.length;
  $("botList").replaceChildren(...bots.map(b => songRow(b, { day:S.day, g:p.g, blind:true, bot:true })));
  renderYesterdayMine($("ymToday"));
  renderPlaying();
}

// my song from yesterday: how far it reached
function renderYesterdayMine(el){
  const v = S.ymine;
  el.hidden = !v;
  if (!v) return;
  const t = v.tally, top = t.c.map((n, i) => ({ i, n })).filter(x => x.n).sort((a, b) => b.n - a.n)[0];
  el.replaceChildren(
    h("div", { class:"ym-head" }, h("h2", { text:"昨日のあなたの曲" }), h("span", { class:"mini-j tiny", style:{ background:jacketBg(groupCombo(v.g)) }, "aria-hidden":"true" })),
    h("p", { class:"ym-lead", text:t.l ? `${t.l}人に届きました` + (top ? `。いちばん多かったのは「${COLORS[top.i].name}」` : "") : "昨日は誰にも聴かれませんでした。今日も置いてみましょう" }),
    h("ol", { class:"songs" }, songRow(v.song, { mine:true, day:addDays(S.day, -1), g:v.g, tally:t })));
}

// ---------- my shelf ----------
function renderShelf(){
  $("shelfInfo").textContent = S.shelf.length ? `${S.shelf.length}曲` : "";
  $("shelfList").replaceChildren(...S.shelf.map(s => songRow(s, { shelf:true })));
  $("shelfEmpty").hidden = !S.shelfLoaded || S.shelf.length > 0;
  renderPlaying();
}

function renderAdd(){
  const a = S.add, out = $("addOut");
  $("addGo").disabled = a.status === "loading" || S.adding;
  $("addGo").textContent = a.status === "loading" ? "確認中…" : "探す";
  $("pasteBtn").hidden = !(navigator.clipboard && navigator.clipboard.readText);
  if (a.status === "idle"){ out.replaceChildren(); return; }
  if (a.status === "loading"){ out.replaceChildren(h("p", { class:"muted small", text:"曲を確認しています…" })); return; }
  if (a.status === "error"){ out.replaceChildren(h("div", { class:"notice err", text:a.msg })); return; }
  const kids = [];
  if (a.status === "one"){
    kids.push(h("p", { class:"label", text:"この曲を置きますか?" }), candRow(a.song, () => confirmPut(songFrom(null, a.song))));
  }
  if (a.status === "pick"){
    if (a.src) kids.push(h("div", { class:"src" },
      a.src.art ? h("img", { class:"src-art", src:a.src.art, alt:"" }) : null,
      h("div", null, h("p", { class:"label", text:a.src.kind === "spotify" ? "Spotify の曲" : "YouTube の曲" }), h("p", { class:"src-t", text:a.src.t }))));
    if (a.results.length) kids.push(h("p", { class:"label", text:a.src ? "同じ曲はどれですか?(ほかのアプリの人も聴けるように)" : "どの曲ですか?" }));
    a.results.forEach(c => kids.push(candRow(c, () => confirmPut(songFrom(a.src, c)))));
    if (a.src && a.src.kind !== "youtube") kids.push(h("button", { type:"button", class:"linkbtn", onclick:() => confirmPut(songFrom(a.src, null)) },
      a.results.length ? "どれでもない(このリンクだけで置く)" : "このリンクの曲を置く"));
  }
  out.replaceChildren(...kids);
}
function candRow(s, onPick){
  return h("button", { type:"button", class:"cand", onclick:onPick, disabled:S.adding },
    s.art ? h("img", { class:"c-art", src:s.art, alt:"", loading:"lazy" }) : h("span", { class:"c-art ph", text:"♪" }),
    h("span", { class:"c-meta" }, h("span", { class:"c-t", text:s.t }), h("span", { class:"c-a", text:[s.a, s.al].filter(Boolean).join(" · ") })),
    h("span", { class:"c-go", text:"置く", "aria-hidden":"true" }));
}

// ---------- 伏せて聴く: other people's songs start with the title hidden; 30 seconds of listening reveals it ----------
const revealed = new Set(ls.get("revealed", []));
let justRevealed = null;
const blindOn = () => ls.get("blind", true) !== false;
const isCovered = (s, mine) => blindOn() && !mine && !!s.am && !revealed.has(s.id);
function reveal(sid){
  if (revealed.has(sid)) return;
  revealed.add(sid); ls.set("revealed", [...revealed].slice(-500));
  justRevealed = sid;
  render();
  setTimeout(() => { if (justRevealed === sid) justRevealed = null; }, 1500);
}

// one song in a playlist: cover (tap to preview when Apple has it), title, buttons to open it in each app,
// what people felt (listened + colors), and the shelf star.
//   live: today's playlist (colors can be given)   shelf: a row on my shelf
function songRow(s, { n, mine, day, g, blind, tally, live, shelf, bot } = {}){
  if (!shelf) songCtx.set(s.id, { day, g, mine:!!mine, bot:!!bot });
  const covered = blind && isCovered(s, mine);
  const pref = ls.get("app", "");
  const apps = Object.keys(APPS).sort((x, y) => (y === pref) - (x === pref));
  const art = s.art ? h("img", { src:s.art, alt:"", loading:"lazy" }) : h("span", { class:"ph", text:"♪" });
  const play = () => togglePreview(s.am, s.id);
  const cover = s.am
    ? h("button", { type:"button", class:"s-art play", "data-sid":s.id, "aria-label":covered ? "伏せた曲を試聴" : `${s.t} を試聴`, onclick:play }, art, h("span", { class:"pl", "aria-hidden":"true" }))
    : h("span", { class:"s-art" }, art);
  const isNew = S.fresh && S.fresh.has(s.id) ? h("span", { class:"new", text:"NEW" }) : null;
  const report = mine || shelf || bot ? null : h("button", { type:"button", class:"s-more", "aria-label":"通報する", title:"通報する", onclick:() => openReport(s, day, g) }, "…");
  const saved = onShelf(s.id);
  const star = h("button", { type:"button", class:"s-star" + (saved ? " on" : ""), "aria-pressed":String(saved),
    "aria-label":saved ? "ボードから外す" : "ボードに貼る", title:saved ? "ボードから外す" : "ボードに貼る", onclick:() => toggleShelf(s) }, "📌");
  if (covered) return h("li", { class:"song covered" },
    n ? h("span", { class:"s-n", text:n }) : null,
    cover,
    h("div", { class:"s-meta" },
      h("p", { class:"s-t" }, "? ? ?", isNew),
      h("p", { class:"s-a", text:"30秒聴くと、曲名が出ます" }),
      h("div", { class:"prog", "data-sid":s.id, "aria-hidden":"true" }, h("span")),
      h("div", { class:"s-open" },
        h("button", { type:"button", class:"open pref", "data-sid":s.id, "data-label":"▶ 伏せて聴く", onclick:play }, "▶ 伏せて聴く"),
        h("button", { type:"button", class:"open", onclick:() => reveal(s.id) }, "答えを見る")),
      tally && tally.l ? h("p", { class:"m-text", text:`🎧 ${tally.l}人が聴きました` }) : null),
    report ? h("div", { class:"s-side" }, report) : null);
  return h("li", { class:"song" + (mine ? " mine" : "") + (s.id === justRevealed ? " just" : "") },
    n ? h("span", { class:"s-n", text:n }) : null,
    cover,
    h("div", { class:"s-meta" },
      h("p", { class:"s-t" }, s.t, mine ? h("span", { class:"you", text:"あなた" }) : null, isNew),
      h("p", { class:"s-a", text:s.a || " " }),
      bot && COLORS[s.mood] ? h("p", { class:"s-from" }, h("span", { class:"cdot", style:{ background:COLORS[s.mood].hex }, "aria-hidden":"true" }),
        `「${COLORS[s.mood].name}」の気分から`) : null,
      shelf && s.combo ? h("p", { class:"s-from" }, h("span", { class:"mini-j tiny", style:{ background:jacketBg(s.combo) }, "aria-hidden":"true" }),
        `${dayLabel(s.day)} ・ ${comboNames(s.combo)}`) : null,
      h("div", { class:"s-open" },
        ...apps.map(app => h("a", {
          class:"open" + (app === pref ? " pref" : ""), href:openUrl(s, app), target:"_blank", rel:"noopener",
          title:exactIn(s, app) ? `${APPS[app]}で開く` : `${APPS[app]}で探す`,
          onclick:shelf ? null : () => listened(s.id),
        }, APPS[app].replace(" Music", ""), exactIn(s, app) ? null : h("span", { class:"srch", text:"検索" })))),
      shelf || bot ? null : moodBlock(s, { tally, mine, live })),
    h("div", { class:"s-side" }, star, report));
}

// how the song was felt: a bar of the colors people gave, "🎧 5人が聴きました ・ しんみり 3", and (today) my color
function moodBlock(s, { tally, mine, live }){
  const t = tally || cleanTally(null);
  const total = t.c.reduce((a, b) => a + b, 0);
  const top = t.c.map((v, i) => ({ i, v })).filter(x => x.v).sort((a, b) => b.v - a.v).slice(0, 3);
  const kids = [];
  if (total) kids.push(h("div", { class:"m-bar", "aria-hidden":"true" },
    ...t.c.map((v, i) => v ? h("span", { style:{ flexGrow:String(v), background:COLORS[i].hex } }) : null)));
  const words = top.map(x => `${COLORS[x.i].name} ${x.v}`).join(" ・ ");
  if (t.l || total) kids.push(h("p", { class:"m-text", text:`🎧 ${t.l}人が聴きました` + (words ? ` ・ ${words}` : "") }));
  else if (mine) kids.push(h("p", { class:"m-text", text:live ? "まだ誰も聴いていません。届くまで待ちましょう" : "この日は誰にも聴かれませんでした" }));
  if (live && !mine){
    const my = myReacts()[s.id], open = S.moodOpen === s.id;
    kids.push(h("button", { type:"button", class:"m-btn" + (my >= 0 ? " given" : ""), "aria-expanded":String(open),
      onclick:() => { S.moodOpen = open ? null : s.id; render(); } },
      my >= 0 ? [h("span", { class:"cdot", style:{ background:COLORS[my].hex } }), COLORS[my].name, h("span", { class:"m-sub", text:"を付けた" })] : "＋ 気分の色を付ける"));
    if (open) kids.push(h("div", { class:"m-pick", role:"group", "aria-label":"この曲に付ける気分の色" },
      ...COLORS.map((c, i) => h("button", { type:"button", class:"mp" + (my === i ? " on" : ""), "aria-pressed":String(my === i),
        disabled:reacting, onclick:() => react(s.id, i) },
        h("span", { class:"cdot", style:{ background:c.hex } }), c.name))));
  }
  return kids.length ? h("div", { class:"mood" }, ...kids) : null;
}
function renderPlaying(){
  document.querySelectorAll("[data-sid]").forEach(el => {
    const on = el.dataset.sid === playingId;
    el.classList.toggle("on", on);
    if (el.classList.contains("s-art")) el.setAttribute("aria-pressed", String(on));
    if (el.dataset.label) el.textContent = on ? "■ とめる" : el.dataset.label;
  });
  renderProgress();
}
function renderProgress(){
  document.querySelectorAll(".prog").forEach(p => {
    const on = p.dataset.sid === playingId && player.duration > 0;
    p.firstChild.style.width = on ? Math.min(100, player.currentTime / player.duration * 100) + "%" : "0";
  });
}

// ---------- calendar ----------
function renderCal(){
  const now = dayParts(S.day);
  if (!S.calMonth) S.calMonth = { y:now.y, m:now.m };
  const { y, m } = S.calMonth;
  loadMonth(y, m);
  $("calTitle").textContent = `${y}年${m}月`;
  $("calNext").disabled = y > now.y || (y === now.y && m >= now.m);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay(), days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [];
  for (let i = 0; i < first; i++) cells.push(h("span", { class:"cd blank" }));
  const counts = new Array(COLORS.length).fill(0);
  let logged = 0;
  for (let d = 1; d <= days; d++){
    const key = `${y}-${pad2(m)}-${pad2(d)}`, e = S.log[key], isToday = key === S.day, future = key > S.day;
    if (e){ logged++; comboIds(e.combo).forEach(i => counts[i]++); }
    const label = `${m}月${d}日` + (e ? ` ${comboNames(e.combo)}` : "");
    cells.push(e
      ? h("a", { class:"cd has" + (isToday ? " today" : ""), href:isToday ? "#" : `#d=${key}`, "aria-label":label, style:{ background:jacketBg(e.combo) } }, h("span", { text:d }))
      : h("span", { class:"cd" + (isToday ? " today" : "") + (future ? " future" : ""), "aria-label":label }, h("span", { text:d })));
  }
  $("calGrid").replaceChildren(...cells);
  const top = counts.map((n, i) => ({ i, n })).filter(x => x.n).sort((a, b) => b.n - a.n).slice(0, 3);
  $("calStats").replaceChildren(
    h("div", { class:"cs" }, h("p", { class:"label", text:"この月に選んだ日" }), h("p", { class:"cs-n" }, String(logged), h("small", { text:"日" }))),
    h("div", { class:"cs" }, h("p", { class:"label", text:"よく選んだ色" }),
      top.length ? h("div", { class:"chips" }, ...top.map(x => h("span", { class:"chip" }, h("span", { class:"cdot", style:{ background:COLORS[x.i].hex } }), `${COLORS[x.i].name} ${x.n}`)))
        : h("p", { class:"muted small", text:S.logLoaded[monthKey(y, m)] === true ? "まだありません" : "読み込み中…" })));
}

// ---------- a past day ----------
function renderDay(day){
  if (!S.past || S.past.day !== day){
    const { y, m } = dayParts(day), st = S.logLoaded[monthKey(y, m)];
    if (st === true) loadPast(day);
    else if (st === undefined) loadMonth(y, m).then(() => { if (route().day === day && (!S.past || S.past.day !== day)) loadPast(day); });
  }
  const p = S.past && S.past.day === day ? S.past : null;
  $("dayDate").textContent = dayLabel(day);
  if (!p || p.missing){
    setJacket($("dayJacket"), null);
    $("dayNames").textContent = "";
    $("dayCount").textContent = "–";
    $("dayList").replaceChildren();
    $("dayEmpty").hidden = !(p && p.missing);
    $("dayEmpty").textContent = "この日は3色を選んでいません。";
    $("daySongInfo").textContent = "";
    return;
  }
  setJacket($("dayJacket"), p.combo);
  $("dayNames").textContent = comboNames(p.combo);
  $("dayCount").textContent = p.count == null ? "–" : p.count;
  const list = p.songs.filter(s => !hidden.has(s.id) || s.id === p.mySid);
  $("daySongInfo").textContent = p.songs.length ? `${p.songs.length}曲` : "";
  $("dayList").replaceChildren(...list.map((s, i) => songRow(s, { n:i + 1, mine:s.id === p.mySid, day, g:p.g, tally:p.tally && p.tally[s.id] })));
  $("dayEmpty").hidden = !p.loaded || list.length > 0 || p.error;
  $("dayEmpty").textContent = "この日は曲がありませんでした。";
  if (p.error){ $("dayEmpty").hidden = false; $("dayEmpty").textContent = "読み込めませんでした。通信を確認してください。"; }
  renderPlaying();
}
