"use client";
import { useState } from "react";
import { api, usePoll } from "@/components/hooks";

interface SettingsView {
  webhookUrl: string | null;
  effectiveWebhookUrl: string | null;
  webhookSecret: string;
  webhookActive: boolean;
  webhookEvents: string[];
  allEvents: string[];
  domains: { id: string; name: string }[];
}

export default function SettingsPage() {
  const { data: s, reload } = usePoll<SettingsView>("/api/ui/settings", 60_000);
  const [domain, setDomain] = useState("");
  const [domainErr, setDomainErr] = useState<string>();

  async function addDomain() {
    setDomainErr(undefined);
    try { await api("/api/ui/domains", { method: "POST", json: { name: domain } }); setDomain(""); reload(); }
    catch (e) { setDomainErr(e instanceof Error ? e.message : String(e)); }
  }
  if (!s) return <div className="p-6 text-muted">Loading…</div>;
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="scroll h-full p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-xl font-semibold">Settings</h1>

        <section className="card p-5">
          <h2 className="font-semibold">Domains</h2>
          <p className="mb-3 text-[13px] text-muted">
            Your app&apos;s domain, like on Resend (<code>test.com</code>). It is verified instantly, no DNS needed.
            The API only accepts <code>from</code> addresses on these domains, and mail sent to them from an inbox triggers the <code>email.received</code> webhook.
            Inboxes (end users) must use <i>other</i> domains.
          </p>
          <div className="space-y-2">
            {s.domains.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-lg bg-panel2 px-3 py-2">
                <span className="font-medium">{d.name} <span className="chip ml-2 text-ok">verified</span></span>
                <button className="text-muted hover:text-danger" onClick={async () => { await api(`/api/ui/domains/${d.id}`, { method: "DELETE" }); reload(); }}>Remove</button>
              </div>
            ))}
            {s.domains.length === 0 && <div className="text-[13px] text-warn">No domain yet. The API will reject every send until you add one.</div>}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="test.com" value={domain} onChange={(e) => setDomain(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addDomain()} />
            <button className="btn btn-primary" onClick={addDomain}>Add domain</button>
          </div>
          {domainErr && <div className="mt-2 text-[13px] text-danger">{domainErr}</div>}
        </section>

        <WebhookForm key={`${s.webhookUrl}|${s.webhookActive}|${s.webhookEvents.join(",")}`} s={s} reload={reload} />

        <section className="card p-5">
          <h2 className="font-semibold">Use it in your app</h2>
          <p className="mb-2 text-[13px] text-muted">Keep using the Resend SDK. Only the environment changes:</p>
          <pre className="rounded-lg bg-panel2 p-3 font-mono text-[12px]">{`RESEND_API_KEY=re_anything\nRESEND_BASE_URL=${origin}`}</pre>
          <p className="mt-2 text-xs text-muted">Or in code: <code>new Resend(key, {`{ baseUrl: "${origin}" }`})</code>. Any API key is accepted.</p>
        </section>
      </div>
    </div>
  );
}

function WebhookForm({ s, reload }: { s: SettingsView; reload: () => void }) {
  const [url, setUrl] = useState(s.webhookUrl ?? "");
  const [events, setEvents] = useState<string[]>(s.webhookEvents);
  const [active, setActive] = useState(s.webhookActive);
  const [saved, setSaved] = useState(false);
  const [saveErr, setSaveErr] = useState<string>();
  const [reveal, setReveal] = useState(false);

  async function save() {
    setSaveErr(undefined);
    try {
      await api("/api/ui/settings", { method: "PUT", json: { webhookUrl: url, webhookEvents: events, webhookActive: active } });
      setSaved(true); setTimeout(() => setSaved(false), 1500); reload();
    } catch (e) { setSaveErr(e instanceof Error ? e.message : String(e)); }
  }

  return (
    <section className="card p-5">
          <h2 className="font-semibold">Webhook</h2>
          <p className="mb-3 text-[13px] text-muted">One endpoint for your app, signed like Resend (Svix / Standard Webhooks), so <code>resend.webhooks.verify</code> works unchanged.</p>
          <label className="mb-1 block text-xs font-semibold text-muted">Endpoint URL</label>
          <input className="input" placeholder="http://localhost:3000/api/webhooks/resend" value={url} onChange={(e) => setUrl(e.target.value)} />
          {s.effectiveWebhookUrl && s.effectiveWebhookUrl !== s.webhookUrl && (
            <p className="mt-1 text-xs text-muted">Running in Docker: requests go to <code>{s.effectiveWebhookUrl}</code> (your host machine).</p>
          )}
          <label className="mb-1 mt-4 block text-xs font-semibold text-muted">Signing secret</label>
          <div className="flex gap-2">
            <input className="input font-mono text-[13px]" readOnly value={reveal ? s.webhookSecret : "whsec_" + "•".repeat(24)} />
            <button className="btn" onClick={() => setReveal((v) => !v)}>{reveal ? "Hide" : "Show"}</button>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(s.webhookSecret)}>Copy</button>
            <button className="btn" onClick={async () => { if (confirm("Generate a new secret? Update your app's env too.")) { await api("/api/ui/settings/secret", { method: "POST" }); reload(); } }}>Regenerate</button>
          </div>
          <label className="mb-1 mt-4 block text-xs font-semibold text-muted">Events</label>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {s.allEvents.map((ev) => (
              <label key={ev} className="flex items-center gap-1.5 font-mono text-[13px]">
                <input type="checkbox" checked={events.includes(ev)} onChange={(e) => setEvents(e.target.checked ? [...events, ev] : events.filter((x) => x !== ev))} />
                {ev}
              </label>
            ))}
          </div>
          <label className="mt-4 flex items-center gap-2 text-[13px]">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Webhook enabled
          </label>
          {saveErr && <div className="mt-2 text-[13px] text-danger">{saveErr}</div>}
          <div className="mt-4 flex items-center gap-3">
            <button className="btn btn-primary" onClick={save}>Save webhook</button>
            {saved && <span className="text-[13px] text-ok">Saved</span>}
          </div>
        </section>
  );
}
