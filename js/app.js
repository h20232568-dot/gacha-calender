import { GAMES, EVENT_TYPES, DEFAULT_CYCLES, EVENTS, BROADCASTS, CODES } from "./data.js";

/* ============================ 자동 수집 데이터 ============================ */
// data/auto.json: GitHub Actions(scripts/collect.mjs)가 주기적으로 갱신. 없으면 무시.
let AUTO = { events: [], broadcasts: [], codes: [], news: [], cycles: {}, updatedAt: null };
try {
  const res = await fetch("data/auto.json", { cache: "no-cache" });
  if (res.ok) AUTO = { ...AUTO, ...(await res.json()) };
} catch { /* 정적 파일이 없어도 동작 */ }

/* ============================ 저장소 ============================ */
const LS_KEY = "gacha-calendar:v1";
const store = loadStore();

function loadStore() {
  const empty = { events: [], broadcasts: [], cycles: {}, deleted: [], prefs: {} };
  try { return { ...empty, ...JSON.parse(localStorage.getItem(LS_KEY) || "{}") }; }
  catch { return empty; }
}
function saveStore() { localStorage.setItem(LS_KEY, JSON.stringify(store)); }

// 사용자 데이터가 같은 id의 기본 데이터를 덮어씀
// 우선순위: 내가 입력한 데이터 > data.js(검수된 데이터) > 자동 수집
function mergeById(auto, seed, user) {
  const map = new Map();
  auto.forEach((x) => map.set(x.id, { ...x, auto: true, seed: true }));
  seed.forEach((x) => map.set(x.id, { ...x, seed: true }));
  user.forEach((x) => map.set(x.id, { ...x, seed: map.has(x.id) }));
  return [...map.values()].filter((x) => !store.deleted.includes(x.id));
}
// 자동 수집 일정 중 같은 게임·종류·시작일의 검수 일정이 이미 있으면 숨김
function dedupeAuto(list) {
  const key = (e) => `${e.game}|${e.type}|${e.start}`;
  const manual = new Set(list.filter((e) => !e.auto).map(key));
  return list.filter((e) => !e.auto || !manual.has(key(e)));
}
const allEvents = () => dedupeAuto(mergeById(AUTO.events, EVENTS, store.events));
const allBroadcasts = () => {
  const list = mergeById(AUTO.broadcasts, BROADCASTS, store.broadcasts);
  const manual = new Set(list.filter((b) => !b.auto).map((b) => `${b.game}|${b.version}`));
  return list.filter((b) => !b.auto || !manual.has(`${b.game}|${b.version}`)).sort((a, b) => b.date.localeCompare(a.date));
};
// 기준값: 직접 수정한 값 > (data.js 와 자동 수집 중 더 최근 기준일)
const cycles = () => {
  const out = {};
  Object.keys(GAMES).forEach((g) => {
    const d = DEFAULT_CYCLES[g], a = AUTO.cycles?.[g];
    out[g] = a && a.anchorDate > d.anchorDate ? { ...d, ...a } : d;
  });
  return { ...out, ...store.cycles };
};
const uid = (p) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/* ============================ 날짜 유틸 ============================ */
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const fmt = (s) => { const d = parse(s); return `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]})`; };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);

/* ============================ 예상 일정 생성 ============================ */
function shiftVersion(v, steps, maxMinor) {
  let [M, m] = v.split(".").map(Number);
  for (let i = 0; i < Math.abs(steps); i++) {
    if (steps > 0) { m++; if (m > maxMinor) { M++; m = 0; } }
    else { m--; if (m < 0) { M--; m = maxMinor; } }
  }
  return `${M}.${m}`;
}

function projectedEvents(confirmed) {
  const out = [];
  const near = (game, types, date, tol) =>
    confirmed.some((e) => e.game === game && types.includes(e.type) && Math.abs(diffDays(e.start, date)) <= tol);

  Object.entries(cycles()).forEach(([game, c]) => {
    if (!GAMES[game] || !c.anchorDate) return;
    for (let i = -4; i <= 10; i++) {
      const start = addDays(c.anchorDate, i * c.cycleDays);
      const v = shiftVersion(c.anchorVersion, i, c.maxMinor);
      const half = Math.floor(c.cycleDays / 2);
      const base = { game, estimated: true, note: "버전 주기 기반 자동 계산된 예상 일정입니다. 공식 공지로 확인하세요." };
      if (!near(game, ["version"], start, 7))
        out.push({ ...base, id: `p-${game}-${v}-v`, type: "version", title: `${v} 업데이트 (예상)`, start, end: start });
      const bc = addDays(start, -c.broadcastOffset);
      if (!near(game, ["broadcast"], bc, 5))
        out.push({ ...base, id: `p-${game}-${v}-b`, type: "broadcast", title: `${v} 특별 방송 (예상)`, start: bc, end: bc });
      if (!near(game, ["banner"], start, 3))
        out.push({ ...base, id: `p-${game}-${v}-p1`, type: "banner", title: `${v} 1차 픽업 시작 (예상)`, start, end: start });
      if (!near(game, ["banner"], addDays(start, half), 3))
        out.push({ ...base, id: `p-${game}-${v}-p2`, type: "banner", title: `${v} 2차 픽업 시작 (예상)`, start: addDays(start, half), end: addDays(start, half) });
    }
  });
  return out;
}

