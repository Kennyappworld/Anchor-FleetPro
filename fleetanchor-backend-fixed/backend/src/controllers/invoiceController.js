const prisma = require('../config/prisma');
const { sendEmail } = require('../services/emailService');
const { logAction } = require('../services/auditService');
const { generateInvoiceNumber } = require('../utils/generators');
const { escHtml } = require('../utils/sanitize');
const { viaJobWhere, jobWhere } = require('../utils/tenant');

// The relation on Invoice is `job` (the code used `jobRequest`, which made every
// invoice query fail). Responses still carry `jobRequest` for the web app.
const tenantFilter = (req) => viaJobWhere(req.user);
const withAlias = (inv) => (inv ? { ...inv, jobRequest: inv.job } : inv);

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, paymentStatus } = req.query;
    const paymentFilter = paymentStatus === 'paid' ? { paymentConfirmed: true }
      : paymentStatus === 'pending' ? { paymentConfirmed: false } : {};
    const where = { ...tenantFilter(req), ...paymentFilter };
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where, skip: (Math.max(parseInt(page) || 1, 1) - 1) * Math.min(Math.max(parseInt(limit) || 50, 1), 100), take: Math.min(Math.max(parseInt(limit) || 50, 1), 100),
        include: {
          job: {
            include: { vehicle: { select: { vin: true, plateNumber: true, make: true, model: true, vendor: { select: { companyName: true } } } }, createdBy: { select: { fullName: true } } },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);
    res.json({ success: true, data: invoices.map(withAlias), total, page: +page });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
      include: {
        job: {
          include: {
            vehicle: true,
            estimates: { where: { status: 'APPROVED' }, take: 1 },
            createdBy: { select: { fullName: true } },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, data: withAlias(invoice) });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { jobId } = req.body;
    // 'COMPLETED' is not a job status in the schema, so invoicing never worked.
    const job = await prisma.jobRequest.findFirst({
      where: { id: jobId, status: 'REPAIR_COMPLETE', ...jobWhere(req.user) },
      include: { estimates: { where: { status: 'APPROVED' }, take: 1 }, invoices: { take: 1 } },
    });
    if (!job) return res.status(400).json({ success: false, error: 'Job must be repair-complete and have an approved estimate' });
    if (job.invoices.length) return res.status(409).json({ success: false, error: 'This job already has an invoice' });

    const estimate = job.estimates[0];
    if (!estimate) return res.status(400).json({ success: false, error: 'No approved estimate found' });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: await generateInvoiceNumber(),
        jobId,
        partsCost: estimate.partsCost,
        labourCost: estimate.labourCost,
        totalAmount: estimate.totalCost,
        issuedAt: new Date(),
        paymentConfirmed: false,
      },
    });
    await prisma.jobRequest.update({ where: { id: jobId }, data: { status: 'AWAITING_PAYMENT' } });
    await logAction(req, 'INVOICE_CREATED', 'Invoice', invoice.id, { jobId, total: estimate.totalCost });
    res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

exports.confirmPayment = async (req, res, next) => {
  try {
    const { paystackRef } = req.body;
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, ...tenantFilter(req) } });
    if (!existing) return res.status(404).json({ success: false, error: 'Invoice not found' });
    if (existing.paymentConfirmed) return res.status(409).json({ success: false, error: 'Payment already confirmed' });

    const invoice = await prisma.invoice.update({
      where: { id: existing.id },
      data: { paymentConfirmed: true, paidAt: new Date(), paystackRef: paystackRef || existing.paystackRef },
      include: { job: { include: { vehicle: { include: { vendor: { include: { users: { where: { role: 'FLEET_MANAGER', active: true }, take: 2 } } } } } } } },
    });

    // 'PAYMENT_CONFIRMED' is not a job status in the schema; CLOSED + paymentAt is.
    await prisma.jobRequest.update({ where: { id: invoice.jobId }, data: { status: 'CLOSED', paymentAt: new Date(), closedAt: new Date() } });

    const amount = Number(invoice.totalAmount || 0).toLocaleString('en-NG', { style: 'currency', currency: 'NGN' });
    for (const user of invoice.job.vehicle.vendor.users) {
      sendEmail({
        to: user.email,
        subject: `Payment confirmed — ${invoice.invoiceNumber}`,
        html: `<p>Hi ${escHtml(user.fullName)},</p><p>Payment of <strong>${escHtml(amount)}</strong> for invoice <strong>${escHtml(invoice.invoiceNumber)}</strong> has been confirmed. Thank you.</p>`,
      }).catch(() => {});
    }
    await logAction(req, 'PAYMENT_CONFIRMED', 'Invoice', req.params.id, { paystackRef });
    res.json({ success: true, data: withAlias(invoice) });
  } catch (err) { next(err); }
};

