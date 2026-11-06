import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors, handler } from "@/lib/errors";
import { originOf, serializeReceiving } from "@/lib/mail";

export const GET = handler(async (req, ctx: RouteContext<"/emails/receiving/[id]">) => {
  const { id } = await ctx.params;
  const email = await db.email.findFirst({
    where: { id, direction: "inbound" },
    include: { attachments: true },
  });
  if (!email) throw Errors.notFound("email");
  return NextResponse.json(await serializeReceiving(email, originOf(req)));
});
