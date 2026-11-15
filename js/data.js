// =============================================================
//  기본 데이터 (직접 확인해 정리한 데이터)
//  - 기준일: 2026-11-15, 공개 기사·가이드 사이트 기준 (각 항목 sources 참고)
//  - 자동 수집 데이터는 data/auto.json 에 따로 저장되며, 이 파일의 데이터가 우선합니다.
//  - 관리 탭에서 추가한 데이터는 브라우저(localStorage)에 저장되며 가장 우선합니다.
//  - 캐릭터 이름은 한국어 공식 표기가 확인되지 않은 경우 영문 표기를 그대로 사용했습니다.
// =============================================================

export const GAMES = {
  genshin: {
    name: "원신", short: "원신", color: "#4fa3e0",
    redeemUrl: "https://genshin.hoyoverse.com/ko/gift?code=",
    officialUrl: "https://genshin.hoyoverse.com/ko/",
  },
  hsr: {
    name: "붕괴: 스타레일", short: "스타레일", color: "#a77bf3",
    redeemUrl: "https://hsr.hoyoverse.com/gift?code=",
    officialUrl: "https://hsr.hoyoverse.com/ko-kr/",
  },
  zzz: {
    name: "젠레스 존 제로", short: "젠존제", color: "#f0a020",
    redeemUrl: "https://zenless.hoyoverse.com/redemption?code=",
    officialUrl: "https://zenless.hoyoverse.com/ko-kr/",
  },
  wuwa: {
    name: "명조: 워더링 웨이브", short: "명조", color: "#3cc9a0",
    redeemUrl: null, // 게임 내 설정 > 기타 > 교환 코드 에서만 입력 가능
    officialUrl: "https://wutheringwaves.kurogames.com/ko/",
  },
};

export const EVENT_TYPES = {
  version:   { label: "버전 업데이트", icon: "🚀" },
  banner:    { label: "캐릭터 픽업",   icon: "⭐" },
  broadcast: { label: "공식 방송",     icon: "📺" },
  collab:    { label: "콜라보",        icon: "🤝" },
  event:     { label: "인게임 이벤트", icon: "🎉" },
  maint:     { label: "점검",          icon: "🛠️" },
};

// 예상 일정 자동 계산 기준값 (가장 최근 확정 버전 기준)
// anchorDate: 기준 버전 업데이트일, cycleDays: 버전 주기, broadcastOffset: 업데이트 며칠 전 방송
export const DEFAULT_CYCLES = {
  genshin: { anchorVersion: "7.2", anchorDate: "2026-11-04", cycleDays: 42, maxMinor: 8, broadcastOffset: 12 },
  hsr:     { anchorVersion: "4.7", anchorDate: "2026-11-11", cycleDays: 42, maxMinor: 8, broadcastOffset: 12 },
  zzz:     { anchorVersion: "3.3", anchorDate: "2026-10-21", cycleDays: 42, maxMinor: 8, broadcastOffset: 12 },
  wuwa:    { anchorVersion: "3.8", anchorDate: "2026-11-12", cycleDays: 42, maxMinor: 8, broadcastOffset: 6 },
};

const SRC = {
  genshin: ["https://game8.co/games/Genshin-Impact/archives/633593", "https://www.gamenguide.com/articles/109104/20261021/genshin-impact-announces-version-72-livestream-set-october-23-new-content-redeem-codes.htm"],
  hsr: ["https://www.icy-veins.com/honkai-star-rail/news/honkai-star-rail-special-program-version-4-7-now-lay-laughter-to-all-stars-overview/", "https://game8.co/games/Honkai-Star-Rail/archives/634499"],
  zzz: ["https://game8.co/games/Zenless-Zone-Zero/archives/622039", "https://www.zzz-build.com/news/zzz-3-3-special-program"],
  wuwa: ["https://finalweapon.net/2026/11/06/wuthering-waves-version-3-8-release-date/", "https://game8.co/games/Wuthering-Waves/archives/629904"],
};