// 방송 요약도 캘린더에 "공식 방송" 일정으로 표시
function broadcastEvents() {
  return allBroadcasts().map((b) => ({
    id: `bc-${b.id}`, broadcastId: b.id, game: b.game, type: "broadcast",
    title: b.title, start: b.date, end: b.date, time: b.time, auto: b.auto, note: "방송 요약이 등록되어 있습니다.",
  }));
}

/* ============================ 상태 / 필터 ============================ */
const state = {
  view: "calendar",
  month: (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })(),
  games: new Set(store.prefs.games || Object.keys(GAMES)),
  types: new Set(store.prefs.types || Object.keys(EVENT_TYPES)),
  showEstimated: store.prefs.showEstimated ?? true,
  bcGame: "all",
};
function savePrefs() {
  store.prefs = { games: [...state.games], types: [...state.types], showEstimated: state.showEstimated };
  saveStore();
}

function visibleEvents() {
  const confirmed = dedupeAuto([...allEvents(), ...broadcastEvents()]);
  const list = state.showEstimated ? [...confirmed, ...projectedEvents(confirmed)] : confirmed;
  return list
    .filter((e) => state.games.has(e.game) && state.types.has(e.type))
    .sort((a, b) => a.start.localeCompare(b.start) || (a.time || "").localeCompare(b.time || ""));
}

/* ============================ 렌더 헬퍼 ============================ */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s = "") => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const gameBadge = (g) => `<span class="badge" style="--c:${GAMES[g].color}">${esc(GAMES[g].short)}</span>`;

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove("show"), 1800);
}
async function copy(text) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = document.createElement("textarea"); ta.value = text; document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  toast(`복사됨: ${text}`);
}

/* ============================ 필터 바 ============================ */
function renderFilters() {
  $("#filters").innerHTML = `
    <div class="chips">${Object.entries(GAMES).map(([k, g]) => `
      <label class="chip" style="--c:${g.color}"><input type="checkbox" data-game="${k}" ${state.games.has(k) ? "checked" : ""}> ${esc(g.short)}</label>`).join("")}
    </div>
    <div class="chips">${Object.entries(EVENT_TYPES).map(([k, t]) => `
      <label class="chip type"><input type="checkbox" data-type="${k}" ${state.types.has(k) ? "checked" : ""}> ${t.icon} ${t.label}</label>`).join("")}
      <label class="chip type est"><input type="checkbox" id="est" ${state.showEstimated ? "checked" : ""}> 🔮 예상 일정</label>
    </div>`;
  $("#filters").onchange = (e) => {
    const { game, type } = e.target.dataset;
    if (game) e.target.checked ? state.games.add(game) : state.games.delete(game);
    if (type) e.target.checked ? state.types.add(type) : state.types.delete(type);
    if (e.target.id === "est") state.showEstimated = e.target.checked;
    savePrefs(); render();
  };
}

const TYPE_ORDER = ["version", "broadcast", "banner", "collab", "event", "maint"];

/* ============================ 캘린더 뷰 ============================ */
function renderCalendar() {
  const m = state.month, y = m.getFullYear(), mo = m.getMonth();
  const first = new Date(y, mo, 1), gridStart = new Date(y, mo, 1 - first.getDay());
  const events = visibleEvents();
  const t = today();

  let cells = "";
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart); d.setDate(gridStart.getDate() + i);
    const ds = ymd(d);
    if (i === 35 && d.getMonth() !== mo) break; // 5주로 끝나는 달
    const dayEvents = events.filter((e) => e.start <= ds && (e.end || e.start) >= ds)
      .sort((a, b) => !!a.estimated - !!b.estimated || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
    const chips = dayEvents.slice(0, 5).map((e) => {
      const isStart = e.start === ds || d.getDay() === 0;
      const isEnd = (e.end || e.start) === ds;
      const cls = ["ev", e.estimated ? "est" : "", e.start !== (e.end || e.start) ? "span" : "", isStart ? "s" : "cont", isEnd ? "e" : ""].join(" ");
      return `<button class="${cls}" style="--c:${GAMES[e.game].color}" data-ev="${esc(e.id)}" title="${esc(GAMES[e.game].short)} · ${esc(e.title)}">
        ${isStart ? `${EVENT_TYPES[e.type].icon} ${esc(e.title)}` : "&nbsp;"}</button>`;
    }).join("");
    const more = dayEvents.length > 5 ? `<button class="more" data-day="${ds}">+${dayEvents.length - 5}개 더</button>` : "";
    cells += `<div class="cell ${d.getMonth() !== mo ? "out" : ""} ${ds === t ? "today" : ""} ${[0, 6].includes(d.getDay()) ? "wk" + d.getDay() : ""}">
      <button class="dnum" data-day="${ds}">${d.getDate()}</button>${chips}${more}</div>`;
  }

  $("#main").innerHTML = `
    <div class="cal-head">
      <button class="btn" id="prev">◀</button>
      <h2>${y}년 ${mo + 1}월</h2>
      <button class="btn" id="next">▶</button>
      <button class="btn ghost" id="todayBtn">오늘</button>
      <span class="grow"></span>
      <button class="btn ghost" id="ics" title="Google 캘린더/아이폰 캘린더로 가져올 수 있는 파일">📅 .ics 내보내기</button>
    </div>
    <div class="cal">
      ${"일월화수목금토".split("").map((w, i) => `<div class="wd wk${i}">${w}</div>`).join("")}
      ${cells}
    </div>
    <p class="hint">🔮 점선 표시는 버전 주기로 계산한 <b>예상 일정</b>입니다. 확정 일정을 등록하면 자동으로 대체됩니다.</p>`;

  $("#prev").onclick = () => { state.month = new Date(y, mo - 1, 1); render(); };
  $("#next").onclick = () => { state.month = new Date(y, mo + 1, 1); render(); };
  $("#todayBtn").onclick = () => { const n = new Date(); state.month = new Date(n.getFullYear(), n.getMonth(), 1); render(); };
  $("#ics").onclick = exportIcs;
  $("#main").querySelectorAll("[data-ev]").forEach((b) => (b.onclick = () => openEvent(b.dataset.ev)));
  $("#main").querySelectorAll("[data-day]").forEach((b) => (b.onclick = () => openDay(b.dataset.day)));
}

