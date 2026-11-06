import crypto from "node:crypto";
import { db } from "@/lib/db";
import { ApiError, Errors } from "@/lib/errors";
import { parseAddress, toArray, type ParsedAddress } from "@/lib/address";
import { emitSequence } from "@/lib/webhooks";
import type { Email, Attachment } from "@/generated/prisma/client";

export const uuid = () => crypto.randomUUID();
const MAX_RECIPIENTS = 50;
const MAX_ATTACHMENT_BYTES = 40 * 1024 * 1024;

export const parseJson = <T>(s: string | null | undefined, fallback: T): T => {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
};

export async function registeredDomainNames(): Promise<Set<string>> {
  const domains = await db.domain.findMany({ select: { name: true } });
  return new Set(domains.map((d) => d.name.toLowerCase()));
}

// ---------------------------------------------------------------- validation

export interface ApiAttachment {
  content?: string;
  filename?: string | false;
  path?: string;
  content_type?: string;
  content_id?: string;
}

export interface ApiEmailPayload {
  from?: string;
  to?: string | string[];
  subject?: string;
  html?: string;
  text?: string;
  cc?: string | string[];
  bcc?: string | string[];
  reply_to?: string | string[];
  headers?: Record<string, string>;
  tags?: { name: string; value: string }[];
  attachments?: ApiAttachment[];
  scheduled_at?: string;
  template?: unknown;
  topic_id?: string | null;
}

interface ValidatedEmail {
  from: ParsedAddress;
  to: ParsedAddress[];
  cc: ParsedAddress[];
  bcc: ParsedAddress[];
  replyTo: string[];
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string> | null;
  tags: { name: string; value: string }[];
  attachments: ApiAttachment[];
}

function parseList(field: string, value: unknown, required: boolean): ParsedAddress[] {
  const items = toArray(value);
  if (items.length === 0) {
    if (required) throw Errors.missingField(field);
    return [];
  }
  if (items.length > MAX_RECIPIENTS)
    throw Errors.validation(`The \`${field}\` field accepts at most ${MAX_RECIPIENTS} recipients.`);
  return items.map((i) => {
    const p = parseAddress(i);
    if (!p)
      throw Errors.validation(
        `Invalid \`${field}\` field. The email address needs to follow the \`email@example.com\` or \`Name <email@example.com>\` format.`,
      );
    return p;
  });
}

export async function validateEmail(p: ApiEmailPayload): Promise<ValidatedEmail> {
  if (!p || typeof p !== "object") throw Errors.validation("Invalid request body.");
  if (p.template) throw Errors.validation("Templates are not supported by dev-maill.");

  if (p.from === undefined || p.from === null || p.from === "") throw Errors.missingField("from");
  const from = parseAddress(p.from);
  if (!from) throw Errors.invalidFrom();

  const to = parseList("to", p.to, true);
  const cc = parseList("cc", p.cc, false);
  const bcc = parseList("bcc", p.bcc, false);
  const replyTo = toArray(p.reply_to).map((r) => {
    if (!parseAddress(r)) throw Errors.validation("Invalid `reply_to` field.");
    return r;
  });

  if (typeof p.subject !== "string") throw Errors.missingField("subject");
  if (p.html === undefined && p.text === undefined)
    throw Errors.validation("Missing `html` or `text` field. Provide at least one of them.");

  const domains = await registeredDomainNames();
  if (!domains.has(from.domain))
    throw Errors.domainNotVerified(from.domain);

  const tags = p.tags ?? [];
  for (const t of tags) {
    if (!t || typeof t.name !== "string" || typeof t.value !== "string")
      throw Errors.validation("Invalid `tags` field. Each tag needs a `name` and a `value`.");
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(t.name) || !/^[A-Za-z0-9_-]{1,256}$/.test(t.value))
      throw Errors.validation(
        "Invalid `tags` field. Tag names and values may only contain ASCII letters, numbers, underscores or dashes (max 256 chars).",
      );
  }

  if (p.headers !== undefined && (typeof p.headers !== "object" || p.headers === null))
    throw Errors.validation("Invalid `headers` field.");

  for (const a of p.attachments ?? []) {
    if (!a || (a.content === undefined && !a.path))
      throw new ApiError(422, "invalid_attachment", "Attachment must have either a `content` or `path`.");
  }

  return {
    from,
    to,
    cc,
    bcc,
    replyTo,
    subject: p.subject,
    html: p.html ?? null,
    text: p.text ?? null,
    headers: p.headers ?? null,
    tags,
    attachments: p.attachments ?? [],
  };
}

