// Vercel 서버리스 함수: POST /api/summarize  { text, game } → 방송 요약 JSON
// 환경변수: ANTHROPIC_API_KEY (필수), ADMIN_TOKEN (권장 — 설정 시 x-admin-token 헤더가 일치해야 호출 가능)
import Anthropic from "@anthropic-ai/sdk";
import { summarizeBroadcast, GAME_NAMES } from "../lib/claude.js";

const MAX_CHARS = 60_000;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST만 지원합니다." });

  const token = process.env.ADMIN_TOKEN;
  if (token && req.headers["x-admin-token"] !== token) {
    return res.status(401).json({ error: "관리자 토큰이 올바르지 않습니다." });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: "서버에 ANTHROPIC_API_KEY가 설정되지 않았습니다." });
  }

  const { text = "", game = "" } = req.body || {};
  if (!GAME_NAMES[game]) return res.status(400).json({ error: "알 수 없는 게임입니다." });
  if (!text.trim()) return res.status(400).json({ error: "원문이 비어 있습니다." });
  if (text.length > MAX_CHARS) {
    return res.status(413).json({ error: `원문이 너무 깁니다 (${text.length.toLocaleString()}자). ${MAX_CHARS.toLocaleString()}자 이하로 나눠서 요청해 주세요.` });
  }

  try {
    const result = await summarizeBroadcast({ text, game });
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return res.status(429).json({ error: "요청이 많습니다. 잠시 후 다시 시도해 주세요." });
    if (err instanceof Anthropic.AuthenticationError) return res.status(500).json({ error: "Anthropic API 키가 올바르지 않습니다." });
    if (err instanceof Anthropic.APIError) return res.status(502).json({ error: `Claude API 오류 (${err.status}): ${err.message}` });
    return res.status(500).json({ error: err.message || "요약 중 오류가 발생했습니다." });
  }
}
