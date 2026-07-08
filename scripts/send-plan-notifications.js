const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { Resend } = require("resend");

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const app = initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore(app);

const RESEND_API_KEY = process.env.RESEND_API_KEY;
console.log("Resend key prefix:", RESEND_API_KEY ? RESEND_API_KEY.substring(0, 6) + "..." : "MISSING");
const resend = new Resend(RESEND_API_KEY);

const RAW_SENDER = process.env.SENDER_EMAIL || "notification@shieldintelligence.in";
const FROM_EMAIL = RAW_SENDER.includes("<") ? RAW_SENDER : `SHIELD Intelligence <${RAW_SENDER}>`;
const CLIENT_URL = (process.env.CLIENT_URL || "https://shieldintelligence.in").replace(/\/+$/, "");

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

function buildEmail(name, plan, endDate, daysRemaining, clientUrl, extra) {
  const cycle = extra?.billingCycle || "";
  const amount = extra?.amount ? `₹${Number(extra.amount).toLocaleString("en-IN")}` : null;
  const cycleSuffix = cycle ? ` / ${cycle.toLowerCase().replace("ly", "").replace("er", "")}` : "";

  let subject;
  if (daysRemaining <= 0) {
    subject = amount ? `${plan}${cycleSuffix} — Expired (${amount})` : `${plan} — Plan Expired`;
  } else if (daysRemaining <= 2) {
    subject = amount ? `${plan}${cycleSuffix} — ${daysRemaining}d left (${amount})` : `${plan} — Expiring in ${daysRemaining}d`;
  } else {
    subject = amount ? `${plan}${cycleSuffix} — ${daysRemaining}d left (${amount})` : `${plan} — Expiring Soon`;
  }

  const amountRow = amount
    ? `<tr><td style="padding:12px 16px;border-bottom:1px solid rgba(202,169,76,0.1);"><span style="color:#888;font-size:13px;">Amount</span><br><span style="color:#f0f0f0;font-size:16px;font-weight:700;">${amount}${cycleSuffix}</span></td></tr>`
    : "";
  const billingCycleRow = cycle
    ? `<tr><td style="padding:12px 16px;border-bottom:1px solid rgba(202,169,76,0.1);"><span style="color:#888;font-size:13px;">Billing Cycle</span><br><span style="color:#f0f0f0;font-size:15px;font-weight:600;">${cycle}</span></td></tr>`
    : "";

  const body =
    daysRemaining <= 0
      ? {
          heading: "Plan Expired",
          message: `Your <strong>${plan}${cycleSuffix}</strong> has expired. Please renew via your dashboard to restore service.`,
          extra: "If you have already renewed, please disregard this notice.",
        }
      : {
          heading: `Expiring in ${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`,
          message: `Your <strong>${plan}${cycleSuffix}</strong> is set to expire on <strong>${formatDate(endDate)}</strong>. Renew now to avoid any disruption.`,
          extra:
            daysRemaining <= 2
              ? "Please renew soon to ensure uninterrupted service."
              : "You can renew anytime before the expiration date.",
        };

  const baseUrl = clientUrl || CLIENT_URL;
  const actionLabel = daysRemaining <= 0 ? "Pay Now" : "Renew Now";
  const actionLink = `${baseUrl}/dashboard`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#121212;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:16px;border:2px solid rgba(202,169,76,0.3);box-shadow:0 0 40px rgba(202,169,76,0.15);">
          <!-- Header -->
          <tr>
            <td align="center" style="padding:36px 32px 12px;">
              <img src="https://shieldintelligence.in/logo512.png" alt="SHIELD Intelligence" width="100" height="100" style="display:block;margin:0 auto 12px;border-radius:12px;" />
              <h1 style="margin:0;font-size:26px;font-weight:900;color:#caa94c;letter-spacing:3px;text-shadow:0 0 12px rgba(202,169,76,0.35);">SHIELD INTELLIGENCE</h1>
              <p style="margin:8px 0 0;font-size:12px;color:#caa94c;letter-spacing:1.5px;opacity:0.7;text-transform:uppercase;">Securing Tomorrow with Strategic Intelligence.</p>
            </td>
          </tr>
          <!-- Divider -->
          <tr><td style="padding:0 32px;"><div style="height:2px;background:linear-gradient(90deg,transparent,rgba(202,169,76,0.5),transparent);"></div></td></tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px 32px;">
              <p style="margin:0 0 10px;font-size:15px;color:#aaa;">Hi ${name},</p>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#caa94c;">${body.heading}</h2>
              <p style="margin:0 0 10px;font-size:15px;color:#d4d4d4;line-height:1.7;">${body.message}</p>
              <p style="margin:0 0 28px;font-size:14px;color:#888;">${body.extra}</p>
              <!-- Details box -->
              <table role="presentation" width="100%" cellpadding="14" cellspacing="0" style="background:rgba(202,169,76,0.05);border-radius:12px;border:1px solid rgba(202,169,76,0.18);margin-bottom:28px;">
                <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(202,169,76,0.1);"><span style="color:#888;font-size:13px;">Plan</span><br><span style="color:#f0f0f0;font-size:15px;font-weight:600;">${plan}</span></td></tr>
                ${amountRow}
                ${billingCycleRow}
                <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(202,169,76,0.1);"><span style="color:#888;font-size:13px;">Billing End</span><br><span style="color:#f0f0f0;font-size:15px;font-weight:600;">${formatDate(endDate)}</span></td></tr>
                <tr><td style="padding:12px 16px;"><span style="color:#888;font-size:13px;">Days Remaining</span><br><span style="color:${daysRemaining <= 0 ? "#ef4444" : "#caa94c"};font-size:16px;font-weight:700;">${daysRemaining <= 0 ? "Expired" : `${daysRemaining} day${daysRemaining > 1 ? "s" : ""}`}</span></td></tr>
              </table>
              <!-- CTA -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="display:inline-block;padding:14px 36px;background:#caa94c;color:#1a1a1a;font-size:15px;font-weight:800;text-decoration:none;border-radius:9999px;box-shadow:0 0 16px rgba(202,169,76,0.35);letter-spacing:0.5px;">${actionLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td align="center" style="padding:0 32px 32px;">
              <div style="height:1px;background:rgba(202,169,76,0.15);margin-bottom:16px;"></div>
              <p style="margin:0;font-size:11px;color:#666;line-height:1.5;">SHIELD Intelligence — Building secure software, authentication tools, and privacy-focused digital systems.</p>
              <p style="margin:4px 0 0;font-size:11px;color:#555;">Contact: <a href="mailto:queriesshield@gmail.com" style="color:#caa94c;text-decoration:none;">queriesshield@gmail.com</a></p>
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
    } else if (days <= 7 && lastAlert !== "expired" && lastAlert !== "2_day" && lastAlert !== "5_day" && lastAlert !== "7_day") {
      alertType = "7_day";
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
      days,
      data.clientUrl,
      { billingCycle: data.billingCycle, amount: data.customMonthlyPrice || data.planPrice }
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

  // ── Enterprise Billing Expiry (same logic as SR) ──
  console.log("Checking enterprise billing expiry...");

  const enterpriseBillingSnapshot = await db.collection("enterpriseConsultations").get();
  let entBillSent = 0;
  let entBillSkipped = 0;

  for (const doc of enterpriseBillingSnapshot.docs) {
    const data = { id: doc.id, ...doc.data() };

    if (!data.billingEndDate || !data.email) {
      console.log(`SKIP (ER billing): ${data.companyName || data.contactPerson || "unknown"} — missing billingEndDate or email`);
      entBillSkipped++;
      continue;
    }

    const days = getDaysRemaining(data.billingEndDate);
    const lastAlert = data.lastAlertType || null;

    console.log(`CHECK (ER billing): ${data.companyName || data.contactPerson} — billingEndDate=${data.billingEndDate}, days=${days}, lastAlert=${lastAlert}`);

    let alertType = null;

    if (!Number.isFinite(days)) {
      console.log(`SKIP (ER billing): ${data.companyName || data.contactPerson} — invalid date (days=${days})`);
      entBillSkipped++;
      continue;
    }

    if (days <= 0 && lastAlert !== "expired") {
      alertType = "expired";
    } else if (days <= 2 && lastAlert !== "expired" && lastAlert !== "2_day") {
      alertType = "2_day";
    } else if (days <= 5 && lastAlert !== "expired" && lastAlert !== "2_day" && lastAlert !== "5_day") {
      alertType = "5_day";
    } else if (days <= 7 && lastAlert !== "expired" && lastAlert !== "2_day" && lastAlert !== "5_day" && lastAlert !== "7_day") {
      alertType = "7_day";
    }

    if (!alertType) {
      console.log(`SKIP (ER billing): ${data.companyName || data.contactPerson} — no matching alert (days=${days}, lastAlert=${lastAlert})`);
      entBillSkipped++;
      continue;
    }

    const { subject, html } = buildEmail(
      data.contactPerson || data.companyName || "Client",
      data.plan || "Enterprise",
      data.billingEndDate,
      days,
      data.clientUrl,
      { billingCycle: data.billingCycle, amount: data.customMonthlyPrice || data.planPrice }
    );

    try {
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        subject,
        html,
      });

      console.log(`[ER-billing][${alertType}] Resend response:`, JSON.stringify(result));

      if (!result || result.error) {
        console.error(`[ER-billing][${alertType}] Resend returned error:`, result?.error);
        continue;
      }

      await db.collection("enterpriseConsultations").doc(doc.id).update({
        lastAlertType: alertType,
        lastAlertSentAt: new Date().toISOString(),
      });

      console.log(`[ER-billing][${alertType}] Email sent to ${data.email} (${data.companyName || data.contactPerson}) — ${data.plan || "Enterprise"}, id=${result.id || "unknown"}`);
      entBillSent++;
    } catch (err) {
      console.error(`Failed to send ER billing email to ${data.email}:`, err);
    }
  }

  // ── Enterprise Pending Consultation Notifications ──
  console.log("Checking enterprise consultations...");

  const enterpriseSnapshot = await db.collection("enterpriseConsultations").get();
  let enterpriseSent = 0;
  let enterpriseSkipped = 0;
  const now = new Date();
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  for (const doc of enterpriseSnapshot.docs) {
    const data = { id: doc.id, ...doc.data() };

    if (data.status !== "pending") {
      enterpriseSkipped++;
      continue;
    }

    if (!data.createdAt || !data.email) {
      enterpriseSkipped++;
      continue;
    }

    const createdAt = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
    const daysPending = (now.getTime() - createdAt.getTime()) / SEVEN_DAYS_MS;

    if (daysPending < 1) {
      enterpriseSkipped++;
      continue;
    }

    const alertType = data.enterpriseAlertType || null;
    if (alertType === "7_day_pending" && daysPending < 2) {
      enterpriseSkipped++;
      continue;
    }
    if (alertType === "14_day_pending" && daysPending < 3) {
      enterpriseSkipped++;
      continue;
    }

    const pendingDays = Math.floor(daysPending * 7);
    let newAlertType;
    if (pendingDays >= 14) {
      newAlertType = "14_day_pending";
    } else if (pendingDays >= 7) {
      newAlertType = "7_day_pending";
    } else {
      enterpriseSkipped++;
      continue;
    }

    if (alertType === newAlertType) {
      enterpriseSkipped++;
      continue;
    }

    const enterpriseSubject = `Enterprise Consultation Pending — ${data.companyName || "Unknown"}`;
    const enterpriseHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;background:#121212;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121212;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:16px;border:2px solid rgba(202,169,76,0.3);box-shadow:0 0 40px rgba(202,169,76,0.15);">
          <tr>
            <td align="center" style="padding:36px 32px 12px;">
              <img src="https://shieldintelligence.in/logo512.png" alt="SHIELD Intelligence" width="100" height="100" style="display:block;margin:0 auto 12px;border-radius:12px;" />
              <h1 style="margin:0;font-size:26px;font-weight:900;color:#caa94c;letter-spacing:3px;">SHIELD INTELLIGENCE</h1>
            </td>
          </tr>
          <tr><td style="padding:0 32px;"><div style="height:2px;background:linear-gradient(90deg,transparent,rgba(202,169,76,0.5),transparent);"></div></td></tr>
          <tr>
            <td style="padding:32px 32px;">
              <p style="margin:0 0 10px;font-size:15px;color:#aaa;">Admin Notification,</p>
              <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#caa94c;">Enterprise Consultation Pending</h2>
              <p style="margin:0 0 10px;font-size:15px;color:#d4d4d4;line-height:1.7;">An enterprise consultation request from <strong>${data.companyName || "Unknown"}</strong> has been pending for <strong>${pendingDays} days</strong>.</p>
              <table role="presentation" width="100%" cellpadding="14" cellspacing="0" style="background:rgba(202,169,76,0.05);border-radius:12px;border:1px solid rgba(202,169,76,0.18);margin-bottom:28px;">
                <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(202,169,76,0.1);"><span style="color:#888;font-size:13px;">Company</span><br><span style="color:#f0f0f0;font-size:15px;font-weight:600;">${data.companyName || "—"}</span></td></tr>
                <tr><td style="padding:12px 16px;border-bottom:1px solid rgba(202,169,76,0.1);"><span style="color:#888;font-size:13px;">Contact</span><br><span style="color:#f0f0f0;font-size:15px;font-weight:600;">${data.contactPerson || "—"} (${data.email || "—"})</span></td></tr>
                <tr><td style="padding:12px 16px;"><span style="color:#888;font-size:13px;">Project</span><br><span style="color:#f0f0f0;font-size:15px;font-weight:600;">${data.projectTitle || "—"}</span></td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 32px 32px;">
              <div style="height:1px;background:rgba(202,169,76,0.15);margin-bottom:16px;"></div>
              <p style="margin:0;font-size:11px;color:#666;">This is an automated notification from SHIELD Intelligence.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

    try {
      const result = await resend.emails.send({
        from: FROM_EMAIL,
        to: data.email,
        subject: enterpriseSubject,
        html: enterpriseHtml,
      });

      if (!result || result.error) {
        console.error(`[Enterprise] Resend returned error:`, result?.error);
        continue;
      }

      await db.collection("enterpriseConsultations").doc(doc.id).update({
        enterpriseAlertType: newAlertType,
        enterpriseAlertSentAt: new Date().toISOString(),
      });

      console.log(`[Enterprise] Pending notification sent to ${data.email} (${data.companyName}) — ${pendingDays} days pending`);
      enterpriseSent++;
    } catch (err) {
      console.error(`Failed to send enterprise notification to ${data.email}:`, err);
    }
  }

  console.log(`Enterprise Pending — Sent: ${enterpriseSent}, Skipped: ${enterpriseSkipped}`);
  console.log(`Enterprise Billing — Sent: ${entBillSent}, Skipped: ${entBillSkipped}`);
  console.log(`Done. Service — Sent: ${sent}, Skipped: ${skipped} | ER Pending — Sent: ${enterpriseSent}, Skipped: ${enterpriseSkipped} | ER Billing — Sent: ${entBillSent}, Skipped: ${entBillSkipped}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
