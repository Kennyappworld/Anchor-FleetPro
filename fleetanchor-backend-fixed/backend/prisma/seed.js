const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const crypto = require('crypto');
const prisma = new PrismaClient();

// No passwords live in this repository. The super admin comes from environment
// variables; sample accounts get a random one-time password printed once and
// must change it at first sign-in.
const randomPassword = () => 'Fa!' + crypto.randomBytes(12).toString('base64url');
const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;
if (!SUPER_ADMIN_EMAIL || !SUPER_ADMIN_PASSWORD || SUPER_ADMIN_PASSWORD.length < 12) {
  console.error('Set SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD (12+ characters) before seeding.');
  process.exit(1);
}

async function main() {
  console.log('🌱 Seeding FleetAnchor Pro database...');

  // 1. Create platform tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'afrifleet-motors' },
    update: {},
    create: { name: 'AfriFleet Motors', slug: 'afrifleet-motors', active: true },
  });
  console.log('✅ Tenant:', tenant.name);

  // 2. Create OEM Company
  const oem = await prisma.oemCompany.upsert({
    where: { id: 'oemcomp-seed-0001' },
    update: {},
    create: { id: 'oemcomp-seed-0001', tenantId: tenant.id, name: 'AfriFleet Workshop', contactEmail: 'ops@afrifleet.com', planTier: 'ENTERPRISE' },
  });
  console.log('✅ OEM:', oem.name);

  // 3. Super Admin
  const superAdminHash = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: SUPER_ADMIN_EMAIL },
    update: {},
    create: {
      fullName: 'Super Administrator',
      email: SUPER_ADMIN_EMAIL,
      passwordHash: superAdminHash,
      role: 'SUPER_ADMIN',
      active: true,
    },
  });
  console.log('✅ Super Admin:', superAdmin.email);

  // 4. Sample Vendor
  const vendor = await prisma.vendor.upsert({
    where: { id: 'vendor-seed-0001' },
    update: {},
    create: {
      id: 'vendor-seed-0001',
      companyName: 'Coca-Cola Nigeria',
      email: 'fleet@coca-cola.ng',
      contactPhone: '+2348012345678',
      oemId: oem.id,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Vendor:', vendor.companyName);

  // 5. Fleet Manager for vendor
  const fmPassword = randomPassword();
  const fmHash = await bcrypt.hash(fmPassword, 12);
  const fleetManager = await prisma.user.upsert({
    where: { email: 'a.okafor@coca-cola.ng' },
    update: {},
    create: {
      fullName: 'Adebayo Okafor',
      email: 'a.okafor@coca-cola.ng',
      passwordHash: fmHash,
      role: 'FLEET_MANAGER',
      vendorId: vendor.id,
      active: true,
      mustChangePassword: true,
    },
  });
  console.log('✅ Fleet Manager:', fleetManager.fullName);

  // 6. Workshop Staff
  const staffPassword = randomPassword();
  const staffHash = await bcrypt.hash(staffPassword, 12);
  await prisma.user.upsert({
    where: { email: 'e.nwosu@afrifleet.com' },
    update: {},
    create: {
      fullName: 'Emeka Nwosu',
      email: 'e.nwosu@afrifleet.com',
      passwordHash: staffHash,
      role: 'WORKSHOP_STAFF',
      oemId: oem.id,
      active: true,
      mustChangePassword: true,
    },
  });
  console.log('✅ Workshop Staff seeded');

  // 7. Sample vehicle
  await prisma.vehicle.upsert({
    where: { vin: 'WNXNF4327A6000001' },
    update: {},
    create: {
      vin: 'WNXNF4327A6000001',
      plateNumber: 'LND421XY',
      make: 'Mercedes-Benz',
      model: 'Actros',
      year: 2021,
      engineNumber: 'OM471LA89234',
      vendorId: vendor.id,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Sample vehicle seeded');

  // 8. Sample subscription (Growth)
  const now = new Date();
  const expiry = new Date(now); expiry.setMonth(expiry.getMonth() + 1);
  await prisma.subscription.create({
    data: {
      vendorId: vendor.id,
      plan: 'ENTERPRISE',
      status: 'ACTIVE',
      startDate: now,
      expiryDate: expiry,
      autoRenew: true,
    },
  }).catch(() => {}); // ignore if exists

  console.log('\n🚀 Seed complete!');
  console.log('─────────────────────────────────────────────');
  console.log(`Super Admin: ${superAdmin.email} (password from SUPER_ADMIN_PASSWORD)`);
  console.log(`Fleet Manager: ${fleetManager.email} / ${fmPassword}   (one-time, must be changed)`);
  console.log(`Workshop Staff: e.nwosu@afrifleet.com / ${staffPassword}   (one-time, must be changed)`);
  console.log('─────────────────────────────────────────────');
  console.log('⚠️  Change all passwords in production!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
