import React, { useState, useEffect, useCallback } from 'react';
import { Search, Download, Filter, RefreshCw, History, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { jobService } from '../../services/api';

const fmt = n => n ? `₦${Number(n).toLocaleString()}` : '—';

const STATUS_CLS = {
  REPAIR_COMPLETE:  'bg-teal-500/15 text-teal-400',
  REPAIR_STARTED:   'bg-orange-500/15 text-orange-400',
  CLOSED:           'bg-slate-500/15 text-slate-400',
  AWAITING_PAYMENT: 'bg-yellow-500/15 text-yellow-300',
};
const STATUS_LABEL = {
  REPAIR_COMPLETE: 'Completed', REPAIR_STARTED: 'In Repair',
  CLOSED: 'Closed', AWAITING_PAYMENT: 'Awaiting Payment',
};

export default function VendorHistoryPage() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatus] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilter, setShowFilter] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await jobService.list({ limit: 200 });
      const list = res.data?.jobs || res.data?.data || [];
      // History = closed/completed jobs
      setJobs(list);
    } catch { toast.error('Failed to load history'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const historyJobs = jobs.filter(j =>
    ['REPAIR_COMPLETE','REPAIR_STARTED','CLOSED','AWAITING_PAYMENT'].includes(j.status)
  );

  const filtered = historyJobs.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      j.vehicle?.plateNumber?.toLowerCase().includes(q) ||
      j.description?.toLowerCase().includes(q) ||
      j.jobNumber?.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'ALL' || j.status === statusFilter;
    const created = j.createdAt ? new Date(j.createdAt) : null;
    const matchFrom = !dateFrom || (created && created >= new Date(dateFrom));
    const matchTo   = !dateTo   || (created && created <= new Date(dateTo + 'T23:59:59'));
    return matchSearch && matchStatus && matchFrom && matchTo;
  });

  const totalCost = filtered.reduce((a, j) => a + (j.estimates?.[0]?.totalCost || 0), 0);
  const activeFilters = [dateFrom, dateTo, statusFilter !== 'ALL'].filter(Boolean).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Maintenance History</h1>
          {!loading && <p className="text-[10px] text-[var(--text3)] mt-0.5">{filtered.length} records · {fmt(totalCost)} total</p>}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowFilter(s => !s)}
            className={`btn-ghost flex items-center gap-1 text-xs px-2.5 py-1.5 ${activeFilters > 0 ? 'text-[var(--gold)]' : ''}`}>
            <Filter size={13} /> Filter {activeFilters > 0 && `(${activeFilters})`}
          </button>
          <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost p-1.5 rounded-lg">
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Search + Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none focus:border-[var(--gold)]"
              placeholder="Search plate, job #, description..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {showFilter && (
          <div className="flex gap-2 flex-wrap p-3 bg-white/[0.03] border border-white/10 rounded-lg">
            <select value={statusFilter} onChange={e => setStatus(e.target.value)}
              className="text-xs bg-white/[0.05] border border-white/10 rounded px-2 py-1.5 text-white outline-none cursor-pointer"
              style={{ backgroundColor: 'rgba(15,30,55,0.95)' }}>
              <option value="ALL" style={{ background: '#0f1e37' }}>All Statuses</option>
              <option value="REPAIR_COMPLETE" style={{ background: '#0f1e37' }}>Completed</option>
              <option value="REPAIR_STARTED" style={{ background: '#0f1e37' }}>In Repair</option>
              <option value="CLOSED" style={{ background: '#0f1e37' }}>Closed</option>
            </select>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="text-xs bg-white/[0.05] border border-white/10 rounded px-2 py-1.5 text-white outline-none" />
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="text-xs bg-white/[0.05] border border-white/10 rounded px-2 py-1.5 text-white outline-none" />
            <button onClick={() => { setDateFrom(''); setDateTo(''); setStatus('ALL'); }}
              className="text-xs text-slate-400 hover:text-white px-2">Clear</button>
          </div>
        )}

        <div className="table-wrap">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw size={13} className="animate-spin" /> Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-10 text-center">
              <History size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">
                {historyJobs.length === 0 ? 'No maintenance history yet' : 'No records match your filters'}
              </p>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Date</th><th>Job #</th><th>Vehicle</th><th>Description</th><th>Status</th><th>Cost</th></tr>
              </thead>
              <tbody>
                {filtered.map(j => {
                  const cost = j.estimates?.[0]?.totalCost || j.invoices?.[0]?.totalAmount || null;
                  return (
                    <tr key={j.id}>
                      <td className="text-[10px] text-[var(--text3)]">
                        {j.createdAt ? new Date(j.createdAt).toLocaleDateString('en-NG') : '—'}
                      </td>
                      <td className="font-mono text-[var(--gold)] text-[11px] font-600">{j.jobNumber}</td>
                      <td className="font-medium text-[var(--text)]">
                        {j.vehicle?.plateNumber}
                        <span className="block text-[10px] text-slate-400">{j.vehicle?.make} {j.vehicle?.model}</span>
                      </td>
                      <td className="text-xs text-slate-300 max-w-[200px] truncate">{j.description}</td>
                      <td>
                        <span className={`pill text-[10px] ${STATUS_CLS[j.status] || 'bg-slate-500/15 text-slate-400'}`}>
                          {STATUS_LABEL[j.status] || j.status}
                        </span>
                      </td>
                      <td className={cost ? 'text-[var(--gold)] font-600' : 'text-[var(--text3)]'}>{fmt(cost)}</td>
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
