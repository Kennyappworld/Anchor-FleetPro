import React, { useEffect, useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import toast from 'react-hot-toast';
import { analyticsService, invoiceService, vendorService } from '../../services/api';

// Live figures from the server (this page used to show fixed made-up numbers).

const COLORS = ['#00C9A7', '#F5A623', '#3498DB', '#9B59B6', '#E84B4B', '#8FA3BF'];
const TT = { contentStyle: { background: '#0F2040', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8, fontSize: 11 }, labelStyle: { color: '#8FA3BF' } };
const naira = (n) => {
  const v = Number(n || 0);
  if (v >= 1e9) return `₦${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `₦${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `₦${Math.round(v / 1e3)}K`;
  return `₦${v.toLocaleString('en-NG')}`;
};
const nice = (c) => String(c || 'Other').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());

export default function AnalyticsPage() {
  const [range, setRange] = useState(12);
  const [dash, setDash] = useState(null);
  const [months, setMonths] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [fleets, setFleets] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      analyticsService.getDashboard(),
      analyticsService.getMonthlyRevenue().catch(() => ({ data: { data: [] } })),
      invoiceService.list({ limit: 100 }).catch(() => ({ data: { data: [] } })),
      vendorService.list({ limit: 100 }).catch(() => ({ data: { data: [] } })),
    ]).then(([d, m, i, v]) => {
      setDash(d.data.data || {});
      setMonths((m.data.data || []).map((x) => ({ m: x.month, rev: Number(x.revenue || 0) })));
      setInvoices(i.data.data || []);
      setFleets(v.data.data || []);
    }).catch((e) => toast.error(e?.response?.data?.error || 'Could not load analytics'))
      .finally(() => setLoading(false));
  }, []);

  const shownMonths = months.slice(-range);
  const categories = useMemo(() => {
    const rows = (dash?.byCategory || []).map((c) => ({ name: nice(c.category), value: typeof c._count === 'number' ? c._count : c._count?._all || 0 }));
    const total = rows.reduce((a, r) => a + r.value, 0) || 1;
    return rows.sort((a, b) => b.value - a.value).map((r) => ({ ...r, pct: Math.round((r.value / total) * 100) }));
  }, [dash]);
  const topFleets = useMemo(() => {
    const by = {};
    invoices.filter((x) => x.paymentConfirmed).forEach((x) => {
      const name = x.job?.vehicle?.vendor?.companyName || 'Unknown';
      by[name] = by[name] || { name, spend: 0, jobs: 0 };
      by[name].spend += Number(x.totalAmount || 0);
      by[name].jobs += 1;
    });
    return Object.values(by).sort((a, b) => b.spend - a.spend).slice(0, 6);
  }, [invoices]);
  const fleetSize = fleets.reduce((a, f) => a + (f._count?.vehicles || 0), 0);
  const activeFleets = fleets.filter((f) => f.status === 'ACTIVE').length;
  const enterprise = fleets.filter((f) => f.subscriptions?.[0]?.plan === 'ENTERPRISE').length;
  const rangeRevenue = shownMonths.reduce((a, x) => a + x.rev, 0);

  if (loading) return <div className="loading">Loading analytics…</div>;

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Analytics & Insights</h1>
        <div className="flex gap-1">
          {[[1, '1M'], [3, '3M'], [6, '6M'], [12, '1Y']].map(([n, l]) => (
            <button key={l} onClick={() => setRange(n)} className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${range === n ? 'bg-gold text-black' : 'bg-white/[0.04] text-[var(--text3)] hover:bg-white/[0.08]'}`}>{l}</button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            [`Revenue (${range === 12 ? '12 months' : `${range} month${range > 1 ? 's' : ''}`})`, naira(rangeRevenue), `${naira(dash?.revenueTotal)} all time`],
            ['Total Jobs', Number(dash?.totalJobs || 0).toLocaleString(), `${dash?.activeJobs || 0} active · ${dash?.completedThisMonth || 0} done this month`],
            ['Active Fleets', activeFleets, `${enterprise} on Enterprise`],
            ['Fleet Size', fleetSize.toLocaleString(), 'vehicles across all fleets'],
          ].map(([l, v, s]) => (
            <div key={l} className="stat-card">
              <div className="text-[9px] uppercase tracking-wider text-[var(--text3)] mb-1">{l}</div>
              <div className="text-2xl font-bold text-[var(--text)] mb-1">{v}</div>
              <div className="text-[10px] text-[var(--text3)]">{s}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 panel min-w-0">
            <div className="text-xs font-semibold text-[var(--text)] mb-3">Revenue collected per month (paid invoices)</div>
            {shownMonths.length === 0 ? <p className="text-xs text-[var(--text3)] py-10 text-center">No paid invoices yet.</p> : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={shownMonths}>
                  <XAxis dataKey="m" tick={{ fill: '#8FA3BF', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#8FA3BF', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={naira} width={52} />
                  <Tooltip {...TT} formatter={(v) => [naira(v), 'Revenue']} />
                  <Bar dataKey="rev" fill="#F5A623" radius={[3, 3, 0, 0]} opacity={0.9} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-3">Jobs by category</div>
            {categories.length === 0 ? <p className="text-xs text-[var(--text3)] py-10 text-center">No jobs yet.</p> : (
              <>
                <ResponsiveContainer width="100%" height={140}>
                  <PieChart>
                    <Pie data={categories} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                      {categories.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...TT} formatter={(v) => [v, 'Jobs']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1 mt-1">
                  {categories.map((c, i) => (
                    <div key={c.name} className="flex items-center gap-1.5 text-[10px]">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 text-[var(--text3)]">{c.name}</span>
                      <span className="text-[var(--text)] font-medium">{c.value} · {c.pct}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="text-xs font-semibold text-[var(--text)] mb-3">Top fleets by amount paid</div>
          {topFleets.length === 0 ? <p className="text-xs text-[var(--text3)]">No paid invoices yet.</p> : (
            <div className="space-y-2">
              {topFleets.map((v, i) => (
                <div key={v.name} className="flex items-center gap-3">
                  <div className="text-[10px] text-[var(--text3)] w-4 text-right">{i + 1}</div>
                  <div className="w-32 text-[11px] text-[var(--text)] truncate">{v.name}</div>
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-gold rounded-full" style={{ width: `${(v.spend / topFleets[0].spend) * 100}%` }} />
                  </div>
                  <div className="text-[10px] text-gold font-medium w-16 text-right">{naira(v.spend)}</div>
                  <div className="text-[10px] text-[var(--text3)] w-16 text-right">{v.jobs} invoice{v.jobs === 1 ? '' : 's'}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
