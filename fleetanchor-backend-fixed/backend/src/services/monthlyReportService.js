const prisma = require('../config/prismaClient');
const logger = require('../config/logger');

/**
 * Generate and send monthly maintenance summary for a vendor.
 * Called by cron on the 1st of each month for GROWTH + ENTERPRISE plans.
 */
async function generateMonthlyReport(vendor, month, year) {
  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0, 23, 59, 59);
  const prevStart = new Date(year, month - 2, 1);
  const prevEnd   = new Date(year, month - 1, 0, 23, 59, 59);
  const monthName = start.toLocaleString('en-NG', { month: 'long' });

  // ── Fetch all jobs this month ───────────────────────────────────────────────
  const [jobs, prevJobs, vehicles, invoices, prevInvoices] = await Promise.all([
    prisma.jobRequest.findMany({
      where: {
        vehicle: { vendorId: vendor.id },
        submittedAt: { gte: start, lte: end },
      },
      include: {
        vehicle: { select: { plateNumber: true, make: true, model: true, year: true } },
        invoices: true,
        estimates: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
      orderBy: { submittedAt: 'asc' },
    }),
    prisma.jobRequest.findMany({
      where: { vehicle: { vendorId: vendor.id }, submittedAt: { gte: prevStart, lte: prevEnd } },
      include: { invoices: true },
    }),
    prisma.vehicle.findMany({
      where: { vendorId: vendor.id, status: 'ACTIVE' },
    }),
    prisma.invoice.findMany({
      where: { job: { vehicle: { vendorId: vendor.id } }, issuedAt: { gte: start, lte: end } },
    }),
    prisma.invoice.findMany({
      where: { job: { vehicle: { vendorId: vendor.id } }, issuedAt: { gte: prevStart, lte: prevEnd } },
    }),
  ]);

  // ── Core metrics ────────────────────────────────────────────────────────────
  const totalJobs       = jobs.length;
  const completedJobs   = jobs.filter(j => j.status === 'CLOSED' || j.status === 'COMPLETED').length;
  const pendingJobs     = jobs.filter(j => ['SUBMITTED','DIAGNOSED','ESTIMATE_SENT','APPROVED','IN_PROGRESS'].includes(j.status)).length;
  const cancelledJobs   = jobs.filter(j => j.status === 'CANCELLED').length;

  const totalCost       = invoices.reduce((s, i) => s + parseFloat(i.totalAmount || 0), 0);
  const partsCost       = invoices.reduce((s, i) => s + parseFloat(i.partsCost || 0), 0);
  const labourCost      = invoices.reduce((s, i) => s + parseFloat(i.labourCost || 0), 0);
  const prevTotalCost   = prevInvoices.reduce((s, i) => s + parseFloat(i.totalAmount || 0), 0);

  const avgCostPerJob   = completedJobs > 0 ? totalCost / completedJobs : 0;
  const prevAvgCost     = prevJobs.filter(j => j.status === 'CLOSED').length > 0
    ? prevTotalCost / prevJobs.filter(j => j.status === 'CLOSED').length : 0;

  // ── Turnaround time (days from submitted → completed) ───────────────────────
  const turnarounds = jobs
    .filter(j => j.completedAt && j.submittedAt)
    .map(j => (new Date(j.completedAt) - new Date(j.submittedAt)) / (1000 * 60 * 60 * 24));
  const avgTurnaround   = turnarounds.length > 0
    ? (turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length).toFixed(1) : 'N/A';
  const maxTurnaround   = turnarounds.length > 0 ? Math.max(...turnarounds).toFixed(1) : 'N/A';
  const minTurnaround   = turnarounds.length > 0 ? Math.min(...turnarounds).toFixed(1) : 'N/A';

  // ── Downtime (vehicles with jobs this month) ─────────────────────────────────
  const vehiclesWithJobs = new Set(jobs.map(j => j.vehicleId)).size;
  const fleetSize        = vehicles.length;
  const fleetUtilization = fleetSize > 0 ? ((vehiclesWithJobs / fleetSize) * 100).toFixed(0) : 0;

  // ── Category breakdown ───────────────────────────────────────────────────────
  const categoryMap = {};
  jobs.forEach(j => {
    categoryMap[j.category] = (categoryMap[j.category] || 0) + 1;
  });
  const topCategories = Object.entries(categoryMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // ── Priority breakdown ───────────────────────────────────────────────────────
  const criticalJobs  = jobs.filter(j => j.priority === 'CRITICAL').length;
  const highJobs      = jobs.filter(j => j.priority === 'HIGH').length;
  const normalJobs    = jobs.filter(j => j.priority === 'NORMAL').length;

  // ── Most serviced vehicles ───────────────────────────────────────────────────
  const vehicleJobMap = {};
  jobs.forEach(j => {
    const key = j.vehicleId;
    if (!vehicleJobMap[key]) vehicleJobMap[key] = { vehicle: j.vehicle, count: 0, cost: 0 };
    vehicleJobMap[key].count++;
    vehicleJobMap[key].cost += j.invoices.reduce((s, i) => s + parseFloat(i.totalAmount || 0), 0);
  });
  const topVehicles = Object.values(vehicleJobMap)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // ── MoM comparison ───────────────────────────────────────────────────────────
  const jobsDelta   = totalJobs - prevJobs.length;
  const costDelta   = totalCost - prevTotalCost;
  const jobsTrend   = jobsDelta > 0 ? `▲ ${jobsDelta} more` : jobsDelta < 0 ? `▼ ${Math.abs(jobsDelta)} fewer` : '→ Same';
  const costTrend   = costDelta > 0 ? `▲ ₦${fmt(costDelta)} more` : costDelta < 0 ? `▼ ₦${fmt(Math.abs(costDelta))} less` : '→ No change';

  // ── Cost projection ───────────────────────────────────────────────────────────
  const last3MonthsAvg = prevTotalCost > 0 ? ((totalCost + prevTotalCost) / 2) : totalCost;
  const projectedAnnual = (last3MonthsAvg * 12);

  return {
    vendor, month, year, monthName,
    totalJobs, completedJobs, pendingJobs, cancelledJobs,
    totalCost, partsCost, labourCost, avgCostPerJob, prevAvgCost,
    avgTurnaround, maxTurnaround, minTurnaround,
    fleetSize, vehiclesWithJobs, fleetUtilization,
    topCategories, topVehicles,
    criticalJobs, highJobs, normalJobs,
    jobsTrend, costTrend, jobsDelta, costDelta,
    projectedAnnual, prevTotalJobs: prevJobs.length, prevTotalCost,
  };
}

const fmt  = (n) => Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtD = (n) => Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function buildReportEmail(r) {
  const costChange  = r.costDelta >= 0 ? `#E84B4B` : `#1A7A4A`;
  const costArrow   = r.costDelta >= 0 ? '▲' : '▼';
  const jobChange   = r.jobsDelta >= 0 ? `#E84B4B` : `#1A7A4A`;
  const jobArrow    = r.jobsDelta >= 0 ? '▲' : '▼';

  const topCatsRows = r.topCategories.map(([cat, count]) => `
    <tr>
      <td style="padding:8px 12px;color:#333;font-size:13px">${cat.replace(/_/g,' ')}</td>
      <td style="padding:8px 12px;text-align:center;font-weight:700;color:#0A1628">${count}</td>
      <td style="padding:8px 12px">
        <div style="background:#E8F0FE;border-radius:4px;height:8px;width:100%">
          <div style="background:#4A90D9;border-radius:4px;height:8px;width:${Math.min(100, (count/r.totalJobs)*100)}%"></div>
        </div>
      </td>
    </tr>`).join('');

  const topVehicleRows = r.topVehicles.map((v, i) => `
    <tr style="background:${i % 2 === 0 ? '#F8FAFC' : '#fff'}">
      <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#0A1628">${v.vehicle.plateNumber}</td>
      <td style="padding:8px 12px;font-size:12px;color:#666">${v.vehicle.make} ${v.vehicle.model} ${v.vehicle.year}</td>
      <td style="padding:8px 12px;text-align:center;font-size:13px;font-weight:700">${v.count}</td>
      <td style="padding:8px 12px;text-align:right;font-size:13px;font-weight:700;color:#0A1628">₦${fmt(v.cost)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:'Segoe UI',Arial,sans-serif">
<div style="max-width:640px;margin:0 auto;padding:24px 16px">

  <!-- HEADER -->
  <div style="background:#0A1628;border-radius:12px 12px 0 0;padding:28px 32px;text-align:center">
    <div style="font-size:22px;font-weight:800;color:#F5A623;letter-spacing:-0.5px">⚓ FleetAnchor Pro</div>
    <div style="font-size:11px;color:#5A7A99;margin-top:4px;letter-spacing:2px">MONTHLY FLEET MAINTENANCE REPORT</div>
    <div style="margin-top:12px;font-size:20px;font-weight:700;color:#fff">${r.monthName} ${r.year}</div>
    <div style="font-size:13px;color:#8AA4C0;margin-top:4px">${r.vendor.companyName}</div>
  </div>

  <!-- EXECUTIVE SUMMARY BAND -->
  <div style="background:#F5A623;padding:16px 32px;display:flex;justify-content:space-between;flex-wrap:wrap">
    <div style="text-align:center;padding:8px 16px">
      <div style="font-size:28px;font-weight:800;color:#0A1628">${r.totalJobs}</div>
      <div style="font-size:11px;font-weight:600;color:#5A3A00;letter-spacing:1px">TOTAL JOBS</div>
    </div>
    <div style="text-align:center;padding:8px 16px">
      <div style="font-size:28px;font-weight:800;color:#0A1628">₦${fmt(r.totalCost)}</div>
      <div style="font-size:11px;font-weight:600;color:#5A3A00;letter-spacing:1px">TOTAL SPEND</div>
    </div>
    <div style="text-align:center;padding:8px 16px">
      <div style="font-size:28px;font-weight:800;color:#0A1628">${r.avgTurnaround}d</div>
      <div style="font-size:11px;font-weight:600;color:#5A3A00;letter-spacing:1px">AVG TURNAROUND</div>
    </div>
    <div style="text-align:center;padding:8px 16px">
      <div style="font-size:28px;font-weight:800;color:#0A1628">${r.fleetUtilization}%</div>
      <div style="font-size:11px;font-weight:600;color:#5A3A00;letter-spacing:1px">FLEET IN WORKSHOP</div>
    </div>
  </div>

  <!-- MAIN CARD -->
  <div style="background:#fff;border-radius:0 0 12px 12px;box-shadow:0 4px 12px rgba(0,0,0,.08)">

    <!-- SECTION 1: JOB STATUS -->
    <div style="padding:24px 32px;border-bottom:1px solid #F0F4F8">
      <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0A1628;letter-spacing:0.5px">📋 JOB STATUS BREAKDOWN</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr>
          <td style="width:25%;padding:12px;text-align:center;background:#E6FAF0;border-radius:8px;margin:4px">
            <div style="font-size:24px;font-weight:800;color:#1A7A4A">${r.completedJobs}</div>
            <div style="font-size:11px;color:#2D8A5A;font-weight:600">COMPLETED</div>
          </td>
          <td style="width:4%"></td>
          <td style="width:25%;padding:12px;text-align:center;background:#FFF3DC;border-radius:8px">
            <div style="font-size:24px;font-weight:800;color:#B8731A">${r.pendingJobs}</div>
            <div style="font-size:11px;color:#B8731A;font-weight:600">IN PROGRESS</div>
          </td>
          <td style="width:4%"></td>
          <td style="width:25%;padding:12px;text-align:center;background:#FEE8E8;border-radius:8px">
            <div style="font-size:24px;font-weight:800;color:#C0392B">${r.criticalJobs}</div>
            <div style="font-size:11px;color:#C0392B;font-weight:600">CRITICAL</div>
          </td>
          <td style="width:4%"></td>
          <td style="width:25%;padding:12px;text-align:center;background:#F0F4F8;border-radius:8px">
            <div style="font-size:24px;font-weight:800;color:#666">${r.cancelledJobs}</div>
            <div style="font-size:11px;color:#888;font-weight:600">CANCELLED</div>
          </td>
        </tr>
      </table>
    </div>

    <!-- SECTION 2: COST ANALYSIS -->
    <div style="padding:24px 32px;border-bottom:1px solid #F0F4F8">
      <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0A1628;letter-spacing:0.5px">💰 COST ANALYSIS</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#F8FAFC">
          <td style="padding:10px 12px;color:#666">Total Maintenance Spend</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:#0A1628;font-size:15px">₦${fmt(r.totalCost)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#666">— Parts & Materials</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600">₦${fmt(r.partsCost)}</td>
        </tr>
        <tr style="background:#F8FAFC">
          <td style="padding:10px 12px;color:#666">— Labour</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600">₦${fmt(r.labourCost)}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#666">Average Cost Per Job</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600">₦${fmt(r.avgCostPerJob)}</td>
        </tr>
        <tr style="background:#F8FAFC">
          <td style="padding:10px 12px;color:#666">vs Previous Month</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:${costChange}">${costArrow} ₦${fmt(Math.abs(r.costDelta))}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#666">Projected Annual Spend</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:#0A1628">₦${fmt(r.projectedAnnual)}</td>
        </tr>
      </table>
    </div>

    <!-- SECTION 3: TURNAROUND & DOWNTIME -->
    <div style="padding:24px 32px;border-bottom:1px solid #F0F4F8">
      <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0A1628;letter-spacing:0.5px">⏱️ TURNAROUND TIME & DOWNTIME</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#F8FAFC">
          <td style="padding:10px 12px;color:#666">Average Repair Turnaround</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:#0A1628">${r.avgTurnaround} days</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#666">Fastest Job Completed</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600;color:#1A7A4A">${r.minTurnaround} days</td>
        </tr>
        <tr style="background:#F8FAFC">
          <td style="padding:10px 12px;color:#666">Longest Job Duration</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600;color:#E84B4B">${r.maxTurnaround} days</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#666">Vehicles in Workshop This Month</td>
          <td style="padding:10px 12px;text-align:right;font-weight:600">${r.vehiclesWithJobs} of ${r.fleetSize}</td>
        </tr>
        <tr style="background:#F8FAFC">
          <td style="padding:10px 12px;color:#666">Fleet Workshop Rate</td>
          <td style="padding:10px 12px;text-align:right;font-weight:700;color:${r.fleetUtilization > 30 ? '#E84B4B' : '#1A7A4A'}">${r.fleetUtilization}% ${r.fleetUtilization > 30 ? '⚠️ High' : '✅ Normal'}</td>
        </tr>
      </table>
    </div>

    <!-- SECTION 4: TOP FAILURE CATEGORIES -->
    ${r.topCategories.length > 0 ? `
    <div style="padding:24px 32px;border-bottom:1px solid #F0F4F8">
      <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0A1628;letter-spacing:0.5px">🔧 TOP MAINTENANCE CATEGORIES</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#F0F4F8">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;font-weight:600">CATEGORY</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#666;font-weight:600">JOBS</th>
          <th style="padding:8px 12px;font-size:11px;color:#666;font-weight:600">FREQUENCY</th>
        </tr>
        ${topCatsRows}
      </table>
    </div>` : ''}

    <!-- SECTION 5: MOST SERVICED VEHICLES -->
    ${r.topVehicles.length > 0 ? `
    <div style="padding:24px 32px;border-bottom:1px solid #F0F4F8">
      <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0A1628;letter-spacing:0.5px">🚗 MOST SERVICED VEHICLES</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr style="background:#F0F4F8">
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;font-weight:600">PLATE</th>
          <th style="padding:8px 12px;text-align:left;font-size:11px;color:#666;font-weight:600">VEHICLE</th>
          <th style="padding:8px 12px;text-align:center;font-size:11px;color:#666;font-weight:600">JOBS</th>
          <th style="padding:8px 12px;text-align:right;font-size:11px;color:#666;font-weight:600">TOTAL COST</th>
        </tr>
        ${topVehicleRows}
      </table>
      ${r.topVehicles[0] && r.topVehicles[0].count >= 3 ? `
      <div style="background:#FEF3CD;border:1px solid #F5A623;border-radius:8px;padding:12px 16px;margin-top:12px">
        <p style="margin:0;font-size:12px;color:#7D4E00">⚠️ <strong>Attention:</strong> ${r.topVehicles[0].vehicle.plateNumber} has had ${r.topVehicles[0].count} jobs this month. Consider a full vehicle inspection to identify underlying issues.</p>
      </div>` : ''}
    </div>` : ''}

    <!-- SECTION 6: MOM COMPARISON -->
    <div style="padding:24px 32px;border-bottom:1px solid #F0F4F8">
      <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0A1628;letter-spacing:0.5px">📊 MONTH-ON-MONTH COMPARISON</h2>
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <tr style="background:#F8FAFC">
          <th style="padding:10px 12px;text-align:left;font-size:11px;color:#888;font-weight:600"></th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:#888;font-weight:600">PREVIOUS MONTH</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:#888;font-weight:600">${r.monthName.toUpperCase()}</th>
          <th style="padding:10px 12px;text-align:center;font-size:11px;color:#888;font-weight:600">CHANGE</th>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#666">Total Jobs</td>
          <td style="padding:10px 12px;text-align:center;font-weight:600">${r.prevTotalJobs}</td>
          <td style="padding:10px 12px;text-align:center;font-weight:700;color:#0A1628">${r.totalJobs}</td>
          <td style="padding:10px 12px;text-align:center;font-weight:700;color:${jobChange}">${jobArrow} ${Math.abs(r.jobsDelta)}</td>
        </tr>
        <tr style="background:#F8FAFC">
          <td style="padding:10px 12px;color:#666">Total Cost</td>
          <td style="padding:10px 12px;text-align:center;font-weight:600">₦${fmt(r.prevTotalCost)}</td>
          <td style="padding:10px 12px;text-align:center;font-weight:700;color:#0A1628">₦${fmt(r.totalCost)}</td>
          <td style="padding:10px 12px;text-align:center;font-weight:700;color:${costChange}">${costArrow} ₦${fmt(Math.abs(r.costDelta))}</td>
        </tr>
        <tr>
          <td style="padding:10px 12px;color:#666">Avg Cost/Job</td>
          <td style="padding:10px 12px;text-align:center;font-weight:600">₦${fmt(r.prevAvgCost)}</td>
          <td style="padding:10px 12px;text-align:center;font-weight:700;color:#0A1628">₦${fmt(r.avgCostPerJob)}</td>
          <td style="padding:10px 12px;text-align:center;font-weight:600;color:#666">—</td>
        </tr>
      </table>
    </div>

    <!-- SECTION 7: INSIGHTS & RECOMMENDATIONS -->
    <div style="padding:24px 32px;background:#F8FAFC;border-radius:0 0 12px 12px">
      <h2 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#0A1628;letter-spacing:0.5px">💡 INSIGHTS & RECOMMENDATIONS</h2>
      ${r.criticalJobs > 0 ? `<div style="display:flex;align-items:flex-start;margin-bottom:12px"><span style="margin-right:8px;font-size:16px">🚨</span><p style="margin:0;font-size:13px;color:#333">You had <strong>${r.criticalJobs} critical priority job(s)</strong> this month. Review response procedures to reduce critical incidents.</p></div>` : ''}
      ${r.avgTurnaround !== 'N/A' && parseFloat(r.avgTurnaround) > 7 ? `<div style="display:flex;align-items:flex-start;margin-bottom:12px"><span style="margin-right:8px;font-size:16px">⏳</span><p style="margin:0;font-size:13px;color:#333">Average turnaround of <strong>${r.avgTurnaround} days</strong> is above the recommended 7-day target. Consider escalating long-running jobs proactively.</p></div>` : `<div style="display:flex;align-items:flex-start;margin-bottom:12px"><span style="margin-right:8px;font-size:16px">✅</span><p style="margin:0;font-size:13px;color:#333">Turnaround time of <strong>${r.avgTurnaround} days</strong> is within healthy range.</p></div>`}
      ${r.fleetUtilization > 30 ? `<div style="display:flex;align-items:flex-start;margin-bottom:12px"><span style="margin-right:8px;font-size:16px">⚠️</span><p style="margin:0;font-size:13px;color:#333"><strong>${r.fleetUtilization}% of your fleet</strong> visited the workshop this month. High frequency may indicate preventive maintenance is overdue.</p></div>` : ''}
      ${r.costDelta > 0 ? `<div style="display:flex;align-items:flex-start;margin-bottom:12px"><span style="margin-right:8px;font-size:16px">📈</span><p style="margin:0;font-size:13px;color:#333">Maintenance costs increased by <strong>₦${fmt(r.costDelta)}</strong> vs last month. Top category: <strong>${r.topCategories[0]?.[0]?.replace(/_/g,' ') || 'N/A'}</strong>.</p></div>` : r.costDelta < 0 ? `<div style="display:flex;align-items:flex-start;margin-bottom:12px"><span style="margin-right:8px;font-size:16px">📉</span><p style="margin:0;font-size:13px;color:#333">Great news — maintenance costs dropped by <strong>₦${fmt(Math.abs(r.costDelta))}</strong> vs last month.</p></div>` : ''}
      <div style="display:flex;align-items:flex-start;margin-bottom:0"><span style="margin-right:8px;font-size:16px">📅</span><p style="margin:0;font-size:13px;color:#333">Projected annual maintenance spend: <strong>₦${fmt(r.projectedAnnual)}</strong>. Budget accordingly.</p></div>
    </div>

  </div>

  <!-- FOOTER -->
  <div style="text-align:center;padding:20px;font-size:11px;color:#8AA4C0">
    FleetAnchor Pro · Monthly Report · ${r.monthName} ${r.year}<br>
    <a href="${process.env.FRONTEND_URL || 'https://anchor-fleet-pro.vercel.app'}/vendor/analytics" style="color:#F5A623;font-weight:600">View Full Analytics Dashboard →</a><br><br>
    This report was automatically generated. To update report preferences, contact your OEM administrator.
  </div>

</div>
</body>
</html>`;
}

async function sendMonthlyReports() {
  const now = new Date();
  const month = now.getMonth() === 0 ? 12 : now.getMonth(); // previous month
  const year  = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();

  logger.info(`[MONTHLY REPORT] Generating reports for ${month}/${year}...`);

  const vendors = await prisma.vendor.findMany({
    where: {
      status: 'ACTIVE',
      deletedAt: null,
      subscription: { plan: { in: ['GROWTH', 'ENTERPRISE'] } },
    },
    include: {
      users: { where: { role: 'FLEET_MANAGER', active: true }, take: 1 },
      subscription: true,
    },
  });

  logger.info(`[MONTHLY REPORT] Found ${vendors.length} eligible vendors`);

  const { sendEmail } = require('./emailService');
  let sent = 0, failed = 0;

  for (const vendor of vendors) {
    try {
      const recipientEmail = vendor.users[0]?.email || vendor.contactEmail;
      if (!recipientEmail) { failed++; continue; }

      const report = await generateMonthlyReport(vendor, month, year);
      const html   = buildReportEmail(report);

      const ok = await sendEmail({
        to: recipientEmail,
        subject: `📊 ${vendor.companyName} — Fleet Maintenance Report · ${report.monthName} ${year}`,
        html,
      });

      if (ok) { sent++; logger.info(`[MONTHLY REPORT] Sent to ${vendor.companyName} (${recipientEmail})`); }
      else { failed++; }
    } catch (err) {
      failed++;
      logger.error(`[MONTHLY REPORT] Failed for vendor ${vendor.id}: ${err.message}`);
    }
  }

  logger.info(`[MONTHLY REPORT] Done — ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

module.exports = { sendMonthlyReports, generateMonthlyReport, buildReportEmail };
