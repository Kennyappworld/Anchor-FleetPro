import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck, Wrench, CheckCircle, AlertTriangle, ArrowRight, Clock,
  TrendingUp, TrendingDown, ShieldCheck, ShieldAlert, Zap,
  BarChart2, Activity, AlertCircle, ChevronRight, RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useAuthStore } from '../../context/authStore';
import { analyticsService, subscriptionService } from '../../services/api';

const fmt = n => `₦${Number(n || 0).toLocaleString()}`;
const fmtK = n => n >= 1000000 ? `₦${(n/1000000).toFixed(1)}M` : n >= 1000 ? `₦${(n/1000).toFixed(0)}K` : `₦${n}`;

const STATUS_PILL = {
  SUBMITTED:         { label: 'Submitted',    cls: 'bg-blue-500/20 text-blue-300' },
  DIAGNOSED:         { label: 'Diagnosed',    cls: 'bg-purple-500/20 text-purple-300' },
  ESTIMATE_SENT:     { label: 'Estimate Sent', cls: 'bg-yellow-500/20 text-yellow-300' },
  ESTIMATE_APPROVED: { label: 'Approved',     cls: 'bg-teal-500/20 text-teal-300' },
  REPAIR_STARTED:    { label: 'In Repair',    cls: 'bg-orange-500/20 text-orange-300' },
  REPAIR_COMPLETE:   { label: 'Complete',     cls: 'bg-green-500/20 text-green-400' },
  CLOSED:            { label: 'Closed',       cls: 'bg-slate-500/20 text-slate-400' },
  CANCELLED:         { label: 'Cancelled',    cls: 'bg-red-500/20 text-red-400' },
};

const CATEGORY_COLORS = ['#F5A623','#00C9A7','#7C5CBF','#3B7BE8','#E84B4B','#2ECC71'];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#0F2040] border border-white/10 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color || '#F5A623' }} className="font-700">{fmtK(p.value)}</p>
      ))}
    </div>
  );
};

