import { NextResponse } from "next/server";
import { Errors } from "@/lib/errors";
import { sendFromInbox, type InboxSendInput } from "@/lib/mail";
import { uiHandler } from "@/lib/ui-api";

export const POST = uiHandler(async (req) => {
  const body = (await req.json().catch(() => null)) as Partial<InboxSendInput> | null;
  if (!body?.inboxId) throw Errors.validation("Pick the inbox to send from.");
  const email = await sendFromInbox({
    inboxId: body.inboxId,
    to: body.to ?? [],
    cc: body.cc,
    bcc: body.bcc,
    subject: body.subject ?? "",
    html: body.html,
    text: body.text,
    attachments: body.attachments,
  });
  return NextResponse.json({ id: email.id, direction: email.direction });
});
