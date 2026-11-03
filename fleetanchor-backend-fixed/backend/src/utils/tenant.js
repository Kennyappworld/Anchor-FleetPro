// Tenant scoping — the single source of truth for "which records may this user touch".
//
// Before this file each controller had its own tenantFilter() that read
// req.user.tenantId, which authenticate() never set. Prisma treats an undefined
// filter value as "no filter", so OEM admins and workshop staff could read and
// change every tenant's data. These helpers scope by oemId / vendorId instead,
// and fall back to an id that matches nothing when the user has none.

const prisma = require('../config/prisma');

const NO_MATCH = '00000000-0000-0000-0000-000000000000';
const OEM_ROLES = ['OEM_ADMIN', 'WORKSHOP_STAFF'];
const VENDOR_ROLES = ['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'FIELD_AGENT', 'DRIVER'];

const isSuper = (u) => u?.role === 'SUPER_ADMIN';
const isOem = (u) => OEM_ROLES.includes(u?.role);
const oemOf = (u) => u?.oemId || NO_MATCH;
const vendorOf = (u) => u?.vendorId || NO_MATCH;

// prisma.vendor
const vendorWhere = (u) => (isSuper(u) ? {} : isOem(u) ? { oemId: oemOf(u) } : { id: vendorOf(u) });
// prisma.vehicle (and anything with a vendorId + vendor relation)
const vehicleWhere = (u) => (isSuper(u) ? {} : isOem(u) ? { vendor: { oemId: oemOf(u) } } : { vendorId: vendorOf(u) });
// prisma.jobRequest
const jobWhere = (u) => (isSuper(u) ? {} : { vehicle: vehicleWhere(u) });
// prisma.invoice / prisma.estimate (both hang off a job)
const viaJobWhere = (u) => (isSuper(u) ? {} : { job: jobWhere(u) });
// prisma.user
const userWhere = (u) =>
  isSuper(u) ? {} : isOem(u) ? { OR: [{ oemId: oemOf(u) }, { vendor: { oemId: oemOf(u) } }] } : { vendorId: vendorOf(u) };
// prisma.subscription / driverSignupRequest / passwordResetRequest (vendorId + vendor)
const vendorOwnedWhere = (u) => (isSuper(u) ? {} : isOem(u) ? { vendor: { oemId: oemOf(u) } } : { vendorId: vendorOf(u) });

// Resolve the vendor a write should land on, refusing vendors outside the caller's reach.
// Returns the vendor id, or null when the caller may not use it.
async function resolveVendorId(u, requestedVendorId) {
  if (VENDOR_ROLES.includes(u?.role)) return u.vendorId || null;
  if (!requestedVendorId) return null;
  const v = await prisma.vendor.findFirst({ where: { id: String(requestedVendorId), deletedAt: null, ...vendorWhere(u) }, select: { id: true } });
  return v ? v.id : null;
}

// Role ladder used when one user acts on another (suspend, reset, change role).
const RANK = { DRIVER: 0, FIELD_AGENT: 1, MAINTENANCE_SUPERVISOR: 2, FLEET_MANAGER: 3, WORKSHOP_STAFF: 4, OEM_ADMIN: 5, SUPER_ADMIN: 6 };
const outranks = (actorRole, targetRole) => (RANK[actorRole] ?? -1) > (RANK[targetRole] ?? 99);

module.exports = {
  NO_MATCH, OEM_ROLES, VENDOR_ROLES, isSuper, isOem,
  vendorWhere, vehicleWhere, jobWhere, viaJobWhere, userWhere, vendorOwnedWhere,
  resolveVendorId, RANK, outranks,
};
