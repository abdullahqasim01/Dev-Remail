import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, Errors, handler } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { sendOutbound, serializeEmailListItem, type ApiEmailPayload } from "@/lib/mail";
import { pageParams, paginate } from "@/lib/pagination";

export const POST = handler(async (req) => {
  const raw = await req.text();
  let payload: ApiEmailPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw Errors.validation("Invalid JSON body.");
  }
  return withIdempotency(req, "emails", raw, async () => ({
    status: 200,
    body: await sendOutbound(payload),
  }));
});

export const GET = handler(async (req) => {
  const p = pageParams(req);
  const { rows, hasMore } = await paginate(p, async ({ order, cursor, take }) =>
    db.email.findMany({
      where: { direction: "outbound" },
      orderBy: [{ createdAt: order }, { id: order }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  ).catch((e) => {
    throw e instanceof ApiError ? e : Errors.validation("Invalid pagination cursor.");
  });
  return NextResponse.json({ object: "list", has_more: hasMore, data: rows.map(serializeEmailListItem) });
});
