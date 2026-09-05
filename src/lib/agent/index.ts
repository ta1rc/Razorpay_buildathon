import type { Candidate } from "./candidates";
import type { AgentTurnResult, ChatHistoryItem } from "./types";
import { runFallbackAgent } from "./fallback-agent";
import { runClaudeAgent } from "./claude-agent";
import { runGeminiAgent } from "./gemini-agent";
import type { Vertical } from "@/lib/enums";

export type { AgentTurnResult, ChatHistoryItem, AgentPick } from "./types";
export type { Candidate, LiveBundle } from "./candidates";
export { getLiveCandidates, getLiveBundles } from "./candidates";

export async function runAgentTurn(
  vertical: Vertical,
  candidates: Candidate[],
  history: ChatHistoryItem[],
  message: string,
): Promise<AgentTurnResult> {
  // Gemini first — it's the free-tier path. Claude is tried next if
  // configured. Either failing (missing key, no credits, API error) falls
  // through to the deterministic rule-based agent so the app never breaks.
  if (process.env.GEMINI_API_KEY) {
    try {
      return await runGeminiAgent(vertical, candidates, history, message);
    } catch (err) {
      console.error("Gemini agent failed, trying next option:", err);
    }
  }
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await runClaudeAgent(vertical, candidates, history, message);
    } catch (err) {
      console.error("Claude agent failed, falling back to rule-based agent:", err);
    }
  }
  return runFallbackAgent(vertical, candidates, message, history);
}
