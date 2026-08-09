// BuildOS email notifications via Resend.
// NOTE: Resend restricts unverified accounts to sending only to the
// account owner's own email. To send to real users, verify a sending
// domain (e.g. buildos.tech) in the Resend dashboard — add the SPF/DKIM
// DNS records they give you, then switch FROM_EMAIL below to that domain.
const { Resend } = require("resend");

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.FROM_EMAIL || "BuildOS <onboarding@resend.dev>";
const SITE_URL = process.env.SITE_URL || "https://buildos.tech";
const LOGO_URL = `${SITE_URL}/assets/logo-final.png`;

function wrapEmail({ heading, body }) {
  return `
  <div style="background:#faf9f5;padding:40px 20px;font-family:Inter,Helvetica,Arial,sans-serif">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e5e5e0;border-radius:16px;overflow:hidden">
      <div style="background:#1a1a17;padding:24px 32px;display:flex;align-items:center;gap:12px">
        <img src="${LOGO_URL}" alt="BuildOS" style="height:28px;width:28px;object-fit:contain">
        <span style="color:#fff;font-weight:600;font-size:1.1em;letter-spacing:0.02em">BuildOS</span>
      </div>
      <div style="padding:32px">
        <h2 style="margin:0 0 16px;color:#1a1a17;font-size:1.3em">${heading}</h2>
        ${body}
      </div>
      <div style="padding:20px 32px;background:#faf9f5;border-top:1px solid #e5e5e0;font-size:0.8em;color:#999">
        BuildOS — funds sit in a non-custodial contract, not in our wallet.
      </div>
    </div>
  </div>`;
}

async function sendWarningEmail({ to, label, statusUrl, daysRemaining, hoursRemaining }) {
  if (!resend || !to) return { skipped: true };
  const timeLeft = daysRemaining >= 1
    ? `${daysRemaining} day${daysRemaining === 1 ? "" : "s"}`
    : `${hoursRemaining} hour${hoursRemaining === 1 ? "" : "s"}`;
  const html = wrapEmail({
    heading: `Check in soon — ${timeLeft} left`,
    body: `
      <p style="color:#444;line-height:1.6">Your agent <strong>${label || "Untitled Agent"}</strong> will trigger in about <strong>${timeLeft}</strong> unless you check in.</p>
      <a href="${statusUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:8px;font-weight:500">View Status & Check In</a>
    `,
  });
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `⏳ ${label || "Your BuildOS agent"} — check in soon`,
    html,
  });
}

async function sendTriggerFiredOwnerEmail({ to, label, statusUrl }) {
  if (!resend || !to) return { skipped: true };
  const html = wrapEmail({
    heading: `${label || "Your agent"} has triggered`,
    body: `
      <p style="color:#444;line-height:1.6">The trigger condition for <strong>${label || "your agent"}</strong> has been met, and the configured action has fired.</p>
      <a href="${statusUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:8px;font-weight:500">View Status</a>
    `,
  });
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `🔔 ${label || "Your BuildOS agent"} has triggered`,
    html,
  });
}

async function sendTriggerFiredBeneficiaryEmail({ to, label, statusUrl }) {
  if (!resend || !to) return { skipped: true };
  const html = wrapEmail({
    heading: `A note is waiting for you`,
    body: `
      <p style="color:#444;line-height:1.6">Someone set up a BuildOS agent that names you as a beneficiary, and its trigger condition has now been met.</p>
      <a href="${statusUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#2d6a4f;color:#fff;text-decoration:none;border-radius:8px;font-weight:500">View Message & Status</a>
    `,
  });
  return resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `A message is waiting for you`,
    html,
  });
}

module.exports = {
  sendWarningEmail,
  sendTriggerFiredOwnerEmail,
  sendTriggerFiredBeneficiaryEmail,
};
