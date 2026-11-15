#!/usr/bin/env node
// 자동 수집: 게임별로 Claude가 웹 검색으로 최신 일정·방송·리딤코드를 조사하고
// 구조화한 결과를 data/auto.json 에 저장합니다. (GitHub Actions에서 매일 실행)
//
//   ANTHROPIC_API_KEY=... node scripts/collect.mjs            # 전체 게임
//   ANTHROPIC_API_KEY=... node scripts/collect.mjs hsr wuwa   # 일부 게임만
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { research, structured, COLLECT_SCHEMA, GAME_NAMES, TYPES } from "../lib/claude.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "auto.json");
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
const isTime = (s) => /^\d{2}:\d{2}$/.test(s || "");
const isUrl = (s) => /^https?:\/\//.test(s || "");
const clean = (s, n = 200) => String(s || "").trim().slice(0, n);

const HINTS = {
  genshin: "공식 사이트 genshin.hoyoverse.com, HoYoLAB 공지, 공식 X(@GenshinImpact)",
  hsr: "공식 사이트 hsr.hoyoverse.com, HoYoLAB 공지, 공식 X(@honkaistarrail)",
  zzz: "공식 사이트 zenless.hoyoverse.com, HoYoLAB 공지, 공식 X(@ZZZ_EN)",
  wuwa: "공식 사이트 wutheringwaves.kurogames.com, 공식 X(@Wuthering_Waves)",
};

async function collectGame(game, today) {
  const name = GAME_NAMES[game];
  console.log(`▶ ${name} 조사 중…`);

  const report = await research({
    system:
      "당신은 서브컬처 게임 일정을 조사하는 리서처입니다. 공식 공지와 신뢰할 만한 게임 매체를 우선하고, " +
      "확인되지 않은 유출(leak) 정보는 제외하거나 '미확정'으로 표시하세요. 모든 사실에 출처 URL을 붙이세요.",
    prompt:
      `오늘은 ${today} (KST)입니다. ${name}에 대해 웹 검색으로 다음을 조사해 보고서로 정리해 주세요.\n` +
      `참고 출처: ${HINTS[game]}\n\n` +
      "1. 현재 서비스 중인 최신 버전 번호와 업데이트일, 다음 버전의 예정일(발표된 경우)\n" +
      "2. 현재·다음 캐릭터 픽업(1차/2차) 기간과 캐릭터 (신규/복각 구분)\n" +
      "3. 가장 최근 또는 예정된 공식 방송(특별 방송/라이브) 일시와 공개 내용 요약, 방송 리딤코드와 만료 시각\n" +
      "4. 현재 사용 가능한 리딤코드 (만료된 것은 제외)\n" +
      "5. 진행 중이거나 예정된 콜라보, 주요 인게임 이벤트, 점검 일정\n\n" +
      "날짜·시간은 모두 한국 시간(KST)으로 변환하고, 각 항목 옆에 출처 URL을 적어 주세요.",
  });

  const data = await structured({
    system:
      "조사 보고서를 JSON으로 옮기는 작업입니다. 보고서에 있는 정보만 사용하고 추측하지 마세요. " +
      "날짜가 확정되지 않은 일정은 events에 넣지 마세요. 일정 제목과 요약은 한국어로 씁니다.",
    prompt: `게임: ${name}\n오늘: ${today}\n\n<보고서>\n${report}\n</보고서>`,
    schema: COLLECT_SCHEMA,
  });

  return normalize(game, data);
}

// 모델 출력 검증·정리 → 사이트 데이터 형식으로 변환
function normalize(game, d) {
  const used = new Set();
  const events = (d.events || [])
    .filter((e) => TYPES.includes(e.type) && isDate(e.start))
    .map((e) => {
      const end = isDate(e.end) && e.end >= e.start ? e.end : e.start;
      let id = `auto-${game}-${e.type}-${e.start}`;
      for (let i = 2; used.has(id); i++) id = `auto-${game}-${e.type}-${e.start}-${i}`;
      used.add(id);
      return {
        id, game, type: e.type, title: clean(e.title), start: e.start, end,
        ...(isTime(e.time) ? { time: e.time } : {}),
        ...(e.note ? { note: clean(e.note, 300) } : {}),
        sources: (e.sources || []).filter(isUrl).slice(0, 3),
      };
    });

  const codes = (d.activeCodes || [])
    .filter((c) => /^[A-Za-z0-9]{4,24}$/.test(c.code))
    .map((c) => ({ game, code: c.code, reward: clean(c.reward), expires: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.expires) ? c.expires : "" }));

  const b = d.broadcast;
  const broadcasts = b && b.version && isDate(b.date) ? [{
    id: `auto-b-${game}-${b.version}`, game, version: clean(b.version, 10), title: clean(b.title), date: b.date,
    ...(isTime(b.time) ? { time: b.time } : {}), vod: "",
    summary: clean(b.summary, 1500), characters: (b.characters || []).map((x) => clean(x)), content: (b.content || []).map((x) => clean(x)),
    codes: (b.codes || []).filter((c) => /^[A-Za-z0-9]{4,24}$/.test(c.code))
      .map((c) => ({ code: c.code, reward: clean(c.reward), expires: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(c.expires) ? c.expires : "" })),
    sources: (d.sources || []).filter(isUrl).slice(0, 4),
  }] : [];

  const cv = d.currentVersion;
  const cycle = cv && /^\d+\.\d+$/.test(cv.version) && isDate(cv.releaseDate) ? { anchorVersion: cv.version, anchorDate: cv.releaseDate } : null;

  console.log(`  일정 ${events.length} · 방송 ${broadcasts.length} · 코드 ${codes.length}${cycle ? ` · 현재 ${cycle.anchorVersion}` : ""}`);
  return { events, broadcasts, codes, cycle };
}

// 이전 결과와 병합: 지난 일정·방송은 기록으로 유지, 앞으로의 일정은 최신 조사 결과로 교체
function merge(prev, game, next, today) {
  const others = (arr) => (arr || []).filter((x) => x.game !== game);
  const mine = (arr) => (arr || []).filter((x) => x.game === game);
  const pastEvents = mine(prev.events).filter((e) => e.end < today && !next.events.some((n) => n.id === e.id));
  const keptBroadcasts = mine(prev.broadcasts).filter((b) => !next.broadcasts.some((n) => n.id === b.id));
  return {
    events: [...others(prev.events), ...pastEvents, ...next.events],
    broadcasts: [...others(prev.broadcasts), ...keptBroadcasts, ...next.broadcasts],
    codes: [...others(prev.codes), ...next.codes], // 코드는 "현재 유효한 것"만 유지
    cycles: { ...prev.cycles, ...(next.cycle ? { [game]: next.cycle } : {}) },
  };
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY 환경변수가 필요합니다.");
    process.exit(1);
  }
  const games = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(GAME_NAMES);
  const today = kstToday();
  let data = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
  data = { events: [], broadcasts: [], codes: [], cycles: {}, ...data };

  let failed = 0;
  for (const game of games) {
    if (!GAME_NAMES[game]) { console.warn(`알 수 없는 게임: ${game}`); continue; }
    try {
      data = { ...data, ...merge(data, game, await collectGame(game, today), today) };
    } catch (err) {
      failed++;
      console.error(`  ✖ ${game} 실패: ${err.message}`); // 실패한 게임은 이전 데이터 유지
    }
  }

  data.updatedAt = new Date().toISOString();
  data.events.sort((a, b) => a.start.localeCompare(b.start));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n");
  console.log(`✔ 저장: ${path.relative(ROOT, OUT)}`);
  if (failed === games.length) process.exit(1);
}

main();
