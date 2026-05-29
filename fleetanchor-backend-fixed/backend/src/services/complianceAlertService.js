/**
 * complianceAlertService.js
 * 
 * Sends GROUPED/BATCHED document expiry alerts.
 * Instead of one email per vehicle, groups all expiring docs for a vendor
 * into a single email — clean, professional, actionable.
 * 
 * Thresholds: 30 days, 15 days, 7 days, day-of (0 days)
 */

const prisma = require('../config/prisma');
const logger = require('../config/logger');
const { sendEmail } = require('./emailService');

const DOC_LABELS = {
  ROAD_WORTHINESS:      'Road Worthiness Certificate',
  VEHICLE_LICENCE:      'Vehicle Licence',
  INSURANCE:            'Insurance Certificate',
  HACKNEY_PERMIT:       'Hackney Permit',
  ECOWAS_BROWN_CARD:    'ECOWAS Brown Card',
  FIRE_EXTINGUISHER:    'Fire Extinguisher Certificate',
  FIRST_AID_KIT:        'First Aid Kit Certificate',
  SPEED_LIMITER:        'Speed Limiter Certificate',
  DRIVERS_LICENCE:      "Driver's Licence",
  VEHICLE_REGISTRATION: 'Vehicle Registration',
  CUSTOMS_PAPER:        'Customs Paper',
  OTHER:                'Other Document',
};

// Thresholds: { days, field, label }
const THRESHOLDS = [
  { days: 30, field: 'alertSent30',  label: '30-Day Renewal Reminder',   color: '#1A7A4A' },
  { days: 15, field: 'alertSent15',  label: '15-Day Renewal Alert',      color: '#F5A623' },
  { days: 7,  field: 'alertSent7',   label: '⚠️ 7-Day Final Warning',    color: '#E07B20' },
  { days: 0,  field: 'alertSentDay', label: '🚨 EXPIRY DAY — Act Now',   color: '#E84B4B' },
];

