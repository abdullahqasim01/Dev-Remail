import { db } from "@/lib/db";
import { buildEml } from "@/lib/eml";

export async function GET(_req: Request, ctx: RouteContext<"/api/files/raw/[id]">) {
  const { id } = await ctx.params;
  const e = await db.email.findUnique({ where: { id }, include: { attachments: true } });
  if (!e) return new Response("Not found", { status: 404 });
  return new Response(buildEml(e, e.attachments), {
    headers: {
      "content-type": "message/rfc822",
      "content-disposition": `attachment; filename="${e.id}.eml"`,
    },
  });
}
