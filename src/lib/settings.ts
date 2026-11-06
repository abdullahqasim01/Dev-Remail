import crypto from "node:crypto";
import { db } from "@/lib/db";

export const ALL_EVENTS = [
  "email.sent",
  "email.delivered",
  "email.bounced",
  "email.complained",
  "email.received",
] as const;
export type EventName = (typeof ALL_EVENTS)[number];

export function newSecret() {
  return `whsec_${crypto.randomBytes(24).toString("base64")}`;
}

export async function getSettings() {
  const existing = await db.settings.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  return db.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, webhookSecret: process.env.WEBHOOK_SECRET || newSecret() },
  });
}