/* ============================ 사이드바 ============================ */
function renderSidebar() {
  const t = today(), until = addDays(t, 14);
  const upcoming = visibleEvents().filter((e) => (e.end || e.start) >= t && e.start <= until).slice(0, 14);
  const codes = activeCodes();

  $("#side").innerHTML = `
    <section class="card">
      <h3>⏰ 다가오는 일정 <small>(2주)</small></h3>
      ${upcoming.length ? `<ul class="agenda">${upcoming.map((e) => {
        const dd = diffDays(t, e.start);
        const when = dd > 0 ? `D-${dd}` : (e.end || e.start) > e.start ? `진행중 ~${fmt(e.end)}` : "오늘";
        return `<li><button data-ev="${esc(e.id)}" class="${e.estimated ? "est" : ""}">
          ${gameBadge(e.game)} <span class="t">${EVENT_TYPES[e.type].icon} ${esc(e.title)}</span>
          <span class="when ${dd <= 0 ? "now" : ""}">${when}</span></button></li>`;
      }).join("")}</ul>` : `<p class="empty">예정된 일정이 없습니다.</p>`}
    </section>
    <section class="card">
      <h3>🎁 사용 가능한 리딤코드</h3>
      ${codes.length ? codes.slice(0, 5).map(codeRow).join("") : `<p class="empty">현재 유효한 코드가 없습니다.</p>`}
      ${codes.length > 5 ? `<button class="btn sm ghost" id="allCodes">전체 ${codes.length}개 보기 →</button>` : ""}
    </section>`;
  const news = (AUTO.news || []).filter((n) => state.games.has(n.game)).slice(0, 10);
  if (news.length) $("#side").insertAdjacentHTML("beforeend", `<section class="card"><h3>📰 공식 공지 <small>(HoYoLAB)</small></h3>
    <ul class="news">${news.map((n) => `<li>${gameBadge(n.game)} <a href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a><small>${esc(n.date.slice(5).replace("-", "/"))}</small></li>`).join("")}</ul></section>`);
  if (AUTO.updatedAt) $("#side").insertAdjacentHTML("beforeend", `<p class="hint">🤖 자동 수집 마지막 갱신: ${esc(new Date(AUTO.updatedAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }))}</p>`);
  $("#side").querySelectorAll("[data-ev]").forEach((b) => (b.onclick = () => openEvent(b.dataset.ev)));
  bindCodeButtons($("#side"));
  $("#allCodes") && ($("#allCodes").onclick = () => { state.view = "codes"; render(); window.scrollTo(0, 0); });
}

const sourceLinks = (arr) => (arr || []).map((u, i) => {
  let host = u; try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {}
  return `<a class="src-link" href="${esc(u)}" target="_blank" rel="noopener" title="${esc(u)}">출처${arr.length > 1 ? i + 1 : ""}: ${esc(host)}</a>`;
}).join(" ");

/* ============================ 리딤코드 ============================ */
const isExpired = (c) => c.expires && new Date(c.expires) < new Date();
function allCodes() {
  const seen = new Set();
  return [
    ...allBroadcasts().flatMap((b) => (b.codes || []).map((c) => ({ ...c, game: b.game, from: b.title, bid: b.id }))),
    ...CODES, ...(AUTO.codes || []),
  ].filter((c) => { const k = `${c.game}|${c.code.toUpperCase()}`; if (seen.has(k)) return false; seen.add(k); return true; })
   .sort((a, b) => (b.expires || "9").localeCompare(a.expires || "9"));
}
const activeCodes = () => allCodes().filter((c) => !isExpired(c) && state.games.has(c.game));

function codeRow(c) {
  const g = GAMES[c.game], exp = isExpired(c);
  const link = g.redeemUrl
    ? `<a class="btn sm" href="${g.redeemUrl}${encodeURIComponent(c.code)}" target="_blank" rel="noopener">교환</a>`
    : `<span class="btn sm disabled" title="게임 내에서만 입력 가능">게임 내 입력</span>`;
  return `<div class="code ${exp ? "expired" : ""}">
    ${gameBadge(c.game)}
    <div class="code-main"><code>${esc(c.code)}</code><small>${esc(c.reward || "")}</small>
      <small class="exp">${c.expires ? (exp ? "만료됨 · " : "~") + esc(c.expires.replace("T", " ")) : "만료일 미정"}</small></div>
    <button class="btn sm" data-copy="${esc(c.code)}">복사</button>${exp ? "" : link}
  </div>`;
}
function bindCodeButtons(root) {
  root.querySelectorAll("[data-copy]").forEach((b) => (b.onclick = () => copy(b.dataset.copy)));
}

