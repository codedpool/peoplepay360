const { prisma } = require("../lib/prisma");

// SMTP is mocked for the demo (Stage 5.3 of plan.md) — no real network call
// is made. What matters for the demo/audit story is that a "sent" event is a
// real, queryable row, not a console.log that vanishes: every send writes an
// AuditLog entry, so "did employee X actually get their payslip email" has a
// real answer. Swapping in a real SMTP client later only needs a new
// implementation of sendMail() with the same signature — everything above
// this function (the worker, the audit write) stays the same.
async function sendMail({ to, subject, body, actorUserId = null }) {
  // Real send would go here (nodemailer + real SMTP creds). Logged instead.
  console.log(`[mailer:stub] To: ${to} | Subject: ${subject}`);

  await prisma.auditLog.create({
    data: {
      actorUserId,
      action: "mail.sent",
      entityType: "Email",
      entityId: to,
      before: null,
      after: { to, subject, bodyPreview: body.slice(0, 200) },
    },
  });

  return { sent: true, to, subject };
}

module.exports = { sendMail };
