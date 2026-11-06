import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors, handler } from "@/lib/errors";
import { serializeEmail } from "@/lib/mail";

export const GET = handler(async (_req, ctx: RouteContext<"/emails/[id]">) => {
  const { id } = await ctx.params;
  const email = await db.email.findFirst({ where: { id, direction: "outbound" } });
  if (!email) throw Errors.notFound("email");
  return NextResponse.json(serializeEmail(email));
});
