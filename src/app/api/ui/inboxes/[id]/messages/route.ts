import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { parseJson } from "@/lib/mail";
import { snippet, uiHandler } from "@/lib/ui-api";

export const GET = uiHandler(async (req, ctx: RouteContext<"/api/ui/inboxes/[id]/messages">) => {
  const { id } = await ctx.params;
  const folder = new URL(req.url).searchParams.get("folder") === "sent" ? "sent" : "inbox";
  const inbox = await db.inbox.findUnique({ where: { id } });
  if (!inbox) throw Errors.notFound("inbox");

  const emails =
    folder === "inbox"
      ? (
          await db.delivery.findMany({
            where: { inboxId: id },
            include: { email: { include: { attachments: { select: { id: true } } } } },
            orderBy: { email: { createdAt: "desc" } },
            take: 200,
          })
        ).map((d) => ({ email: d.email, read: d.read }))
      : (
          await db.email.findMany({
            where: { senderInboxId: id },
            include: { attachments: { select: { id: true } } },
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        ).map((email) => ({ email, read: true }));

  return NextResponse.json(
    emails.map(({ email: e, read }) => ({
      id: e.id,
      from: e.from,
      to: parseJson<string[]>(e.to, []),
      subject: e.subject,
      snippet: snippet(e),
      createdAt: e.createdAt.toISOString(),
      read,
      attachments: e.attachments.length,
    })),
  );
});
