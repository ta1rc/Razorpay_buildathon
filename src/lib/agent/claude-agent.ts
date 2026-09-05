import Anthropic from "@anthropic-ai/sdk";
import type { Candidate } from "./candidates";
import type { AgentTurnResult, ChatHistoryItem } from "./types";
import type { Vertical } from "@/lib/enums";

const RESPOND_TOOL = {
  name: "respond_to_buyer",
  description:
    "Send a structured response to the buyer. Always use this tool — never answer in plain prose.",
  input_schema: {
    type: "object" as const,
    properties: {
      responseType: {
        type: "string",
        enum: ["clarifying_questions", "comparison", "basket"],
        description:
          "clarifying_questions if you cannot responsibly answer yet (missing budget, size, household size, etc). comparison for a single-item / ranked pick across candidates. basket for a multi-item cart (e.g. grocery baskets).",
      },
      message: { type: "string", description: "Natural-language reply shown to the buyer in the chat bubble." },
      clarifyingQuestions: {
        type: "array",
        items: { type: "string" },
        description: "Only when responseType is clarifying_questions — 2-3 targeted questions.",
      },
      assumptions: {
        type: "array",
        items: { type: "string" },
        description: "Explicit defaults you assumed for anything the buyer left unanswered.",
      },
      picks: {
        type: "array",
        description:
          "Product picks from the candidate list ONLY — never invent a productId. For comparison, 1-3 ranked picks. For basket, every item in the cart.",
        items: {
          type: "object",
          properties: {
            productId: { type: "string" },
            qty: { type: "number" },
            reasoning: { type: "string", description: "One sentence: why this pick, citing its actual specs/price." },
          },
          required: ["productId", "qty", "reasoning"],
        },
      },
    },
    required: ["responseType", "message"],
  },
};

function systemPromptFor(vertical: Vertical, candidates: Candidate[]): string {
  const candidateSummary = candidates
    .map((c) => {
      const facetStr = Object.entries(c.facet)
        .filter(([k]) => k !== "kind")
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join("/") : v}`)
        .join(", ");
      return `- id=${c.id} | ${c.common.title} (${c.merchantName}) | ${facetStr} | price=₹${(c.price / 100).toFixed(0)} | stock=${c.stockCount} | verification=${c.verificationLevel}`;
    })
    .join("\n");

  return `You are a shopping agent for the ${vertical.toLowerCase()} vertical of an agentic commerce platform. You may ONLY recommend products from this exact candidate list — never invent a product or productId:

${candidateSummary}

Rules:
- If the buyer's request is underspecified for this vertical (e.g. a grocery basket with no household size/diet given, or a fashion request with no size), respond with responseType "clarifying_questions" and ask 2-3 targeted questions in ONE turn — do not ask one question at a time.
- If the buyer has answered enough (even partially), proceed and state any remaining assumptions explicitly in "assumptions" rather than asking again.
- Every reasoning line must cite real facts from the candidate list (spec, price, diet tag, size) — never vague marketing language.
- For a grocery basket, pick items across multiple categories within budget; note in "message" the total and budget.
- Always call the respond_to_buyer tool. Never reply in plain text.`;
}

export async function runClaudeAgent(
  vertical: Vertical,
  candidates: Candidate[],
  history: ChatHistoryItem[],
  message: string,
): Promise<AgentTurnResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = [
    ...history.map((h) => ({
      role: h.role === "USER" ? ("user" as const) : ("assistant" as const),
      content: h.content,
    })),
    { role: "user", content: message },
  ];

  const response = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: systemPromptFor(vertical, candidates),
    tools: [RESPOND_TOOL],
    tool_choice: { type: "tool", name: "respond_to_buyer" },
    messages,
  });

  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a structured response");
  }

  const raw = toolUse.input as AgentTurnResult;
  const validIds = new Set(candidates.map((c) => c.id));
  const picks = (raw.picks ?? []).filter((p) => validIds.has(p.productId));

  return { ...raw, picks };
}
