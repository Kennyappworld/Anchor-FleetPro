const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

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
  const superAdminHash = await bcrypt.hash(process.env.SUPER_ADMIN_PASSWORD || 'Change@Me123!', 12);
  const superAdmin = await prisma.user.upsert({
    where: { email: process.env.SUPER_ADMIN_EMAIL || 'admin@afrifleet.com' },
    update: {},
    create: {
      fullName: 'Super Administrator',
      email: process.env.SUPER_ADMIN_EMAIL || 'admin@afrifleet.com',
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
      oemCompanyId: oem.id,
      status: 'ACTIVE',
    },
  });
  console.log('✅ Vendor:', vendor.companyName);

  // 5. Fleet Manager for vendor
  const fmHash = await bcrypt.hash('FleetMgr@2026!', 12);
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
    },
  });
  console.log('✅ Fleet Manager:', fleetManager.fullName);

  // 6. Workshop Staff
  const staffHash = await bcrypt.hash('WorkShop@2026!', 12);
  await prisma.user.upsert({
    where: { email: 'e.nwosu@afrifleet.com' },
    update: {},
    create: {
      fullName: 'Emeka Nwosu',
      email: 'e.nwosu@afrifleet.com',
      passwordHash: staffHash,
      role: 'WORKSHOP_STAFF',
      active: true,
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
  console.log(`Super Admin: ${superAdmin.email} / ${process.env.SUPER_ADMIN_PASSWORD || 'Change@Me123!'}`);
  console.log(`Fleet Manager: ${fleetManager.email} / FleetMgr@2026!`);
  console.log('─────────────────────────────────────────────');
  console.log('⚠️  Change all passwords in production!');
}

main().catch(console.error).finally(() => prisma.$disconnect());