// 확정 일정
export const EVENTS = [
  // ── 원신 7.2 「Hour of Ruin」
  { id: "gi-7.2-v",  game: "genshin", type: "version", title: "7.2 「Hour of Ruin」 업데이트", start: "2026-11-04", end: "2026-11-04", time: "11:00", sources: SRC.genshin },
  { id: "gi-7.2-p1", game: "genshin", type: "banner",  title: "7.2 1차 픽업: Mitya · 푸리나 (4성 Valeriy)", start: "2026-11-04", end: "2026-11-24", sources: SRC.genshin },
  { id: "gi-7.2-p2", game: "genshin", type: "banner",  title: "7.2 2차 픽업: Zibai · Linnea", start: "2026-11-24", end: "2026-12-15", note: "2차 기간에 나타 집록 기원도 진행", sources: SRC.genshin },

  // ── 붕괴: 스타레일 4.7 「Now, Lay Laughter to All Stars」
  { id: "hsr-4.7-v",  game: "hsr", type: "version", title: "4.7 「Now, Lay Laughter to All Stars」 업데이트", start: "2026-11-11", end: "2026-11-11", sources: SRC.hsr },
  { id: "hsr-4.7-p1", game: "hsr", type: "banner",  title: "4.7 1차 픽업: Aha(신규) · 은랑 LV.999 · Sparxie · Yao Guang", start: "2026-11-11", end: "2026-12-02", sources: SRC.hsr },
  { id: "hsr-4.7-p2", game: "hsr", type: "banner",  title: "4.7 2차 픽업: 아케론 · 단항•음월 · 경원 (복각)", start: "2026-12-02", end: "2026-12-23", note: "종료일은 다음 버전 주기 기준 추정", sources: SRC.hsr },

  // ── 젠레스 존 제로 3.3 「Journey to the Sky」
  { id: "zzz-3.3-v",  game: "zzz", type: "version", title: "3.3 「Journey to the Sky」 업데이트", start: "2026-10-21", end: "2026-10-21", sources: SRC.zzz },
  { id: "zzz-3.3-p1", game: "zzz", type: "banner",  title: "3.3 1차 픽업: Phoenix(신규) · Velina(복각)", start: "2026-10-21", end: "2026-11-11", sources: SRC.zzz },
  { id: "zzz-3.3-p2", game: "zzz", type: "banner",  title: "3.3 2차 픽업: Severian(신규) · Norma(복각)", start: "2026-11-11", end: "2026-12-01", note: "종료 시각 12/1 14:59(서버 시간) — 일부 출처는 12/2", sources: SRC.zzz },

  // ── 명조 3.8 「Lilies in a Dying Dream」
  { id: "ww-3.8-v",  game: "wuwa", type: "version", title: "3.8 「Lilies in a Dying Dream」 업데이트", start: "2026-11-12", end: "2026-11-12", note: "사전 다운로드 11/10 11:00(KST)", sources: SRC.wuwa },
  { id: "ww-3.8-p1", game: "wuwa", type: "banner",  title: "3.8 1차 픽업: Lily(신규) · Sigrika · Qiuyuan(복각)", start: "2026-11-12", end: "2026-12-03", sources: SRC.wuwa },
  { id: "ww-3.8-p2", game: "wuwa", type: "banner",  title: "3.8 2차 픽업: 양양: Xuanling · Suisui · Hiyuki (복각)", start: "2026-12-03", end: "2026-12-21", note: "종료일 출처별 상이(12/21~12/23)", sources: SRC.wuwa },
];

