const nodemailer = require('nodemailer');

function getTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null;
  return nodemailer.createTransporter({
    host: SMTP_HOST,
    port: Number(SMTP_PORT) || 587,
    secure: (Number(SMTP_PORT) || 587) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    from: SMTP_FROM || SMTP_USER,
  });
}

async function sendWeeklyReport({ to, shop, stats, period = 'last 7 days' }) {
  const t = getTransporter();
  if (!t) throw new Error('SMTP not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS.');
  const subject = `Size Guide + Fit Finder weekly report for ${shop}`;
  const body = `
Hi,

Here is your weekly ${period} summary for Size Guide + Fit Finder on ${shop}:

- Size guide opens: ${stats.size_guide_opens || 0}
- Fit finder submissions: ${stats.fit_finder_submits || 0}
- Measurements saved: ${stats.measurements_saved || 0}
- Total events: ${stats.total_events || 0}

Top recommended sizes:
${(stats.top_sizes || []).map(s => `- ${s.size}: ${s.count}`).join('\n') || 'No data'}

Open your admin dashboard for more details.

Thanks,
Size Guide + Fit Finder
`.trim();
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: body,
  });
  return { sent: true };
}

module.exports = { sendWeeklyReport, getTransporter };