async function resolveAttachment(a: ApiAttachment) {
  let data: Buffer;
  let filename: string | null = typeof a.filename === "string" ? a.filename : null;
  let contentType = a.content_type;
  if (a.content !== undefined) {
    data = Buffer.from(a.content, "base64");
  } else {
    try {
      const res = await fetch(a.path!, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`status ${res.status}`);
      data = Buffer.from(await res.arrayBuffer());
      contentType ??= res.headers.get("content-type")?.split(";")[0] ?? undefined;
      filename ??= decodeURIComponent(new URL(a.path!).pathname.split("/").pop() || "") || null;
    } catch {
      throw new ApiError(422, "invalid_attachment", `Could not download attachment from \`${a.path}\`.`);
    }
  }
  if (data.length > MAX_ATTACHMENT_BYTES)
    throw new ApiError(422, "invalid_attachment", "Attachments exceed the 40MB limit.");
  return {
    id: uuid(),
    filename,
    contentType: contentType ?? guessType(filename),
    contentId: a.content_id ?? null,
    disposition: a.content_id ? "inline" : "attachment",
    size: data.length,
    data: new Uint8Array(data),
  };
}

function guessType(filename: string | null) {
  const ext = filename?.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    txt: "text/plain",
    html: "text/html",
    csv: "text/csv",
    json: "application/json",
    zip: "application/zip",
  };
  return (ext && map[ext]) || "application/octet-stream";
}

// ---------------------------------------------------------------- events

const tagsRecord = (tags: { name: string; value: string }[]) =>
  tags.length ? Object.fromEntries(tags.map((t) => [t.name, t.value])) : undefined;

function baseEventData(email: Email) {
  return {
    created_at: email.createdAt.toISOString(),
    email_id: email.id,
    message_id: email.messageId,
    from: email.from,
    to: parseJson<string[]>(email.to, []),
    subject: email.subject,
    ...(tagsRecord(parseJson(email.tags, [])) ? { tags: tagsRecord(parseJson(email.tags, [])) } : {}),
  };
}

/** Resend-style test addresses: delivered@resend.dev, bounced@resend.dev, complained@resend.dev */
function simulatedOutcome(recipients: ParsedAddress[]): "delivered" | "bounced" | "complained" {
  const kinds = recipients
    .filter((r) => r.domain === "resend.dev")
    .map((r) => r.address.split("@")[0].split("+")[0]);
  if (kinds.includes("bounced")) return "bounced";
  if (kinds.includes("complained")) return "complained";
  return "delivered";
}

// ---------------------------------------------------------------- outbound (API)

