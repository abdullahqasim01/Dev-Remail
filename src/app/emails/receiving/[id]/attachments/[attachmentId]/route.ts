import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors, handler } from "@/lib/errors";
import { originOf, serializeAttachmentData } from "@/lib/mail";

export const GET = handler(
  async (req, ctx: RouteContext<"/emails/receiving/[id]/attachments/[attachmentId]">) => {
    const { id, attachmentId } = await ctx.params;
    const a = await db.attachment.findFirst({
      where: { id: attachmentId, emailId: id, email: { direction: "inbound" } },
    });
    if (!a) throw Errors.notFound("attachment");
    return NextResponse.json({ object: "attachment", ...serializeAttachmentData(a, originOf(req)) });
  },
);
