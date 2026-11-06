import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { connectWebhook, startApp, startReceiver } from "./helpers.mjs";

describe("sending API (official Resend SDK)", () => {
  let app, hook, resend;

  before(async () => {
    app = await startApp();
    resend = app.resend;
    hook = await startReceiver(resend);
    await connectWebhook(app, hook);
    await app.ui("/api/ui/inboxes", "POST", { address: "alice@gmail.com", name: "Alice" });
    await app.ui("/api/ui/inboxes", "POST", { address: "bob@yahoo.com" });
  });
  after(async () => {
    await hook.close();
    await app.stop();
  });

  it("registers a domain", async () => {
    const created = await resend.domains.create({ name: "test.com" });
    assert.equal(created.error, null);
    assert.equal(created.data.name, "test.com");
    const list = await resend.domains.list();
    assert.equal(list.data.data.length, 1);
    assert.equal(list.data.data[0].status, "verified");
    const got = await resend.domains.get(created.data.id);
    assert.equal(got.data.object, "domain");
  });

  let sentId;
  it("sends an email and returns an id", async () => {
    const r = await resend.emails.send({
      from: "Acme <noreply@test.com>",
      to: ["alice@gmail.com"],
      subject: "Hello",
      html: "<p>hi</p>",
      text: "hi",
      tags: [{ name: "category", value: "welcome" }],
      headers: { "X-Entity-Ref-ID": "123" },
    });
    assert.equal(r.error, null);
    assert.match(r.data.id, /^[0-9a-f-]{36}$/);
    sentId = r.data.id;
  });

  it("retrieves and lists the email", async () => {
    const got = await resend.emails.get(sentId);
    assert.equal(got.error, null);
    assert.equal(got.data.object, "email");
    assert.equal(got.data.last_event, "delivered");
    assert.deepEqual(got.data.to, ["alice@gmail.com"]);
    assert.equal(got.data.from, "Acme <noreply@test.com>");
    assert.deepEqual(got.data.tags, [{ name: "category", value: "welcome" }]);
    const list = await resend.emails.list({ limit: 5 });
    assert.equal(list.data.object, "list");
    assert.equal(list.data.data.length, 1);
    assert.equal(list.data.data[0].html, undefined);
    assert.equal(list.data.has_more, false);
  });

  it("delivers the email into the recipient's inbox, unread", async () => {
    const inboxes = await app.json("/api/ui/inboxes");
    const alice = inboxes.find((i) => i.address === "alice@gmail.com");
    assert.equal(alice.unread, 1);
    const msgs = await app.json(`/api/ui/inboxes/${alice.id}/messages`);
    assert.equal(msgs[0].subject, "Hello");
    assert.equal(msgs[0].read, false);
  });

  it("sends email.sent then email.delivered with a valid signature", async () => {
    const sent = await hook.waitFor((e) => e.type === "email.sent" && e.data.email_id === sentId);
    const delivered = await hook.waitFor((e) => e.type === "email.delivered" && e.data.email_id === sentId);
    assert.equal(sent.data.from, "Acme <noreply@test.com>");
    assert.deepEqual(sent.data.to, ["alice@gmail.com"]);
    assert.equal(sent.data.subject, "Hello");
    assert.deepEqual(sent.data.tags, { category: "welcome" });
    assert.ok(hook.events.indexOf(sent) < hook.events.indexOf(delivered));
    assert.ok(!hook.events.some((e) => e.type === "VERIFY_FAILED"), JSON.stringify(hook.events));
  });

  describe("validation and errors", () => {
    it("rejects a from address on an unregistered domain (403)", async () => {
      const r = await resend.emails.send({ from: "x@unknown.org", to: "alice@gmail.com", subject: "s", text: "t" });
      assert.equal(r.error.statusCode, 403);
      assert.equal(r.error.name, "validation_error");
      assert.match(r.error.message, /unknown\.org/);
    });
    it("rejects a malformed from address", async () => {
      const r = await resend.emails.send({ from: "notanemail", to: "alice@gmail.com", subject: "s", text: "t" });
      assert.equal(r.error.name, "invalid_from_address");
      assert.equal(r.error.statusCode, 422);
    });
    it("rejects a malformed recipient", async () => {
      const r = await resend.emails.send({ from: "a@test.com", to: "bad", subject: "s", text: "t" });
      assert.equal(r.error.statusCode, 422);
    });
    it("requires html or text", async () => {
      const r = await resend.emails.send({ from: "a@test.com", to: "alice@gmail.com", subject: "s" });
      assert.equal(r.error.statusCode, 422);
    });
    it("returns 404 not_found for an unknown email", async () => {
      const r = await resend.emails.get("00000000-0000-0000-0000-000000000000");
      assert.equal(r.error.statusCode, 404);
      assert.equal(r.error.name, "not_found");
    });
    it("returns 401 missing_api_key without an Authorization header", async () => {
      const res = await fetch(`${app.baseUrl}/emails`, { method: "POST", body: "{}" });
      assert.equal(res.status, 401);
      assert.equal((await res.json()).name, "missing_api_key");
    });
    it("rejects templates, which are not supported", async () => {
      const r = await resend.emails.send({ to: "alice@gmail.com", from: "a@test.com", template: { id: "t1" } });
      assert.equal(r.error.statusCode, 422);
    });
  });

  describe("idempotency", () => {
    const body = { from: "a@test.com", to: "bob@yahoo.com", subject: "idem", text: "t" };
    it("replays the original response for the same key and payload", async () => {
      const a = await resend.emails.send(body, { idempotencyKey: "key-1" });
      const b = await resend.emails.send(body, { idempotencyKey: "key-1" });
      assert.equal(a.data.id, b.data.id);
    });
    it("returns 409 when the same key is reused with a different payload", async () => {
      const c = await resend.emails.send({ ...body, subject: "different" }, { idempotencyKey: "key-1" });
      assert.equal(c.error.statusCode, 409);
      assert.equal(c.error.name, "invalid_idempotent_request");
    });
  });

  describe("attachments", () => {
    it("stores, lists, gets and serves attachments", async () => {
      const r = await resend.emails.send({
        from: "a@test.com",
        to: "alice@gmail.com",
        subject: "att",
        text: "t",
        attachments: [{ filename: "hello.txt", content: Buffer.from("hello world") }],
      });
      assert.equal(r.error, null);
      const list = await resend.emails.attachments.list({ emailId: r.data.id });
      assert.equal(list.data.data[0].filename, "hello.txt");
      assert.equal(list.data.data[0].size, 11);
      const got = await resend.emails.attachments.get({ emailId: r.data.id, id: list.data.data[0].id });
      assert.equal(got.data.object, "attachment");
      const file = await fetch(list.data.data[0].download_url);
      assert.equal(await file.text(), "hello world");
    });
  });

  describe("batch", () => {
    const ok = { from: "a@test.com", to: "alice@gmail.com", subject: "b", text: "1" };
    const bad = { from: "a@unknown.org", to: "bob@yahoo.com", subject: "b", text: "2" };
    it("sends every email in a valid batch", async () => {
      const r = await resend.batch.send([ok, { ...ok, to: "bob@yahoo.com" }]);
      assert.equal(r.data.data.length, 2);
    });
    it("fails the whole batch in strict mode", async () => {
      const r = await resend.batch.send([ok, bad]);
      assert.ok(r.error);
    });
    it("sends valid emails and reports errors in permissive mode", async () => {
      const r = await resend.batch.send([ok, bad], { batchValidation: "permissive" });
      assert.equal(r.data.data.length, 1);
      assert.equal(r.data.errors[0].index, 1);
    });
  });

  describe("simulated outcomes", () => {
    it("bounces mail to bounced@resend.dev", async () => {
      const r = await resend.emails.send({ from: "a@test.com", to: "bounced@resend.dev", subject: "bounce", text: "t" });
      assert.equal((await resend.emails.get(r.data.id)).data.last_event, "bounced");
      const ev = await hook.waitFor((e) => e.type === "email.bounced" && e.data.email_id === r.data.id);
      assert.equal(ev.data.bounce.type, "Permanent");
    });
    it("reports a complaint for complained@resend.dev", async () => {
      const r = await resend.emails.send({ from: "a@test.com", to: "complained+x@resend.dev", subject: "c", text: "t" });
      await hook.waitFor((e) => e.type === "email.complained" && e.data.email_id === r.data.id);
    });
  });

  describe("webhook event toggles", () => {
    it("does not send events that are disabled in settings", async () => {
      await connectWebhook(app, hook, ["email.delivered"]);
      const before = hook.events.length;
      const r = await resend.emails.send({ from: "a@test.com", to: "bob@yahoo.com", subject: "toggle", text: "t" });
      await hook.waitFor((e) => e.type === "email.delivered" && e.data.email_id === r.data.id);
      assert.ok(!hook.events.slice(before).some((e) => e.type === "email.sent" && e.data.email_id === r.data.id));
    });
  });
});
