import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/mail";
import { snippet, uiHandler } from "@/lib/ui-api";

/** Everything the app under test sent through the API, newest first. */
export const GET = uiHandler(async () => {
  const emails = await db.email.findMany({
    where: { direction: { in: ["outbound", "inbound"] } },
    include: { attachments: { select: { id: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return NextResponse.json(
    emails.map((e) => ({
      id: e.id,
      direction: e.direction,
      from: e.from,
      to: parseJson<string[]>(e.to, []),
      subject: e.subject,
      snippet: snippet(e),
      lastEvent: e.lastEvent,
      createdAt: e.createdAt.toISOString(),
      attachments: e.attachments.length,
    })),
  );
});
