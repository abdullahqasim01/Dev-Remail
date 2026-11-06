"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

const items = [
  { href: "/", label: "Mailboxes", icon: "✉" },
  { href: "/activity", label: "API activity", icon: "⇄" },
  { href: "/webhooks", label: "Webhook log", icon: "↯" },
  { href: "/settings", label: "Settings", icon: "⚙" },
];

export function Nav() {
  const path = usePathname();
  const origin = useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");
  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-line bg-panel p-3">
      <div className="mb-4 px-2 pt-1">
        <div className="text-base font-bold tracking-tight">dev-maill</div>
        <div className="text-xs text-muted">Fake Resend for development</div>
      </div>
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 ${
              active ? "bg-accent-soft font-semibold text-accent" : "text-muted hover:bg-panel2 hover:text-ink"
            }`}
          >
            <span className="w-4 text-center">{i.icon}</span>
            {i.label}
          </Link>
        );
      })}
      <div className="mt-auto rounded-lg bg-panel2 p-3 text-xs text-muted">
        Point the SDK here:
        <code className="mt-1 block break-all font-mono text-ink">RESEND_BASE_URL={origin}</code>
      </div>
    </nav>
  );
}
