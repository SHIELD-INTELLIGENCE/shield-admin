const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { Resend } = require("resend");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
console.log("Resend key prefix:", RESEND_API_KEY ? RESEND_API_KEY.substring(0, 6) + "..." : "MISSING");
const resend = new Resend(RESEND_API_KEY);

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
  const actionLink = `mailto:queriesshield@gmail.com?subject=${encodeURIComponent(subject)}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#121212;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:16px;border:2px solid rgba(202,169,76,0.3);box-shadow:0 0 40px rgba(202,169,76,0.15);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:36px 32px 0;">
              <h1 style="margin:0;font-size:30px;font-weight:900;color:#caa94c;letter-spacing:3px;text-shadow:0 0 12px rgba(202,169,76,0.35);">SHIELD</h1>
              <p style="margin:6px 0 0;font-size:12px;color:#caa94c;letter-spacing:2px;opacity:0.8;">SECURITY • HOSTING • INTEGRATION • ENGINEERING • DEVELOPMENT</p>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style="padding:0 32px;"><div style="height:2px;background:linear-gradient(90deg,transparent,rgba(202,169,76,0.5),transparent);box-shadow:0 0 8px rgba(202,169,76,0.2);"></div></td></tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px;">
              <p style="margin:0 0 8px;font-size:15px;color:#aaa;">Hi ${name},</p>
              <h2 style="margin:0 0 14px;font-size:24px;font-weight:700;color:#caa94c;text-shadow:0 0 8px rgba(202,169,76,0.25);">${body.heading}</h2>
              <p style="margin:0 0 10px;font-size:16px;color:#e0e0e0;line-height:1.7;">${body.message}</p>
              <p style="margin:0 0 24px;font-size:14px;color:#888;">${body.extra}</p>
              <!-- Details box -->
              <table role="presentation" width="100%" cellpadding="14" cellspacing="0" style="background:rgba(202,169,76,0.06);border-radius:12px;border:1px solid rgba(202,169,76,0.2);margin-bottom:24px;">
                <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(202,169,76,0.12);"><span style="color:#888;font-size:13px;">Plan</span><br><span style="color:#f0f0f0;font-size:16px;font-weight:600;">${plan}</span></td></tr>
                <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(202,169,76,0.12);"><span style="color:#888;font-size:13px;">Billing End</span><br><span style="color:#f0f0f0;font-size:16px;font-weight:600;">${formatDate(endDate)}</span></td></tr>
                <tr><td style="padding:12px 16px;"><span style="color:#888;font-size:13px;">Status</span><br><span style="color:${daysRemaining <= 0 ? "#ef4444" : "#caa94c"};font-size:16px;font-weight:700;text-shadow:${daysRemaining <= 0 ? "0 0 8px rgba(239,68,68,0.3)" : "0 0 8px rgba(202,169,76,0.25)"};">${daysRemaining <= 0 ? "Expired" : `Active — ${daysRemaining} day${daysRemaining > 1 ? "s" : ""} remaining`}</span></td></tr>
              </table>
              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#caa94c,#e5c76a);color:#1a1a1a;font-size:15px;font-weight:800;text-decoration:none;border-radius:9999px;box-shadow:0 0 16px rgba(202,169,76,0.35);letter-spacing:0.5px;">${actionLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:0 32px 32px;">
              <div style="height:1px;background:rgba(202,169,76,0.2);margin-bottom:16px;"></div>
              <p style="margin:0;font-size:12px;color:#666;">SHIELD — Security, Hosting, Integration, Engineering, Development</p>
              <p style="margin:4px 0 0;font-size:12px;color:#666;">If you have any questions, reply to this email or contact us at <a href="mailto:queriesshield@gmail.com" style="color:#caa94c;text-decoration:none;">queriesshield@gmail.com</a></p>
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
      console.log(`SKIP: ${data.name || "unknown"} — missing billingEndDate or email`);
      skipped++;
      continue;
    }

    const days = getDaysRemaining(data.billingEndDate);
    const lastAlert = data.lastAlertType || null;

    console.log(`CHECK: ${data.name} — billingEndDate=${data.billingEndDate}, days=${days}, lastAlert=${lastAlert}`);

    let alertType = null;

    if (!Number.isFinite(days)) {
      console.log(`SKIP: ${data.name} — invalid date (days=${days})`);
      skipped++;
      continue;
    }

    if (days <= 0 && lastAlert !== "expired") {
      alertType = "expired";
    } else if (days <= 2 && lastAlert !== "expired" && lastAlert !== "2_day") {
      alertType = "2_day";
    } else if (days <= 5 && lastAlert !== "expired" && lastAlert !== "2_day" && lastAlert !== "5_day") {
      alertType = "5_day";
    }

    if (!alertType) {
      console.log(`SKIP: ${data.name} — no matching alert type (days=${days}, lastAlert=${lastAlert})`);
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
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        subject,
        html,
      });

      console.log(`[${alertType}] Resend response:`, JSON.stringify(result));

      if (!result || result.error) {
        console.error(`[${alertType}] Resend returned error:`, result?.error);
        continue;
      }

      await db.collection("serviceRequests").doc(doc.id).update({
        lastAlertType: alertType,
        lastAlertSentAt: new Date().toISOString(),
      });

      console.log(`[${alertType}] Email sent to ${data.email} (${data.name}) — ${data.plan}, id=${result.id || "unknown"}`);
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
