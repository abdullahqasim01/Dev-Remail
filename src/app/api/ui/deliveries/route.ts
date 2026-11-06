import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { uiHandler } from "@/lib/ui-api";

export const GET = uiHandler(async () => {
  const rows = await db.webhookDelivery.findMany({ orderBy: { createdAt: "desc" }, take: 100 });
  return NextResponse.json(
    rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      emailId: r.emailId,
      url: r.url,
      status: r.status,
      statusCode: r.statusCode,
      responseBody: r.responseBody,
      attempts: r.attempts,
      createdAt: r.createdAt.toISOString(),
      lastAttemptAt: r.lastAttemptAt?.toISOString() ?? null,
      payload: r.payload,
    })),
  );
});

export const DELETE = uiHandler(async () => {
  await db.webhookDelivery.deleteMany({});
  return NextResponse.json({ ok: true });
});
