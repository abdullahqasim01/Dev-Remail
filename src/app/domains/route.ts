import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError, Errors, handler } from "@/lib/errors";
import { serializeDomain } from "@/lib/domains";
import { uuid } from "@/lib/mail";
import { pageParams, paginate } from "@/lib/pagination";

export const POST = handler(async (req) => {
  const body = (await req.json().catch(() => null)) as { name?: string; region?: string } | null;
  if (!body?.name) throw Errors.missingField("name");
  const name = body.name.trim().toLowerCase();
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(name)) throw Errors.validation("Invalid `name` field.");
  if (await db.domain.findUnique({ where: { name } }))
    throw new ApiError(403, "validation_error", "This domain is already registered.");
  const d = await db.domain.create({ data: { id: uuid(), name, region: body.region ?? "us-east-1" } });
  return NextResponse.json({ ...serializeDomain(d), records: [] });
});

export const GET = handler(async (req) => {
  const p = pageParams(req);
  const { rows, hasMore } = await paginate(p, ({ order, cursor, take }) =>
    db.domain.findMany({
      orderBy: [{ createdAt: order }, { id: order }],
      take,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
  );
  return NextResponse.json({ object: "list", has_more: hasMore, data: rows.map(serializeDomain) });
});
