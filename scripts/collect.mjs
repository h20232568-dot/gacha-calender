#!/usr/bin/env node
// 무료 자동 수집 (유료 API 없음) — GitHub Actions에서 매일 실행되어 data/auto.json 을 갱신합니다.
//
// 출처
//  - 원신 / 스타레일 / 젠존제: HoYoLAB 공식 공지(한국어)  → 버전 업데이트, 픽업(기원·워프·채널), 프리뷰 방송, 공지 목록
//  - 리딤코드(호요버스 3종): hoyo-codes.seria.moe 커뮤니티 API
//  - 명조: 공식 사이트 공지(한국어/영어) → 버전 업데이트, 방송일 / Fandom 위키 → 픽업(한국어 이름), 리딤코드
//
//   node scripts/collect.mjs            # 전체
//   node scripts/collect.mjs hsr wuwa   # 일부만
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_CYCLES } from "../js/data.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "auto.json");
const UA = "gacha-calendar-bot/1.0 (+https://github.com/h20232568-dot/gacha-calender)";
const DAY = 86400e3;
const kst = (ms = Date.now()) => new Date(ms + 9 * 3600e3).toISOString(); // "YYYY-MM-DDTHH:MM..." (KST 표기)
const today = kst().slice(0, 10);

/* ------------------------------ 공통 유틸 ------------------------------ */
async function getJson(url, headers = {}) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i === 2) throw new Error(`${url} → ${err.message}`);
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}
const pad = (n) => String(n).padStart(2, "0");
// "2026/11/24 18:59" (서버 시간 UTC+8) → { date, time } KST
function toKst(y, mo, d, h = 0, mi = 0, offsetHours = 8) {
  const ms = Date.UTC(+y, +mo - 1, +d, +h - offsetHours, +mi);
  const s = kst(ms);
  return { date: s.slice(0, 10), time: s.slice(11, 16) };
}
const htmlToText = (html) =>
  html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|h\d)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");

/* ------------------------------ HoYoLAB ------------------------------ */
const HOYO = {
  genshin: { gid: 2, codeKey: "genshin" },
  hsr: { gid: 6, codeKey: "hkrpg" },
  zzz: { gid: 8, codeKey: "nap" },
};
const HOYOLAB = "https://bbs-api-os.hoyolab.com/community/post/wapi";
const hoyoHeaders = { "x-rpc-language": "ko-kr" };
const postUrl = (id) => `https://www.hoyolab.com/article/${id}`;

async function listNotices(gid) {
  const out = [];
  // 1: 공지, 2: 이벤트, 3: 정보 — 정보 게시판은 영상·배경화면 글이 많아 2페이지까지 확인
  for (const [type, pages] of [[1, 1], [2, 1], [3, 2]]) {
    let lastId = "";
    for (let page = 0; page < pages; page++) {
      const d = await getJson(`${HOYOLAB}/getNewsList?gids=${gid}&page_size=50&type=${type}${lastId ? `&last_id=${lastId}` : ""}`, hoyoHeaders);
      for (const x of d?.data?.list ?? []) {
        const p = x.post;
        out.push({ id: p.post_id, title: p.subject.trim(), createdMs: +p.created_at * 1000, date: kst(+p.created_at * 1000).slice(0, 10) });
      }
      lastId = d?.data?.last_id;
      if (!lastId || d?.data?.is_last) break;
    }
  }
  return out.sort((a, b) => b.createdMs - a.createdMs);
}

async function noticeText(id) {
  const d = await getJson(`${HOYOLAB}/getPostFull?post_id=${id}`, hoyoHeaders);
  const p = d?.data?.post?.post ?? {};
  let text = htmlToText(p.content || "");
  if (text.trim().length < 50 && p.structured_content) {
    try { text = JSON.parse(p.structured_content).map((o) => (typeof o.insert === "string" ? o.insert : "\n")).join(""); } catch {}
  }
  return text.replace(/\r/g, "").replace(/\n\s*\n+/g, "\n");
}