export async function sendOutbound(payload: ApiEmailPayload): Promise<{ id: string }> {
  const v = await validateEmail(payload);
  const attachments = await Promise.all(v.attachments.map(resolveAttachment));
  const all = [...v.to, ...v.cc, ...v.bcc];
  const outcome = simulatedOutcome(all);
  const id = uuid();

  const inboxes = await db.inbox.findMany({
    where: { address: { in: all.map((a) => a.address) } },
    select: { id: true },
  });

  const email = await db.email.create({
    data: {
      id,
      direction: "outbound",
      from: v.from.raw,
      to: JSON.stringify(v.to.map((a) => a.raw)),
      cc: JSON.stringify(v.cc.map((a) => a.raw)),
      bcc: JSON.stringify(v.bcc.map((a) => a.raw)),
      replyTo: JSON.stringify(v.replyTo),
      subject: v.subject,
      html: v.html,
      text: v.text,
      headers: v.headers ? JSON.stringify(v.headers) : null,
      tags: JSON.stringify(v.tags),
      messageId: `<${id}@dev-maill.local>`,
      lastEvent: outcome,
      attachments: { create: attachments },
      deliveries: {
        create: inboxes
          // a bounced mail never reaches the mailbox
          .filter(() => outcome !== "bounced")
          .map((i) => ({ id: uuid(), inboxId: i.id })),
      },
    },
  });

  const base = baseEventData(email);
  const second =
    outcome === "bounced"
      ? {
          type: "email.bounced" as const,
          data: { ...base, bounce: { message: "The recipient's mail server rejected the message (simulated).", subType: "General", type: "Permanent" } },
        }
      : outcome === "complained"
        ? { type: "email.complained" as const, data: base }
        : { type: "email.delivered" as const, data: base };

  void emitSequence([
    { type: "email.sent", data: base, emailId: id },
    { ...second, emailId: id },
  ]);
  return { id };
}

// ---------------------------------------------------------------- from an inbox (UI)

export interface InboxSendInput {
  inboxId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html?: string | null;
  text?: string | null;
  attachments?: { filename: string; contentType: string; contentBase64: string }[];
}

export async function sendFromInbox(input: InboxSendInput) {
  const sender = await db.inbox.findUnique({ where: { id: input.inboxId } });
  if (!sender) throw Errors.notFound("inbox");

  const parse = (list: string[] | undefined, field: string) =>
    (list ?? []).filter((x) => x.trim()).map((x) => {
      const p = parseAddress(x);
      if (!p) throw Errors.validation(`Invalid ${field} address: ${x}`);
      return p;
    });
  const to = parse(input.to, "to");
  const cc = parse(input.cc, "cc");
  const bcc = parse(input.bcc, "bcc");
  if (to.length === 0) throw Errors.validation("Add at least one recipient.");

  const domains = await registeredDomainNames();
  const all = [...to, ...cc, ...bcc];
  const inboxes = await db.inbox.findMany({ where: { address: { in: all.map((a) => a.address) } } });
  const inboxByAddress = new Map(inboxes.map((i) => [i.address, i]));

  const appRecipients: ParsedAddress[] = [];
  for (const r of all) {
    if (domains.has(r.domain)) appRecipients.push(r);
    else if (!inboxByAddress.has(r.address))
      throw Errors.validation(
        `${r.address} is neither an inbox nor on a registered domain. Create an inbox for it first.`,
      );
  }

  const id = uuid();
  const from = sender.name ? `${sender.name} <${sender.address}>` : sender.address;
  const attachments = (input.attachments ?? []).map((a) => {
    const data = Buffer.from(a.contentBase64, "base64");
    return {
      id: uuid(),
      filename: a.filename,
      contentType: a.contentType || "application/octet-stream",
      contentId: null,
      disposition: "attachment",
      size: data.length,
      data: new Uint8Array(data),
    };
  });
  const recipientInboxIds = [...new Set(inboxes.map((i) => i.id))];

  const email = await db.email.create({
    data: {
      id,
      direction: appRecipients.length ? "inbound" : "internal",
      from,
      to: JSON.stringify(to.map((a) => a.address)),
      cc: JSON.stringify(cc.map((a) => a.address)),
      bcc: JSON.stringify(bcc.map((a) => a.address)),
      subject: input.subject,
      html: input.html || null,
      text: input.text || null,
      messageId: `<${id}@dev-maill.local>`,
      lastEvent: "delivered",
      senderInboxId: sender.id,
      attachments: { create: attachments },
      deliveries: {
        create: recipientInboxIds.map((inboxId) => ({ id: uuid(), inboxId })),
      },
    },
    include: { attachments: true },
  });

  if (appRecipients.length) {
    void emitSequence([
      {
        type: "email.received",
        emailId: id,
        data: {
          email_id: id,
          created_at: email.createdAt.toISOString(),
          from: email.from,
          to: to.map((a) => a.address),
          bcc: bcc.map((a) => a.address),
          cc: cc.map((a) => a.address),
          received_for: [...new Set(appRecipients.map((a) => a.address))],
          message_id: email.messageId,
          subject: email.subject,
          attachments: email.attachments.map((a) => ({
            id: a.id,
            filename: a.filename,
            content_type: a.contentType,
            content_disposition: a.disposition,
            content_id: a.contentId,
          })),
        },
      },
    ]);
  }
  return email;
}

