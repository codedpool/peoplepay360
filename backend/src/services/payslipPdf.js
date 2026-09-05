const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const { prisma } = require("../lib/prisma");

// pdf-lib draws text directly onto a page — there is no HTML/script parsing
// step in this pipeline at all, so the usual "escape before templating"
// concern for HTML-to-PDF renderers doesn't apply the same way here. The one
// real risk is control characters (newlines, etc.) inside a name/label
// breaking the fixed line layout — stripped here rather than trusted as-is.
function sanitizeLine(value) {
  return String(value ?? "").replace(/[\r\n\t]/g, " ").trim();
}

function formatMoney(amount) {
  return Number(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Renders one Payslip to a PDF buffer. Loads its own data by id rather than
// taking a pre-fetched object, so it can be called identically from the
// worker (Phase 5.3) and, later, from a synchronous "preview" route if one
// is ever added.
async function renderPayslipPdf(payslipId) {
  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      employee: true,
      contract: true,
      payrun: { include: { salaryStructure: true } },
      lines: { include: { salaryRule: true } },
    },
  });
  if (!payslip) {
    throw new Error(`Payslip ${payslipId} not found`);
  }

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = 800;
  const lineHeight = 18;

  function drawText(text, { size = 11, bold = false, x = margin, color = rgb(0.1, 0.1, 0.1) } = {}) {
    page.drawText(sanitizeLine(text), { x, y, size, font: bold ? boldFont : font, color });
    y -= lineHeight;
  }

  drawText("PeoplePay360 — Payslip", { bold: true, size: 18 });
  y -= 6;
  drawText(`Employee: ${payslip.employee.name}`, { bold: true });
  drawText(`Department: ${payslip.employee.department}    Position: ${payslip.employee.jobPosition}`);
  drawText(`Pay Run: ${payslip.payrun.name}`);
  drawText(
    `Period: ${payslip.payrun.periodStart.toISOString().slice(0, 10)} to ${payslip.payrun.periodEnd.toISOString().slice(0, 10)}`
  );
  drawText(`Structure: ${payslip.payrun.salaryStructure.name}`);
  drawText(`Status: ${payslip.status}    Worked Days: ${payslip.workedDays}`);
  y -= 10;

  drawText("Salary Computation", { bold: true, size: 13 });
  y -= 4;

  const sortedLines = [...payslip.lines].sort((a, b) => a.salaryRule.sequence - b.salaryRule.sequence);
  for (const line of sortedLines) {
    const isNet = line.salaryRule.category === "NET";
    drawText(`${line.salaryRule.name} (${line.salaryRule.code})`, {
      bold: isNet,
      x: margin,
    });
    // Draw the amount right-aligned on the same line just written.
    const amountText = formatMoney(line.amount);
    const amountWidth = (isNet ? boldFont : font).widthOfTextAtSize(amountText, 11);
    page.drawText(amountText, {
      x: 545 - amountWidth,
      y: y + lineHeight,
      size: 11,
      font: isNet ? boldFont : font,
    });
  }

  y -= 10;
  drawText(`Generated: ${new Date().toISOString()}`, { size: 9, color: rgb(0.5, 0.5, 0.5) });

  return doc.save();
}

module.exports = { renderPayslipPdf };
