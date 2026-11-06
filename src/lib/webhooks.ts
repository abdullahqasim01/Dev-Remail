import crypto from "node:crypto";
import { db } from "@/lib/db";
import { getSettings, type EventName } from "@/lib/settings";

const RETRY_DELAYS_MS = [2_000, 10_000, 30_000];
const TIMEOUT_MS = 10_000;

function keyBytes(secret: string) {
  return Buffer.from(secret.replace(/^whsec_/, ""), "base64");
}

/** Standard Webhooks / Svix signature: base64(HMAC-SHA256(id.timestamp.body)). */
export function sign(secret: string, id: string, timestamp: string, body: string) {
  const sig = crypto
    .createHmac("sha256", keyBytes(secret))
    .update(`${id}.${timestamp}.${body}`)
    .digest("base64");
  return `v1,${sig}`;
}

/** Inside Docker, `localhost` is the container; send it to the host machine instead. */
export function effectiveUrl(url: string) {
  if (process.env.RUNNING_IN_DOCKER !== "1") return url;
  try {
    const u = new URL(url);
    if (["localhost", "127.0.0.1", "0.0.0.0", "[::1]"].includes(u.hostname)) {
      u.hostname = "host.docker.internal";
      return u.toString();
    }
  } catch {}
  return url;
}

export interface WebhookEnvelope {
  type: EventName;
  created_at: string;
  data: Record<string, unknown>;
}

async function attempt(deliveryId: string): Promise<boolean> {
  const row = await db.webhookDelivery.findUnique({ where: { id: deliveryId } });
  if (!row) return true;
  const settings = await getSettings();
  const msgId = `msg_${row.id.replace(/-/g, "")}`;
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const sig = sign(settings.webhookSecret, msgId, timestamp, row.payload);

  let statusCode: number | null = null;
  let responseBody: string | null = null;
  let ok = false;
  try {
    const res = await fetch(effectiveUrl(row.url), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "dev-maill-webhooks/1.0",
        // Resend uses Svix headers; the Resend SDK maps them to Standard Webhooks.
        "svix-id": msgId,
        "svix-timestamp": timestamp,
        "svix-signature": sig,
        "webhook-id": msgId,
        "webhook-timestamp": timestamp,
        "webhook-signature": sig,
      },
      body: row.payload,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "manual",
    });
    statusCode = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, 2000);
    ok = res.status >= 200 && res.status < 300;
  } catch (e) {
    responseBody = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  await db.webhookDelivery.update({
    where: { id: row.id },
    data: {
      attempts: { increment: 1 },
      lastAttemptAt: new Date(),
      statusCode,
      responseBody,
      status: ok ? "success" : "failed",
    },
  });
  return ok;
}

function scheduleRetries(deliveryId: string, index = 0) {
  if (index >= RETRY_DELAYS_MS.length) return;
  setTimeout(async () => {
    const ok = await attempt(deliveryId).catch(() => false);
    if (!ok) scheduleRetries(deliveryId, index + 1);
  }, RETRY_DELAYS_MS[index]).unref?.();
}

/** Record + send one event. Resolves after the first attempt; retries continue in the background. */
async function emitOne(type: EventName, data: Record<string, unknown>, emailId?: string) {
  const settings = await getSettings();
  if (!settings.webhookActive || !settings.webhookUrl) return;
  if (!settings.webhookEvents.split(",").includes(type)) return;

  const envelope: WebhookEnvelope = { type, created_at: new Date().toISOString(), data };
  const row = await db.webhookDelivery.create({
    data: {
      id: crypto.randomUUID(),
      eventType: type,
      emailId,
      url: settings.webhookUrl,
      payload: JSON.stringify(envelope),
    },
  });
  const ok = await attempt(row.id).catch(() => false);
  if (!ok) scheduleRetries(row.id);
}

/** Emit events strictly in order (e.g. email.sent before email.delivered). Fire-and-forget safe. */
export async function emitSequence(
  events: { type: EventName; data: Record<string, unknown>; emailId?: string }[],
) {
  for (const e of events) {
    try {
      await emitOne(e.type, e.data, e.emailId);
    } catch (err) {
      console.error("[dev-maill] webhook emit failed", err);
    }
  }
}

/** Manual re-send from the UI. */
export async function redeliver(deliveryId: string) {
  const ok = await attempt(deliveryId);
  return ok;
}
