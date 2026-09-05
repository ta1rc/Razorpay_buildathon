import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { productId } = (await req.json()) as { productId: string };

  await prisma.ambiguityFlag.deleteMany({ where: { productId } });
  await prisma.product.delete({ where: { id: productId } });

  return NextResponse.json({ ok: true });
}
