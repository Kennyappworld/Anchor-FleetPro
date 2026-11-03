const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { sendEmail } = require('../services/emailService');
const { activateFromPaystack } = require('../controllers/subscriptionController');

function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY; // Paystack uses secret key for webhook too
  const given = req.headers['x-paystack-signature'];
  if (!secret || !given || !Buffer.isBuffer(req.body)) return false;
  const expected = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(given));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

router.post('/paystack', async (req, res) => {
  if (!verifyPaystackSignature(req)) {
    logger.warn('[WEBHOOK] Invalid Paystack signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  let event;
  try { event = JSON.parse(req.body.toString()); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  logger.info(`[WEBHOOK] Paystack event: ${event.event}`);
  res.status(200).json({ received: true }); // Always 200 first — Paystack requires it

  try {
    switch (event.event) {

      
      case 'charge.success': {
        const data = event.data;
        const ref = data.reference;

        // Invoice payment?
        const invoice = await prisma.invoice.findFirst({ where: { paystackRef: ref } });
        if (invoice) {
          if (Number(data.amount) < Math.round(Number(invoice.totalAmount) * 100)) {
            logger.warn(`[WEBHOOK] Invoice ${invoice.invoiceNumber}: amount paid is less than the invoice — not marked paid`);
            break;
          }
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { paymentConfirmed: true, paidAt: new Date(), paystackTrxRef: String(data.id || '') },
          });
          logger.info(`[WEBHOOK] Invoice payment confirmed: ${ref}`);
          break;
        }

        // Subscription payment — only with our own metadata and the right amount.
        // (It used to activate a plan for any payment from a fleet's email, of any size.)
        const result = await activateFromPaystack(data, 'webhook');
        if (result.error) logger.warn(`[WEBHOOK] charge.success ${ref} not applied: ${result.error}`);
        else if (result.duplicate) logger.info(`[WEBHOOK] charge.success ${ref} already processed`);
        else logger.info(`[WEBHOOK] Subscription applied for payment ${ref}`);
        break;
      }

      
      case 'subscription.create':
      case 'invoice.payment_failed': {
        if (event.event === 'invoice.payment_failed') {
          const email = event.data?.customer?.email;
          const vendor = await prisma.vendor.findFirst({ where: { users: { some: { email } } } });
          if (vendor) {
            const users = await prisma.user.findMany({ where: { vendorId: vendor.id, active: true } });
            for (const u of users) {
              sendEmail({
                to: u.email,
                subject: '⚠️ FleetAnchor Pro — Payment Failed',
                html: `<h2>Payment Failed</h2><p>We couldn't process your subscription renewal payment. Please update your payment method to keep access active.</p><p><a href="${process.env.FRONTEND_URL}/vendor/subscription">Update Payment →</a></p>`,
              }).catch(() => {});
            }
            logger.warn(`[WEBHOOK] Payment failed for ${email}`);
          }
        }
        break;
      }

      
      case 'subscription.disable': {
        const subCode = event.data.subscription_code;
        const sub = await prisma.subscription.findFirst({ where: { paystackSubCode: subCode } });
        if (sub) {
          await prisma.subscription.update({
            where: { id: sub.id },
            data: { status: 'CANCELLED', autoRenew: false, cancelledAt: new Date() },
          });
          // Only suspend vendor if no other active subscription
          const otherActive = await prisma.subscription.count({
            where: { vendorId: sub.vendorId, status: 'ACTIVE', id: { not: sub.id } },
          });
          if (!otherActive) {
            await prisma.vendor.update({ where: { id: sub.vendorId }, data: { status: 'SUSPENDED' } });
            const users = await prisma.user.findMany({ where: { vendorId: sub.vendorId, active: true } });
            for (const u of users) {
              sendEmail({
                to: u.email,
                subject: 'FleetAnchor Pro — Subscription Ended',
                html: `<h2>Your subscription has ended</h2><p>Your FleetAnchor Pro subscription has been cancelled. <a href="${process.env.FRONTEND_URL}/vendor/subscription">Renew here</a> to restore access.</p>`,
              }).catch(() => {});
            }
          }
          logger.warn(`[WEBHOOK] Subscription ${subCode} disabled`);
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