/* ============================ 방송 요약 뷰 ============================ */
function renderBroadcasts() {
  const list = allBroadcasts().filter((b) => state.bcGame === "all" || b.game === state.bcGame);
  $("#main").innerHTML = `
    <div class="cal-head">
      <h2>📺 공식 방송 요약</h2><span class="grow"></span>
      <select id="bcGame"><option value="all">전체 게임</option>
        ${Object.entries(GAMES).map(([k, g]) => `<option value="${k}" ${state.bcGame === k ? "selected" : ""}>${esc(g.name)}</option>`).join("")}
      </select>
      <button class="btn" id="newBc">＋ 요약 작성</button>
    </div>
    ${list.length ? list.map(bcCard).join("") : `<p class="empty">등록된 방송 요약이 없습니다.</p>`}`;
  $("#bcGame").onchange = (e) => { state.bcGame = e.target.value; render(); };
  $("#newBc").onclick = () => { state.view = "admin"; render(); $("#bcForm").scrollIntoView(); };
  $("#main").querySelectorAll("[data-edit-bc]").forEach((b) => (b.onclick = () => editBroadcast(b.dataset.editBc)));
  $("#main").querySelectorAll("[data-del-bc]").forEach((b) => (b.onclick = () => removeItem("broadcasts", b.dataset.delBc)));
  bindCodeButtons($("#main"));
}

