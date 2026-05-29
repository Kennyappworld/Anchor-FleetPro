const { PrismaClient } = require('@prisma/client');
const { logAction } = require('../services/auditService');
const { sendEmail } = require('../services/emailService');
const { generateInvoiceNumber } = require('../utils/generators');
const prisma = new PrismaClient();

function tenantFilter(req) {
  const { role, vendorId, tenantId } = req.user;
  if (role === 'SUPER_ADMIN') return {};
  if (role === 'OEM_ADMIN' || role === 'WORKSHOP_STAFF') return { jobRequest: { vehicle: { vendor: { oem: { tenantId } } } } };
  return { jobRequest: { vehicle: { vendorId } } };
}

exports.list = async (req, res, next) => {
  try {
    const { page = 1, limit = 50, paymentStatus } = req.query;
    const paymentFilter = paymentStatus === 'paid' ? { paymentConfirmed: true }
      : paymentStatus === 'pending' ? { paymentConfirmed: false } : {};
    const where = { ...tenantFilter(req), ...paymentFilter };
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where, skip: (page - 1) * limit, take: +limit,
        include: {
          jobRequest: {
            include: { vehicle: { select: { vin: true, plateNumber: true } }, createdBy: { select: { fullName: true } } },
          },
        },
        orderBy: { issuedAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);
    res.json({ success: true, data: invoices, total, page: +page });
  } catch (err) { next(err); }
};

exports.getOne = async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
      include: {
        jobRequest: {
          include: {
            vehicle: true,
            estimates: { where: { status: 'APPROVED' }, take: 1 },
            createdBy: { select: { fullName: true } },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const { jobId } = req.body;
    const job = await prisma.jobRequest.findFirst({
      where: { id: jobId, status: 'COMPLETED' },
      include: { estimates: { where: { status: 'APPROVED' }, take: 1 } },
    });
    if (!job) return res.status(400).json({ success: false, error: 'Job must be completed and have approved estimate' });

    const estimate = job.estimates[0];
    if (!estimate) return res.status(400).json({ success: false, error: 'No approved estimate found' });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: generateInvoiceNumber(),
        jobId,
        partsTotal: estimate.partsTotal,
        labourTotal: estimate.labourTotal,
        totalAmount: estimate.totalCost,
        issuedAt: new Date(),
        paymentConfirmed: false,
      },
    });
    await logAction(req, 'INVOICE_CREATED', 'Invoice', invoice.id, { jobId, total: estimate.totalCost });
    res.status(201).json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

exports.confirmPayment = async (req, res, next) => {
  try {
    const { paystackRef } = req.body;
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { paymentConfirmed: true, paidAt: new Date(), paystackRef },
      include: { jobRequest: { include: { vehicle: { include: { vendor: { include: { users: { take: 2 } } } } } } } },
    });

    await prisma.jobRequest.update({ where: { id: invoice.jobId }, data: { status: 'PAYMENT_CONFIRMED' } });

    for (const user of invoice.jobRequest.vehicle.vendor.users) {
      await sendEmail(user.email, 'paymentConfirmed', {
        name: user.fullName,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.totalAmount.toLocaleString('en-NG', { style: 'currency', currency: 'NGN' }),
      });
    }
    await logAction(req, 'PAYMENT_CONFIRMED', 'Invoice', req.params.id, { paystackRef });
    res.json({ success: true, data: invoice });
  } catch (err) { next(err); }
};

exports.downloadPDF = async (req, res, next) => {
  try {
    const { hideCost = false } = req.query;
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, ...tenantFilter(req) },
      include: {
        jobRequest: {
          include: {
            vehicle: { include: { vendor: true } },
            estimates: { where: { status: 'APPROVED' }, take: 1 },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ success: false, error: 'Invoice not found' });

    // Generate PDF with puppeteer
    const puppeteer = require('puppeteer');
    const browser = await puppeteer.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const page = await browser.newPage();

    const html = buildInvoiceHTML(invoice, hideCost === 'true');
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    await logAction(req, 'INVOICE_DOWNLOADED', 'Invoice', req.params.id, { hideCost });

    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoice.invoiceNumber}.pdf"` });
    res.send(pdf);
  } catch (err) { next(err); }
};

function buildInvoiceHTML(inv, hideCost) {
  const job = inv.jobRequest;
  const vehicle = job.vehicle;
  const vendor = vehicle.vendor;
  const estimate = job.estimates[0] || {};

  const costSection = hideCost ? '' : `
    <tr><td>Parts</td><td align="right">₦${(inv.partsTotal || 0).toLocaleString()}</td></tr>
    <tr><td>Labour</td><td align="right">₦${(inv.labourTotal || 0).toLocaleString()}</td></tr>
    <tr style="font-weight:bold;font-size:16px"><td>Total</td><td align="right">₦${(inv.totalAmount || 0).toLocaleString()}</td></tr>
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
      <div class="inv-no">${inv.invoiceNumber}</div>
      <div style="font-size:13px;color:#666">Issued: ${new Date(inv.issuedAt).toLocaleDateString('en-NG')}</div>
      ${inv.paymentConfirmed ? '<div class="paid">PAID</div>' : '<div style="color:#E84B4B;font-weight:bold;margin-top:8px">PAYMENT PENDING</div>'}
    </div>
  </div>
  <div class="section">Bill To</div>
  <div><strong>${vendor.companyName}</strong><br>${vendor.email || ''}</div>
  <div class="section">Vehicle</div>
  <table><tr><td>VIN</td><td>${vehicle.vin}</td></tr>
  <tr><td>Plate</td><td>${vehicle.plateNumber}</td></tr>
  <tr><td>Make / Model</td><td>${vehicle.make} ${vehicle.model} ${vehicle.year}</td></tr></table>
  <div class="section">Services</div>
  <table><tr><td><strong>Job</strong></td><td>${job.category} — ${job.description}</td></tr>
  ${costSection}</table>
  ${hideCost ? '<p style="color:#999;font-size:11px;margin-top:20px"><em>Cost details withheld for audit export</em></p>' : ''}
  </body></html>`;
}
