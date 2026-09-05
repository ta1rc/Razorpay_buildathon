import type { Candidate } from "./candidates";
import type { AgentTurnResult, ChatHistoryItem } from "./types";
import type { Vertical } from "@/lib/enums";

// Calls the Gemini REST API directly rather than via @google/generative-ai.
// The npm SDK's chat/tool-calling path was found to route through a
// capacity-constrained backend that reliably 503'd ("high demand"), while
// the identical request shape sent as plain REST succeeds consistently.
const GEMINI_MODEL = "gemini-3.6-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const RESPOND_FUNCTION = {
  name: "respond_to_buyer",
  description:
    "Send a structured response to the buyer. Always call this — never answer in plain prose.",
  parameters: {
    type: "OBJECT",
    properties: {
      responseType: {
        type: "STRING",
        format: "enum",
        enum: ["clarifying_questions", "comparison", "basket"],
        description:
          "clarifying_questions if you cannot responsibly answer yet (missing budget, size, household size, etc). comparison for a single-item / ranked pick across candidates. basket for a multi-item cart (e.g. grocery baskets).",
      },
      message: { type: "STRING", description: "Natural-language reply shown to the buyer in the chat bubble." },
      clarifyingQuestions: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Only when responseType is clarifying_questions — 2-3 targeted questions.",
      },
      assumptions: {
        type: "ARRAY",
        items: { type: "STRING" },
        description: "Explicit defaults you assumed for anything the buyer left unanswered.",
      },
      picks: {
        type: "ARRAY",
        description:
          "Product picks from the candidate list ONLY — never invent a productId. For comparison, 1-3 ranked picks. For basket, every item in the cart.",
        items: {
          type: "OBJECT",
          properties: {
            productId: { type: "STRING" },
            qty: { type: "NUMBER" },
            reasoning: { type: "STRING", description: "One sentence: why this pick, citing its actual specs/price." },
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

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: GeminiPart[] } }[];
  error?: { message: string };
}

export async function runGeminiAgent(
  vertical: Vertical,
  candidates: Candidate[],
  history: ChatHistoryItem[],
  message: string,
): Promise<AgentTurnResult> {
  const apiKey = process.env.GEMINI_API_KEY!;

  const contents = [
    ...history.map((h) => ({
      role: h.role === "USER" ? "user" : "model",
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const requestBody = JSON.stringify({
    systemInstruction: { parts: [{ text: systemPromptFor(vertical, candidates) }] },
    contents,
    tools: [{ functionDeclarations: [RESPOND_FUNCTION] }],
    toolConfig: { functionCallingConfig: { mode: "AUTO" } },
  });

  // The free tier intermittently 503s ("high demand") on otherwise-valid
  // requests — a short retry-with-backoff clears most of these rather than
  // dropping straight to the rule-based fallback.
  let data: GeminiResponse | null = null;
  let lastError: string | undefined;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));
    const res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: requestBody,
    });
    const json = (await res.json()) as GeminiResponse;
    if (res.ok) {
      data = json;
      break;
    }
    lastError = json.error?.message ?? res.statusText;
  }

  if (!data) {
    throw new Error(`Gemini API error after retries: ${lastError}`);
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const functionCallPart = parts.find((p) => p.functionCall?.name === "respond_to_buyer");

  if (!functionCallPart?.functionCall) {
    const textPart = parts.find((p) => p.text)?.text;
    return {
      responseType: "clarifying_questions",
      message: textPart || "Could you say more about what you're looking for?",
    };
  }

  const raw = functionCallPart.functionCall.args as unknown as AgentTurnResult;
  const validIds = new Set(candidates.map((c) => c.id));
  const picks = (raw.picks ?? []).filter((p) => validIds.has(p.productId));

  return { ...raw, picks };
}
