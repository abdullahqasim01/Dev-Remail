"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { Compose, type ComposeInit } from "@/components/Compose";
import { EmailView } from "@/components/EmailView";
import { api, bareName, timeAgo, usePoll } from "@/components/hooks";

interface Inbox { id: string; address: string; name: string | null; unread: number }
interface Msg { id: string; from: string; to: string[]; subject: string; snippet: string; createdAt: string; read: boolean; attachments: number }
interface SettingsView { domains: { id: string; name: string }[] }

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

export default function MailboxPage() {
  const { data: inboxes, reload: reloadInboxes } = usePoll<Inbox[]>("/api/ui/inboxes");
  const { data: settings } = usePoll<SettingsView>("/api/ui/settings", 10_000);
  const [inboxId, setInboxId] = useState<string | null>(() => {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem("dr.inbox");
    } catch {
      return null;
    }
  });
  const [folder, setFolder] = useState<"inbox" | "sent">("inbox");
  // The open message lives in the URL hash (/#<id>) so it can be linked and survives reloads.
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  const selected = picked === undefined ? hash || null : picked;
  const setSelected = (id: string | null) => {
    setPicked(id);
    history.replaceState(null, "", id ? `#${id}` : window.location.pathname);
  };
  const [compose, setCompose] = useState<ComposeInit | null>(null);
  const [adding, setAdding] = useState(false);
  const [newAddr, setNewAddr] = useState("");
  const [newName, setNewName] = useState("");
  const [addErr, setAddErr] = useState<string>();

  const current = inboxes?.find((i) => i.id === inboxId) ?? inboxes?.[0] ?? null;
  useEffect(() => {
    if (current) try { localStorage.setItem("dr.inbox", current.id); } catch {}
  }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: messages, reload: reloadMessages } = usePoll<Msg[]>(
    current ? `/api/ui/inboxes/${current.id}/messages?folder=${folder}` : null,
  );

  async function addInbox() {
    setAddErr(undefined);
    try {
      const i = await api<Inbox>("/api/ui/inboxes", { method: "POST", json: { address: newAddr, name: newName } });
      setNewAddr(""); setNewName(""); setAdding(false);
      setInboxId(i.id); setSelected(null);
      reloadInboxes();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e));
    }
  }

  const domains = settings?.domains.map((d) => d.name) ?? [];

  return (
    <div className="flex h-full">
      {/* inbox rail */}
      <aside className="flex w-64 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="font-semibold">Inboxes</div>
          <button className="btn px-2 py-1" onClick={() => setAdding((v) => !v)}>＋ New</button>
        </div>
        {adding && (
          <div className="space-y-2 border-y border-line bg-panel2 p-3">
            <input className="input" placeholder="alice@gmail.com" value={newAddr} onChange={(e) => setNewAddr(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInbox()} autoFocus />
            <input className="input" placeholder="Display name (optional)" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addInbox()} />
            {addErr && <div className="text-xs text-danger">{addErr}</div>}
            <div className="flex gap-2">
              <button className="btn btn-primary" onClick={addInbox}>Create</button>
              <button className="btn" onClick={() => { setAdding(false); setAddErr(undefined); }}>Cancel</button>
            </div>
          </div>
        )}
        <div className="scroll flex-1 p-2">
          {inboxes?.length === 0 && !adding && (
            <div className="p-3 text-[13px] text-muted">
              No inboxes yet. Create one for each end user you want to simulate, like <code>alice@gmail.com</code>.
            </div>
          )}
          {inboxes?.map((i) => (
            <div key={i.id} className={`group flex items-center rounded-lg ${current?.id === i.id ? "bg-accent-soft" : "hover:bg-panel2"}`}>
              <button className="min-w-0 flex-1 px-3 py-2 text-left" onClick={() => { setInboxId(i.id); setSelected(null); }}>
                <div className={`truncate ${current?.id === i.id ? "font-semibold text-accent" : ""}`}>{i.name || i.address}</div>
                {i.name && <div className="truncate text-xs text-muted">{i.address}</div>}
              </button>
              {i.unread > 0 && <span className="mr-2 rounded-full bg-accent px-1.5 text-[11px] font-bold text-[var(--accent-text)]">{i.unread}</span>}
              <button
                className="mr-2 hidden text-muted hover:text-danger group-hover:block"
                title="Delete inbox"
                onClick={async () => {
                  if (!confirm(`Delete inbox ${i.address} and its mail?`)) return;
                  await fetch(`/api/ui/inboxes/${i.id}`, { method: "DELETE" });
                  setSelected(null); reloadInboxes();
                }}
              >✕</button>
            </div>
          ))}
        </div>
        {domains.length === 0 && settings && (
          <div className="m-2 rounded-lg bg-warn/10 p-3 text-xs text-warn">
            No app domain yet. <Link href="/settings" className="underline">Add one in Settings</Link> so your app can send mail.
          </div>
        )}
      </aside>

      {/* message list */}
      <section className="flex w-96 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <div className="flex rounded-lg bg-panel2 p-0.5 text-[13px]">
            {(["inbox", "sent"] as const).map((f) => (
              <button key={f} onClick={() => { setFolder(f); setSelected(null); }}
                className={`rounded-md px-3 py-1 capitalize ${folder === f ? "bg-panel font-semibold shadow-sm" : "text-muted"}`}>{f}</button>
            ))}
          </div>
          <button className="btn btn-primary ml-auto" disabled={!current} onClick={() => setCompose({})}>✎ Compose</button>
        </div>
        <div className="scroll flex-1">
          {!current && <div className="p-6 text-center text-muted">Create an inbox to get started.</div>}
          {current && messages?.length === 0 && <div className="p-6 text-center text-muted">{folder === "inbox" ? "Nothing here yet. Send an email to this address through the API." : "No sent mail."}</div>}
          {messages?.map((m) => (
            <button key={m.id} onClick={() => setSelected(m.id)}
              className={`block w-full border-b border-line px-4 py-3 text-left ${selected === m.id ? "bg-accent-soft" : "hover:bg-panel2"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className={`truncate ${m.read ? "" : "font-bold"}`}>{folder === "sent" ? `To: ${m.to.join(", ")}` : bareName(m.from)}</span>
                <span className="shrink-0 text-xs text-muted">{timeAgo(m.createdAt)}</span>
              </div>
              <div className={`truncate ${m.read ? "text-ink" : "font-semibold"}`}>{!m.read && <span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-accent" />}{m.subject || "(no subject)"}</div>
              <div className="truncate text-xs text-muted">{m.attachments > 0 && "📎 "}{m.snippet}</div>
            </button>
          ))}
        </div>
      </section>

      {/* reader */}
      <section className="min-w-0 flex-1 bg-panel">
        {selected && current ? (
          <EmailView
            key={selected}
            id={selected}
            inboxId={current.id}
            onReply={(m) => setCompose({ to: m.from.match(/<(.+)>/)?.[1] ?? m.from, subject: /^re:/i.test(m.subject) ? m.subject : `Re: ${m.subject}` })}
            onDelete={() => { setSelected(null); reloadMessages(); reloadInboxes(); }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted">Select a message</div>
        )}
      </section>

      {compose && current && (
        <Compose
          key={JSON.stringify(compose)}
          inbox={current}
          inboxAddresses={inboxes?.map((i) => i.address) ?? []}
          domains={domains}
          init={compose}
          onClose={() => setCompose(null)}
          onSent={() => { setCompose(null); setFolder("sent"); reloadMessages(); reloadInboxes(); }}
        />
      )}
    </div>
  );
}
