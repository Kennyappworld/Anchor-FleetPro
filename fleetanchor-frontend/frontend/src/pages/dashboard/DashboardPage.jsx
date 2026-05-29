import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wrench, Car, CheckCircle, DollarSign, TrendingUp, TrendingDown, RefreshCw, Users, ChevronRight } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { analyticsService, jobService } from '../../services/api';

const fmtK = n => n >= 1000000 ? `₦${(n/1000000).toFixed(1)}M` : n >= 1000 ? `₦${(n/1000).toFixed(0)}K` : `₦${n||0}`;

const STATUS_PILL = {
  REPAIR_STARTED:     { label: 'In Repair',    cls: 'bg-orange-500/15 text-orange-400' },
  ESTIMATE_SENT:      { label: 'Est. Pending', cls: 'bg-yellow-500/15 text-yellow-300' },
  ESTIMATE_APPROVED:  { label: 'Approved',     cls: 'bg-teal-500/15 text-teal-300' },
  ESTIMATE_QUERIED:   { label: 'Queried',      cls: 'bg-purple-500/15 text-purple-300' },
  REPAIR_COMPLETE:    { label: 'Complete',     cls: 'bg-green-500/15 text-green-400' },
  SUBMITTED:          { label: 'Submitted',    cls: 'bg-blue-500/15 text-blue-300' },
  DIAGNOSED:          { label: 'Diagnosed',    cls: 'bg-indigo-500/15 text-indigo-300' },
  CLOSED:             { label: 'Closed',       cls: 'bg-slate-500/15 text-slate-400' },
};

const BAR_COLORS = ['#00C9A7','#F5A623','#3B7BE8','#7C5CBF','#E84B4B','#2ECC71'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0F2040] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      <p className="text-[var(--gold)] font-700">{fmtK(payload[0]?.value)}</p>
    </div>
  );
};

export default function DashboardPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [dashRes, jobsRes] = await Promise.allSettled([
        analyticsService.getDashboard(),
        jobService.list({ limit: 8, sort: 'createdAt_desc' }),
      ]);
      if (dashRes.status === 'fulfilled') setStats(dashRes.value.data?.data || dashRes.value.data);
      if (jobsRes.status === 'fulfilled') {
        const list = jobsRes.value.data?.jobs || jobsRes.value.data?.data || [];
        setRecentJobs(list);
      }
    } catch { /* silently fail */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const s = stats || {};
  const activeJobs   = s.activeJobs   ?? s.openJobs    ?? 0;
  const inRepair     = s.inRepair     ?? s.vehiclesInRepair ?? 0;
  const completedMTD = s.completedMTD ?? s.completedThisMonth ?? 0;
  const revenueMTD   = s.revenueMTD   ?? s.revenueThisMonth  ?? 0;
  const totalVendors = s.totalVendors ?? s.vendors ?? 0;
  const revenueData  = s.monthlyRevenue ?? s.revenueByMonth ?? [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Workshop Dashboard</h1>
          <p className="text-[10px] text-[var(--text3)]">{dateStr}</p>
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost p-1.5 rounded-lg">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Active Jobs',    value: loading ? '—' : activeJobs,             icon: Wrench,       trend: null, onClick: () => navigate('/admin/jobs') },
            { label: 'In Repair Bay',  value: loading ? '—' : inRepair,               icon: Car,          trend: null, onClick: () => navigate('/admin/repairs') },
            { label: 'Completed MTD',  value: loading ? '—' : completedMTD,           icon: CheckCircle,  trend: null },
            { label: 'Revenue MTD',    value: loading ? '—' : fmtK(revenueMTD),       icon: DollarSign,   trend: null, onClick: () => navigate('/admin/invoices') },
          ].map(({ label, value, icon: Icon, onClick }) => (
            <div key={label} className="stat-card cursor-pointer" onClick={onClick}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span className="text-[9px] uppercase tracking-wider text-[var(--text3)]">{label}</span>
              </div>
              <div className="text-2xl font-bold text-[var(--text)] leading-none mb-1">{value}</div>
              {totalVendors > 0 && label === 'Active Jobs' && (
                <div className="text-[10px] text-slate-500">{totalVendors} fleet clients</div>
              )}
            </div>
          ))}
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Revenue Bar Chart */}
          <div className="card p-4 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-700 text-white">Monthly Revenue</h3>
                <p className="text-xs text-slate-400">Last 6 months</p>
              </div>
              <div className="text-right">
                <div className="text-sm font-700 text-white">{fmtK(revenueMTD)}</div>
                <div className="text-xs text-slate-400">This month</div>
              </div>
            </div>
            {revenueData.length > 0 ? (
              <ResponsiveContainer width="100%" height={150}>
                <BarChart data={revenueData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={fmtK} width={44} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" radius={[4, 4, 0, 0]}>
                    {revenueData.map((_, i) => <Cell key={i} fill={i === revenueData.length - 1 ? '#F5A623' : '#1A3A5C'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[150px] flex items-center justify-center text-slate-500 text-xs">
                Revenue data appears after invoices are confirmed
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="card p-4 space-y-3">
            <h3 className="text-sm font-700 text-white mb-3">At a Glance</h3>
            {[
              { label: 'Fleet Clients',      value: loading ? '—' : totalVendors,             color: 'text-blue-400' },
              { label: 'Active Jobs',        value: loading ? '—' : activeJobs,               color: 'text-[var(--gold)]' },
              { label: 'In Workshop',        value: loading ? '—' : inRepair,                 color: 'text-orange-400' },
              { label: 'Completed This Month', value: loading ? '—' : completedMTD,           color: 'text-green-400' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-0">
                <span className="text-xs text-slate-400">{label}</span>
                <span className={`text-sm font-700 ${color}`}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Jobs Table */}
        <div className="table-wrap">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.07]">
            <h3 className="text-sm font-700 text-white">Recent Job Requests</h3>
            <button onClick={() => navigate('/admin/jobs')} className="text-xs text-[var(--gold)] hover:opacity-80 flex items-center gap-1">
              View all <ChevronRight size={12} />
            </button>
          </div>
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw size={13} className="animate-spin" /> Loading...
            </div>
          ) : recentJobs.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No jobs yet — they will appear here as fleet managers submit requests</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Job #</th><th>Vehicle</th><th>Vendor</th><th>Issue</th><th>Status</th><th>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.map(j => {
                  const pill = STATUS_PILL[j.status] || { label: j.status, cls: 'bg-slate-500/15 text-slate-400' };
                  return (
                    <tr key={j.id} className="cursor-pointer" onClick={() => navigate(`/admin/jobs/${j.id}`)}>
                      <td className="font-mono text-[var(--gold)] text-[11px] font-600">{j.jobNumber}</td>
                      <td className="font-medium text-[var(--text)] text-xs">
                        {j.vehicle?.plateNumber}
                        {j.vehicle?.make && <span className="block text-[10px] text-slate-400">{j.vehicle.make} {j.vehicle.model}</span>}
                      </td>
                      <td className="text-xs text-slate-300">{j.vehicle?.vendor?.companyName || j.vendor?.companyName || '—'}</td>
                      <td className="text-xs text-slate-300 max-w-[160px] truncate">{j.description}</td>
                      <td><span className={`pill text-[10px] ${pill.cls}`}>{pill.label}</span></td>
                      <td className="text-[10px] text-[var(--text3)]">
                        {j.createdAt ? new Date(j.createdAt).toLocaleDateString('en-NG') : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
