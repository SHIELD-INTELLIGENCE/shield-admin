const admin = require("firebase-admin");
const { Resend } = require("resend");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();
const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL = process.env.SENDER_EMAIL || "noreply@shield.com";

function getDaysRemaining(endDate) {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatDate(dateStr) {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-IN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function buildEmail(name, plan, endDate, daysRemaining) {
  const subject =
    daysRemaining <= 0
      ? `Your ${plan} has expired — SHIELD`
      : `Your ${plan} expires in ${daysRemaining} days — SHIELD`;

  const body =
    daysRemaining <= 0
      ? {
          heading: "Plan Expired",
          message: `Your <strong>${plan}</strong> has expired. To avoid any disruption, please renew your plan at your earliest convenience.`,
          extra: "If you have already renewed, please ignore this message.",
        }
      : {
          heading: `Expiring in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`,
          message: `This is a friendly reminder that your <strong>${plan}</strong> is set to expire on <strong>${formatDate(endDate)}</strong>.`,
          extra:
            daysRemaining <= 2
              ? "Please take action soon to ensure uninterrupted service."
              : "You can renew your plan anytime before the expiration date.",
        };

  const actionLabel = daysRemaining <= 0 ? "Renew Now" : "Review Your Plan";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f0f1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f0f1a;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#1a1a2e;border-radius:12px;border:1px solid rgba(139,92,246,0.2);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:32px 32px 0;">
              <h1 style="margin:0;font-size:28px;font-weight:800;color:#fff;letter-spacing:2px;">SHIELD</h1>
              <p style="margin:4px 0 0;font-size:13px;color:#a78bfa;letter-spacing:1px;">SECURITY • HOSTING • INTEGRATION • ENGINEERING • DEVELOPMENT</p>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style="padding:0 32px;"><div style="height:1px;background:linear-gradient(90deg,transparent,rgba(139,92,246,0.4),transparent);"></div></td></tr>
          <!-- Body -->
          <tr>
            <td style="padding:28px 32px;">
              <p style="margin:0 0 6px;font-size:14px;color:#a1a1aa;">Hi ${name},</p>
              <h2 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#fbbf24;">${body.heading}</h2>
              <p style="margin:0 0 8px;font-size:15px;color:#e4e4e7;line-height:1.6;">${body.message}</p>
              <p style="margin:0 0 20px;font-size:14px;color:#a1a1aa;">${body.extra}</p>
              <!-- Details box -->
              <table role="presentation" width="100%" cellpadding="12" cellspacing="0" style="background:rgba(255,255,255,0.04);border-radius:8px;margin-bottom:20px;">
                <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);"><span style="color:#a1a1aa;font-size:13px;">Plan</span><br><span style="color:#fff;font-size:15px;font-weight:600;">${plan}</span></td></tr>
                <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(255,255,255,0.06);"><span style="color:#a1a1aa;font-size:13px;">Billing End</span><br><span style="color:#fff;font-size:15px;font-weight:600;">${formatDate(endDate)}</span></td></tr>
                <tr><td style="padding:12px 16px;"><span style="color:#a1a1aa;font-size:13px;">Status</span><br><span style="color:${daysRemaining <= 0 ? "#ef4444" : "#fbbf24"};font-size:15px;font-weight:600;">${daysRemaining <= 0 ? "Expired" : `Active — ${daysRemaining} day${daysRemaining > 1 ? "s" : ""} remaining`}</span></td></tr>
              </table>
              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="mailto:${FROM_EMAIL}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#7c3aed,#a78bfa);color:#fff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${actionLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:0 32px 28px;">
              <p style="margin:0;font-size:12px;color:#52525b;">SHIELD — Security, Hosting, Integration, Engineering, Development</p>
              <p style="margin:4px 0 0;font-size:12px;color:#52525b;">If you have any questions, reply to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

async function main() {
  console.log("Starting plan notification check...");

  const snapshot = await db.collection("serviceRequests").get();
  let sent = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const data = { id: doc.id, ...doc.data() };

    if (!data.billingEndDate || !data.email) {
      skipped++;
      continue;
    }

    const days = getDaysRemaining(data.billingEndDate);
    const lastAlert = data.lastAlertType || null;

    let alertType = null;

    if (days <= 0 && lastAlert !== "expired") {
      alertType = "expired";
    } else if (days <= 2 && lastAlert !== "expired" && lastAlert !== "2_day") {
      alertType = "2_day";
    } else if (days <= 5 && lastAlert !== "expired" && lastAlert !== "2_day" && lastAlert !== "5_day") {
      alertType = "5_day";
    }

    if (!alertType) {
      skipped++;
      continue;
    }

    const { subject, html } = buildEmail(
      data.name || "Client",
      data.plan || "your plan",
      data.billingEndDate,
      days
    );

    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        subject,
        html,
      });

      await db.collection("serviceRequests").doc(doc.id).update({
        lastAlertType: alertType,
        lastAlertSentAt: new Date().toISOString(),
      });

      console.log(`[${alertType}] Email sent to ${data.email} (${data.name}) — ${data.plan}`);
      sent++;
    } catch (err) {
      console.error(`Failed to send email to ${data.email}:`, err);
    }
  }

  console.log(`Done. Sent: ${sent}, Skipped: ${skipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
