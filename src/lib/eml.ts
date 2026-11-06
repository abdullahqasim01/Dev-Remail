import crypto from "node:crypto";
import type { Email, Attachment } from "@/generated/prisma/client";
import { parseJson } from "@/lib/mail";

const b64 = (buf: Uint8Array | string) =>
  (typeof buf === "string" ? Buffer.from(buf, "utf8") : Buffer.from(buf))
    .toString("base64")
    .replace(/(.{76})/g, "$1\r\n");

const encodeHeader = (s: string) =>
  /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;

/** Builds an RFC 5322 message so SDK helpers (e.g. `emails.receiving.forward`) can parse it. */
export function buildEml(email: Email, attachments: Attachment[]): string {
  const to = parseJson<string[]>(email.to, []);
  const cc = parseJson<string[]>(email.cc, []);
  const mixed = `mixed_${crypto.randomBytes(8).toString("hex")}`;
  const alt = `alt_${crypto.randomBytes(8).toString("hex")}`;

  const lines: string[] = [
    `From: ${email.from}`,
    `To: ${to.join(", ")}`,
    ...(cc.length ? [`Cc: ${cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(email.subject)}`,
    `Date: ${email.createdAt.toUTCString()}`,
    `Message-ID: ${email.messageId}`,
    "MIME-Version: 1.0",
  ];

  const bodyParts: string[] = [];
  if (email.text !== null)
    bodyParts.push(
      `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(email.text)}`,
    );
  if (email.html !== null)
    bodyParts.push(
      `Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${b64(email.html)}`,
    );
  if (bodyParts.length === 0)
    bodyParts.push(`Content-Type: text/plain; charset=utf-8\r\n\r\n`);

  const altBlock =
    bodyParts.length > 1
      ? `Content-Type: multipart/alternative; boundary="${alt}"\r\n\r\n` +
        bodyParts.map((p) => `--${alt}\r\n${p}\r\n`).join("") +
        `--${alt}--\r\n`
      : bodyParts[0];

  if (attachments.length === 0) {
    return `${lines.join("\r\n")}\r\n${altBlock}`;
  }
  const out = [
    ...lines,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    altBlock,
  ].join("\r\n");
  const atts = attachments
    .map(
      (a) =>
        `\r\n--${mixed}\r\n` +
        `Content-Type: ${a.contentType}${a.filename ? `; name="${a.filename}"` : ""}\r\n` +
        `Content-Disposition: ${a.disposition}${a.filename ? `; filename="${a.filename}"` : ""}\r\n` +
        (a.contentId ? `Content-ID: <${a.contentId}>\r\n` : "") +
        `Content-Transfer-Encoding: base64\r\n\r\n${b64(a.data)}`,
    )
    .join("");
  return `${out}${atts}\r\n--${mixed}--\r\n`;
}
