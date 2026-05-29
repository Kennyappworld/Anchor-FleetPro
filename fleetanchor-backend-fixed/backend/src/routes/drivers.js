/**
 * Driver Self-Signup Flow:
 * 1. Driver opens app, enters name + phone + scans plate/VIN
 * 2. POST /api/drivers/signup → creates DriverSignupRequest (PENDING)
 * 3. Fleet Manager sees pending requests on their dashboard
 * 4. Fleet Manager approves → DRIVER account created, credentials sent via SMS/email
 * 5. Fleet Manager rejects → Driver notified
 */
const router = require('express').Router();
const { body, param } = require('express-validator');
const { validate } = require('../middleware/validate');
const { authenticate, requireRole } = require('../middleware/auth');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendEmail } = require('../services/emailService');
const { logAction } = require('../services/auditService');
const logger = require('../config/logger');

const prisma = new PrismaClient();

// ─── Public: Driver submits signup request ────────────────────────────────────
// This is the unauthenticated endpoint — the driver app calls this without a token
router.post('/signup',
  body('fullName').trim().isLength({ min: 2 }),
  body('phone').trim().notEmpty(),
  body('vehicleScan').trim().notEmpty(), // plate number or VIN
  validate,
  async (req, res, next) => {
    try {
      const { fullName, phone, email, vehicleScan } = req.body;

      // Find the vendor by matching plate number or VIN
      const normalised = vehicleScan.trim().toUpperCase().replace(/\s+/g, '');
      const vehicle = await prisma.vehicle.findFirst({
        where: {
          OR: [
            { plateNumber: { contains: normalised } },
            { vin: { contains: normalised } },
          ],
          status: 'ACTIVE',
          vendor: { deletedAt: null, status: 'ACTIVE' },
        },
        include: { vendor: { select: { id: true, companyName: true, contactEmail: true } } },
      });

      if (!vehicle) {
        return res.status(404).json({
          success: false,
          error: 'Vehicle not found. Check the plate number or chassis number and try again.',
        });
      }

      // Check no duplicate pending request for this phone + vehicle
      const existing = await prisma.driverSignupRequest.findFirst({
        where: { vendorId: vehicle.vendorId, phone, status: 'PENDING' },
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'A signup request for this phone number is already pending approval.',
        });
      }

      const request = await prisma.driverSignupRequest.create({
        data: {
          fullName,
          phone,
          email: email || null,
          vehicleScan: normalised,
          vendorId: vehicle.vendorId,
          status: 'PENDING',
        },
      });

      // Notify Fleet Manager by email
      const managers = await prisma.user.findMany({
        where: { vendorId: vehicle.vendorId, role: 'FLEET_MANAGER', active: true },
      });
      for (const mgr of managers) {
        sendEmail({
          to: mgr.email,
          subject: `🚗 New driver signup request — ${fullName}`,
          html: `
            <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto">
              <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0;text-align:center">
                <div style="font-size:20px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
              </div>
              <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px">
                <h2 style="color:#0A1628">New driver signup request</h2>
                <table style="width:100%;font-size:13px">
                  <tr><td style="color:#666;padding:5px 0;width:40%">Name</td><td><strong>${fullName}</strong></td></tr>
                  <tr><td style="color:#666;padding:5px 0">Phone</td><td>${phone}</td></tr>
                  <tr><td style="color:#666;padding:5px 0">Vehicle scanned</td><td><strong>${normalised}</strong> (${vehicle.make} ${vehicle.model})</td></tr>
                  <tr><td style="color:#666;padding:5px 0">Fleet</td><td>${vehicle.vendor.companyName}</td></tr>
                </table>
                <p style="font-size:13px;margin-top:16px">Log in to FleetAnchor Pro to approve or reject this request.</p>
                <div style="text-align:center;margin:20px 0">
                  <a href="${process.env.FRONTEND_URL}/vendor/team" style="background:#F5A623;color:#000;font-weight:700;padding:12px 28px;border-radius:8px;text-decoration:none">
                    Review Request →
                  </a>
                </div>
              </div>
            </div>
          `,
        }).catch(() => {});
      }

      res.status(201).json({
        success: true,
        message: `Signup request sent to ${vehicle.vendor.companyName}. Your fleet manager will review and approve your account.`,
        companyName: vehicle.vendor.companyName,
        vehicleFound: `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})`,
      });
    } catch (err) { next(err); }
  }
);

