"use client";
import { useCallback, useEffect, useState } from "react";

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { message?: string }).message ?? `Request failed (${res.status})`);
  return body as T;
}

/** Fetches `url` immediately and then every `interval` ms (paused while the tab is hidden). */
export function usePoll<T>(url: string | null, interval = 2500) {
  const [res, setRes] = useState<{ url: string; data?: T; error?: string }>();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const run = async () => {
      try {
        const data = await api<T>(url);
        if (!cancelled) setRes({ url, data });
      } catch (e) {
        if (!cancelled)
          setRes((prev) => ({
            url,
            data: prev?.url === url ? prev.data : undefined,
            error: e instanceof Error ? e.message : String(e),
          }));
      }
    };
    run();
    const t = setInterval(() => {
      if (!document.hidden) run();
    }, interval);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [url, interval, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = res?.url === url ? res : undefined;
  return { data: current?.data, error: current?.error, reload };
}

export function timeAgo(iso: string) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString();
}

export function bareName(addr: string) {
  const m = addr.match(/^\s*"?([^"<]*?)"?\s*<(.+)>\s*$/);
  return m ? m[1].trim() || m[2] : addr;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
