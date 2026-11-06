import { NextResponse } from "next/server";

/** Error names used by the Resend API (see resend-node `RESEND_ERROR_CODE_KEY`). */
export type ResendErrorName =
  | "invalid_idempotency_key"
  | "validation_error"
  | "missing_api_key"
  | "invalid_api_key"
  | "not_found"
  | "method_not_allowed"
  | "invalid_idempotent_request"
  | "concurrent_idempotent_requests"
  | "invalid_attachment"
  | "invalid_from_address"
  | "invalid_access"
  | "invalid_parameter"
  | "missing_required_field"
  | "application_error"
  | "internal_server_error";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public errorName: ResendErrorName,
    message: string,
  ) {
    super(message);
  }

  body() {
    return { statusCode: this.statusCode, message: this.message, name: this.errorName };
  }

  toResponse() {
    return NextResponse.json(this.body(), { status: this.statusCode });
  }
}

export const Errors = {
  missingApiKey: () =>
    new ApiError(401, "missing_api_key", "Missing API key in the authorization header."),
  notFound: (what = "resource") =>
    new ApiError(404, "not_found", `The requested ${what} could not be found.`),
  validation: (message: string) => new ApiError(422, "validation_error", message),
  missingField: (field: string) =>
    new ApiError(422, "missing_required_field", `Missing \`${field}\` field.`),
  invalidFrom: () =>
    new ApiError(
      422,
      "invalid_from_address",
      "Invalid `from` field. The email address needs to follow the `email@example.com` or `Name <email@example.com>` format.",
    ),
  domainNotVerified: (domain: string) =>
    new ApiError(
      403,
      "validation_error",
      `The ${domain} domain is not verified. Please, add and verify your domain in the Dev-Remail settings.`,
    ),
};

/** Wrap a route handler: auth header check + uniform error responses. */
export function handler<A extends unknown[]>(
  fn: (req: Request, ...args: A) => Promise<Response>,
  opts: { auth?: boolean } = { auth: true },
) {
  return async (req: Request, ...args: A): Promise<Response> => {
    try {
      if (opts.auth !== false) requireApiKey(req);
      return await fn(req, ...args);
    } catch (e) {
      if (e instanceof ApiError) return e.toResponse();
      console.error("[dev-remail] unhandled error", e);
      return NextResponse.json(
        { statusCode: 500, name: "internal_server_error", message: "Internal server error." },
        { status: 500 },
      );
    }
  };
}

/** Any bearer token is accepted; only its presence is checked (like Resend's missing_api_key). */
export function requireApiKey(req: Request) {
  const auth = req.headers.get("authorization");
  if (!auth || !/^bearer\s+\S+/i.test(auth)) throw Errors.missingApiKey();
}
