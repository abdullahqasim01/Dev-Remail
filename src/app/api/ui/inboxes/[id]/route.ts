import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { uiHandler } from "@/lib/ui-api";

export const DELETE = uiHandler(async (_req, ctx: RouteContext<"/api/ui/inboxes/[id]">) => {
  const { id } = await ctx.params;
  if (!(await db.inbox.findUnique({ where: { id } }))) throw Errors.notFound("inbox");
  await db.inbox.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
