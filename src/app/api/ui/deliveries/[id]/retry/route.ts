import { NextResponse } from "next/server";
import { redeliver } from "@/lib/webhooks";
import { uiHandler } from "@/lib/ui-api";

export const POST = uiHandler(async (_req, ctx: RouteContext<"/api/ui/deliveries/[id]/retry">) => {
  const { id } = await ctx.params;
  const ok = await redeliver(id);
  return NextResponse.json({ ok });
});
