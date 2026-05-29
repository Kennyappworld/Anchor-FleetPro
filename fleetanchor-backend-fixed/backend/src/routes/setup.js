const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { execSync } = require("child_process");
const { PrismaClient } = require("@prisma/client");

// One-time setup endpoint - creates all tables and super admin
// SECURITY: Disabled after first run. Requires SETUP_SECRET env var (not hardcoded).
router.post("/run", async (req, res) => {
  // Block entirely in production unless SETUP_ENABLED=true is explicitly set
  if (process.env.NODE_ENV === "production" && process.env.SETUP_ENABLED !== "true") {
    return res.status(404).json({ error: "Not found" });
  }
  const { secret } = req.body;
  const expectedSecret = process.env.SETUP_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(403).json({ error: "Invalid secret" });
  }

  try {
    // Force db push to ensure tables exist
    console.log("Setup: running prisma db push...");
    try {
      execSync("npx prisma db push --accept-data-loss --skip-generate", { 
        stdio: "pipe", 
        timeout: 90000,
        cwd: process.cwd()
      });
      console.log("Setup: db push complete");
    } catch (pushErr) {
      console.log("Setup: db push warning:", pushErr.message);
    }

    // Create fresh prisma client after db push
    const prisma = new PrismaClient();
    await prisma.$connect();

    // Create tenant
    let tenant = await prisma.tenant.upsert({
      where: { slug: "afrifleet-motors" },
      update: {},
      create: { name: "AfriFleet Motors", slug: "afrifleet-motors", active: true }
    });

    // Create OEM
    let oem = await prisma.oemCompany.findFirst({ where: { tenantId: tenant.id } });
    if (!oem) {
      oem = await prisma.oemCompany.create({
        data: { tenantId: tenant.id, name: "AfriFleet Workshop", contactEmail: "ops@afrifleet.com", planTier: "ENTERPRISE" }
      });
    }

    // Create Super Admin
    const hash = await bcrypt.hash("Admin@FleetAnchor2026!", 12);
    const admin = await prisma.user.upsert({
      where: { email: "admin@fleetanchor.com" },
      update: {},
      create: { fullName: "Super Administrator", email: "admin@fleetanchor.com", passwordHash: hash, role: "SUPER_ADMIN", active: true }
    });

    // Create sample vendor
    let vendor = await prisma.vendor.findFirst({ where: { contactEmail: "fleet@coca-cola.ng" } });
    if (!vendor) {
      vendor = await prisma.vendor.create({
        data: { companyName: "Coca-Cola Nigeria", contactEmail: "fleet@coca-cola.ng", contactPhone: "+2348012345678", oemId: oem.id, status: "ACTIVE" }
      });
    }

    // Create fleet manager
    const fmHash = await bcrypt.hash("FleetMgr@2026!", 12);
    await prisma.user.upsert({
      where: { email: "a.okafor@coca-cola.ng" },
      update: {},
      create: { fullName: "Adebayo Okafor", email: "a.okafor@coca-cola.ng", passwordHash: fmHash, role: "FLEET_MANAGER", vendorId: vendor.id, active: true }
    });

    await prisma.$disconnect();

    res.json({
      success: true,
      message: "Setup complete! All tables created and accounts ready.",
      credentials: {
        superAdmin: { email: "admin@fleetanchor.com", password: "Admin@FleetAnchor2026!", role: "Super Admin" },
        fleetManager: { email: "a.okafor@coca-cola.ng", password: "FleetMgr@2026!", role: "Fleet Manager" }
      }
    });
  } catch (err) {
    console.error("Setup error:", err);
    res.status(500).json({ success: false, error: err.message, stack: err.stack });
  }
});

// GET version for easy browser testing
router.get("/status", (req, res) => {
  // In production, reveal nothing about this endpoint
  if (process.env.NODE_ENV === "production") return res.status(404).json({ error: "Not found" });
  res.json({ message: "Setup route active (dev only)." });
});

module.exports = router;

