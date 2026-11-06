import { handler } from "@/lib/errors";

/** UI endpoints need no API key. */
export const uiHandler = <A extends unknown[]>(fn: (req: Request, ...args: A) => Promise<Response>) =>
  handler(fn, { auth: false });

export const snippet = (e: { text: string | null; html: string | null }) =>
  (e.text ?? (e.html ?? "").replace(/<style[\s\S]*?<\/style>|<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);
