const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[^\s@<>"',;]+$/;

export interface ParsedAddress {
  /** lower-cased bare address */
  address: string;
  /** original string as supplied (used in events/responses) */
  raw: string;
  domain: string;
}

/** Parses `a@b.com` or `Name <a@b.com>`. Returns null if invalid. */
export function parseAddress(input: unknown): ParsedAddress | null {
  if (typeof input !== "string") return null;
  const raw = input.trim();
  if (!raw) return null;
  const m = raw.match(/^(?:.*?)<\s*([^<>]+?)\s*>$/);
  const bare = (m ? m[1] : raw).trim();
  if (!EMAIL_RE.test(bare)) return null;
  const address = bare.toLowerCase();
  return { address, raw, domain: address.split("@")[1] };
}

export function normalizeAddress(input: string): string | null {
  return parseAddress(input)?.address ?? null;
}

export function toArray(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? (v as string[]) : [v as string];
}
