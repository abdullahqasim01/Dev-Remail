import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { connectWebhook, startApp, startReceiver, waitUntil } from "./helpers.mjs";

describe("webhook retries and signing", () => {
  let app, resend;
  before(async () => {
    app = await startApp();
    resend = app.resend;
    await resend.domains.create({ name: "test.com" });
  });
  after(() => app.stop());

  it("retries a failing endpoint until it succeeds", async () => {
    // fail the first attempt, accept the second (retry fires after ~2s)
    const hook = await startReceiver(resend, { respond: (n) => (n === 1 ? 500 : 200) });
    try {
      await connectWebhook(app, hook, ["email.sent"]);
      const r = await resend.emails.send({ from: "a@test.com", to: "x@gmail.com", subject: "retry", text: "t" });
      assert.equal(r.error, null);
      // the receiver records the failed first attempt too, so wait on the delivery log instead
      const delivery = await waitUntil(
        async () => (await app.json("/api/ui/deliveries")).find((d) => d.status === "success"),
        { timeout: 10_000, message: "the retry to succeed" },
      );
      assert.equal(delivery.attempts, 2);
      assert.equal(hook.hits, 2);
    } finally {
      await hook.close();
    }
  });

  it("signatures fail verification with the wrong secret", async () => {
    const hook = await startReceiver(resend);
    try {
      await connectWebhook(app, hook, ["email.sent"]);
      hook.setSecret("whsec_" + Buffer.from("not-the-real-secret").toString("base64"));
      await resend.emails.send({ from: "a@test.com", to: "x@gmail.com", subject: "sig", text: "t" });
      const ev = await hook.waitFor((e) => e.type === "VERIFY_FAILED");
      assert.ok(ev.error);
    } finally {
      await hook.close();
    }
  });

  it("regenerating the secret changes the signing key", async () => {
    const before = (await app.json("/api/ui/settings")).webhookSecret;
    const { webhookSecret } = await app.json("/api/ui/settings/secret", "POST");
    assert.notEqual(webhookSecret, before);
    assert.match(webhookSecret, /^whsec_/);
  });
});
