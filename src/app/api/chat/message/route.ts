import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getLiveCandidates, runAgentTurn } from "@/lib/agent";
import { computeCrossSell, computeStretchPick } from "@/lib/agent/upsell";
import type { Vertical } from "@/lib/enums";
import type { ChatHistoryItem } from "@/lib/agent/types";

export async function POST(req: Request) {
  const body = (await req.json()) as {
    chatSessionId?: string;
    vertical?: Vertical;
    message: string;
  };

  let session = body.chatSessionId
    ? await prisma.chatSession.findUnique({
        where: { id: body.chatSessionId },
        include: { messages: { orderBy: { createdAt: "asc" } } },
      })
    : null;

  if (!session) {
    if (!body.vertical) {
      return NextResponse.json({ error: "vertical is required to start a chat session" }, { status: 400 });
    }
    session = await prisma.chatSession.create({
      data: { vertical: body.vertical },
      include: { messages: true },
    });
  }

  const vertical = session.vertical as Vertical;
  const candidates = await getLiveCandidates(vertical);

  const history: ChatHistoryItem[] = session.messages.map((m) => ({
    role: m.role as "USER" | "AGENT",
    content: m.content,
  }));

  await prisma.chatMessage.create({
    data: { chatSessionId: session.id, role: "USER", content: body.message },
  });

  const result = await runAgentTurn(vertical, candidates, history, body.message);

  await prisma.chatMessage.create({
    data: {
      chatSessionId: session.id,
      role: "AGENT",
      content: result.message,
      structuredJson: JSON.stringify(result),
    },
  });

  const candidateById = new Map(candidates.map((c) => [c.id, c]));
  const cards = (result.picks ?? [])
    .map((pick) => {
      const c = candidateById.get(pick.productId);
      if (!c) return null;
      return {
        productId: c.id,
        merchantName: c.merchantName,
        title: c.common.title,
        brand: c.common.brand,
        imageEmoji: c.common.imageEmoji,
        facet: c.facet,
        price: c.price,
        stockCount: c.stockCount,
        verificationLevel: c.verificationLevel,
        freshnessState: c.freshnessState,
        qty: pick.qty,
        reasoning: pick.reasoning,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);

  // Upsell/cross-sell are computed here, deterministically, rather than
  // inside each agent backend — this guarantees they appear regardless of
  // whether Gemini, Claude, or the rule-based fallback served the turn.
  const pickedIds = (result.picks ?? []).map((p) => p.productId);
  const crossSell =
    pickedIds.length > 0 && (result.responseType === "comparison" || result.responseType === "basket")
      ? computeCrossSell(candidates, pickedIds)
      : [];
  const stretchPick =
    pickedIds.length > 0 && result.responseType !== "clarifying_questions"
      ? computeStretchPick(candidates, pickedIds[0])
      : null;

  return NextResponse.json({
    chatSessionId: session.id,
    vertical,
    agent: {
      responseType: result.responseType,
      message: result.message,
      clarifyingQuestions: result.clarifyingQuestions ?? [],
      assumptions: result.assumptions ?? [],
      cards,
      crossSell,
      stretchPick,
    },
  });
}
