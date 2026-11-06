import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors, handler } from "@/lib/errors";

export const POST = handler(async (_req, ctx: RouteContext<"/domains/[id]/verify">) => {
  const { id } = await ctx.params;
  if (!(await db.domain.findUnique({ where: { id } }))) throw Errors.notFound("domain");
  return NextResponse.json({ object: "domain", id });
});