// 공식 방송 요약
export const BROADCASTS = [
  {
    id: "b-gi-7.2", game: "genshin", version: "7.2", title: "원신 7.2 버전 특별 방송",
    date: "2026-10-23", time: "21:00", vod: "",
    characters: ["5성 Mitya (신규) — 1차", "5성 푸리나 (복각) — 1차", "4성 Valeriy (신규) — 1차", "5성 Zibai · Linnea — 2차"],
    content: ["스네즈나야 마신 임무: 「Hour of Doom」, 「Yesterday from the Other Shore」", "신규 지역 개방", "메인 이벤트 진행", "2차: 나타 집록 기원"],
    summary: "7.2 「Hour of Ruin」은 스네즈나야 마신 임무가 이어지는 버전입니다. 1차는 Mitya와 푸리나, 2차는 Zibai와 Linnea 픽업으로 진행됩니다.",
    codes: [
      { code: "HourofRuin", reward: "원석 ×100 외", expires: "2026-10-26T13:00" },
      { code: "ExpertMitya", reward: "원석 ×100 외", expires: "2026-10-26T13:00" },
      { code: "PhotoTime", reward: "원석 ×100 외", expires: "2026-10-26T13:00" },
    ],
    sources: SRC.genshin,
  },
  {
    id: "b-hsr-4.7", game: "hsr", version: "4.7", title: "붕괴: 스타레일 4.7 특별 방송 「Aha's Night」",
    date: "2026-10-30", vod: "",
    characters: ["5성 Aha (신규, 환락 운명의 길) — 1차", "은랑 LV.999 · Sparxie · Yao Guang (복각) — 1차", "아케론 · 단항•음월 · 경원 (복각) — 2차"],
    content: ["무료 한정 5성 1명 선택 지급 (아케론 / 단항•음월 / 경원 중)", "Affinitive Eidolons 시스템 추가"],
    summary: "4.7 「Now, Lay Laughter to All Stars」에서 에온 Aha가 플레이어블 캐릭터로 등장합니다. 한정 5성 무료 선택권과 리딤코드 3개(성옥 총 300개)가 공개되었습니다.",
    codes: [
      { code: "NEVERGONNAGIVE", reward: "성옥 ×100, 신용 포인트 ×50,000", expires: "2026-11-01T00:59" },
      { code: "NEVERGONNAMAKE", reward: "성옥 ×100, 여행자 가이드 ×5", expires: "2026-11-01T00:59" },
      { code: "AHABLESSYOU", reward: "성옥 ×100, 정제된 에테르 ×4", expires: "2026-11-01T00:59" },
    ],
    sources: SRC.hsr,
  },
  {
    id: "b-zzz-3.3", game: "zzz", version: "3.3", title: "젠레스 존 제로 3.3 특별 방송",
    date: "2026-10-09", vod: "",
    characters: ["S급 Phoenix (신규, 불속성 이상) — 1차", "Velina (복각) — 1차", "S급 Severian (신규, 바람 강공) — 2차", "Norma (복각) — 2차"],
    content: ["붕괴: 스타레일 콜라보 발표 (세부 내용은 공식 공지 확인)"],
    summary: "3.3 「Journey to the Sky」는 신규 S급 요원 Phoenix와 Severian이 순서대로 등장합니다. 방송 리딤코드는 1개(폴리크롬 300)였습니다.",
    codes: [
      { code: "JRNY2SKY", reward: "폴리크롬 ×300, 수석 조사원 기록 ×2, W-엔진 에너지 모듈 ×3, 데니 ×30,000", expires: "2026-10-11T23:59" },
    ],
    sources: SRC.zzz,
  },
  {
    id: "b-ww-3.8", game: "wuwa", version: "3.8", title: "명조 3.8 프리뷰 특별 방송",
    date: "2026-11-06", time: "20:00", vod: "",
    characters: ["5성 Lily (신규, 회절 권총, New Federation 소속) — 1차", "Sigrika · Qiuyuan (복각) — 1차", "양양: Xuanling · Suisui · Hiyuki (복각) — 2차"],
    content: ["신규 무기: Lullaby (Lily 전용)", "2차 4성 픽업: 단근 · 백지 · 연무"],
    summary: "3.8 「Lilies in a Dying Dream」은 11/12(KST 기준) 업데이트되었습니다. 신규 5성은 Lily 1명이며, 나머지는 복각으로 구성됩니다.",
    codes: [
      { code: "TRAINOFSOULS", reward: "성음 등", expires: "2026-11-09T00:59" },
      { code: "BLOOMINGFLOWERS", reward: "성음 등", expires: "2026-11-09T00:59" },
      { code: "SCHOOLLIFE", reward: "성음 등", expires: "2026-11-09T00:59" },
    ],
    sources: SRC.wuwa,
  },
];

// 방송 외 리딤코드 (상시 코드 등)
export const CODES = [];