exports.downloadPDF = async (req, res, next) => {
  try {
    const { hideCost = false } = req.query;
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
      include: {
        job: {
          include: {
            vehicle: { include: { vendor: true } },
            estimates: { where: { status: 'APPROVED' }, take: 1 },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

    // Generate PDF with puppeteer
    let puppeteer;
    try { puppeteer = require('puppeteer'); } catch {
      return res.status(503).json({ success: false, error: 'PDF export is not available on this server' });
    }
    const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    const html = buildInvoiceHTML(invoice, hideCost === 'true' || hideCost === true);
    // The page is built from our own escaped data; block it from loading anything.
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith('data:') || r.url() === 'about:blank' ? r.continue() : r.abort()));
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    await logAction(req, 'INVOICE_DOWNLOADED', 'Invoice', req.params.id, { hideCost });

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${String(invoice.invoiceNumber).replace(/[^A-Za-z0-9._-]/g, '')}.pdf"` });
    res.send(pdf);
  } catch (err) { next(err); }
};

function buildInvoiceHTML(inv, hideCost) {
  const job = inv.job;
  const e = escHtml;
  const vehicle = job.vehicle;
  const vendor = vehicle.vendor;
  const estimate = job.estimates[0] || {};

  const costSection = hideCost ? '' : `
    <tr><td>Parts</td><td align="right">₦${Number(inv.partsCost || 0).toLocaleString()}</td></tr>
    <tr><td>Labour</td><td align="right">₦${Number(inv.labourCost || 0).toLocaleString()}</td></tr>
    <tr style="font-weight:bold;font-size:16px"><td>Total</td><td align="right">₦${Number(inv.totalAmount || 0).toLocaleString()}</td></tr>
  `;

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>body{font-family:Arial,sans-serif;padding:40px;color:#222}
  .header{display:flex;justify-content:space-between;margin-bottom:40px}
  .logo{font-size:24px;font-weight:900;color:#F5A623}
  .inv-no{font-size:14px;color:#666}
  table{width:100%;border-collapse:collapse;margin-top:20px}
  td{padding:10px;border-bottom:1px solid #eee}
  .section{margin-top:30px;font-weight:bold;font-size:13px;color:#999;text-transform:uppercase}
  .paid{color:#2ECC71;font-weight:bold;font-size:18px;border:3px solid #2ECC71;padding:4px 16px;display:inline-block;transform:rotate(-5deg);margin-top:20px}
  </style></head><body>
  <div class="header">
    <div><div class="logo">⚓ FleetAnchor Pro</div><div style="color:#666;font-size:13px;margin-top:4px">Maintenance Invoice</div></div>
    <div style="text-align:right">
      <div class="inv-no">${e(inv.invoiceNumber)}</div>
      <div style="font-size:13px;color:#666">Issued: ${new Date(inv.issuedAt).toLocaleDateString('en-NG')}</div>
      ${inv.paymentConfirmed ? '<div class="paid">PAID</div>' : '<div style="color:#E84B4B;font-weight:bold;margin-top:8px">PAYMENT PENDING</div>'}
    </div>
  </div>
  <div class="section">Bill To</div>
  <div><strong>${e(vendor.companyName)}</strong><br>${e(vendor.contactEmail || '')}</div>
  <div class="section">Vehicle</div>
  <table><tr><td>VIN</td><td>${e(vehicle.vin)}</td></tr>
  <tr><td>Plate</td><td>${e(vehicle.plateNumber)}</td></tr>
  <tr><td>Make / Model</td><td>${e(vehicle.make)} ${e(vehicle.model)} ${e(vehicle.year)}</td></tr></table>
  <div class="section">Services</div>
  <table><tr><td><strong>Job</strong></td><td>${e(job.category)} — ${e(job.description)}</td></tr>
  ${costSection}</table>
  ${hideCost ? '<p style="color:#999;font-size:11px;margin-top:20px"><em>Cost details withheld for audit export</em></p>' : ''}
  </body></html>`;
}
