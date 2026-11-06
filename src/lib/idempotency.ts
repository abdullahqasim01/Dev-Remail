import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/errors";

/**
 * Resend idempotency: same key + same body => replay the stored response;
 * same key + different body => 409 invalid_idempotent_request.
 */
export async function withIdempotency(
  req: Request,
  scope: string,
  rawBody: string,
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const key = req.headers.get("idempotency-key");
  if (!key) {
    const r = await run();
    return NextResponse.json(r.body, { status: r.status });
  }
  if (key.length > 256)
    throw new ApiError(400, "invalid_idempotency_key", "The key must be between 1-256 chars.");

  const fullKey = `${scope}:${key}`;
  const hash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const existing = await db.idempotencyKey.findUnique({ where: { key: fullKey } });
  if (existing) {
    if (existing.requestHash !== hash)
      throw new ApiError(
        409,
        "invalid_idempotent_request",
        "Same idempotency key used with a different request payload.",
      );
    return NextResponse.json(JSON.parse(existing.responseBody), { status: existing.statusCode });
  }
  const r = await run();
  if (r.status < 400) {
    await db.idempotencyKey
      .create({
        data: { key: fullKey, requestHash: hash, statusCode: r.status, responseBody: JSON.stringify(r.body) },
      })
      .catch(() => {});
  }
  return NextResponse.json(r.body, { status: r.status });
}
