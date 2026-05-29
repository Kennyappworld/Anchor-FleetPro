const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const prisma = require('../config/prisma');

const PLAN_DAYS = 30;

function verifyPaystackSignature(req) {
  const secret = process.env.PAYSTACK_SECRET_KEY; // Paystack uses secret key for webhook too
  const hash = crypto.createHmac('sha512', secret).update(req.body).digest('hex');
  return hash === req.headers['x-paystack-signature'];
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

      // ── Successful payment (one-time or recurring charge) ─────────────────
      case 'charge.success': {
        const data = event.data;
        const email = data.customer?.email;
        const amount = data.amount / 100; // kobo → naira
        const ref = data.reference;

        // Determine plan from amount
        let plan = 'GROWTH';
        if (amount >= 250000) plan = 'ENTERPRISE';

        // Check if this is a subscription payment (has metadata) or invoice payment
        const meta = data.metadata || {};

        // ── Invoice payment ────────────────────────────────────────────────
        const invoice = await prisma.invoice.findFirst({ where: { paystackRef: ref } });
        if (invoice) {
          await prisma.invoice.update({
            where: { id: invoice.id },
            data: { paymentConfirmed: true, paidAt: new Date(), paystackTrxRef: String(data.id || '') },
          });
          logger.info(`[WEBHOOK] Invoice payment confirmed: ${ref}`);
          break;
        }

        // ── Subscription payment ───────────────────────────────────────────
        const vendor = await prisma.vendor.findFirst({
          where: {
            OR: [
              meta.vendorId ? { id: meta.vendorId } : undefined,
              { users: { some: { email } } },
            ].filter(Boolean),
          },
        });

        if (!vendor) {
          logger.warn(`[WEBHOOK] charge.success — could not match vendor for email ${email}`);
          break;
        }

        // Get current active subscription for smart renewal calc
        const currentSub = await prisma.subscription.findFirst({
          where: { vendorId: vendor.id, status: { in: ['ACTIVE', 'TRIAL'] } },
          orderBy: { expiryDate: 'desc' },
        });

        // Smart start date: if current sub still has days left, new period starts after it
        const now = new Date();
        const currentExpiry = currentSub?.expiryDate ? new Date(currentSub.expiryDate) : null;
        const startDate = currentExpiry && currentExpiry > now ? currentExpiry : now;
        const expiryDate = new Date(startDate);
        expiryDate.setDate(expiryDate.getDate() + PLAN_DAYS);

        await activateSubscription({
          vendorId: vendor.id,
          plan: meta.plan || plan,
          startDate,
          expiryDate,
          paystackAuthCode: data.authorization?.authorization_code,
          paystackEmail: email,
          reference: ref,
        });

        logger.info(`[WEBHOOK] Subscription ${currentSub && currentExpiry > now ? 'renewal queued' : 'activated'} for ${vendor.companyName} — ${plan}`);
        break;
      }

      // ── Subscription auto-renewed by Paystack ──────────────────────────
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

      // ── Subscription disabled / cancelled ──────────────────────────────
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
