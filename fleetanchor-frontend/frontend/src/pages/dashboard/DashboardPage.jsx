import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Car, CheckCircle, DollarSign, Bell, Search, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { analyticsService } from '../../services/api';
import toast from 'react-hot-toast';

const MOCK_STATS = { activeJobs: 34, inRepair: 12, completedMTD: 187, revenueMTD: '28.4M' };
const MOCK_REVENUE = [
  { month: 'Dec', v: 18.2 }, { month: 'Jan', v: 13.8 }, { month: 'Feb', v: 21.4 },
  { month: 'Mar', v: 17.1 }, { month: 'Apr', v: 24.6 }, { month: 'May', v: 28.4 },
];
const MOCK_JOBS = [
  { id: 1, jobNumber: 'JB-2647', vehicle: 'WNXNF4327A6', plate: 'LND-421-XY', vendor: 'Coca-Cola NG', issue: 'Engine overheating', status: 'REPAIR_STARTED', age: '2d 4h' },
  { id: 2, jobNumber: 'JB-2646', vehicle: 'JHMCG56461C', plate: 'ABJ-009-FG', vendor: 'Dangote Flour', issue: 'Brake failure', status: 'ESTIMATE_SENT', age: '1d 6h' },
  { id: 3, jobNumber: 'JB-2645', vehicle: '1FTFW1ET5F', plate: 'KN-772-AA', vendor: 'NNPC Logistics', issue: 'Transmission fault', status: 'ESTIMATE_APPROVED', age: '3d 1h' },
  { id: 4, jobNumber: 'JB-2644', vehicle: '5NPDH4AE7GH', plate: 'PH-083-BA', vendor: 'UAC Nigeria', issue: 'AC system failure', status: 'ESTIMATE_QUERIED', age: '4d' },
  { id: 5, jobNumber: 'JB-2643', vehicle: '2T1BURHE0JC', plate: 'OG-341-KS', vendor: 'Lafarge Cement', issue: 'Wheel alignment', status: 'REPAIR_COMPLETE', age: '5d' },
];

const STATUS_PILL = {
  REPAIR_STARTED: { label: 'In Repair', cls: 'pill-repair' },
  ESTIMATE_SENT: { label: 'Est. Pending', cls: 'pill-pending' },
  ESTIMATE_APPROVED: { label: 'Approved', cls: 'bg-blue-500/15 text-anchor-blue' },
  ESTIMATE_QUERIED: { label: 'Queried', cls: 'pill-query' },
  REPAIR_COMPLETE: { label: 'Completed', cls: 'pill-complete' },
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = MOCK_JOBS.filter(j =>
    !search || j.jobNumber.includes(search) || j.vehicle.includes(search.toUpperCase()) || j.vendor.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {/* Topbar */}
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Dashboard</h1>
          <p className="text-[10px] text-[var(--text3)]">Wed, 27 May 2026 · AfriFleet Motors</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 w-44">
            <Search className="w-3 h-3 text-[var(--text3)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search jobs, VIN..." className="bg-transparent text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none w-full" />
          </div>
          <button className="relative bg-white/[0.04] border border-white/[0.08] rounded-lg p-1.5 text-[var(--text2)] hover:bg-white/[0.08]">
            <Bell className="w-4 h-4" />
            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-anchor-red rounded-full" />
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            { label: 'Active Jobs', value: MOCK_STATS.activeJobs, sub: '+6 this week', trend: 'up', icon: Wrench, onClick: () => navigate('/admin/jobs') },
            { label: 'In Repair Bay', value: MOCK_STATS.inRepair, sub: '4 completing today', trend: 'up', icon: Car, onClick: () => navigate('/admin/repairs') },
            { label: 'Completed MTD', value: MOCK_STATS.completedMTD, sub: '+23% vs last month', trend: 'up', icon: CheckCircle },
            { label: 'Revenue MTD', value: `₦${MOCK_STATS.revenueMTD}`, sub: '+₦4.2M vs target', trend: 'up', icon: DollarSign, onClick: () => navigate('/admin/invoices') },
          ].map(({ label, value, sub, trend, icon: Icon, onClick }) => (
            <div key={label} className="stat-card" onClick={onClick}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-gold" />
                <span className="text-[9px] uppercase tracking-wider text-[var(--text3)]">{label}</span>
              </div>
              <div className="text-2xl font-bold text-[var(--text)] leading-none mb-1.5">{value}</div>
              <div className={`flex items-center gap-1 text-[10px] ${trend === 'up' ? 'text-anchor-green' : 'text-anchor-red'}`}>
                {trend === 'up' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                {sub}
              </div>
            </div>
          ))}
        </div>

        {/* Two-column layout */}
        <div className="grid grid-cols-5 gap-4">
          {/* Jobs table */}
          <div className="col-span-3">
            <div className="flex items-center justify-between mb-2">
              <span className="section-title">Recent Job Requests</span>
              <button onClick={() => navigate('/admin/jobs')} className="btn-ghost text-[10px] py-1">View all →</button>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Vehicle</th><th>Vendor</th><th>Issue</th><th>Status</th><th>Age</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(job => {
                    const s = STATUS_PILL[job.status] || { label: job.status, cls: '' };
                    return (
                      <tr key={job.id} onClick={() => navigate(`/admin/jobs/${job.id}`)}>
                        <td>
                          <div className="font-semibold text-teal text-[11px]">{job.vehicle}</div>
                          <div className="text-[10px] text-[var(--text3)]">{job.plate}</div>
                        </td>
                        <td>{job.vendor}</td>
                        <td className="max-w-[100px] truncate">{job.issue}</td>
                        <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                        <td className="text-[var(--text3)]">{job.age}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right panels */}
          <div className="col-span-2 flex flex-col gap-3">
            {/* Revenue chart */}
            <div className="panel">
              <div className="text-xs font-semibold text-[var(--text)] mb-3">Revenue — Last 6 Months (₦M)</div>
              <ResponsiveContainer width="100%" height={80}>
                <BarChart data={MOCK_REVENUE} barSize={16}>
                  <XAxis dataKey="month" tick={{ fill: 'var(--text3)', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#0F2040', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                    formatter={(v) => [`₦${v}M`, 'Revenue']}
                    labelStyle={{ color: 'var(--text3)' }}
                  />
                  <Bar dataKey="v" radius={[3, 3, 0, 0]}>
                    {MOCK_REVENUE.map((_, i) => (
                      <Cell key={i} fill={i === MOCK_REVENUE.length - 1 ? '#00C9A7' : '#F5A623'} opacity={i === MOCK_REVENUE.length - 1 ? 1 : 0.7} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Bay status */}
            <div className="panel">
              <div className="text-xs font-semibold text-[var(--text)] mb-2">Repair Bay Status</div>
              {[
                { bay: 'Bay 01', desc: 'WNXNF4327A6 — Engine', pct: 72, color: 'bg-gold' },
                { bay: 'Bay 03', desc: '1FTFW1ET5F — Transmission', pct: 35, color: 'bg-teal' },
              ].map(({ bay, desc, pct, color }) => (
                <div key={bay} className="mb-3 last:mb-0">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[10px] text-[var(--text3)] uppercase tracking-wider">{bay}</span>
                    <span className="pill pill-repair text-[9px]">Active</span>
                  </div>
                  <div className="text-xs text-[var(--text)] mb-1.5">{desc}</div>
                  <div className="h-1.5 bg-white/[0.08] rounded-full overflow-hidden">
                    <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className="text-[9px] text-[var(--text3)] mt-1">{pct}% complete</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
