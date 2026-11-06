"use client";
import { useState } from "react";
import { EmailView } from "@/components/EmailView";
import { timeAgo, usePoll } from "@/components/hooks";

interface Row { id: string; direction: string; from: string; to: string[]; subject: string; snippet: string; lastEvent: string; createdAt: string; attachments: number }

const eventColor: Record<string, string> = { delivered: "text-ok", bounced: "text-danger", complained: "text-warn" };

export default function ActivityPage() {
  const { data: rows } = usePoll<Row[]>("/api/ui/activity");
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex h-full">
      <section className="flex w-[28rem] shrink-0 flex-col border-r border-line bg-panel">
        <div className="border-b border-line px-4 py-3">
          <div className="font-semibold">API activity</div>
          <div className="text-xs text-muted">Every email your app sent through the API, plus mail users sent to your domain.</div>
        </div>
        <div className="scroll flex-1">
          {rows?.length === 0 && <div className="p-6 text-center text-muted">No emails yet. Send one with the Resend SDK.</div>}
          {rows?.map((r) => (
            <button key={r.id} onClick={() => setSelected(r.id)} className={`block w-full border-b border-line px-4 py-3 text-left ${selected === r.id ? "bg-accent-soft" : "hover:bg-panel2"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{r.subject || "(no subject)"}</span>
                <span className="shrink-0 text-xs text-muted">{timeAgo(r.createdAt)}</span>
              </div>
              <div className="truncate text-xs text-muted">{r.from} → {r.to.join(", ")}</div>
              <div className="mt-1 flex gap-2">
                <span className="chip">{r.direction === "outbound" ? "sent by app" : "received by app"}</span>
                <span className={`chip ${eventColor[r.lastEvent] ?? ""}`}>{r.direction === "outbound" ? r.lastEvent : "received"}</span>
                {r.attachments > 0 && <span className="chip">📎 {r.attachments}</span>}
              </div>
            </button>
          ))}
        </div>
      </section>
      <section className="min-w-0 flex-1 bg-panel">
        {selected ? <EmailView key={selected} id={selected} /> : <div className="flex h-full items-center justify-center text-muted">Select an email</div>}
      </section>
    </div>
  );
}
