import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { Errors } from "@/lib/errors";
import { ALL_EVENTS, getSettings } from "@/lib/settings";
import { effectiveUrl } from "@/lib/webhooks";
import { uiHandler } from "@/lib/ui-api";

async function view() {
  const s = await getSettings();
  const domains = await db.domain.findMany({ orderBy: { createdAt: "asc" } });
  return {
    webhookUrl: s.webhookUrl,
    effectiveWebhookUrl: s.webhookUrl ? effectiveUrl(s.webhookUrl) : null,
    webhookSecret: s.webhookSecret,
    webhookActive: s.webhookActive,
    webhookEvents: s.webhookEvents.split(",").filter(Boolean),
    allEvents: ALL_EVENTS,
    domains: domains.map((d) => ({ id: d.id, name: d.name })),
  };
}

export const GET = uiHandler(async () => NextResponse.json(await view()));

export const PUT = uiHandler(async (req) => {
  const b = (await req.json().catch(() => ({}))) as {
    webhookUrl?: string | null;
    webhookActive?: boolean;
    webhookEvents?: string[];
  };
  await getSettings();
  const data: { webhookUrl?: string | null; webhookActive?: boolean; webhookEvents?: string } = {};
  if (b.webhookUrl !== undefined) {
    const url = b.webhookUrl?.trim() || null;
    if (url) {
      try {
        const u = new URL(url);
        if (!/^https?:$/.test(u.protocol)) throw new Error();
      } catch {
        throw Errors.validation("Webhook URL must be a valid http(s) URL.");
      }
    }
    data.webhookUrl = url;
  }
  if (b.webhookActive !== undefined) data.webhookActive = b.webhookActive;
  if (b.webhookEvents) data.webhookEvents = b.webhookEvents.filter((e) => (ALL_EVENTS as readonly string[]).includes(e)).join(",");
  await db.settings.update({ where: { id: 1 }, data });
  return NextResponse.json(await view());
});
