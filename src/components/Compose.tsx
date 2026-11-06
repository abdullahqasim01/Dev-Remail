"use client";
import { useState } from "react";
import { api, formatBytes } from "@/components/hooks";

export interface ComposeInit {
  to?: string;
  subject?: string;
}

interface Att { filename: string; contentType: string; contentBase64: string; size: number }

const split = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

export function Compose({
  inbox,
  inboxAddresses,
  domains,
  init,
  onClose,
  onSent,
}: {
  inbox: { id: string; address: string };
  inboxAddresses: string[];
  domains: string[];
  init?: ComposeInit;
  onClose: () => void;
  onSent: () => void;
}) {
  const [to, setTo] = useState(init?.to ?? "");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [showCc, setShowCc] = useState(false);
  const [subject, setSubject] = useState(init?.subject ?? "");
  const [body, setBody] = useState("");
  const [asHtml, setAsHtml] = useState(false);
  const [atts, setAtts] = useState<Att[]>([]);
  const [err, setErr] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    const next: Att[] = [];
    for (const f of Array.from(files)) {
      const buf = new Uint8Array(await f.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      next.push({ filename: f.name, contentType: f.type || "application/octet-stream", contentBase64: btoa(bin), size: f.size });
    }
    setAtts((a) => [...a, ...next]);
  }

  async function send() {
    setBusy(true);
    setErr(undefined);
    try {
      await api("/api/ui/send", {
        method: "POST",
        json: {
          inboxId: inbox.id,
          to: split(to),
          cc: split(cc),
          bcc: split(bcc),
          subject,
          ...(asHtml ? { html: body } : { text: body }),
          attachments: atts.map(({ filename, contentType, contentBase64 }) => ({ filename, contentType, contentBase64 })),
        },
      });
      onSent();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" onClick={onClose}>
      <div className="card flex max-h-full w-full max-w-2xl flex-col shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div className="font-semibold">New message</div>
          <button className="text-muted hover:text-ink" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="scroll space-y-2 p-4">
          <div className="text-[13px] text-muted">
            From <span className="font-medium text-ink">{inbox.address}</span>
          </div>
          <div className="flex items-center gap-2">
            <input className="input" placeholder="To" value={to} onChange={(e) => setTo(e.target.value)} list="dr-recipients" autoFocus />
            {!showCc && <button className="btn" onClick={() => setShowCc(true)}>Cc/Bcc</button>}
          </div>
          <datalist id="dr-recipients">
            {inboxAddresses.filter((a) => a !== inbox.address).map((a) => <option key={a} value={a} />)}
          </datalist>
          {showCc && (
            <>
              <input className="input" placeholder="Cc" value={cc} onChange={(e) => setCc(e.target.value)} />
              <input className="input" placeholder="Bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} />
            </>
          )}
          <p className="text-xs text-muted">
            {domains.length > 0 ? (
              <>Sending to an address on <b>{domains.map((d) => `@${d}`).join(", ")}</b> triggers the <code>email.received</code> webhook. Sending to another inbox just delivers it.</>
            ) : (
              <>No app domain registered yet. Add one in Settings to receive webhooks.</>
            )}
          </p>
          <input className="input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          <textarea
            className="input min-h-48 resize-y font-mono text-[13px]"
            placeholder={asHtml ? "<p>HTML body…</p>" : "Message…"}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3 text-[13px]">
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={asHtml} onChange={(e) => setAsHtml(e.target.checked)} /> Send as HTML
            </label>
            <label className="btn cursor-pointer">
              📎 Attach
              <input type="file" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
            </label>
            {atts.map((a, i) => (
              <span key={i} className="chip">
                {a.filename} · {formatBytes(a.size)}{" "}
                <button onClick={() => setAtts(atts.filter((_, j) => j !== i))} aria-label="Remove">✕</button>
              </span>
            ))}
          </div>
          {err && <div className="rounded-lg bg-danger/10 px-3 py-2 text-[13px] text-danger">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-4 py-3">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={send} disabled={busy || !to.trim()}>
            {busy ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
