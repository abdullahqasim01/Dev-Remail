// Test helpers: boots an isolated Dev-Remail instance (the same standalone build the
// Docker image runs) on a free port with a throwaway SQLite database.
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { Resend } from "resend";

const root = path.resolve(import.meta.dirname, "..");

export function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

export async function startApp() {
  const entry = path.join(root, ".next/standalone/server.js");
  if (!fs.existsSync(entry)) throw new Error("No build found. Run `npm run build` before `npm test`.");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dev-remail-test-"));
  const port = await freePort();
  const env = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: `file:${path.join(dir, "test.db")}`,
    RUNNING_IN_DOCKER: "",
    PUBLIC_URL: "",
  };
  execFileSync("node", ["scripts/migrate.mjs"], { env, cwd: root, stdio: "pipe" });

  const child = spawn("node", [entry], { env, cwd: path.dirname(entry), stdio: "pipe" });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));

  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${baseUrl}/api/health`)).ok) break;
    } catch {}
    if (child.exitCode !== null) throw new Error(`Server exited early:\n${log}`);
    if (Date.now() > deadline) throw new Error(`Server did not become healthy:\n${log}`);
    await new Promise((r) => setTimeout(r, 150));
  }

  const resend = new Resend("re_test_key", { baseUrl });
  const ui = (p, method = "GET", body) =>
    fetch(baseUrl + p, {
      method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

  return {
    baseUrl,
    resend,
    ui,
    json: async (p, method, body) => (await ui(p, method, body)).json(),
    async stop() {
      child.kill();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A webhook endpoint that verifies signatures with the Resend SDK.
 * `respond` lets a test script the HTTP status (e.g. fail first, then succeed).
 */
export async function startReceiver(resend, { respond = () => 200 } = {}) {
  const events = [];
  const secretBox = { secret: "" };
  let hits = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      hits++;
      try {
        const get = (k) => req.headers[k];
        const verified = resend.webhooks.verify({
          payload: body,
          headers: { id: get("svix-id"), timestamp: get("svix-timestamp"), signature: get("svix-signature") },
          webhookSecret: secretBox.secret,
        });
        // The standard-webhooks header names must carry the same signature.
        if (get("webhook-signature") !== get("svix-signature")) throw new Error("header mismatch");
        events.push(verified);
      } catch (e) {
        events.push({ type: "VERIFY_FAILED", error: String(e) });
      }
      res.statusCode = respond(hits);
      res.end("ok");
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    url: `http://127.0.0.1:${server.address().port}/hook`,
    events,
    get hits() { return hits; },
    setSecret: (s) => (secretBox.secret = s),
    /** Resolve once an event matching `pred` arrives; reject after `timeout`. */
    async waitFor(pred, timeout = 8000) {
      const end = Date.now() + timeout;
      for (;;) {
        const hit = events.find(pred);
        if (hit) return hit;
        if (Date.now() > end) throw new Error(`Timed out. Events seen: ${events.map((e) => e.type).join(", ") || "none"}`);
        await new Promise((r) => setTimeout(r, 50));
      }
    },
    close: () => new Promise((r) => server.close(r)),
  };
}

/** Points the app's webhook at `receiver` and hands the signing secret to it. */
export async function connectWebhook(app, receiver, events) {
  const s = await app.json("/api/ui/settings", "PUT", {
    webhookUrl: receiver.url,
    webhookActive: true,
    ...(events ? { webhookEvents: events } : {}),
  });
  receiver.setSecret(s.webhookSecret);
  return s;
}

/** Polls `fn` until it returns a truthy value (returned), or throws after `timeout` ms. */
export async function waitUntil(fn, { timeout = 8000, interval = 50, message = "condition" } = {}) {
  const end = Date.now() + timeout;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`Timed out waiting for ${message}`);
    await new Promise((r) => setTimeout(r, interval));
  }
}
