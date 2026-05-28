const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// One-time setup endpoint - creates super admin
// DELETE THIS FILE after first use
router.post("/run", async (req, res) => {
  const { secret } = req.body;
  if (secret !== "fleetanchor-setup-2026") {
    return res.status(403).json({ error: "Invalid secret" });
  }

  try {
    // Create tenant
    let tenant = await prisma.tenant.findFirst({ where: { slug: "afrifleet-motors" } });
    if (!tenant) {
      tenant = await prisma.tenant.create({
        data: { name: "AfriFleet Motors", slug: "afrifleet-motors", active: true }
      });
    }

    // Create OEM
    let oem = await prisma.oemCompany.findFirst({ where: { tenantId: tenant.id } });
    if (!oem) {
      oem = await prisma.oemCompany.create({
        data: { tenantId: tenant.id, name: "AfriFleet Workshop", contactEmail: "ops@afrifleet.com", planTier: "ENTERPRISE" }
      });
    }

    // Create Super Admin
    const existing = await prisma.user.findUnique({ where: { email: "admin@fleetanchor.com" } });
    let admin;
    if (!existing) {
      const hash = await bcrypt.hash("Admin@FleetAnchor2026!", 12);
      admin = await prisma.user.create({
        data: { fullName: "Super Administrator", email: "admin@fleetanchor.com", passwordHash: hash, role: "SUPER_ADMIN", active: true }
      });
    } else {
      admin = existing;
    }

    // Create sample vendor
    let vendor = await prisma.vendor.findFirst({ where: { email: "fleet@coca-cola.ng" } });
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: { companyName: "Coca-Cola Nigeria", email: "fleet@coca-cola.ng", contactPhone: "+2348012345678", oemId: oem.id, status: "ACTIVE" }
      });
    }

    // Create fleet manager
    const fmExisting = await prisma.user.findUnique({ where: { email: "a.okafor@coca-cola.ng" } });
    if (!fmExisting) {
      const fmHash = await bcrypt.hash("FleetMgr@2026!", 12);
      await prisma.user.create({
        data: { fullName: "Adebayo Okafor", email: "a.okafor@coca-cola.ng", passwordHash: fmHash, role: "FLEET_MANAGER", vendorId: vendor.id, active: true }
      });
    }

    res.json({
      success: true,
      message: "Setup complete!",
      credentials: {
        superAdmin: { email: "admin@fleetanchor.com", password: "Admin@FleetAnchor2026!" },
        fleetManager: { email: "a.okafor@coca-cola.ng", password: "FleetMgr@2026!" }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;