// ---------------------------------------------------------------- serializers (Resend API shapes)

const nullIfEmpty = <T,>(a: T[]) => (a.length ? a : null);

export function serializeEmail(e: Email) {
  const tags = parseJson<{ name: string; value: string }[]>(e.tags, []);
  return {
    object: "email" as const,
    id: e.id,
    to: parseJson<string[]>(e.to, []),
    from: e.from,
    created_at: e.createdAt.toISOString(),
    subject: e.subject,
    html: e.html,
    text: e.text,
    bcc: nullIfEmpty(parseJson<string[]>(e.bcc, [])),
    cc: nullIfEmpty(parseJson<string[]>(e.cc, [])),
    reply_to: nullIfEmpty(parseJson<string[]>(e.replyTo, [])),
    last_event: e.lastEvent,
    scheduled_at: e.scheduledAt ? e.scheduledAt.toISOString() : null,
    message_id: e.messageId,
    ...(tags.length ? { tags } : {}),
  };
}

export function serializeEmailListItem(e: Email) {
  const { html: _h, text: _t, tags: _tags, object: _o, ...rest } = serializeEmail(e);
  void _h; void _t; void _tags; void _o;
  return rest;
}

export function serializeAttachmentData(a: Attachment, origin: string) {
  return {
    id: a.id,
    ...(a.filename ? { filename: a.filename } : {}),
    size: a.size,
    content_type: a.contentType,
    content_disposition: a.disposition as "inline" | "attachment",
    ...(a.contentId ? { content_id: a.contentId } : {}),
    download_url: `${origin}/api/files/attachments/${a.id}`,
    expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };
}

export async function serializeReceiving(e: Email & { attachments: Attachment[] }, origin: string) {
  const domains = await registeredDomainNames();
  const to = parseJson<string[]>(e.to, []);
  const cc = parseJson<string[]>(e.cc, []);
  const bcc = parseJson<string[]>(e.bcc, []);
  const receivedFor = [...to, ...cc, ...bcc].filter((a) => {
    const p = parseAddress(a);
    return p && domains.has(p.domain);
  });
  return {
    object: "email" as const,
    id: e.id,
    to,
    from: e.from,
    created_at: e.createdAt.toISOString(),
    subject: e.subject,
    bcc: nullIfEmpty(bcc),
    cc: nullIfEmpty(cc),
    reply_to: nullIfEmpty(parseJson<string[]>(e.replyTo, [])),
    received_for: receivedFor,
    html: e.html,
    text: e.text,
    headers: {
      from: e.from,
      to: to.join(", "),
      subject: e.subject,
      "message-id": e.messageId,
      date: e.createdAt.toUTCString(),
    } as Record<string, string>,
    message_id: e.messageId,
    raw: {
      download_url: `${origin}/api/files/raw/${e.id}`,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    },
    attachments: e.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      size: a.size,
      content_type: a.contentType,
      content_id: a.contentId,
      content_disposition: a.disposition,
    })),
  };
}

export function serializeReceivingListItem(r: Awaited<ReturnType<typeof serializeReceiving>>) {
  const { html: _h, text: _t, headers: _hd, raw: _r, object: _o, ...rest } = r;
  void _h; void _t; void _hd; void _r; void _o;
  return rest;
}

export function originOf(req: Request) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
