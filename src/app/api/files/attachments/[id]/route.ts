import { db } from "@/lib/db";

// Public (unauthenticated) like Resend's signed download URLs; SDK/clients fetch these directly.
export async function GET(_req: Request, ctx: RouteContext<"/api/files/attachments/[id]">) {
  const { id } = await ctx.params;
  const a = await db.attachment.findUnique({ where: { id } });
  if (!a) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(a.data), {
    headers: {
      "content-type": a.contentType,
      "content-length": String(a.size),
      "content-disposition": `${a.disposition === "inline" ? "inline" : "attachment"}${a.filename ? `; filename*=UTF-8''${encodeURIComponent(a.filename)}` : ""}`,
    },
  });
}