export default function VendorDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [data, setData] = useState(null);
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [dashRes, subRes] = await Promise.allSettled([
        analyticsService.getVendorDashboard(),
        user?.vendorId ? subscriptionService.getForVendor(user.vendorId) : Promise.resolve(null),
      ]);
      if (dashRes.status === 'fulfilled') setData(dashRes.value.data?.data);
      if (subRes?.status === 'fulfilled') setSub(subRes.value?.data?.data);
    } catch { /* silently show zeros */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [user?.vendorId]);

  useEffect(() => { load(); }, [load]);

  const trialDays = sub?.daysLeft ?? (sub?.expiryDate
    ? Math.max(0, Math.ceil((new Date(sub.expiryDate) - Date.now()) / 86400000)) : null);

  const fleet = data?.fleet || {};
  const jobs = data?.jobs || {};
  const spend = data?.spend || {};
  const compliance = data?.compliance || {};
  const recentJobs = data?.recentJobs || [];

  const spendUp = spend.spendChange > 0;
  const utilizationPct = fleet.total > 0 ? Math.round((fleet.inRepair / fleet.total) * 100) : 0;

  // Build pie chart for job categories
  const catData = (jobs.byCategory || []).map((c, i) => ({
    name: c.category?.replace(/_/g, ' ') || 'Other',
    value: c._count,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  // Build status breakdown
  const statusMap = {};
  (jobs.byStatus || []).forEach(s => { statusMap[s.status] = s._count; });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-slate-400 text-sm flex items-center gap-2">
        <RefreshCw size={16} className="animate-spin" /> Loading dashboard...
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">

      {/* ── Header ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">
            Welcome back, {user?.fullName?.split(' ')[0] || 'Fleet Manager'} 👋
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{new Date().toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => load(true)} className="btn-ghost p-2 rounded-lg" disabled={refreshing}>
            <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => navigate('/vendor/jobs')} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2">
            <Wrench size={15} /> New Job Request
          </button>
        </div>
      </div>

      {/* ── Trial Banner ── */}
      {sub?.status === 'TRIAL' && trialDays !== null && trialDays <= 10 && (
        <div className="flex items-center gap-3 bg-[var(--gold)]/10 border border-[var(--gold)]/20 rounded-xl px-4 py-3">
          <Clock className="w-4 h-4 text-[var(--gold)] shrink-0" />
          <p className="text-xs text-[var(--gold)] flex-1">
            Your trial ends in <strong>{trialDays} day{trialDays !== 1 ? 's' : ''}</strong>. Upgrade to keep all features.
          </p>
          <button onClick={() => navigate('/vendor/subscription')}
            className="text-xs font-700 text-black bg-[var(--gold)] px-3 py-1.5 rounded-lg whitespace-nowrap">
            Upgrade Now
          </button>
        </div>
      )}

      {/* ── Compliance Alert Banner (if any alerts) ── */}
      {compliance.totalAlerts > 0 && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-xs text-red-300 flex-1">
            <strong>{compliance.totalAlerts} compliance alert{compliance.totalAlerts !== 1 ? 's' : ''}</strong> need attention —
            {compliance.expiredDocs > 0 && ` ${compliance.expiredDocs} expired doc${compliance.expiredDocs !== 1 ? 's' : ''},`}
            {compliance.expiringDocs > 0 && ` ${compliance.expiringDocs} doc${compliance.expiringDocs !== 1 ? 's' : ''} expiring soon,`}
            {compliance.expiredLicences > 0 && ` ${compliance.expiredLicences} expired licence${compliance.expiredLicences !== 1 ? 's' : ''},`}
            {compliance.expiringLicences > 0 && ` ${compliance.expiringLicences} licence${compliance.expiringLicences !== 1 ? 's' : ''} expiring soon`}
          </p>
          <button onClick={() => navigate('/vendor/compliance')} className="text-xs font-700 text-red-300 hover:text-red-200 whitespace-nowrap flex items-center gap-1">
            Review <ChevronRight size={12} />
          </button>
        </div>
      )}

      {/* ── KPI Cards Row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Fleet */}
        <div className="card p-4 cursor-pointer hover:bg-white/[0.06] transition-colors" onClick={() => navigate('/vendor/vehicles')}>
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center">
              <Truck size={17} className="text-blue-400" />
            </div>
            <span className="text-xs text-slate-500">Total Fleet</span>
          </div>
          <div className="text-2xl font-800 text-white">{fleet.total || 0}</div>
          <div className="text-xs text-slate-400 mt-1">
            <span className="text-orange-400 font-600">{fleet.inRepair || 0}</span> in repair ·
            <span className="text-green-400 font-600"> {fleet.available || 0}</span> available
          </div>
        </div>

        {/* Active Jobs */}
        <div className="card p-4 cursor-pointer hover:bg-white/[0.06] transition-colors" onClick={() => navigate('/vendor/jobs')}>
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center">
              <Wrench size={17} className="text-orange-400" />
            </div>
            <span className="text-xs text-slate-500">Active Jobs</span>
          </div>
          <div className="text-2xl font-800 text-white">{jobs.active || 0}</div>
          <div className="text-xs text-slate-400 mt-1">
            <span className="text-green-400 font-600">{jobs.completedThisMonth || 0}</span> completed this month
          </div>
        </div>

        {/* This Month Spend */}
        <div className="card p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-[var(--gold)]/15 flex items-center justify-center">
              <BarChart2 size={17} className="text-[var(--gold)]" />
            </div>
            <span className="text-xs text-slate-500">This Month</span>
          </div>
          <div className="text-2xl font-800 text-white">{fmtK(spend.thisMonth || 0)}</div>
          <div className="text-xs mt-1 flex items-center gap-1">
            {spend.spendChange !== 0 ? (
              <>
                {spendUp
                  ? <TrendingUp size={12} className="text-red-400" />
                  : <TrendingDown size={12} className="text-green-400" />}
                <span className={spendUp ? 'text-red-400' : 'text-green-400'}>
                  {Math.abs(spend.spendChange)}% vs last month
                </span>
              </>
            ) : <span className="text-slate-500">No change vs last month</span>}
          </div>
        </div>

        {/* Fleet Utilization */}
        <div className="card p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="w-9 h-9 rounded-lg bg-teal-500/15 flex items-center justify-center">
              <Activity size={17} className="text-teal-400" />
            </div>
            <span className="text-xs text-slate-500">In Workshop</span>
          </div>
          <div className="text-2xl font-800 text-white">{utilizationPct}%</div>
          <div className="w-full bg-white/10 rounded-full h-1.5 mt-2">
            <div className="h-1.5 rounded-full transition-all"
              style={{ width: `${Math.min(utilizationPct, 100)}%`, background: utilizationPct > 40 ? '#E84B4B' : utilizationPct > 20 ? '#F5A623' : '#00C9A7' }} />
          </div>
          <div className="text-xs text-slate-400 mt-1">{fleet.inRepair || 0} of {fleet.total || 0} vehicles</div>
        </div>
      </div>

      {/* ── Compliance Health Row ── */}
      <div className="grid grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: 'Docs Expiring', value: compliance.expiringDocs || 0, icon: ShieldCheck, color: 'text-yellow-400', bg: 'bg-yellow-500/10', path: '/vendor/compliance' },
          { label: 'Docs Expired', value: compliance.expiredDocs || 0, icon: ShieldCheck, color: 'text-red-400', bg: 'bg-red-500/10', path: '/vendor/compliance' },
          { label: 'Licences Expiring', value: compliance.expiringLicences || 0, icon: ShieldAlert, color: 'text-yellow-400', bg: 'bg-yellow-500/10', path: '/vendor/drivers' },
          { label: 'Licences Expired', value: compliance.expiredLicences || 0, icon: ShieldAlert, color: 'text-red-400', bg: 'bg-red-500/10', path: '/vendor/drivers' },
          { label: 'Service Due', value: compliance.vehiclesDueService || 0, icon: Zap, color: 'text-orange-400', bg: 'bg-orange-500/10', path: '/vendor/vehicles' },
        ].map(({ label, value, icon: Icon, color, bg, path }) => (
          <div key={label} onClick={() => navigate(path)}
            className="card p-3 flex items-center gap-2.5 cursor-pointer hover:bg-white/[0.06] transition-colors group">
            <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={15} className={color} />
            </div>
            <div className="min-w-0">
              <div className={`text-lg font-800 ${value > 0 ? color : 'text-white'}`}>{value}</div>
              <div className="text-[10px] text-slate-400 leading-tight truncate">{label}</div>
            </div>
            <ChevronRight size={12} className="text-slate-600 group-hover:text-slate-400 ml-auto flex-shrink-0 transition-colors" />
          </div>
        ))}
      </div>

      {/* ── Charts Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* 6-Month Cost Trend */}
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-700 text-white">6-Month Maintenance Cost</h3>
              <p className="text-xs text-slate-400">Total spend trend</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-700 text-white">{fmtK(spend.total || 0)}</div>
              <div className="text-xs text-slate-400">All time</div>
            </div>
          </div>
          {spend.trend?.some(t => t.amount > 0) ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={spend.trend || []} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F5A623" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#F5A623" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} tickFormatter={v => fmtK(v)} width={48} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="amount" stroke="#F5A623" strokeWidth={2} fill="url(#costGrad)" dot={{ fill: '#F5A623', r: 3 }} activeDot={{ r: 5 }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[160px] flex items-center justify-center text-slate-500 text-xs">
              No spend data yet — costs appear after invoices are paid
            </div>
          )}
        </div>

        {/* Repair Categories Pie */}
        <div className="card p-4">
          <h3 className="text-sm font-700 text-white mb-1">Top Repair Categories</h3>
          <p className="text-xs text-slate-400 mb-4">All time breakdown</p>
          {catData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={catData} cx="50%" cy="50%" innerRadius={35} outerRadius={58}
                    paddingAngle={3} dataKey="value">
                    {catData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(val, name) => [val + ' jobs', name]} contentStyle={{ background: '#0F2040', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {catData.slice(0, 4).map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                      <span className="text-slate-300 truncate">{c.name}</span>
                    </div>
                    <span className="text-slate-400 font-600">{c.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="h-[130px] flex items-center justify-center text-slate-500 text-xs text-center">
              Repair categories appear<br />after job requests are submitted
            </div>
          )}
        </div>
      </div>

      {/* ── Job Status + Recent Jobs Row ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Job Status Breakdown */}
        <div className="card p-4">
          <h3 className="text-sm font-700 text-white mb-4">Job Status Breakdown</h3>
          <div className="space-y-2.5">
            {[
              { key: 'SUBMITTED',         label: 'Submitted',     color: '#3B7BE8' },
              { key: 'REPAIR_STARTED',    label: 'In Repair',     color: '#F5A623' },
              { key: 'ESTIMATE_SENT',     label: 'Awaiting Approval', color: '#7C5CBF' },
              { key: 'REPAIR_COMPLETE',   label: 'Completed',     color: '#00C9A7' },
              { key: 'CLOSED',            label: 'Closed',        color: '#64748b' },
            ].map(({ key, label, color }) => {
              const count = statusMap[key] || 0;
              const total = Object.values(statusMap).reduce((a, b) => a + b, 0) || 1;
              const pct = Math.round((count / total) * 100);
              return (
                <div key={key}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300">{label}</span>
                    <span className="font-700" style={{ color }}>{count}</span>
                  </div>
                  <div className="w-full bg-white/[0.06] rounded-full h-1.5">
                    <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recent Jobs */}
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-700 text-white">Recent Job Requests</h3>
            <button onClick={() => navigate('/vendor/jobs')}
              className="text-xs text-[var(--gold)] hover:text-[var(--gold)]/80 flex items-center gap-1 transition-colors">
              View all <ArrowRight size={12} />
            </button>
          </div>
          {recentJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-slate-500 text-xs text-center">
              <Wrench size={28} className="mb-2 opacity-30" />
              No job requests yet
            </div>
          ) : (
            <div className="space-y-2">
              {recentJobs.map(job => {
                const pill = STATUS_PILL[job.status] || { label: job.status, cls: 'bg-slate-500/20 text-slate-400' };
                return (
                  <div key={job.id} onClick={() => navigate('/vendor/jobs')}
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] cursor-pointer transition-colors group">
                    <div className="w-8 h-8 rounded-lg bg-[var(--gold)]/10 flex items-center justify-center flex-shrink-0">
                      <Wrench size={14} className="text-[var(--gold)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-600 text-white truncate">
                        {job.vehicle?.plateNumber} — {job.vehicle?.make} {job.vehicle?.model}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {job.jobNumber} · {new Date(job.createdAt).toLocaleDateString('en-NG')}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-500 flex-shrink-0 ${pill.cls}`}>
                      {pill.label}
                    </span>
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-slate-400 flex-shrink-0 transition-colors" />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div className="card p-4">
        <h3 className="text-sm font-700 text-white mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          {[
            { label: 'New Job Request',     icon: Wrench,      path: '/vendor/jobs',       cls: 'bg-[var(--gold)]/10 text-[var(--gold)] hover:bg-[var(--gold)]/20' },
            { label: 'Manage Fleet',        icon: Truck,       path: '/vendor/vehicles',   cls: 'bg-blue-500/10 text-blue-400 hover:bg-blue-500/20' },
            { label: 'Doc Compliance',      icon: ShieldCheck, path: '/vendor/compliance', cls: 'bg-teal-500/10 text-teal-400 hover:bg-teal-500/20' },
            { label: 'Driver Licences',     icon: ShieldAlert, path: '/vendor/drivers',    cls: 'bg-purple-500/10 text-purple-400 hover:bg-purple-500/20' },
          ].map(({ label, icon: Icon, path, cls }) => (
            <button key={label} onClick={() => navigate(path)}
              className={`${cls} rounded-xl p-3 flex items-center gap-2.5 text-sm font-600 transition-colors text-left`}>
              <Icon size={17} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>
      </div>

    </div>
  );
}
