export interface AgentPick {
  productId: string;
  qty: number;
  reasoning: string;
}

export interface AgentTurnResult {
  responseType: "clarifying_questions" | "comparison" | "basket";
  message: string;
  clarifyingQuestions?: string[];
  assumptions?: string[];
  picks?: AgentPick[];
}

export interface ChatHistoryItem {
  role: "USER" | "AGENT";
  content: string;
}
