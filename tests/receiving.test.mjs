import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { connectWebhook, startApp, startReceiver, waitUntil } from "./helpers.mjs";

describe("inboxes, inbound mail and the receiving API", () => {
  let app, hook, resend, alice, bob;

  before(async () => {
    app = await startApp();
    resend = app.resend;
    hook = await startReceiver(resend);
    await connectWebhook(app, hook);
    await resend.domains.create({ name: "test.com" });
    await app.ui("/api/ui/inboxes", "POST", { address: "alice@gmail.com", name: "Alice" });
    await app.ui("/api/ui/inboxes", "POST", { address: "bob@yahoo.com" });
    const inboxes = await app.json("/api/ui/inboxes");
    alice = inboxes.find((i) => i.address === "alice@gmail.com");
    bob = inboxes.find((i) => i.address === "bob@yahoo.com");
  });
  after(async () => {
    await hook.close();
    await app.stop();
  });

  const send = (body) => app.ui("/api/ui/send", "POST", body);

  describe("inbox and domain rules", () => {
    it("rejects an inbox on a registered app domain", async () => {
      const r = await app.ui("/api/ui/inboxes", "POST", { address: "evil@test.com" });
      assert.equal(r.status, 422);
      assert.match((await r.json()).message, /registered app domain/);
    });
    it("rejects a duplicate inbox", async () => {
      assert.equal((await app.ui("/api/ui/inboxes", "POST", { address: "alice@gmail.com" })).status, 422);
    });
    it("rejects registering a domain that existing inboxes use", async () => {
      assert.equal((await app.ui("/api/ui/domains", "POST", { name: "gmail.com" })).status, 422);
    });
    it("rejects sending to an address that is neither an inbox nor an app domain", async () => {
      const r = await send({ inboxId: alice.id, to: ["nobody@nowhere.org"], subject: "x", text: "y" });
      assert.equal(r.status, 422);
    });
  });

  describe("user to user", () => {
    it("delivers to the other inbox without any webhook", async () => {
      const before = hook.events.length;
      assert.ok((await send({ inboxId: alice.id, to: ["bob@yahoo.com"], subject: "hi bob", text: "yo" })).ok);
      const msgs = await app.json(`/api/ui/inboxes/${bob.id}/messages`);
      assert.ok(msgs.some((m) => m.subject === "hi bob" && m.read === false));
      await new Promise((r) => setTimeout(r, 500));
      assert.equal(hook.events.length, before);
    });
    it("shows the message in the sender's Sent folder", async () => {
      const sent = await app.json(`/api/ui/inboxes/${alice.id}/messages?folder=sent`);
      assert.ok(sent.some((m) => m.subject === "hi bob"));
    });
    it("marks a message read when opened", async () => {
      const msgs = await app.json(`/api/ui/inboxes/${bob.id}/messages`);
      await app.ui(`/api/ui/messages/${msgs[0].id}?inbox=${bob.id}`);
      const after = await app.json(`/api/ui/inboxes/${bob.id}/messages`);
      assert.equal(after[0].read, true);
    });
  });

  describe("user to app (email.received)", () => {
    let emailId;
    it("fires a verified email.received webhook", async () => {
      const r = await send({
        inboxId: alice.id,
        to: ["support@test.com"],
        subject: "Need help",
        html: "<p>help <b>me</b></p>",
        text: "help me",
        attachments: [{ filename: "log.txt", contentType: "text/plain", contentBase64: Buffer.from("LOGDATA").toString("base64") }],
      });
      const body = await r.json();
      assert.equal(body.direction, "inbound");
      emailId = body.id;
      const ev = await hook.waitFor((e) => e.type === "email.received" && e.data.email_id === emailId);
      assert.equal(ev.data.from, "Alice <alice@gmail.com>");
      assert.deepEqual(ev.data.received_for, ["support@test.com"]);
      assert.equal(ev.data.attachments[0].filename, "log.txt");
      assert.equal(ev.data.subject, "Need help");
    });

    it("emails.receiving.get returns the full message", async () => {
      const g = await resend.emails.receiving.get(emailId);
      assert.equal(g.error, null);
      assert.equal(g.data.subject, "Need help");
      assert.ok(g.data.html.includes("help"));
      assert.equal(g.data.text, "help me");
      assert.equal(g.data.attachments.length, 1);
      assert.ok(g.data.raw.download_url);
    });
    it("emails.receiving.list omits bodies", async () => {
      const l = await resend.emails.receiving.list();
      assert.equal(l.data.data.length, 1);
      assert.equal(l.data.data[0].html, undefined);
    });
    it("receiving attachments can be listed and downloaded", async () => {
      const list = await resend.emails.receiving.attachments.list({ emailId });
      assert.equal(list.data.data[0].filename, "log.txt");
      assert.equal(await (await fetch(list.data.data[0].download_url)).text(), "LOGDATA");
    });
    it("is not exposed through the sending endpoints", async () => {
      assert.equal((await resend.emails.get(emailId)).error.statusCode, 404);
    });
    it("is forwardable (the SDK downloads and parses the raw .eml)", async () => {
      const passthrough = await resend.emails.receiving.forward({ emailId, to: "alice@gmail.com", from: "fwd@test.com" });
      assert.equal(passthrough.error, null);
      const got = await resend.emails.get(passthrough.data.id);
      assert.equal(got.data.subject, "Need help");
      assert.ok(got.data.html.includes("help"));
      const wrapped = await resend.emails.receiving.forward({
        emailId, to: "alice@gmail.com", from: "fwd@test.com", passthrough: false, text: "see attached",
      });
      assert.equal(wrapped.error, null);
    });
  });

  describe("webhook delivery", () => {
    it("records every attempt in the delivery log", async () => {
      // deliveries are asynchronous: wait until none is still in flight
      const log = await waitUntil(
        async () => {
          const l = await app.json("/api/ui/deliveries");
          return l.length > 0 && l.every((d) => d.status !== "pending") && l;
        },
        { message: "webhook deliveries to settle" },
      );
      assert.ok(log.every((d) => d.status === "success" && d.statusCode === 200), JSON.stringify(log.map((d) => [d.eventType, d.status])));
    });
  });
});