// 본문에서 "날짜 + 시각 (시간대)" 찾기. 지원 형식:
//   2026년 10월 23일 21:00(한국 시간) / 2026/10/30 20:30 (한국 시간) / 10월 9일 20:30(KST) / 11월 6일 (목) 19:00 (UTC+8)
const DATETIME = /(?:(\d{4})\s*[년\/.-]\s*)?(\d{1,2})\s*[월\/.-]\s*(\d{1,2})\s*일?\s*(?:\([^)0-9]{1,3}\))?\s*(\d{1,2}):(\d{2})\s*\(?\s*(KST|한국 시간|UTC\+8|UTC\+9|서버 시간)/;
function findDateTime(text, refDate) {
  const m = text.match(DATETIME);
  if (!m) return null;
  const refY = +refDate.slice(0, 4), refM = +refDate.slice(5, 7);
  let y = m[1] ? +m[1] : refY;
  if (!m[1] && refM === 12 && +m[2] === 1) y = refY + 1; // 12월 게시글의 1월 방송
  return toKst(y, m[2], m[3], m[4], m[5], /KST|한국|UTC\+9/.test(m[6]) ? 9 : 8);
}

// 캐릭터 이름 정리: 「규칙 파괴자·미탸(번개)」 → 미탸, [세베리안(바람·강공)] → 세베리안
const cleanName = (raw) => {
  let n = raw.replace(/[「」\[\]]/g, "").replace(/\([^)]*\)\s*$/, "").trim();
  if (n.includes("·")) n = n.split("·").pop().trim(); // 원신 칭호 제거 (스타레일의 '•' 는 이름 일부라 유지)
  return n;
};

// 한 공지에서 (★5/S급 캐릭터들, 기간) 묶음 추출
function parseBanners(text, versionDates, fallbackStart) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const found = []; // { names:Set, start, end, endTime }
  let pending = new Set(), orphan = null;
  const NAME_RUN = /(?:★5|S급)\s*(?:캐릭터|에이전트)\s*((?:[「\[][^」\]]+[」\]][\s,、와과및]*)+)/g;
  const RANGE = /(?:(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?|(\d+\.\d+)\s*버전\s*업데이트\s*후)\s*(?:\((KST|UTC\+8|서버 시간|한국 시간)\))?\s*~\s*(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\s+(\d{1,2}):(\d{2}))?\s*(?:\((KST|UTC\+8|서버 시간|한국 시간)\))?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/W-엔진|광추|무기/.test(line) && !/캐릭터|에이전트/.test(line)) continue;
    // 원신 헤더: 「...」 기원: 「칭호·이름(원소)」 확률 UP!
    const head = line.match(/기원:\s*(「[^」]+\([^)]+\)」(?:[,，\s]*「[^」]+\([^)]+\)」)*)\s*확률 UP/);
    if (head) head[1].match(/「[^」]+」/g).forEach((n) => pending.add(cleanName(n)));
    // "●/※" 로 시작하는 상세 설명 줄은 앞서 나온 이름의 반복이므로 건너뜀
    if (!/^[●•※]/.test(line)) for (const m of line.matchAll(NAME_RUN)) {
      (m[1].match(/[「\[][^」\]]+[」\]]/g) || []).forEach((n) => pending.add(cleanName(n)));
    }
    const r = line.match(RANGE);
    if (r && !pending.size) { orphan = r; continue; } // 젠존제: 기간이 이름보다 먼저 나옴
    if (r && pending.size) {
      const zoneOffset = (z) => (/KST|한국/.test(z || "") ? 9 : 8);
      let start;
      if (r[1]) start = toKst(r[1], r[2], r[3], r[4] ?? 12, r[5] ?? 0, zoneOffset(r[7] || r[13])).date;
      else start = versionDates[r[6]] || fallbackStart;
      const end = toKst(r[8], r[9], r[10], r[11] ?? 12, r[12] ?? 0, zoneOffset(r[13] || r[7]));
      found.push({ names: [...pending], start, end: end.date, endTime: end.time });
      pending = new Set();
    }
  }
  if (pending.size && orphan) {
    // 남은 이름은 앞서 나온 기간에 연결
    const r = orphan, z = (x) => (/KST|한국/.test(x || "") ? 9 : 8);
    const start = r[1] ? toKst(r[1], r[2], r[3], r[4] ?? 12, r[5] ?? 0, z(r[7] || r[13])).date : versionDates[r[6]] || fallbackStart;
    const end = toKst(r[8], r[9], r[10], r[11] ?? 12, r[12] ?? 0, z(r[13] || r[7]));
    found.push({ names: [...pending], start, end: end.date, endTime: end.time });
  }
  return found;
}