// ─── Get pending driver requests (Fleet Manager) ──────────────────────────────
router.get('/requests',
  authenticate,
  requireRole(['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'OEM_ADMIN', 'SUPER_ADMIN']),
  async (req, res, next) => {
    try {
      const { role, vendorId } = req.user;
      const where = role === 'SUPER_ADMIN' || role === 'OEM_ADMIN'
        ? { status: 'PENDING' }
        : { vendorId, status: 'PENDING' };

      const requests = await prisma.driverSignupRequest.findMany({
        where,
        include: { vendor: { select: { companyName: true } } },
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: requests });
    } catch (err) { next(err); }
  }
);

// ─── Approve driver signup ────────────────────────────────────────────────────
router.post('/requests/:id/approve',
  authenticate,
  requireRole(['FLEET_MANAGER', 'OEM_ADMIN', 'SUPER_ADMIN']),
  param('id').isUUID(),
  validate,
  async (req, res, next) => {
    try {
      const dsr = await prisma.driverSignupRequest.findUnique({
        where: { id: req.params.id },
        include: { vendor: true },
      });
      if (!dsr) return res.status(404).json({ success: false, error: 'Request not found' });
      if (dsr.status !== 'PENDING') return res.status(400).json({ success: false, error: 'Request already processed' });

      // Verify this Fleet Manager owns this vendor
      if (req.user.role === 'FLEET_MANAGER' && dsr.vendorId !== req.user.vendorId) {
        return res.status(403).json({ success: false, error: 'Not authorised' });
      }

      // Generate a PIN-style password (4-digit PIN + random suffix — easy to type on mobile)
      const pin = Math.floor(1000 + Math.random() * 9000);
      const tempPassword = `Driver${pin}!`;
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      // Use email or generate a phone-based username
      const emailToUse = dsr.email || `${dsr.phone.replace(/\D/g, '')}@driver.fleetanchor.com`;

      // Check if user already exists
      const existing = await prisma.user.findUnique({ where: { email: emailToUse } });
      if (existing) {
        // Just approve the request pointing to existing user
        await prisma.driverSignupRequest.update({
          where: { id: dsr.id },
          data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() },
        });
        return res.json({ success: true, message: 'Approved — driver account already exists', email: emailToUse });
      }

      const [user] = await prisma.$transaction([
        prisma.user.create({
          data: {
            fullName: dsr.fullName,
            email: emailToUse,
            passwordHash,
            role: 'DRIVER',
            vendorId: dsr.vendorId,
            oemId: dsr.vendor.oemId,
            active: true,
            mustChangePassword: true,
          },
        }),
        prisma.driverSignupRequest.update({
          where: { id: dsr.id },
          data: { status: 'APPROVED', approvedById: req.user.id, approvedAt: new Date() },
        }),
      ]);

      // Send credentials
      const loginUrl = `${process.env.FRONTEND_URL}/login`;
      if (dsr.email) {
        sendEmail({
          to: dsr.email,
          subject: '✅ FleetAnchor Pro — Your driver account is approved!',
          html: `
            <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:560px;margin:0 auto">
              <div style="background:#0A1628;padding:24px;border-radius:12px 12px 0 0;text-align:center">
                <div style="font-size:20px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
              </div>
              <div style="background:#fff;padding:28px;border-radius:0 0 12px 12px">
                <h2 style="color:#1A6A3A">You're approved, ${dsr.fullName}! 🎉</h2>
                <p>${dsr.vendor.companyName} has approved your driver account.</p>
                <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:16px 0">
                  <p style="margin:0 0 10px;font-weight:700;color:#0A1628">Your login details</p>
                  <table style="width:100%;font-size:13px">
                    <tr><td style="color:#666;padding:5px 0">App URL</td><td><a href="${loginUrl}">${loginUrl}</a></td></tr>
                    <tr><td style="color:#666;padding:5px 0">Username</td><td><strong>${emailToUse}</strong></td></tr>
                    <tr><td style="color:#666;padding:5px 0">PIN / Password</td><td><strong style="background:#FFF3DC;padding:2px 8px;border-radius:4px">${tempPassword}</strong></td></tr>
                  </table>
                </div>
                <div style="background:#FEF3CD;border:1px solid #F5A623;border-radius:8px;padding:10px 14px">
                  <p style="margin:0;font-size:12px;color:#7D4E00">⚠ Change this password when you first log in.</p>
                </div>
              </div>
            </div>
          `,
        }).catch(() => {});
      }

      await logAction(req, 'DRIVER_APPROVED', 'User', user.id, { driverName: dsr.fullName });

      res.json({
        success: true,
        message: `${dsr.fullName} approved. Login details ${dsr.email ? 'sent to their email' : 'created'}.`,
        tempPassword, // show in UI for Fleet Manager to share manually
        loginUrl,
        email: emailToUse,
      });
    } catch (err) { next(err); }
  }
);

// ─── Reject driver signup ─────────────────────────────────────────────────────
router.post('/requests/:id/reject',
  authenticate,
  requireRole(['FLEET_MANAGER', 'OEM_ADMIN', 'SUPER_ADMIN']),
  param('id').isUUID(),
  body('reason').optional().trim(),
  validate,
  async (req, res, next) => {
    try {
      const dsr = await prisma.driverSignupRequest.findUnique({ where: { id: req.params.id } });
      if (!dsr) return res.status(404).json({ success: false, error: 'Request not found' });
      await prisma.driverSignupRequest.update({
        where: { id: dsr.id },
        data: { status: 'REJECTED', rejectedReason: req.body.reason || 'Not approved by fleet manager' },
      });
      await logAction(req, 'DRIVER_REJECTED', 'DriverSignupRequest', dsr.id, { reason: req.body.reason });
      res.json({ success: true, message: 'Request rejected' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
