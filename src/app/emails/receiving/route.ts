import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";
import { originOf, serializeReceiving, serializeReceivingListItem } from "@/lib/mail";
import { pageParams, paginate } from "@/lib/pagination";

export const GET = handler(async (req) => {
  const p = pageParams(req);
  const { rows, hasMore } = await paginate(p, ({ order, cursor, take }) =>
    db.email.findMany({
      where: { direction: "inbound" },
      include: { attachments: true },
      orderBy: [{ createdAt: order }, { id: order }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  const origin = originOf(req);
  const data = await Promise.all(rows.map(async (r) => serializeReceivingListItem(await serializeReceiving(r, origin))));
  return NextResponse.json({ object: "list", has_more: hasMore, data });
});
