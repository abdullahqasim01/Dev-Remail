"use client";
import { useState } from "react";
import Link from "next/link";
import { api, timeAgo, usePoll } from "@/components/hooks";

interface Delivery { id: string; eventType: string; emailId: string | null; url: string; status: string; statusCode: number | null; responseBody: string | null; attempts: number; createdAt: string; lastAttemptAt: string | null; payload: string }

const statusStyle: Record<string, string> = { success: "text-ok", failed: "text-danger", pending: "text-warn" };

export default function WebhookLogPage() {
  const { data: rows, reload } = usePoll<Delivery[]>("/api/ui/deliveries");
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="scroll h-full p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold">Webhook log</h1>
            <p className="text-[13px] text-muted">Events sent to your app. Failed deliveries retry automatically (2s, 10s, 30s). Configure the URL in <Link className="text-accent underline" href="/settings">Settings</Link>.</p>
          </div>
          <button className="btn" onClick={async () => { await api("/api/ui/deliveries", { method: "DELETE" }); reload(); }}>Clear</button>
        </div>
        {rows?.length === 0 && <div className="card p-8 text-center text-muted">No webhook events yet.</div>}
        <div className="space-y-2">
          {rows?.map((r) => (
            <div key={r.id} className="card">
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(open === r.id ? null : r.id)}>
                <span className={`w-16 text-xs font-bold uppercase ${statusStyle[r.status]}`}>{r.status}</span>
                <span className="font-mono text-[13px] font-semibold">{r.eventType}</span>
                <span className="min-w-0 flex-1 truncate text-xs text-muted">{r.url}</span>
                <span className="text-xs text-muted">{r.statusCode ?? "—"} · {r.attempts} attempt{r.attempts === 1 ? "" : "s"}</span>
                <span className="w-16 text-right text-xs text-muted">{timeAgo(r.createdAt)}</span>
              </button>
              {open === r.id && (
                <div className="space-y-3 border-t border-line p-4">
                  <div className="flex gap-2">
                    <button className="btn" disabled={busy === r.id} onClick={async () => { setBusy(r.id); await api(`/api/ui/deliveries/${r.id}/retry`, { method: "POST" }); setBusy(null); reload(); }}>↻ Resend</button>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-muted">Payload</div>
                    <pre className="scroll max-h-72 rounded-lg bg-panel2 p-3 font-mono text-[12px]">{JSON.stringify(JSON.parse(r.payload), null, 2)}</pre>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold text-muted">Last response ({r.statusCode ?? "no response"})</div>
                    <pre className="scroll max-h-40 whitespace-pre-wrap rounded-lg bg-panel2 p-3 font-mono text-[12px]">{r.responseBody || "(empty)"}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
