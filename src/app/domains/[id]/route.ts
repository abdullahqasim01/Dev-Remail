import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors, handler } from "@/lib/errors";
import { serializeDomain } from "@/lib/domains";

export const GET = handler(async (_req, ctx: RouteContext<"/domains/[id]">) => {
  const { id } = await ctx.params;
  const d = await db.domain.findUnique({ where: { id } });
  if (!d) throw Errors.notFound("domain");
  return NextResponse.json({ object: "domain", ...serializeDomain(d), records: [] });
});

export const PATCH = handler(async (_req, ctx: RouteContext<"/domains/[id]">) => {
  const { id } = await ctx.params;
  if (!(await db.domain.findUnique({ where: { id } }))) throw Errors.notFound("domain");
  return NextResponse.json({ object: "domain", id });
});

export const DELETE = handler(async (_req, ctx: RouteContext<"/domains/[id]">) => {
  const { id } = await ctx.params;
  if (!(await db.domain.findUnique({ where: { id } }))) throw Errors.notFound("domain");
  await db.domain.delete({ where: { id } });
  return NextResponse.json({ object: "domain", id, deleted: true });
});
