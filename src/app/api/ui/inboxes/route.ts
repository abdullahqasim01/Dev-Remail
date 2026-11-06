import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { parseAddress } from "@/lib/address";
import { registeredDomainNames, uuid } from "@/lib/mail";
import { uiHandler } from "@/lib/ui-api";

export const GET = uiHandler(async () => {
  const inboxes = await db.inbox.findMany({ orderBy: { createdAt: "asc" } });
  const unread = await db.delivery.groupBy({
    by: ["inboxId"],
    where: { read: false },
    _count: { _all: true },
  });
  const map = new Map(unread.map((u) => [u.inboxId, u._count._all]));
  return NextResponse.json(
    inboxes.map((i) => ({ id: i.id, address: i.address, name: i.name, unread: map.get(i.id) ?? 0 })),
  );
});

export const POST = uiHandler(async (req) => {
  const body = (await req.json().catch(() => ({}))) as { address?: string; name?: string };
  const p = parseAddress(body.address);
  if (!p) throw Errors.validation("Enter a valid email address.");
  if ((await registeredDomainNames()).has(p.domain))
    throw Errors.validation(
      `${p.domain} is a registered app domain. Inboxes represent end users, so use a different domain (e.g. gmail.com).`,
    );
  if (await db.inbox.findUnique({ where: { address: p.address } }))
    throw Errors.validation("An inbox with this address already exists.");
  const inbox = await db.inbox.create({
    data: { id: uuid(), address: p.address, name: body.name?.trim() || null },
  });
  return NextResponse.json({ id: inbox.id, address: inbox.address, name: inbox.name, unread: 0 });
});