async function checkComplianceAlerts() {
  const now = new Date();
  let totalSent = 0;

  for (const threshold of THRESHOLDS) {
    const { days, field, label, color } = threshold;

    // Window: documents expiring within `days` days (±12hr buffer for day-of)
    const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
    const windowStart = days === 0
      ? new Date(now.getTime() - 12 * 60 * 60 * 1000)   // day-of: today only
      : new Date(now.getTime() + (days - 1) * 24 * 60 * 60 * 1000); // within the window

    const docs = await prisma.vehicleDocument.findMany({
      where: {
        [field]: false,
        expiryDate: {
          gte: days === 0 ? windowStart : now,
          lte: windowEnd,
        },
      },
      include: {
        vehicle: {
          select: { id: true, plateNumber: true, make: true, model: true, year: true },
        },
        vendor: {
          include: {
            users: {
              where: { role: 'FLEET_MANAGER', active: true },
              take: 2,
              select: { email: true, name: true },
            },
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    if (docs.length === 0) continue;

    // Group by vendor
    const byVendor = {};
    for (const doc of docs) {
      const vid = doc.vendorId;
      if (!byVendor[vid]) {
        byVendor[vid] = {
          vendor: doc.vendor,
          docs: [],
        };
      }
      byVendor[vid].docs.push(doc);
    }

    // Send one grouped email per vendor
    for (const [vendorId, group] of Object.entries(byVendor)) {
      const { vendor, docs: vendorDocs } = group;

      // Get email — prefer fleet manager, fallback to vendor contact
      const recipientEmails = vendor.users?.length > 0
        ? vendor.users.map(u => u.email)
        : [vendor.contactEmail];

      const recipientName = vendor.users?.[0]?.name || vendor.companyName;

      for (const toEmail of recipientEmails) {
        if (!toEmail) continue;

        try {
          await sendEmail({
            to: toEmail,
            subject: `${label} — ${vendorDocs.length} Vehicle Document${vendorDocs.length > 1 ? 's' : ''} Expiring | ${vendor.companyName}`,
            html: buildComplianceEmail({ label, color, vendorDocs, vendor, recipientName, days, now }),
          });
        } catch (emailErr) {
          logger.error(`[COMPLIANCE ALERT] Email failed to ${toEmail}: ${emailErr.message}`);
        }
      }

      // Mark all docs in this batch as alerted for this threshold
      const docIds = vendorDocs.map(d => d.id);
      await prisma.vehicleDocument.updateMany({
        where: { id: { in: docIds } },
        data: { [field]: true },
      });

      totalSent++;
      logger.info(`[COMPLIANCE ALERT] Sent ${label} to ${vendor.companyName} (${vendorDocs.length} docs)`);
    }
  }

  return { sent: totalSent };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL TEMPLATE
// ─────────────────────────────────────────────────────────────────────────────
function buildComplianceEmail({ label, color, vendorDocs, vendor, recipientName, days, now }) {
  const isOverdue = days <= 0;
  const urgencyBg = isOverdue ? '#FEE8E8' : days <= 7 ? '#FFF3DC' : '#EAF7F0';
  const urgencyText = isOverdue ? '#C0392B' : days <= 7 ? '#B8731A' : '#1A7A4A';

  const docRows = vendorDocs.map(doc => {
    const expiry = new Date(doc.expiryDate);
    const daysLeft = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    const overdue = daysLeft < 0;
    const statusColor = overdue ? '#E84B4B' : daysLeft <= 7 ? '#E07B20' : daysLeft <= 15 ? '#F5A623' : '#1A7A4A';
    const statusBadge = overdue
      ? `<span style="background:#FEE8E8;color:#C0392B;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${Math.abs(daysLeft)} days OVERDUE</span>`
      : `<span style="background:${urgencyBg};color:${urgencyText};padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${daysLeft === 0 ? 'TODAY' : `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left`}</span>`;

    return `
      <tr style="border-bottom:1px solid #F0F4F8">
        <td style="padding:12px 14px;font-weight:700;color:#0A1628;font-size:13px">${doc.vehicle.plateNumber}</td>
        <td style="padding:12px 14px;color:#444;font-size:13px">${doc.vehicle.make} ${doc.vehicle.model} ${doc.vehicle.year}</td>
        <td style="padding:12px 14px;color:#444;font-size:13px">${DOC_LABELS[doc.docType] || doc.docType}</td>
        <td style="padding:12px 14px;color:${statusColor};font-weight:700;font-size:13px">${expiry.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
        <td style="padding:12px 14px;text-align:center">${statusBadge}</td>
        ${doc.docNumber ? `<td style="padding:12px 14px;color:#777;font-size:12px">${doc.docNumber}</td>` : '<td></td>'}
      </tr>`;
  }).join('');

  return `
  <!DOCTYPE html>
  <html>
  <body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:700px;margin:0 auto;padding:24px 16px">

    <!-- Header -->
    <div style="background:#0A1628;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:#F5A623;letter-spacing:-0.5px">⚓ FleetAnchor Pro</div>
      <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:2.5px">DOCUMENT COMPLIANCE ALERT</div>
    </div>

    <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px 28px 32px;box-shadow:0 4px 16px rgba(0,0,0,.10)">

      <!-- Urgency Banner -->
      <div style="background:${color};color:#fff;padding:12px 18px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:22px;text-align:center;letter-spacing:0.3px">
        ${label}
      </div>

      <!-- Greeting -->
      <p style="font-size:14px;color:#333;margin:0 0 6px">Dear ${recipientName},</p>
      <p style="font-size:13px;color:#666;margin:0 0 20px;line-height:1.6">
        ${days === 0
          ? `The following vehicle document${vendorDocs.length > 1 ? 's' : ''} <strong style="color:#E84B4B">expire TODAY</strong>. Immediate action is required to avoid penalties, fines, or operational downtime.`
          : `The following <strong>${vendorDocs.length} vehicle document${vendorDocs.length > 1 ? 's' : ''}</strong> for <strong>${vendor.companyName}</strong> will expire within <strong>${days} days</strong>. Please arrange renewals promptly to avoid disruptions.`
        }
      </p>

      <!-- Summary Stats -->
      <div style="display:flex;gap:12px;margin-bottom:22px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;background:#F8FAFC;border-radius:8px;padding:14px;text-align:center;border:1px solid #E8EEF4">
          <div style="font-size:24px;font-weight:800;color:${color}">${vendorDocs.length}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">Documents Due</div>
        </div>
        <div style="flex:1;min-width:120px;background:#F8FAFC;border-radius:8px;padding:14px;text-align:center;border:1px solid #E8EEF4">
          <div style="font-size:24px;font-weight:800;color:#0A1628">${new Set(vendorDocs.map(d => d.vehicleId)).size}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">Vehicles Affected</div>
        </div>
        <div style="flex:1;min-width:120px;background:#F8FAFC;border-radius:8px;padding:14px;text-align:center;border:1px solid #E8EEF4">
          <div style="font-size:24px;font-weight:800;color:${days <= 7 ? '#E84B4B' : '#F5A623'}">${days === 0 ? 'TODAY' : days + ' days'}</div>
          <div style="font-size:11px;color:#888;margin-top:2px">Until Expiry</div>
        </div>
      </div>

      <!-- Documents Table -->
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;border-radius:8px;overflow:hidden;border:1px solid #E8EEF4">
        <thead>
          <tr style="background:#0A1628;color:#fff">
            <th style="padding:11px 14px;text-align:left;font-weight:600;font-size:12px">Plate No.</th>
            <th style="padding:11px 14px;text-align:left;font-weight:600;font-size:12px">Vehicle</th>
            <th style="padding:11px 14px;text-align:left;font-weight:600;font-size:12px">Document Type</th>
            <th style="padding:11px 14px;text-align:left;font-weight:600;font-size:12px">Expiry Date</th>
            <th style="padding:11px 14px;text-align:center;font-weight:600;font-size:12px">Status</th>
            <th style="padding:11px 14px;text-align:left;font-weight:600;font-size:12px">Doc No.</th>
          </tr>
        </thead>
        <tbody>${docRows}</tbody>
      </table>

      <!-- CTA Button -->
      <div style="text-align:center;margin-bottom:20px">
        <a href="${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/vendor/compliance"
           style="background:#F5A623;color:#000;font-weight:800;padding:13px 32px;border-radius:9px;text-decoration:none;font-size:14px;display:inline-block;letter-spacing:0.3px">
          Manage Document Compliance →
        </a>
      </div>

      <!-- Footer note -->
      <p style="font-size:11px;color:#aaa;text-align:center;margin:0;line-height:1.7">
        After renewing a document, update the expiry date in your compliance dashboard to stop these alerts.<br>
        You will receive alerts at 30, 15, 7 days, and on the expiry date.
      </p>
    </div>

    <!-- Brand Footer -->
    <div style="text-align:center;padding:16px;font-size:10px;color:#999">
      FleetAnchor Pro · Automated Compliance Alerts · Do not reply to this email
    </div>
  </div>
  </body>
  </html>`;
}

// ─────────────────────────────────────────────────────────────────────────────
// BATCHED SERVICE ALERT (same concept — grouped by vendor)
// ─────────────────────────────────────────────────────────────────────────────
async function checkServiceAlertsBatched() {
  const { sendEmail } = require('./emailService');
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Vehicles due by date within 30 days, alert not sent
  const byDate = await prisma.vehicle.findMany({
    where: {
      status: 'ACTIVE',
      nextServiceDate: { lte: in30Days },
      serviceAlertSent: false,
    },
    include: {
      vendor: {
        include: { users: { where: { role: 'FLEET_MANAGER', active: true }, take: 2, select: { email: true, name: true } } },
      },
    },
  });

  // Vehicles due by odometer within 700km
  const byOdo = await prisma.vehicle.findMany({
    where: {
      status: 'ACTIVE',
      nextServiceOdometer: { not: null },
      serviceAlertSent: false,
      currentOdometer: { not: null },
    },
    include: {
      vendor: {
        include: { users: { where: { role: 'FLEET_MANAGER', active: true }, take: 2, select: { email: true, name: true } } },
      },
    },
  });

  const odoAlerts = byOdo.filter(v => v.nextServiceOdometer - v.currentOdometer <= 700);

  // Merge deduped
  const alertMap = {};
  [...byDate, ...odoAlerts].forEach(v => { alertMap[v.id] = v; });
  const toAlert = Object.values(alertMap);

  if (toAlert.length === 0) return { alerted: 0 };

  // Group by vendor
  const byVendor = {};
  for (const v of toAlert) {
    if (!byVendor[v.vendorId]) byVendor[v.vendorId] = { vendor: v.vendor, vehicles: [] };
    byVendor[v.vendorId].vehicles.push(v);
  }

  let alerted = 0;

  for (const [vendorId, group] of Object.entries(byVendor)) {
    const { vendor, vehicles } = group;
    const emails = vendor.users?.length > 0
      ? vendor.users.map(u => u.email)
      : [vendor.contactEmail];
    const recipientName = vendor.users?.[0]?.name || vendor.companyName;

    const vehicleRows = vehicles.map(v => {
      const daysLeft = v.nextServiceDate
        ? Math.ceil((new Date(v.nextServiceDate) - now) / (1000 * 60 * 60 * 24))
        : null;
      const kmLeft = v.nextServiceOdometer && v.currentOdometer
        ? v.nextServiceOdometer - v.currentOdometer
        : null;
      const overdue = (daysLeft !== null && daysLeft < 0) || (kmLeft !== null && kmLeft < 0);
      const statusColor = overdue ? '#E84B4B' : '#F5A623';

      return `
        <tr style="border-bottom:1px solid #F0F4F8">
          <td style="padding:11px 14px;font-weight:700;color:#0A1628;font-size:13px">${v.plateNumber}</td>
          <td style="padding:11px 14px;color:#444;font-size:13px">${v.make} ${v.model} ${v.year}</td>
          <td style="padding:11px 14px;color:${statusColor};font-weight:700;font-size:13px">
            ${daysLeft !== null ? `${overdue && daysLeft < 0 ? Math.abs(daysLeft) + 'd OVERDUE' : daysLeft + 'd left'}` : '—'}
          </td>
          <td style="padding:11px 14px;color:${statusColor};font-weight:700;font-size:13px">
            ${kmLeft !== null ? `${overdue && kmLeft < 0 ? Math.abs(kmLeft) + 'km OVERDUE' : kmLeft.toLocaleString() + 'km left'}` : '—'}
          </td>
          <td style="padding:11px 14px;color:#777;font-size:12px">
            ${v.nextServiceDate ? new Date(v.nextServiceDate).toLocaleDateString('en-NG') : '—'}
          </td>
        </tr>`;
    }).join('');

    const html = `
    <!DOCTYPE html><html><body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif">
    <div style="max-width:700px;margin:0 auto;padding:24px 16px">
      <div style="background:#0A1628;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center">
        <div style="font-size:22px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
        <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:2.5px">PREVENTIVE MAINTENANCE ALERT</div>
      </div>
      <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;box-shadow:0 4px 16px rgba(0,0,0,.10)">
        <div style="background:#F5A623;color:#000;padding:12px 18px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:22px;text-align:center">
          🔧 ${vehicles.length} Vehicle${vehicles.length > 1 ? 's' : ''} Due for Preventive Service
        </div>
        <p style="font-size:14px;color:#333;margin:0 0 18px">Dear ${recipientName}, the following vehicles require scheduled maintenance:</p>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;border:1px solid #E8EEF4;border-radius:8px;overflow:hidden">
          <thead>
            <tr style="background:#0A1628;color:#fff">
              <th style="padding:11px 14px;text-align:left;font-size:12px">Plate No.</th>
              <th style="padding:11px 14px;text-align:left;font-size:12px">Vehicle</th>
              <th style="padding:11px 14px;text-align:left;font-size:12px">Days Left</th>
              <th style="padding:11px 14px;text-align:left;font-size:12px">KM Left</th>
              <th style="padding:11px 14px;text-align:left;font-size:12px">Due Date</th>
            </tr>
          </thead>
          <tbody>${vehicleRows}</tbody>
        </table>
        <div style="text-align:center">
          <a href="${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/vendor/vehicles"
             style="background:#F5A623;color:#000;font-weight:800;padding:13px 32px;border-radius:9px;text-decoration:none;font-size:14px;display:inline-block">
            Submit Service Requests →
          </a>
        </div>
      </div>
    </div></body></html>`;

    for (const toEmail of emails) {
      if (!toEmail) continue;
      try {
        await sendEmail({
          to: toEmail,
          subject: `🔧 ${vehicles.length} Vehicle${vehicles.length > 1 ? 's' : ''} Due for Service — ${vendor.companyName}`,
          html,
        });
      } catch (e) {
        logger.error(`[SERVICE ALERT BATCH] Email failed: ${e.message}`);
      }
    }

    // Mark all as alerted
    await prisma.vehicle.updateMany({
      where: { id: { in: vehicles.map(v => v.id) } },
      data: { serviceAlertSent: true },
    });

    alerted += vehicles.length;
  }

  await prisma.$disconnect();
  return { alerted };
}


// ─────────────────────────────────────────────────────────────────────────────
// DRIVER LICENCE ALERTS (batched, same pattern as compliance)
// ─────────────────────────────────────────────────────────────────────────────
async function checkDriverLicenceAlerts() {
  const now = new Date();
  let totalSent = 0;

  for (const threshold of THRESHOLDS) {
    const { days, field, label, color } = threshold;
    const windowEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000 + 12 * 60 * 60 * 1000);
    const windowStart = days === 0 ? new Date(now.getTime() - 12 * 60 * 60 * 1000) : now;

    const licences = await prisma.driverLicence.findMany({
      where: {
        [field]: false,
        expiryDate: { gte: windowStart, lte: windowEnd },
      },
      include: {
        vendor: {
          include: {
            users: { where: { role: 'FLEET_MANAGER', active: true }, take: 2, select: { email: true, name: true } },
          },
        },
      },
      orderBy: { expiryDate: 'asc' },
    });

    if (licences.length === 0) continue;

    const byVendor = {};
    for (const lic of licences) {
      if (!byVendor[lic.vendorId]) byVendor[lic.vendorId] = { vendor: lic.vendor, licences: [] };
      byVendor[lic.vendorId].licences.push(lic);
    }

    for (const [vendorId, group] of Object.entries(byVendor)) {
      const { vendor, licences: vendorLics } = group;
      const emails = vendor.users?.length > 0 ? vendor.users.map(u => u.email) : [vendor.contactEmail];
      const recipientName = vendor.users?.[0]?.name || vendor.companyName;

      const licRows = vendorLics.map(l => {
        const exp = new Date(l.expiryDate);
        const dl = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
        const over = dl < 0;
        const sc = over ? '#E84B4B' : dl <= 7 ? '#E07B20' : '#F5A623';
        const badge = over
          ? `<span style="background:#FEE8E8;color:#C0392B;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${Math.abs(dl)}d OVERDUE</span>`
          : `<span style="background:#FFF3DC;color:#B8731A;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700">${dl === 0 ? 'TODAY' : `${dl}d left`}</span>`;
        return `<tr style="border-bottom:1px solid #F0F4F8">
          <td style="padding:11px 14px;font-weight:700;color:#0A1628;font-size:13px">${l.driverName}</td>
          <td style="padding:11px 14px;color:#444;font-size:13px">${l.licenceCategory}</td>
          <td style="padding:11px 14px;color:#777;font-size:12px;font-family:monospace">${l.licenceNumber || '—'}</td>
          <td style="padding:11px 14px;color:${sc};font-weight:700;font-size:13px">${exp.toLocaleDateString('en-NG', { day:'numeric', month:'short', year:'numeric' })}</td>
          <td style="padding:11px 14px;text-align:center">${badge}</td>
        </tr>`;
      }).join('');

      const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:680px;margin:0 auto;padding:24px 16px">
  <div style="background:#0A1628;border-radius:12px 12px 0 0;padding:24px 28px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#F5A623">⚓ FleetAnchor Pro</div>
    <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:2.5px">DRIVER LICENCE ALERT</div>
  </div>
  <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;box-shadow:0 4px 16px rgba(0,0,0,.10)">
    <div style="background:${color};color:#fff;padding:12px 18px;border-radius:10px;font-weight:700;font-size:15px;margin-bottom:22px;text-align:center">${label}</div>
    <p style="font-size:14px;color:#333;margin:0 0 6px">Dear ${recipientName},</p>
    <p style="font-size:13px;color:#666;margin:0 0 20px;line-height:1.6">
      ${vendorLics.length} driver licence${vendorLics.length > 1 ? 's' : ''} for <strong>${vendor.companyName}</strong> 
      ${days === 0 ? '<strong style="color:#E84B4B">expire TODAY</strong>. Immediate renewal required.' : `will expire within <strong>${days} days</strong>. Please arrange renewals.`}
    </p>
    <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
      <div style="flex:1;min-width:100px;background:#F8FAFC;border-radius:8px;padding:14px;text-align:center;border:1px solid #E8EEF4">
        <div style="font-size:24px;font-weight:800;color:${color}">${vendorLics.length}</div>
        <div style="font-size:11px;color:#888">Licences Due</div>
      </div>
      <div style="flex:1;min-width:100px;background:#F8FAFC;border-radius:8px;padding:14px;text-align:center;border:1px solid #E8EEF4">
        <div style="font-size:24px;font-weight:800;color:#0A1628">${days === 0 ? 'TODAY' : days + 'd'}</div>
        <div style="font-size:11px;color:#888">Until Expiry</div>
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px;border:1px solid #E8EEF4;border-radius:8px;overflow:hidden">
      <thead><tr style="background:#0A1628;color:#fff">
        <th style="padding:11px 14px;text-align:left;font-size:12px">Driver Name</th>
        <th style="padding:11px 14px;text-align:left;font-size:12px">Category</th>
        <th style="padding:11px 14px;text-align:left;font-size:12px">Licence No.</th>
        <th style="padding:11px 14px;text-align:left;font-size:12px">Expiry Date</th>
        <th style="padding:11px 14px;text-align:center;font-size:12px">Status</th>
      </tr></thead>
      <tbody>${licRows}</tbody>
    </table>
    <div style="text-align:center;margin-bottom:20px">
      <a href="${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/vendor/drivers"
         style="background:#F5A623;color:#000;font-weight:800;padding:13px 32px;border-radius:9px;text-decoration:none;font-size:14px;display:inline-block">
        Manage Driver Licences →
      </a>
    </div>
    <p style="font-size:11px;color:#aaa;text-align:center;margin:0">After renewal, update the expiry date to reset this alert. Alerts fire at 30, 15, 7 days and on expiry day.</p>
  </div>
</div></body></html>`;

      for (const toEmail of emails) {
        if (!toEmail) continue;
        try {
          await sendEmail({
            to: toEmail,
            subject: `${label} — ${vendorLics.length} Driver Licence${vendorLics.length > 1 ? 's' : ''} Expiring | ${vendor.companyName}`,
            html,
          });
        } catch (e) { logger.error(`[DRIVER LICENCE ALERT] Email failed: ${e.message}`); }
      }

      await prisma.driverLicence.updateMany({
        where: { id: { in: vendorLics.map(l => l.id) } },
        data: { [field]: true },
      });
      totalSent++;
    }
  }
  return { sent: totalSent };
}

module.exports = { checkComplianceAlerts, checkServiceAlertsBatched, checkDriverLicenceAlerts };
