import { Errors, handler } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { sendOutbound, validateEmail, type ApiEmailPayload } from "@/lib/mail";
import { ApiError } from "@/lib/errors";

export const POST = handler(async (req) => {
  const raw = await req.text();
  let payload: ApiEmailPayload[];
  try {
    payload = JSON.parse(raw);
  } catch {
    throw Errors.validation("Invalid JSON body.");
  }
  if (!Array.isArray(payload)) throw Errors.validation("The request body must be an array of emails.");
  if (payload.length === 0) throw Errors.validation("The batch must contain at least one email.");
  if (payload.length > 100) throw Errors.validation("The batch can contain at most 100 emails.");
  if (payload.some((e) => e && (e as ApiEmailPayload).attachments?.length))
    throw Errors.validation("The `attachments` field is not supported in batch sends.");

  const permissive = req.headers.get("x-batch-validation") === "permissive";

  return withIdempotency(req, "emails-batch", raw, async () => {
    const ids: { id: string }[] = [];
    const errors: { index: number; message: string }[] = [];

    if (!permissive) {
      // strict: all or nothing
      for (let i = 0; i < payload.length; i++) {
        try {
          await validateEmail(payload[i]);
        } catch (e) {
          if (e instanceof ApiError) throw new ApiError(e.statusCode, e.errorName, `Email ${i}: ${e.message}`);
          throw e;
        }
      }
    }
    for (let i = 0; i < payload.length; i++) {
      try {
        ids.push(await sendOutbound(payload[i]));
      } catch (e) {
        if (permissive && e instanceof ApiError) errors.push({ index: i, message: e.message });
        else throw e;
      }
    }
    return { status: 200, body: permissive ? { data: ids, errors } : { data: ids } };
  });
});

