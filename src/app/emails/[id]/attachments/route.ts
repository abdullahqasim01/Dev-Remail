import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors, handler } from "@/lib/errors";
import { originOf, serializeAttachmentData } from "@/lib/mail";
import { pageParams, paginate } from "@/lib/pagination";

export const GET = handler(async (req, ctx: RouteContext<"/emails/[id]/attachments">) => {
  const { id } = await ctx.params;
  const email = await db.email.findFirst({ where: { id, direction: "outbound" }, select: { id: true } });
  if (!email) throw Errors.notFound("email");
  const p = pageParams(req);
  const { rows, hasMore } = await paginate(p, ({ order, cursor, take }) =>
    db.attachment.findMany({
      where: { emailId: id },
      orderBy: { id: order },
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const origin = originOf(req);
  return NextResponse.json({
    object: "list",
    has_more: hasMore,
    data: rows.map((a) => serializeAttachmentData(a, origin)),
  });
});
