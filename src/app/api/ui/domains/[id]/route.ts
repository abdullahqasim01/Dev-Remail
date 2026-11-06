import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uiHandler } from "@/lib/ui-api";

export const DELETE = uiHandler(async (_req, ctx: RouteContext<"/api/ui/domains/[id]">) => {
  const { id } = await ctx.params;
  await db.domain.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
});
