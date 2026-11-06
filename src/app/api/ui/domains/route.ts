import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { uuid } from "@/lib/mail";
import { uiHandler } from "@/lib/ui-api";

export const POST = uiHandler(async (req) => {
  const b = (await req.json().catch(() => ({}))) as { name?: string };
  const name = b.name?.trim().toLowerCase() ?? "";
  if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(name)) throw Errors.validation("Enter a valid domain, e.g. test.com.");
  if (await db.domain.findUnique({ where: { name } })) throw Errors.validation("Domain already added.");
  const clash = await db.inbox.count({ where: { address: { endsWith: `@${name}` } } });
  if (clash)
    throw Errors.validation(`${clash} inbox(es) already use @${name}. Delete them first: inboxes cannot share an app domain.`);
  const d = await db.domain.create({ data: { id: uuid(), name } });
  return NextResponse.json({ id: d.id, name: d.name });
});
