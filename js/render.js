// Now ON: 画面の描画
// index.html から順番に読み込みます(前のファイルで決めた名前を使います)。

const SCREENS = ["sLoading", "sError", "sPick", "sToday", "sCal", "sDay"];
function show(id){ SCREENS.forEach(s => { $(s).hidden = s !== id; }); }

// which screen the address asks for: "#cal", "#d=2026-10-12", otherwise today
function route(){
  const hsh = location.hash.slice(1);
  if (hsh === "cal") return { view:"cal" };
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
    h("button", { type:"button", class:"sw", "data-i":i, role:"checkbox", "aria-checked":"false", style:{ "--c":c.hex } },
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
  $("songList").replaceChildren(...list.map((s, i) => songRow(s, { n:i + 1, mine:s.id === S.mySid, day:S.day, g:p.g })));
  $("songEmpty").hidden = !S.songsLoaded || list.length > 0;

  const nb = S.neighbor && size != null && size < NEIGHBOR_UNDER && !hidden.has(S.neighbor.song.id) ? S.neighbor : null;
  $("nbCard").hidden = !nb;
  if (nb){
    const other = groupCombo(nb.g);
    setJacket($("nbJacket"), other);
    const lost = comboIds(p.combo).filter(i => !comboIds(other).includes(i)), got = comboIds(other).filter(i => !comboIds(p.combo).includes(i));
    $("nbWhy").textContent = other === p.combo ? "同じ3色の、もうひとつのプレイリストから"
      : `${COLORS[lost[0]].name}のかわりに${COLORS[got[0]].name}を選んだ人たちから`;
    $("nbList").replaceChildren(songRow(nb.song, { day:S.day, g:nb.g }));
  }
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

// one song in a playlist: cover (tap to preview when Apple has it), title, and buttons to open it in each app
function songRow(s, { n, mine, day, g } = {}){
  const pref = ls.get("app", "");
  const apps = Object.keys(APPS).sort((x, y) => (y === pref) - (x === pref));
  const art = s.art ? h("img", { src:s.art, alt:"", loading:"lazy" }) : h("span", { class:"ph", text:"♪" });
  const cover = s.am
    ? h("button", { type:"button", class:"s-art play", "data-am":s.am, "aria-label":`${s.t} を試聴`, onclick:() => togglePreview(s.am) }, art, h("span", { class:"pl", "aria-hidden":"true" }))
    : h("span", { class:"s-art" }, art);
  return h("li", { class:"song" + (mine ? " mine" : "") },
    n ? h("span", { class:"s-n", text:n }) : null,
    cover,
    h("div", { class:"s-meta" },
      h("p", { class:"s-t" }, s.t, mine ? h("span", { class:"you", text:"あなた" }) : null),
      h("p", { class:"s-a", text:s.a || " " }),
      h("div", { class:"s-open" }, ...apps.map(app => h("a", {
        class:"open" + (app === pref ? " pref" : ""), href:openUrl(s, app), target:"_blank", rel:"noopener",
        title:exactIn(s, app) ? `${APPS[app]}で開く` : `${APPS[app]}で探す`,
      }, APPS[app].replace(" Music", ""), exactIn(s, app) ? null : h("span", { class:"srch", text:"検索" }))))),
    mine ? null : h("button", { type:"button", class:"s-more", "aria-label":"通報する", title:"通報する", onclick:() => openReport(s, day, g) }, "…"));
}
function renderPlaying(){
  document.querySelectorAll(".s-art.play").forEach(b => {
    const on = b.dataset.am === playingId;
    b.classList.toggle("on", on);
    b.setAttribute("aria-pressed", String(on));
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
  $("dayList").replaceChildren(...list.map((s, i) => songRow(s, { n:i + 1, mine:s.id === p.mySid, day, g:p.g })));
  $("dayEmpty").hidden = !p.loaded || list.length > 0 || p.error;
  $("dayEmpty").textContent = "この日は曲がありませんでした。";
  if (p.error){ $("dayEmpty").hidden = false; $("dayEmpty").textContent = "読み込めませんでした。通信を確認してください。"; }
  renderPlaying();
}