async function collectHoyo(game) {
  const { gid } = HOYO[game];
  const notices = await listNotices(gid);
  const recent = notices.filter((n) => Date.now() - n.createdMs < 75 * DAY);
  const events = [], versions = {}, versionDates = {};

  // 1) 버전 업데이트: "점검 예고" 공지의 점검 시작 시각
  for (const n of recent.filter((n) => /점검 예고/.test(n.title) && /버전/.test(n.title))) {
    const text = await noticeText(n.id);
    const ver = (n.title.match(/(\d+\.\d+)\s*버전/) || text.match(/(\d+\.\d+)\s*버전/) || [])[1];
    // 사전 다운로드 날짜가 아닌 "점검" 시각을 찾음
    const DT = /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})\s*\((UTC\+8|KST|한국 시간|서버 시간)\)/;
    const line = text.split("\n").find((l) => DT.test(l) && /점검|업데이트 시간|시작/.test(l) && !/사전 다운로드/.test(l));
    const m = line && line.match(DT);
    if (!ver || !m) continue;
    const t = toKst(m[1], m[2], m[3], m[4], m[5], /KST|한국/.test(m[6]) ? 9 : 8);
    versionDates[ver] = t.date;
    versions[ver] = { date: t.date, time: t.time, url: postUrl(n.id) };
  }
  // 버전 부제: "X.Y 버전 「부제」 업데이트 안내" / "「부제」 X.Y 버전 업데이트 안내"
  for (const n of recent.filter((n) => /버전.*업데이트 안내/.test(n.title) && !/상점/.test(n.title))) {
    const ver = (n.title.match(/(\d+\.\d+)\s*버전/) || [])[1];
    const sub = (n.title.match(/「([^」]+)」/) || [])[1];
    if (ver && sub && versions[ver]) versions[ver].subtitle = sub;
  }
  // 점검 공지를 못 찾은 버전은 버전 주기(js/data.js)로 계산한 날짜를 픽업 시작일 계산에만 사용
  const c = DEFAULT_CYCLES[game];
  const cycleDate = (ver) => {
    const [M, m] = ver.split(".").map(Number), [aM, am] = c.anchorVersion.split(".").map(Number);
    const steps = (M - aM) * (c.maxMinor + 1) + (m - am);
    return new Date(Date.parse(c.anchorDate) + steps * c.cycleDays * DAY).toISOString().slice(0, 10);
  };
  const verDate = (ver) => versionDates[ver] ?? (ver ? cycleDate(ver) : undefined);
  for (const [ver, v] of Object.entries(versions)) {
    events.push({
      id: `auto-${game}-version-${ver}`, game, type: "version",
      title: `${ver}${v.subtitle ? ` 「${v.subtitle}」` : ""} 업데이트`, start: v.date, end: v.date,
      time: v.time, note: "점검 시작 시각 (KST)", sources: [v.url],
    });
  }

  // 2) 픽업: 기원 / 워프 / 채널 공지
  const banners = new Map();
  for (const n of recent.filter((n) => /이벤트 기원|이벤트 워프|한정 채널|기원 알림/.test(n.title))) {
    const ver = (n.title.match(/(\d+\.\d+)\s*버전/) || [])[1];
    const text = await noticeText(n.id);
    const vd = ver ? { ...versionDates, [ver]: verDate(ver) } : versionDates;
    for (const b of parseBanners(text, vd, n.date)) {
      const key = `${b.start}|${b.end}`;
      const cur = banners.get(key) || { ...b, names: [], ver, url: postUrl(n.id) };
      b.names.forEach((x) => !cur.names.includes(x) && cur.names.push(x));
      banners.set(key, cur);
    }
  }
  for (const b of banners.values()) {
    const vDate = b.ver && verDate(b.ver);
    const phase = vDate ? (b.start <= vDate ? "1차 " : "2차 ") : "";
    events.push({
      id: `auto-${game}-banner-${b.start}-${b.end}`, game, type: "banner",
      title: `${b.ver ? b.ver + " " : ""}${phase}픽업: ${b.names.join(" · ")}`, start: b.start, end: b.end,
      note: `종료 ${b.end} ${b.endTime} (KST)`, sources: [b.url],
    });
  }

  // 3) 공식 방송: "특별 방송 예고"(원신·젠존제) / "프리뷰 스페셜 프로그램"(스타레일) 공지의 방송 일시
  const broadcasts = [], seenVer = new Set();
  const isPreview = (t) => /특별 방송 예고|스페셜 프로그램|특별 방송 안내/.test(t) && !/정보 일람|프로그램 정보|토론실|은하탐구|2차 창작/.test(t);
  for (const n of recent.filter((n) => isPreview(n.title))) {
    const ver = (n.title.match(/(\d+\.\d+)\s*버전/) || n.title.match(/(\d+\.\d+)/) || [])[1];
    if (!ver || seenVer.has(ver)) continue; // 같은 버전의 "1시간 전" 공지 등은 한 번만
    const text = await noticeText(n.id);
    const t = findDateTime(text, n.date);
    if (!t) continue;
    seenVer.add(ver);
    events.push({ id: `auto-${game}-broadcast-${ver}`, game, type: "broadcast", title: `${ver} 버전 특별 방송`, start: t.date, end: t.date, time: t.time, note: "공식 방송 예고 공지 기준", sources: [postUrl(n.id)] });
  }
  // 예고 공지를 못 찾은 경우(스타레일): "X.Y 버전 프리뷰 토론실" 게시일 = 방송일
  for (const n of recent.filter((n) => /프리뷰 토론실/.test(n.title))) {
    const ver = (n.title.match(/(\d+\.\d+)\s*버전/) || [])[1];
    if (ver && !seenVer.has(ver)) { seenVer.add(ver); events.push({ id: `auto-${game}-broadcast-${ver}`, game, type: "broadcast", title: `${ver} 버전 특별 방송`, start: n.date, end: n.date, note: "HoYoLAB 프리뷰 토론실 게시일 기준", sources: [postUrl(n.id)] }); }
  }
  // 방송 정리 글("특별 방송 | 정보 일람", "프리뷰 스페셜 프로그램 정보") → 방송 요약 카드
  for (const n of recent.filter((n) => /정보 일람|프로그램 정보|특별 방송 정리/.test(n.title))) {
    const ver = (n.title.match(/(\d+\.\d+)/) || [])[1];
    if (!ver) continue;
    const text = await noticeText(n.id);
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => l.length > 5 && !/^https?:|구독|YouTube|Twitch|>>/i.test(l));
    const bEvent = events.find((e) => e.id === `auto-${game}-broadcast-${ver}`);
    broadcasts.push({
      id: `auto-b-${game}-${ver}`, game, version: ver, title: n.title.replace(/[〈〉]/g, "").slice(0, 80),
      date: bEvent?.start || n.date, ...(bEvent?.time ? { time: bEvent.time } : {}), vod: "",
      summary: lines.slice(0, 6).join("\n").slice(0, 800), characters: [], content: [], codes: [],
      sources: [postUrl(n.id)],
    });
  }

  // 4) 콜라보 공지 → 일정(게시일) + 소식
  for (const n of recent.filter((n) => /콜라보/.test(n.title) && !/후기/.test(n.title))) {
    events.push({ id: `auto-${game}-collab-${n.id}`, game, type: "collab", title: n.title.slice(0, 60), start: n.date, end: n.date, note: "공지 게시일 기준", sources: [postUrl(n.id)] });
  }

  const latest = Object.keys(versions).sort((a, b) => parseFloat(b) - parseFloat(a) || b.localeCompare(a, undefined, { numeric: true }))[0];
  const news = notices.slice(0, 8).map((n) => ({ game, title: n.title, date: n.date, url: postUrl(n.id) }));
  return { events, broadcasts, news, cycle: latest ? { anchorVersion: latest, anchorDate: versions[latest].date } : null };
}

