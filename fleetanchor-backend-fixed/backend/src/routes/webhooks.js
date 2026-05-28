const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const emailService = require('../services/emailService');
const auditService = require('../services/auditService');
const logger = require('../config/logger');

const prisma = new PrismaClient();

// ─── Verify Paystack webhook signature ────────────────────────────────────────
const verifyPaystackSignature = (req) => {
  const hash = crypto
    .createHmac('sha512', process.env.PAYSTACK_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');
  return hash === req.headers['x-paystack-signature'];
};

// ─── PAYSTACK WEBHOOK ─────────────────────────────────────────────────────────
router.post('/paystack', async (req, res) => {
  if (!verifyPaystackSignature(req)) {
    logger.warn('[WEBHOOK] Invalid Paystack signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  logger.info(`[WEBHOOK] Paystack event: ${event.event}`);
  res.status(200).json({ received: true }); // Always respond 200 first

  try {
    switch (event.event) {
      // ─── Subscription payment successful ─────────────────────────────────
      case 'subscription.create':
      case 'charge.success': {
        const data = event.data;
        const ref = data.reference;
        const email = data.customer?.email;
        const amount = data.amount / 100; // Paystack sends in kobo

        // Determine plan from amount
        let plan = 'GROWTH';
        if (amount >= 250000) plan = 'ENTERPRISE';
        if (amount >= 500000) plan = 'OEM_WHITE_LABEL';

        const vendor = await prisma.vendor.findFirst({ where: { users: { some: { email } } } });
        if (vendor) {
          const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
          await prisma.subscription.upsert({
            where: { id: `${vendor.id}-active` },
            create: {
              id: `${vendor.id}-active`,
              vendorId: vendor.id,
              plan,
              startDate: new Date(),
              expiryDate,
              status: 'ACTIVE',
              paystackSubCode: data.subscription_code,
              paystackEmail: email,
              warningAt7Days: false,
              warningAt3Days: false,
            },
            update: {
              plan,
              startDate: new Date(),
              expiryDate,
              status: 'ACTIVE',
              paystackSubCode: data.subscription_code,
              warningAt7Days: false,
              warningAt3Days: false,
            },
          });
          await prisma.vendor.update({ where: { id: vendor.id }, data: { status: 'ACTIVE' } });
          logger.info(`[WEBHOOK] Subscription activated for vendor ${vendor.id} — ${plan}`);
        }

        // Check if this matches a job invoice
        const invoice = await prisma.invoice.findFirst({ where: { paystackRef: ref } });
        if (invoice) {
          await prisma.invoice.update({ where: { id: invoice.id }, data: { paymentConfirmed: true, paidAt: new Date(), paystackTrxRef: data.id?.toString() } });
          await prisma.jobRequest.update({ where: { id: invoice.jobId }, data: { status: 'AWAITING_PAYMENT', paymentAt: new Date() } });
          logger.info(`[WEBHOOK] Invoice ${invoice.invoiceNumber} payment confirmed`);
        }

        await auditService.log({ actorLabel: 'paystack', action: 'PAYMENT_RECEIVED', entityType: 'payment', metadata: { ref, amount, plan } });
        break;
      }

      // ─── Subscription disabled ────────────────────────────────────────────
      case 'subscription.disable': {
        const subCode = event.data.subscription_code;
        const sub = await prisma.subscription.findFirst({ where: { paystackSubCode: subCode } });
        if (sub) {
          await prisma.subscription.update({ where: { id: sub.id }, data: { status: 'EXPIRED', autoRenew: false } });
          await prisma.vendor.update({ where: { id: sub.vendorId }, data: { status: 'EXPIRED' } });
          const users = await prisma.user.findMany({ where: { vendorId: sub.vendorId, role: 'FLEET_MANAGER', active: true } });
          for (const u of users) {
            await emailService.sendAccountSuspended({ to: u.email, name: u.fullName, reason: 'Paystack subscription cancelled' });
          }
          logger.warn(`[WEBHOOK] Subscription ${subCode} disabled → vendor suspended`);
        }
        break;
      }

      default:
        logger.info(`[WEBHOOK] Unhandled event: ${event.event}`);
    }
  } catch (err) {
    logger.error('[WEBHOOK] Processing error:', err.message);
  }
});

module.exports = router;
