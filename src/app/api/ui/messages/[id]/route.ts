import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { parseJson } from "@/lib/mail";
import { uiHandler } from "@/lib/ui-api";

export const GET = uiHandler(async (req, ctx: RouteContext<"/api/ui/messages/[id]">) => {
  const { id } = await ctx.params;
  const inboxId = new URL(req.url).searchParams.get("inbox");
  const e = await db.email.findUnique({ where: { id }, include: { attachments: { omit: { data: true } } } });
  if (!e) throw Errors.notFound("email");
  if (inboxId)
    await db.delivery.updateMany({ where: { emailId: id, inboxId }, data: { read: true } });
  return NextResponse.json({
    id: e.id,
    direction: e.direction,
    from: e.from,
    to: parseJson<string[]>(e.to, []),
    cc: parseJson<string[]>(e.cc, []),
    bcc: parseJson<string[]>(e.bcc, []),
    replyTo: parseJson<string[]>(e.replyTo, []),
    subject: e.subject,
    html: e.html,
    text: e.text,
    headers: parseJson<Record<string, string>>(e.headers, {}),
    tags: parseJson<{ name: string; value: string }[]>(e.tags, []),
    messageId: e.messageId,
    lastEvent: e.lastEvent,
    createdAt: e.createdAt.toISOString(),
    attachments: e.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      size: a.size,
      contentType: a.contentType,
      contentId: a.contentId,
      url: `/api/files/attachments/${a.id}`,
    })),
  });
});

export const DELETE = uiHandler(async (_req, ctx: RouteContext<"/api/ui/messages/[id]">) => {
  const { id } = await ctx.params;
  await db.email.deleteMany({ where: { id } });
  return NextResponse.json({ ok: true });
});
