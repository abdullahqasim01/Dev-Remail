import type { Domain } from "@/generated/prisma/client";

export function serializeDomain(d: Domain) {
  return {
    id: d.id,
    name: d.name,
    status: "verified" as const,
    created_at: d.createdAt.toISOString(),
    region: d.region,
    capabilities: { sending: "enabled" as const, receiving: "enabled" as const },
  };
}
