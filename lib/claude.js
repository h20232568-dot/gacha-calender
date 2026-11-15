// Claude API 공통 모듈 — api/summarize.js(방송 요약)와 scripts/collect.mjs(자동 수집)에서 사용
import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-5-5";
export const GAME_NAMES = {
  genshin: "원신 (Genshin Impact)",
  hsr: "붕괴: 스타레일 (Honkai: Star Rail)",
  zzz: "젠레스 존 제로 (Zenless Zone Zero)",
  wuwa: "명조: 워더링 웨이브 (Wuthering Waves)",
};
export const TYPES = ["version", "banner", "broadcast", "collab", "event", "maint"];

let _client;
export const client = () => (_client ??= new Anthropic()); // ANTHROPIC_API_KEY 환경변수 사용

// ---------- JSON 스키마 (structured outputs) ----------
const str = { type: "string" };
const strArr = { type: "array", items: str };
const obj = (properties) => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });

const CODE = obj({
  code: str,
  reward: str,
  expires: { type: "string", description: "만료 일시, 한국 시간(KST) 'YYYY-MM-DDTHH:MM'. 모르면 빈 문자열" },
});
const EVENT = obj({
  type: { type: "string", enum: TYPES },
  title: { type: "string", description: "한국어 일정 제목. 예: '7.3 1차 픽업: 캐릭터A · 캐릭터B'" },
  start: { type: "string", description: "YYYY-MM-DD (KST)" },
  end: { type: "string", description: "YYYY-MM-DD (KST), 하루짜리면 start와 같게" },
  time: { type: "string", description: "HH:MM (KST), 모르면 빈 문자열" },
  note: str,
});

export const SUMMARY_SCHEMA = obj({
  version: { type: "string", description: "버전 번호, 예: '7.3'. 모르면 빈 문자열" },
  title: { type: "string", description: "방송 제목 (한국어)" },
  date: { type: "string", description: "방송일 YYYY-MM-DD, 모르면 빈 문자열" },
  summary: { type: "string", description: "핵심 요약 3~5문장 (한국어)" },
  characters: { ...strArr, description: "신규/복각 픽업 캐릭터. '5성 이름 (신규, 속성/무기) — 1차' 형식" },
  content: { ...strArr, description: "신규 지역·스토리·이벤트·시스템 변경 등 주요 콘텐츠" },
  codes: { type: "array", items: CODE },
  events: { type: "array", items: EVENT, description: "본문에 날짜가 명시된 일정만 (업데이트일, 픽업 기간, 이벤트 기간 등)" },
});

const BROADCAST = obj({
  version: str, title: str,
  date: { type: "string", description: "YYYY-MM-DD, 방송 정보가 없으면 빈 문자열" },
  time: str, summary: str, characters: strArr, content: strArr, codes: { type: "array", items: CODE },
});
export const COLLECT_SCHEMA = obj({
  currentVersion: obj({
    version: { type: "string", description: "현재 서비스 중인 최신 버전" },
    releaseDate: { type: "string", description: "그 버전의 업데이트일 YYYY-MM-DD" },
  }),
  events: { type: "array", items: { ...EVENT, properties: { ...EVENT.properties, sources: strArr }, required: [...EVENT.required, "sources"] } },
  broadcast: { ...BROADCAST, description: "가장 최근(또는 예정된) 공식 방송. 정보가 없으면 version을 빈 문자열로" },
  activeCodes: { type: "array", items: CODE, description: "현재 사용 가능한 리딤코드만" },
  sources: strArr,
});

// ---------- 호출 헬퍼 ----------
// 거절(refusal) 시 서버 측 fallback 모델로 자동 재시도 (server-side-fallback 베타)
const BASE = { model: MODEL, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

function textOf(msg) {
  return msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}
function assertOk(msg) {
  if (msg.stop_reason === "refusal") throw new Error(`요청이 거절되었습니다 (${msg.stop_details?.category ?? "unknown"})`);
  if (msg.stop_reason === "max_tokens") throw new Error("응답이 너무 길어 잘렸습니다");
}

/** JSON 스키마에 맞춘 구조화 출력 */
export async function structured({ system, prompt, schema, effort = "medium" }) {
  const msg = await client().beta.messages.create({
    ...BASE,
    max_tokens: 16000,
    output_config: { effort, format: { type: "json_schema", schema } },
    system,
    messages: [{ role: "user", content: prompt }],
  });
  assertOk(msg);
  return JSON.parse(textOf(msg));
}

/** 웹 검색을 쓰는 리서치 호출 (pause_turn 이어받기 포함) → 텍스트 보고서 */
export async function research({ system, prompt, maxSearches = 8 }) {
  const messages = [{ role: "user", content: prompt }];
  for (let i = 0; i < 5; i++) {
    const msg = await client().beta.messages.create({
      ...BASE,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      system,
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: maxSearches }],
      messages,
    });
    assertOk(msg);
    if (msg.stop_reason !== "pause_turn") return textOf(msg);
    messages.push({ role: "assistant", content: msg.content }); // 서버가 이어서 진행
  }
  throw new Error("리서치가 너무 오래 걸려 중단했습니다");
}

// ---------- 방송 요약 ----------
export async function summarizeBroadcast({ text, game }) {
  const today = new Date().toISOString().slice(0, 10);
  return structured({
    system:
      "당신은 서브컬처 게임 공식 방송/공지를 정리하는 한국어 편집자입니다. " +
      "주어진 원문에 있는 정보만 사용하고, 원문에 없는 날짜·캐릭터·코드는 지어내지 마세요. " +
      "날짜와 시간은 한국 시간(KST)으로 변환합니다. 캐릭터 이름은 한국 서버 공식 표기를 알면 그것을, 확실하지 않으면 원문 표기를 그대로 씁니다.",
    prompt: `게임: ${GAME_NAMES[game] ?? game}\n오늘 날짜: ${today}\n\n아래 원문을 정리해 주세요.\n\n<원문>\n${text}\n</원문>`,
    schema: SUMMARY_SCHEMA,
  });
}
