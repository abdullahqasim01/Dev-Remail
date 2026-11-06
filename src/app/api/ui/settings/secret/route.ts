import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSettings, newSecret } from "@/lib/settings";
import { uiHandler } from "@/lib/ui-api";

export const POST = uiHandler(async () => {
  await getSettings();
  const s = await db.settings.update({ where: { id: 1 }, data: { webhookSecret: newSecret() } });
  return NextResponse.json({ webhookSecret: s.webhookSecret });
});