function bcCard(b) {
  const list = (arr) => (arr && arr.length ? `<ul>${arr.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : `<p class="empty">-</p>`);
  return `<article class="card bc" id="bc-${esc(b.id)}" style="--c:${GAMES[b.game].color}">
    <header>
      ${gameBadge(b.game)} <span class="ver">Ver. ${esc(b.version)}</span>
      <h3>${esc(b.title)}</h3>
      ${b.auto ? `<span class="tag">🤖 자동 수집</span>` : ""}<span class="grow"></span><span class="date">${esc(b.date)}${b.time ? " " + esc(b.time) : ""}</span>
    </header>
    ${b.summary ? `<p class="summary">${esc(b.summary).replace(/\n/g, "<br>")}</p>` : ""}
    <div class="bc-grid">
      <div><h4>⭐ 신규 / 픽업 캐릭터</h4>${list(b.characters)}</div>
      <div><h4>🗺️ 주요 콘텐츠</h4>${list(b.content)}</div>
    </div>
    <h4>🎁 리딤코드</h4>
    ${(b.codes || []).length ? b.codes.map((c) => codeRow({ ...c, game: b.game })).join("") : `<p class="empty">코드 없음</p>`}
    <footer>
      ${b.vod ? `<a href="${esc(b.vod)}" target="_blank" rel="noopener">▶ 방송 다시보기</a>` : ""}
      ${sourceLinks(b.sources)}
      <span class="grow"></span>
      <button class="btn sm ghost" data-edit-bc="${esc(b.id)}">수정</button>
      <button class="btn sm ghost danger" data-del-bc="${esc(b.id)}">삭제</button>
    </footer>
  </article>`;
}

/* ============================ 리딤코드 뷰 ============================ */
function renderCodes() {
  const codes = allCodes().filter((c) => state.games.has(c.game));
  const active = codes.filter((c) => !isExpired(c)), expired = codes.filter(isExpired);
  $("#main").innerHTML = `
    <div class="cal-head"><h2>🎁 리딤코드 모음</h2><span class="grow"></span>
      ${active.length ? `<button class="btn" id="copyAll">유효 코드 전체 복사</button>` : ""}</div>
    <section class="card"><h3>사용 가능 (${active.length})</h3>${active.map(codeRow).join("") || `<p class="empty">없음</p>`}</section>
    <section class="card"><h3>만료됨 (${expired.length})</h3>${expired.map(codeRow).join("") || `<p class="empty">없음</p>`}</section>
    <p class="hint">명조는 웹 교환 페이지가 없어 게임 내 <b>설정 → 기타 → 교환 코드</b>에서 입력합니다.</p>`;
  if (active.length) $("#copyAll").onclick = () => copy(active.map((c) => c.code).join("\n"));
  bindCodeButtons($("#main"));
}

/* ============================ 관리 뷰 ============================ */
function renderAdmin() {
  const gameOpts = (sel) => Object.entries(GAMES).map(([k, g]) => `<option value="${k}" ${sel === k ? "selected" : ""}>${esc(g.name)}</option>`).join("");
  const typeOpts = Object.entries(EVENT_TYPES).map(([k, t]) => `<option value="${k}">${t.icon} ${t.label}</option>`).join("");
  const cyc = cycles();

  $("#main").innerHTML = `
    <section class="card">
      <h3>📅 일정 추가 / 수정</h3>
      <form id="evForm" class="form">
        <input type="hidden" name="id">
        <label>게임<select name="game">${gameOpts()}</select></label>
        <label>종류<select name="type">${typeOpts}</select></label>
        <label class="wide">제목<input name="title" required placeholder="예: 6.3 1차 픽업 — 캐릭터명"></label>
        <label>시작일<input type="date" name="start" required></label>
        <label>종료일<input type="date" name="end"></label>
        <label>시간<input type="time" name="time"></label>
        <label class="wide">링크<input name="url" type="url" placeholder="공식 공지 URL"></label>
        <label class="wide">메모<textarea name="note" rows="2"></textarea></label>
        <div class="wide row"><button class="btn">저장</button><button type="reset" class="btn ghost">초기화</button></div>
      </form>
    </section>

    <section class="card" id="bcForm">
      <h3>📺 공식 방송 요약 작성 / 수정</h3>
      <form id="bForm" class="form">
        <input type="hidden" name="id">
        <label>게임<select name="game">${gameOpts()}</select></label>
        <label>버전<input name="version" required placeholder="예: 6.3"></label>
        <label>방송일<input type="date" name="date" required></label>
        <label>방송 시간<input type="time" name="time"></label>
        <label class="wide">방송 제목<input name="title" required placeholder="예: 6.3 버전 특별 방송"></label>
        <label class="wide">다시보기 URL<input name="vod" type="url"></label>
        <label class="wide">📝 원문 붙여넣기 <small>(공지/기사/방송 메모를 붙여넣고 "자동 정리"를 누르면 리딤코드와 항목을 추출합니다)</small>
          <textarea id="raw" rows="4" placeholder="방송 내용, 공지문 등을 붙여넣기"></textarea></label>
        <div class="wide row">
          <button type="button" class="btn ghost" id="parseRaw">✨ 간단 정리 (바로 적용)</button>
          <button type="button" class="btn" id="copyPrompt">📋 AI 요약용 프롬프트 복사</button>
          <span class="hint">→ Claude·ChatGPT 등 무료 채팅에 붙여넣고, 받은 답변을 아래에 붙여넣으세요</span>
        </div>
        <div class="wide ai-box">
          <label>🤖 AI 답변 붙여넣기 <small>(JSON 형식 답변 그대로)</small>
            <textarea id="aiJson" rows="3" placeholder='{"version": "7.3", "title": "...", ...}'></textarea></label>
          <div class="row"><button type="button" class="btn sm" id="applyJson">답변 적용</button><span class="hint" id="aiStatus"></span></div>
        </div>
        <label class="wide">요약<textarea name="summary" rows="4"></textarea></label>
        <label>신규/픽업 캐릭터 <small>(한 줄에 하나)</small><textarea name="characters" rows="4"></textarea></label>
        <label>주요 콘텐츠 <small>(한 줄에 하나)</small><textarea name="content" rows="4"></textarea></label>
        <label class="wide">리딤코드 <small>(한 줄에 하나: <code>코드 | 보상 | 만료일시(2026-12-01 23:59)</code>)</small>
          <textarea name="codes" rows="3" placeholder="ABCDEF123 | 원석 ×100 | 2026-12-01 23:59"></textarea></label>
        <div class="wide row"><button class="btn">저장</button><button type="reset" class="btn ghost">초기화</button></div>
      </form>
    </section>

    <section class="card">
      <h3>🔮 예상 일정 기준값</h3>
      <p class="hint">기준 버전이 실제로 업데이트된 날짜를 입력하면, 그 주기를 바탕으로 앞뒤 버전·방송·픽업 일정을 자동 계산합니다.</p>
      <form id="cForm"><table class="tbl"><thead><tr><th>게임</th><th>기준 버전</th><th>업데이트일</th><th>주기(일)</th><th>마지막 소수 버전</th><th>방송(며칠 전)</th></tr></thead><tbody>
        ${Object.entries(GAMES).map(([k, g]) => `<tr data-g="${k}"><td>${gameBadge(k)}</td>
          <td><input name="anchorVersion" value="${esc(cyc[k].anchorVersion)}" size="4"></td>
          <td><input type="date" name="anchorDate" value="${esc(cyc[k].anchorDate)}"></td>
          <td><input type="number" name="cycleDays" value="${cyc[k].cycleDays}" min="7" style="width:5em"></td>
          <td><input type="number" name="maxMinor" value="${cyc[k].maxMinor}" min="1" style="width:4em"></td>
          <td><input type="number" name="broadcastOffset" value="${cyc[k].broadcastOffset}" min="0" style="width:4em"></td></tr>`).join("")}
      </tbody></table><div class="row"><button class="btn">기준값 저장</button></div></form>
    </section>

    <section class="card">
      <h3>💾 데이터 백업</h3>
      <p class="hint">직접 추가한 데이터는 이 브라우저에만 저장됩니다. 내보낸 JSON을 <code>js/data.js</code>에 반영하면 모든 방문자에게 보입니다.</p>
      <div class="row">
        <button class="btn" id="exp">JSON 내보내기</button>
        <label class="btn ghost">JSON 가져오기<input type="file" id="imp" accept="application/json" hidden></label>
        <button class="btn ghost danger" id="reset">내 데이터 초기화</button>
      </div>
    </section>

    <section class="card">
      <h3>✏️ 내가 등록한 일정 (${store.events.length})</h3>
      ${store.events.length ? `<ul class="agenda">${[...store.events].sort((a, b) => b.start.localeCompare(a.start)).map((e) => `
        <li><button data-ev="${esc(e.id)}">${gameBadge(e.game)} <span class="t">${EVENT_TYPES[e.type].icon} ${esc(e.title)}</span><span class="when">${esc(e.start)}</span></button></li>`).join("")}</ul>`
        : `<p class="empty">아직 없습니다.</p>`}
    </section>`;

  // 일정 저장
  $("#evForm").onsubmit = (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    if (f.end && f.end < f.start) return toast("종료일이 시작일보다 빠릅니다.");
    const item = { ...f, id: f.id || uid("e"), end: f.end || f.start };
    upsert("events", item);
    toast("일정이 저장되었습니다.");
    state.month = new Date(parse(item.start).getFullYear(), parse(item.start).getMonth(), 1);
    state.games.add(item.game); state.types.add(item.type);
    state.view = "calendar"; render();
  };

  // 방송 요약 저장
  $("#bForm").onsubmit = (ev) => {
    ev.preventDefault();
    const f = Object.fromEntries(new FormData(ev.target));
    const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
    const item = {
      id: f.id || uid("b"), game: f.game, version: f.version.trim(), title: f.title.trim(), date: f.date, time: f.time, vod: f.vod,
      summary: f.summary.trim(), characters: lines(f.characters), content: lines(f.content),
      codes: lines(f.codes).map((l) => {
        const [code, reward = "", expires = ""] = l.split("|").map((x) => x.trim());
        return { code: code.toUpperCase(), reward, expires: expires.replace(" ", "T") };
      }),
    };
    upsert("broadcasts", item);
    toast("방송 요약이 저장되었습니다.");
    state.view = "broadcasts"; state.bcGame = "all"; render();
    document.getElementById(`bc-${item.id}`)?.scrollIntoView({ behavior: "smooth" });
  };

  $("#parseRaw").onclick = () => autoParse($("#bForm"), $("#raw").value);
  $("#copyPrompt").onclick = () => {
    if (!$("#raw").value.trim()) return toast("원문을 먼저 붙여넣어 주세요.");
    copy(buildPrompt($("#bForm").game.value, $("#raw").value));
    toast("프롬프트를 복사했습니다. AI 채팅창에 붙여넣으세요.");
  };
  $("#applyJson").onclick = () => applyAiJson($("#bForm"), $("#aiJson").value);

  // 기준값 저장
  $("#cForm").onsubmit = (ev) => {
    ev.preventDefault();
    ev.target.querySelectorAll("tr[data-g]").forEach((tr) => {
      const v = (n) => tr.querySelector(`[name=${n}]`).value;
      store.cycles[tr.dataset.g] = {
        anchorVersion: v("anchorVersion"), anchorDate: v("anchorDate"),
        cycleDays: +v("cycleDays") || 42, maxMinor: +v("maxMinor") || 8, broadcastOffset: +v("broadcastOffset") || 0,
      };
    });
    saveStore(); toast("기준값이 저장되었습니다.");
  };

  $("#exp").onclick = () => {
    const blob = new Blob([JSON.stringify({ events: store.events, broadcasts: store.broadcasts, cycles: store.cycles, deleted: store.deleted }, null, 2)], { type: "application/json" });
    download(blob, `gacha-calendar-${today()}.json`);
  };
  $("#imp").onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      ["events", "broadcasts", "deleted"].forEach((k) => Array.isArray(data[k]) && (store[k] = data[k]));
      if (data.cycles) store.cycles = data.cycles;
      saveStore(); toast("가져오기 완료"); render();
    } catch { toast("올바른 JSON 파일이 아닙니다."); }
  };
  $("#reset").onclick = () => {
    if (!confirm("직접 추가/수정한 모든 데이터를 삭제할까요?")) return;
    Object.assign(store, { events: [], broadcasts: [], cycles: {}, deleted: [] });
    saveStore(); render();
  };
  $("#main").querySelectorAll("[data-ev]").forEach((b) => (b.onclick = () => openEvent(b.dataset.ev)));
}

// 무료 AI 활용: 프롬프트를 복사해 사용자가 직접 무료 AI 채팅(Claude.ai, ChatGPT 등)에 붙여넣고,
// 돌려받은 JSON 답변을 폼에 적용합니다. (사이트는 유료 API를 호출하지 않음)
function buildPrompt(game, raw) {
  return `아래는 서브컬처 게임 「${GAMES[game].name}」의 공식 방송/공지 원문입니다. 내용을 정리해서 아래 JSON 형식으로만 답해 주세요.
규칙:
- 원문에 있는 정보만 사용하고, 없는 내용은 빈 문자열이나 빈 배열로 둡니다.
- 날짜·시간은 한국 시간(KST)으로 변환합니다. 날짜는 YYYY-MM-DD, 만료 시각은 YYYY-MM-DDTHH:MM 형식입니다.
- 캐릭터 이름은 한국 서버 공식 표기를 알면 그것을, 모르면 원문 표기를 씁니다.
- events 의 type 은 version(버전 업데이트) / banner(캐릭터 픽업) / broadcast(공식 방송) / collab(콜라보) / event(인게임 이벤트) / maint(점검) 중 하나입니다.

{
  "version": "버전 번호 (예: 7.3)",
  "title": "방송 제목",
  "date": "방송일 YYYY-MM-DD",
  "summary": "핵심 요약 3~5문장",
  "characters": ["5성 이름 (신규/복각, 속성) — 1차"],
  "content": ["신규 지역·스토리·이벤트·시스템 변경 등"],
  "codes": [{"code": "리딤코드", "reward": "보상", "expires": "YYYY-MM-DDTHH:MM"}],
  "events": [{"type": "banner", "title": "일정 제목", "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "time": "HH:MM", "note": ""}]
}

<원문>
${raw}
</원문>`;
}

function applyAiJson(form, text) {
  const status = $("#aiStatus");
  let data;
  try {
    const m = text.match(/\{[\s\S]*\}/); // 코드블록·설명이 섞여 있어도 JSON 부분만 사용
    data = JSON.parse(m ? m[0] : text);
  } catch { return toast("JSON을 읽지 못했습니다. AI 답변의 { ... } 부분을 그대로 붙여넣어 주세요."); }
  const put = (n, v) => { if (v) form[n].value = v; };
  const arr = (v) => (Array.isArray(v) ? v : []);
  put("version", data.version); put("title", data.title);
  if (/^\d{4}-\d{2}-\d{2}$/.test(data.date || "")) put("date", data.date);
  put("summary", data.summary);
  put("characters", arr(data.characters).join("\n"));
  put("content", arr(data.content).join("\n"));
  put("codes", arr(data.codes).filter((c) => c && c.code).map((c) => `${c.code} | ${c.reward || ""} | ${(c.expires || "").replace("T", " ")}`).join("\n"));
  const evs = arr(data.events).filter((e) => e && EVENT_TYPES[e.type] && /^\d{4}-\d{2}-\d{2}$/.test(e.start || ""));
  status.innerHTML = `적용 완료! 확인 후 저장하세요.${evs.length ? ` <button type="button" class="btn sm" id="addAiEvents">일정 ${evs.length}개 캘린더에 추가</button>` : ""}`;
  if (evs.length) $("#addAiEvents").onclick = () => {
    evs.forEach((e) => upsert("events", { id: uid("e"), game: form.game.value, type: e.type, title: String(e.title || ""), start: e.start, end: /^\d{4}-\d{2}-\d{2}$/.test(e.end || "") && e.end >= e.start ? e.end : e.start, time: e.time || "", note: e.note || "" }));
    toast(`일정 ${evs.length}개를 추가했습니다.`); $("#addAiEvents").remove();
  };
}

// 원문 텍스트에서 리딤코드·캐릭터·버전 추출 (규칙 기반)
function autoParse(form, raw) {
  if (!raw.trim()) return toast("원문을 먼저 붙여넣어 주세요.");
  const set = (n, v) => { if (v && !form[n].value.trim()) form[n].value = v; };

  // 리딤코드: 영문 대문자(+숫자) 8~20자 덩어리
  const NOT_CODE = /^(YOUTUBE|TWITCH|HOYOVERSE|HOYOLAB|KUROGAMES|LIVESTREAM|UPDATE|VERSION)$/;
  const found = [...new Set((raw.match(/\b[A-Z][A-Z0-9]{7,19}\b/g) || []))].filter((c) => !NOT_CODE.test(c));
  if (found.length) {
    const exist = form.codes.value.trim();
    const add = found.filter((c) => !exist.includes(c)).map((c) => `${c} |  | `);
    form.codes.value = [exist, ...add].filter(Boolean).join("\n");
  }
  const ver = raw.match(/(\d+\.\d+)\s*버전/) || raw.match(/[Vv]er\.?\s*(\d+\.\d+)/);
  if (ver) set("version", ver[1]);

  // 키워드가 포함된 줄 분류
  const ls = raw.split(/\n+/).map((l) => l.replace(/^[\s\-•·*▶►◆■]+/, "").trim()).filter(Boolean);
  const chars = ls.filter((l) => /(5성|4성|S급|A급|신규 캐릭터|픽업|공명자|요원|기원|워프|조율|채널)/.test(l) && l.length < 80);
  const content = ls.filter((l) => /(지역|이벤트|스토리|임무|시스템|개선|맵|모드|콘텐츠|스킨|의상)/.test(l) && !chars.includes(l) && l.length < 100);
  set("characters", chars.join("\n"));
  set("content", content.join("\n"));
  set("summary", ls.filter((l) => !found.some((c) => l.includes(c))).slice(0, 4).join("\n"));
  toast(`자동 정리 완료 · 코드 ${found.length}개 추출`);
}

function upsert(kind, item) {
  const arr = store[kind], i = arr.findIndex((x) => x.id === item.id);
  i >= 0 ? (arr[i] = item) : arr.push(item);
  store.deleted = store.deleted.filter((d) => d !== item.id);
  saveStore();
}
function removeItem(kind, id) {
  if (!confirm("삭제할까요?")) return;
  store[kind] = store[kind].filter((x) => x.id !== id);
  const seed = kind === "events" ? EVENTS : BROADCASTS;
  if (seed.some((x) => x.id === id)) store.deleted.push(id);
  saveStore(); closeModal(); render();
}

function editEvent(id) {
  const e = allEvents().find((x) => x.id === id); if (!e) return;
  closeModal(); state.view = "admin"; render();
  const f = $("#evForm");
  ["id", "game", "type", "title", "start", "end", "time", "url", "note"].forEach((k) => (f[k].value = e[k] || ""));
  f.scrollIntoView(); f.title.focus();
}
function editBroadcast(id) {
  const b = allBroadcasts().find((x) => x.id === id); if (!b) return;
  state.view = "admin"; render();
  const f = $("#bForm");
  ["id", "game", "version", "title", "date", "time", "vod", "summary"].forEach((k) => (f[k].value = b[k] || ""));
  f.characters.value = (b.characters || []).join("\n");
  f.content.value = (b.content || []).join("\n");
  f.codes.value = (b.codes || []).map((c) => `${c.code} | ${c.reward || ""} | ${(c.expires || "").replace("T", " ")}`).join("\n");
  f.scrollIntoView();
}

/* ============================ 모달 ============================ */
function openModal(html) { $("#modal .body").innerHTML = html; $("#modal").showModal(); }
function closeModal() { const m = $("#modal"); if (m.open) m.close(); }

function findEvent(id) { return visibleEvents().find((e) => e.id === id) || allEvents().find((e) => e.id === id); }

function openEvent(id) {
  const e = findEvent(id); if (!e) return;
  if (e.broadcastId) { closeModal(); state.view = "broadcasts"; state.bcGame = "all"; render(); document.getElementById(`bc-${e.broadcastId}`)?.scrollIntoView({ behavior: "smooth" }); return; }
  const editable = !e.estimated;
  const range = e.end && e.end !== e.start ? `${e.start} ~ ${e.end} (${diffDays(e.start, e.end) + 1}일)` : e.start;
  openModal(`
    <div class="m-head" style="--c:${GAMES[e.game].color}">${gameBadge(e.game)} <span>${EVENT_TYPES[e.type].icon} ${EVENT_TYPES[e.type].label}</span>
      ${e.estimated ? `<span class="tag">🔮 예상</span>` : ""}${e.auto ? `<span class="tag">🤖 자동 수집</span>` : ""}</div>
    <h2>${esc(e.title)}</h2>
    <p>🗓️ ${esc(range)} ${e.time ? `· ⏰ ${esc(e.time)}` : ""}</p>
    ${e.note ? `<p class="note">${esc(e.note).replace(/\n/g, "<br>")}</p>` : ""}
    ${e.url ? `<p><a href="${esc(e.url)}" target="_blank" rel="noopener">🔗 공식 공지 보기</a></p>` : ""}
    ${e.sources?.length ? `<p class="src">${sourceLinks(e.sources)}</p>` : ""}
    <div class="row">
      ${editable ? `<button class="btn" id="mEdit">수정</button><button class="btn ghost danger" id="mDel">삭제</button>`
        : `<button class="btn" id="mConfirm">확정 일정으로 등록</button>`}
      <span class="grow"></span><button class="btn ghost" id="mClose">닫기</button>
    </div>`);
  $("#mClose").onclick = closeModal;
  if (editable) { $("#mEdit").onclick = () => editEvent(e.id); $("#mDel").onclick = () => removeItem("events", e.id); }
  else $("#mConfirm").onclick = () => {
    closeModal(); state.view = "admin"; render();
    const f = $("#evForm");
    f.game.value = e.game; f.type.value = e.type; f.title.value = e.title.replace(" (예상)", "");
    f.start.value = e.start; f.end.value = e.end; f.scrollIntoView(); f.title.focus();
  };
}

function openDay(ds) {
  const list = visibleEvents().filter((e) => e.start <= ds && (e.end || e.start) >= ds);
  openModal(`<h2>${esc(ds)} ${fmt(ds).slice(-3)}</h2>
    ${list.length ? `<ul class="agenda">${list.map((e) => `<li><button data-ev="${esc(e.id)}" class="${e.estimated ? "est" : ""}">${gameBadge(e.game)}
      <span class="t">${EVENT_TYPES[e.type].icon} ${esc(e.title)}</span></button></li>`).join("")}</ul>` : `<p class="empty">일정 없음</p>`}
    <div class="row"><button class="btn" id="mAdd">＋ 이 날짜에 일정 추가</button><span class="grow"></span><button class="btn ghost" id="mClose">닫기</button></div>`);
  $("#modal").querySelectorAll("[data-ev]").forEach((b) => (b.onclick = () => openEvent(b.dataset.ev)));
  $("#mClose").onclick = closeModal;
  $("#mAdd").onclick = () => { closeModal(); state.view = "admin"; render(); const f = $("#evForm"); f.start.value = ds; f.scrollIntoView(); f.title.focus(); };
}

/* ============================ .ics 내보내기 ============================ */
function exportIcs() {
  const d = (s) => s.replace(/-/g, "");
  const icsEsc = (s = "") => s.replace(/[\\,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//gacha-calendar//KO", "X-WR-CALNAME:서브컬처 게임 캘린더"];
  visibleEvents().forEach((e) => {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@gacha-calendar`, `DTSTAMP:${d(today())}T000000Z`);
    if (e.time && e.start === (e.end || e.start)) {
      lines.push(`DTSTART;TZID=Asia/Seoul:${d(e.start)}T${e.time.replace(":", "")}00`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${d(e.start)}`, `DTEND;VALUE=DATE:${d(addDays(e.end || e.start, 1))}`);
    }
    lines.push(`SUMMARY:${icsEsc(`[${GAMES[e.game].short}] ${EVENT_TYPES[e.type].icon} ${e.title}`)}`);
    if (e.note || e.url) lines.push(`DESCRIPTION:${icsEsc([e.note, e.url].filter(Boolean).join("\n"))}`);
    lines.push("END:VEVENT");
  });
  lines.push("END:VCALENDAR");
  download(new Blob([lines.join("\r\n")], { type: "text/calendar" }), "gacha-calendar.ics");
  toast("현재 필터 기준으로 .ics 파일을 만들었습니다.");
}
function download(blob, name) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ============================ 라우팅 ============================ */
const VIEWS = { calendar: renderCalendar, broadcasts: renderBroadcasts, codes: renderCodes, admin: renderAdmin };
function render() {
  document.querySelectorAll("nav [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
  document.body.dataset.view = state.view;
  renderFilters();
  VIEWS[state.view]();
  renderSidebar();
  if (location.hash.slice(1) !== state.view) history.replaceState(null, "", `#${state.view}`);
}
document.querySelectorAll("nav [data-view]").forEach((b) => (b.onclick = () => { state.view = b.dataset.view; render(); window.scrollTo(0, 0); }));
$("#modal").addEventListener("click", (e) => { if (e.target.id === "modal") closeModal(); });
if (VIEWS[location.hash.slice(1)]) state.view = location.hash.slice(1);
render();