async function collectHoyoCodes(game) {
  const d = await getJson(`https://hoyo-codes.seria.moe/codes?game=${HOYO[game].codeKey}`);
  return (d.codes || [])
    .filter((c) => c.status === "OK" && /^[A-Za-z0-9]{4,24}$/.test(c.code))
    .map((c) => ({ game, code: c.code.toUpperCase(), reward: (c.rewards || "").replace(/;/g, ", ").slice(0, 160), expires: "", source: "hoyo-codes.seria.moe" }));
}

/* ------------------------------ 명조 ------------------------------ */
// - 공식 사이트 공지 JSON (한국어 kr / 영어 en): 버전 업데이트(한국어 부제·점검 시각), 방송일(Version Preview 게시일)
// - Fandom 위키: 픽업 기간, 캐릭터 한국어 이름(문서의 ko 항목), 리딤코드
const WW = "https://wutheringwaves.fandom.com/api.php";
const WW_CMS = "https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152";
const wikitext = async (page) => (await getJson(`${WW}?action=parse&page=${encodeURIComponent(page)}&prop=wikitext&format=json&formatversion=2&redirects=1`))?.parse?.wikitext ?? "";
const field = (t, k) => (t.match(new RegExp(`\\|\\s*${k}\\s*=\\s*([^\\n|]*)`)) || [])[1]?.trim() ?? "";
const wwNewsUrl = (lang, id) => `https://wutheringwaves.kurogames.com/${lang}/main/news/detail/${id}`;

