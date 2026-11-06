// Sends a test email through Dev-Remail using the official Resend SDK.
//   node scripts/send-test-email.mjs [recipient]
// Env: RESEND_BASE_URL (default http://localhost:6245), RESEND_API_KEY (any value)
import { Resend } from "resend";

const baseUrl = process.env.RESEND_BASE_URL ?? "http://localhost:6245";
const resend = new Resend(process.env.RESEND_API_KEY ?? "re_anything", { baseUrl });

const FROM = "test@test.com";
const TO = process.argv[2] ?? "user@example.com";

// One-time setup so the script works on a fresh server: register the sender's
// domain (the API rejects unregistered domains) and create the recipient's inbox.
const domains = await resend.domains.list();
if (!domains.data?.data.some((d) => d.name === "test.com")) {
  await resend.domains.create({ name: "test.com" });
}
await fetch(`${baseUrl}/api/ui/inboxes`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ address: TO }),
}); // 422 if it already exists, which is fine

const { data, error } = await resend.emails.send({
  from: `Test <${FROM}>`,
  to: [TO],
  subject: "Hello from Dev-Remail",
  html: "<h2>It works 🎉</h2><p>This email was sent with the Resend SDK to <b>Dev-Remail</b>.</p>",
  text: "It works! This email was sent with the Resend SDK to Dev-Remail.",
});

if (error) {
  console.error("Send failed:", error);
  process.exit(1);
}
console.log(`Sent! id=${data.id}\nOpen ${baseUrl} and select the ${TO} inbox.`);
