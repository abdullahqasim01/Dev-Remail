"use client";
import { useState } from "react";
import { formatBytes, usePoll } from "@/components/hooks";

export interface MessageDetail {
  id: string;
  direction: string;
  from: string;
  to: string[];
  cc: string[];
  bcc: string[];
  replyTo: string[];
  subject: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string>;
  tags: { name: string; value: string }[];
  messageId: string;
  lastEvent: string;
  createdAt: string;
  attachments: { id: string; filename: string | null; size: number; contentType: string; url: string }[];
}

type Tab = "html" | "text" | "details";

export function EmailView({
  id,
  inboxId,
  onReply,
  onDelete,
}: {
  id: string;
  inboxId?: string;
  onReply?: (m: MessageDetail) => void;
  onDelete?: () => void;
}) {
  const { data: m, error } = usePoll<MessageDetail>(
    `/api/ui/messages/${id}${inboxId ? `?inbox=${inboxId}` : ""}`,
    60_000,
  );
  const [chosenTab, setTab] = useState<Tab | null>(null);

  if (error) return <div className="p-6 text-danger">{error}</div>;
  if (!m) return <div className="p-6 text-muted">Loading…</div>;

  const tab: Tab = chosenTab ?? (m.html ? "html" : m.text ? "text" : "details");
  const srcDoc = `<base target="_blank"><style>body{font-family:system-ui,sans-serif;margin:16px;color:#111}</style>${m.html ?? ""}`;
  const tabs: [Tab, string][] = [
    ["html", "HTML"],
    ["text", "Text"],
    ["details", "Details"],
  ];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line p-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold leading-snug">{m.subject || "(no subject)"}</h2>
          <div className="flex shrink-0 gap-2">
            {onReply && (
              <button className="btn" onClick={() => onReply(m)}>
                Reply
              </button>
            )}
            {onDelete && (
              <button
                className="btn btn-danger"
                onClick={async () => {
                  await fetch(`/api/ui/messages/${m.id}`, { method: "DELETE" });
                  onDelete();
                }}
              >
                Delete
              </button>
            )}
          </div>
        </div>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[13px]">
          <dt className="text-muted">From</dt>
          <dd className="break-all">{m.from}</dd>
          <dt className="text-muted">To</dt>
          <dd className="break-all">{m.to.join(", ")}</dd>
          {m.cc.length > 0 && (<><dt className="text-muted">Cc</dt><dd className="break-all">{m.cc.join(", ")}</dd></>)}
          {m.bcc.length > 0 && (<><dt className="text-muted">Bcc</dt><dd className="break-all">{m.bcc.join(", ")}</dd></>)}
          <dt className="text-muted">Date</dt>
          <dd>{new Date(m.createdAt).toLocaleString()}</dd>
        </dl>
        {m.attachments.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {m.attachments.map((a) => (
              <a key={a.id} href={a.url} download={a.filename ?? undefined} className="btn text-[13px]">
                📎 {a.filename ?? "attachment"} <span className="text-muted">{formatBytes(a.size)}</span>
              </a>
            ))}
          </div>
        )}
      </header>
      <div className="flex gap-1 border-b border-line px-3 pt-2">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-lg px-3 py-1.5 text-[13px] ${
              tab === t ? "border-b-2 border-accent font-semibold text-accent" : "text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 bg-panel">
        {tab === "html" &&
          (m.html ? (
            <iframe
              title="email"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
              srcDoc={srcDoc}
              className="h-full w-full border-0 bg-white"
            />
          ) : (
            <div className="p-6 text-muted">This email has no HTML part.</div>
          ))}
        {tab === "text" && (
          <pre className="scroll h-full whitespace-pre-wrap p-4 font-mono text-[13px]">
            {m.text ?? "This email has no plain-text part."}
          </pre>
        )}
        {tab === "details" && (
          <div className="scroll h-full space-y-3 p-4 font-mono text-[12px]">
            <div><span className="text-muted">id:</span> {m.id}</div>
            <div><span className="text-muted">message-id:</span> {m.messageId}</div>
            <div><span className="text-muted">last_event:</span> {m.lastEvent}</div>
            <div><span className="text-muted">direction:</span> {m.direction}</div>
            {m.replyTo.length > 0 && <div><span className="text-muted">reply_to:</span> {m.replyTo.join(", ")}</div>}
            {m.tags.length > 0 && (
              <div><span className="text-muted">tags:</span> {m.tags.map((t) => `${t.name}=${t.value}`).join(", ")}</div>
            )}
            {Object.keys(m.headers).length > 0 && (
              <div>
                <div className="mb-1 text-muted">custom headers</div>
                {Object.entries(m.headers).map(([k, v]) => (<div key={k}>{k}: {v}</div>))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