async function koName(en, cache) {
  if (cache[en]) return cache[en];
  try {
    // 인포박스의 "|ko = 릴리" 줄 (성우 항목 안의 {{Lang|ko=...}} 와 구분하기 위해 줄 시작 기준)
    const ko = ((await wikitext(en.replace(/ /g, "_"))).match(/^\|\s*ko\s*=\s*([^\n<{|]+)/m) || [])[1]?.trim();
    if (ko && /[가-힣]/.test(ko)) cache[en] = ko;
  } catch {}
  return cache[en] || en;
}

async function collectWuwa(nameCache) {
  const events = [], news = [];
  let cycle = null;

  // 1) 버전 업데이트 — 한국어 공식 공지 "「부제」 X.Y 버전 (업데이트) 내용 안내"
  const kr = await getJson(`${WW_CMS}/kr/ArticleMenu.json`);
  const krSorted = [...kr].sort((x, y) => y.startTime.localeCompare(x.startTime));
  for (const a of krSorted.slice(0, 12)) news.push({ game: "wuwa", title: a.articleTitle, date: a.startTime.slice(0, 10), url: wwNewsUrl("kr", a.articleId) });
  for (const a of krSorted.filter((a) => /(\d+\.\d+)\s*버전\s*(업데이트\s*)?내용 안내/.test(a.articleTitle)).slice(0, 3)) {
    const ver = a.articleTitle.match(/(\d+\.\d+)\s*버전/)[1];
    const sub = (a.articleTitle.match(/「([^」]+)」/) || [])[1];
    const art = await getJson(`${WW_CMS}/kr/article/${a.articleId}.json`);
    const text = htmlToText(art.articleContent || "");
    const m = text.match(/점검 시간:\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*(\d{1,2}):(\d{2})/);
    const t = m ? toKst(m[1], m[2], m[3], m[4], m[5], 9) : { date: a.startTime.slice(0, 10), time: "" };
    events.push({ id: `auto-wuwa-version-${ver}`, game: "wuwa", type: "version", title: `${ver}${sub ? ` 「${sub}」` : ""} 업데이트`, start: t.date, end: t.date, ...(t.time ? { time: t.time } : {}), note: m ? "점검 시작 시각 (KST)" : "공지 게시일 기준", sources: [wwNewsUrl("kr", a.articleId)] });
    if (!cycle || ver > cycle.anchorVersion) cycle = { anchorVersion: ver, anchorDate: t.date };
  }

  // 2) 공식 방송 — 영어 공지 "Version Preview | Version X.Y" 는 방송 직후 게시됨
  const en = await getJson(`${WW_CMS}/en/ArticleMenu.json`);
  for (const a of en.filter((a) => /Version Preview\s*\|\s*Version\s*(\d+\.\d+)/.test(a.articleTitle)).sort((x, y) => y.startTime.localeCompare(x.startTime)).slice(0, 3)) {
    const ver = a.articleTitle.match(/Version\s*(\d+\.\d+)/)[1];
    const [d, tm] = a.startTime.split(" ");
    const t = toKst(...d.split("-"), ...tm.split(":").slice(0, 2)); // 사이트 시간 UTC+8
    events.push({ id: `auto-wuwa-broadcast-${ver}`, game: "wuwa", type: "broadcast", title: `${ver} 버전 프리뷰 특별 방송`, start: t.date, end: t.date, note: "방송 직후 게시되는 공식 'Version Preview' 공지 기준 (시각 미표기)", sources: [wwNewsUrl("en", a.articleId)] });
  }

  // 3) 픽업 — 위키 공명 이벤트 문서, 이름은 한국어로 변환
  const d = await getJson(`${WW}?action=query&list=categorymembers&cmtitle=Category:Featured_Resonator_Convenes&cmsort=timestamp&cmdir=desc&cmlimit=12&format=json`);
  const groups = new Map();
  for (const { title } of d?.query?.categorymembers ?? []) {
    const t = await wikitext(title);
    const s = field(t, "time_start"), e = field(t, "time_end"), name = field(t, "resonator_5_F");
    if (!/^\d{4}-\d{2}-\d{2}/.test(s) || !/^\d{4}-\d{2}-\d{2}/.test(e) || !name) continue;
    const [sd, st] = s.split(" "), [ed, et] = e.split(" ");
    const start = toKst(...sd.split("-"), ...(st || "12:00").split(":")), end = toKst(...ed.split("-"), ...(et || "12:00").split(":"));
    const key = `${start.date}|${end.date}`;
    const g = groups.get(key) || { start, end, names: [], url: field(t, "link") || `https://wutheringwaves.fandom.com/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}` };
    for (const n of name.split(";").map((x) => x.trim()).filter(Boolean)) {
      const ko = await koName(n, nameCache);
      if (!g.names.includes(ko)) g.names.push(ko);
    }
    groups.set(key, g);
  }
  const verEvents = events.filter((e) => e.type === "version");
  for (const g of groups.values()) {
    const v = verEvents.find((e) => e.start === g.start.date);
    const prev = verEvents.filter((e) => e.start < g.start.date).sort((a, b) => b.start.localeCompare(a.start))[0];
    const ver = (v || prev)?.id.split("-").pop();
    const phase = v ? "1차 " : prev ? "2차 " : "";
    events.push({
      id: `auto-wuwa-banner-${g.start.date}-${g.end.date}`, game: "wuwa", type: "banner",
      title: `${ver ? ver + " " : ""}${phase}픽업: ${g.names.join(" · ")}`, start: g.start.date, end: g.end.date,
      note: `${g.start.time} ~ ${g.end.date} ${g.end.time} (KST)`, sources: [g.url],
    });
  }

  // 4) 리딤코드 — 위키 "===Active===" 표
  const rc = await wikitext("Redemption_Code");
  const active = (rc.split(/===\s*Expired\s*===/)[0].split(/===\s*Active\s*===/)[1] || "");
  const codes = [];
  for (const row of active.split(/\n\|-/)) {
    const code = (row.match(/<code>([^<]+)<\/code>/) || [])[1];
    if (!code) continue;
    const reward = ((row.match(/\{\{Card List\|([^|}]+)/) || [])[1] || "").replace(/;/g, ", ");
    const until = (row.match(/Valid until:\s*([^'<]+)/) || [])[1]?.trim() ?? "";
    let expires = "";
    const m = until.match(/([A-Za-z]+) (\d{1,2}), (\d{4}) (\d{1,2}):(\d{2}) \(PT\)/);
    if (m) {
      const month = new Date(`${m[1]} 1, 2000`).getMonth() + 1;
      const t = toKst(m[3], month, m[2], m[4], m[5], month >= 4 && month <= 10 ? -7 : -8); // PDT/PST 근사
      expires = `${t.date}T${t.time}`;
    }
    codes.push({ game: "wuwa", code: code.trim().toUpperCase(), reward: reward.slice(0, 160), expires, source: "wutheringwaves.fandom.com" });
  }
  return { events, broadcasts: [], codes, news, cycle };
}

/* ------------------------------ 병합 / 저장 ------------------------------ */
function merge(prev, game, next) {
  const others = (arr) => (arr || []).filter((x) => x.game !== game);
  const mine = (arr) => (arr || []).filter((x) => x.game === game);
  // 지난 일정은 기록으로 유지, 진행 중·예정 일정은 최신 결과로 교체
  const past = mine(prev.events).filter((e) => e.end < today && !next.events.some((n) => n.id === e.id));
  return {
    events: [...others(prev.events), ...past, ...next.events],
    codes: [...others(prev.codes), ...next.codes],
    broadcasts: [...others(prev.broadcasts), ...mine(prev.broadcasts).filter((b) => !(next.broadcasts || []).some((n) => n.id === b.id)), ...(next.broadcasts || [])],
    news: [...others(prev.news), ...next.news],
    cycles: { ...prev.cycles, ...(next.cycle ? { [game]: next.cycle } : {}) },
  };
}

async function main() {
  const games = process.argv.slice(2).length ? process.argv.slice(2) : ["genshin", "hsr", "zzz", "wuwa"];
  let data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  data = { events: [], broadcasts: [], codes: [], news: [], cycles: {}, wuwaNames: {}, ...data };

  let failed = 0;
  for (const game of games) {
    try {
      let result;
      if (game === "wuwa") result = await collectWuwa(data.wuwaNames);
      else if (HOYO[game]) {
        result = await collectHoyo(game);
        try { result.codes = await collectHoyoCodes(game); } catch (err) {
          console.warn(`  ! ${game} 코드 수집 실패 (이전 코드 유지): ${err.message}`);
          result.codes = data.codes.filter((c) => c.game === game);
        }
      } else { console.warn(`알 수 없는 게임: ${game}`); continue; }
      data = { ...data, ...merge(data, game, result) };
      console.log(`✔ ${game}: 일정 ${result.events.length} · 코드 ${result.codes.length} · 공지 ${result.news.length}${result.cycle ? ` · 최신 ${result.cycle.anchorVersion} (${result.cycle.anchorDate})` : ""}`);
      result.events.forEach((e) => console.log(`    ${e.start}~${e.end} [${e.type}] ${e.title}`));
    } catch (err) {
      failed++;
      console.error(`✖ ${game} 실패 (이전 데이터 유지): ${err.message}`);
    }
  }

  data.events.sort((a, b) => a.start.localeCompare(b.start));
  data.news.sort((a, b) => b.date.localeCompare(a.date));
  data.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(`저장: ${path.relative(ROOT, OUT)}`);
  if (failed === games.length) process.exit(1);
}

main();
