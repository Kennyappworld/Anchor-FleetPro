import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Search, ChevronRight, Wrench } from 'lucide-react';
import { jobService } from '../../services/api';

const STATUS_MAP = {
  SUBMITTED:          { label: 'Submitted',        cls: 'bg-blue-500/15 text-blue-300' },
  DIAGNOSED:          { label: 'Diagnosed',         cls: 'bg-indigo-500/15 text-indigo-300' },
  ESTIMATE_SENT:      { label: 'Est. Sent',         cls: 'bg-yellow-500/15 text-yellow-300' },
  ESTIMATE_APPROVED:  { label: 'Approved',          cls: 'bg-teal-500/15 text-teal-300' },
  ESTIMATE_QUERIED:   { label: 'Queried',           cls: 'bg-purple-500/15 text-purple-300' },
  REPAIR_STARTED:     { label: 'In Repair',         cls: 'bg-orange-500/15 text-orange-400' },
  REPAIR_COMPLETE:    { label: 'Ready Pickup',      cls: 'bg-green-500/15 text-green-400' },
  AWAITING_PAYMENT:   { label: 'Awaiting Payment',  cls: 'bg-yellow-500/15 text-yellow-200' },
  CLOSED:             { label: 'Closed',            cls: 'bg-slate-500/15 text-slate-400' },
  CANCELLED:          { label: 'Cancelled',         cls: 'bg-red-500/15 text-red-400' },
};

const PRIORITY_CLS = {
  LOW: 'text-green-400', NORMAL: 'text-blue-400', HIGH: 'text-amber-400', CRITICAL: 'text-red-400',
};

export default function JobsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [total, setTotal] = useState(0);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { limit: 100 };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await jobService.list(params);
      const list = res.data?.jobs || res.data?.data || [];
      setJobs(list);
      setTotal(res.data?.pagination?.total || list.length);
    } catch { /* fail silently */ }
    finally { setLoading(false); setRefreshing(false); }
  }, [statusFilter, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setTimeout(() => load(), 400); return () => clearTimeout(t); }, [search]);

  const activeCount = jobs.filter(j => ['SUBMITTED','DIAGNOSED','ESTIMATE_SENT','ESTIMATE_APPROVED','REPAIR_STARTED'].includes(j.status)).length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">All Job Requests</h1>
          {!loading && <p className="text-[10px] text-[var(--text3)] mt-0.5">{total} total · {activeCount} active</p>}
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost p-1.5 rounded-lg">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none focus:border-[var(--gold)]"
              placeholder="Search job #, plate, description..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            className="text-xs bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-white outline-none cursor-pointer"
            style={{ backgroundColor: 'rgba(15,30,55,0.95)' }}>
            <option value="" style={{ background: '#0f1e37' }}>All Statuses</option>
            {Object.entries(STATUS_MAP).map(([v, { label }]) => (
              <option key={v} value={v} style={{ background: '#0f1e37' }}>{label}</option>
            ))}
          </select>
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin" /> Loading...
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-10 text-center">
              <Wrench size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">No job requests yet</p>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Job #</th><th>Vehicle</th><th>Vendor</th><th>Issue</th><th>Priority</th><th>Status</th><th>Submitted</th><th></th></tr>
              </thead>
              <tbody>
                {jobs.map(j => {
                  const pill = STATUS_MAP[j.status] || { label: j.status, cls: 'bg-slate-500/15 text-slate-400' };
                  return (
                    <tr key={j.id} className="cursor-pointer" onClick={() => navigate(`/admin/jobs/${j.id}`)}>
                      <td className="font-mono text-[var(--gold)] font-600 text-[11px]">{j.jobNumber}</td>
                      <td className="font-medium text-[var(--text)]">
                        {j.vehicle?.plateNumber}
                        <span className="block text-[10px] text-slate-400">{j.vehicle?.make} {j.vehicle?.model}</span>
                      </td>
                      <td className="text-xs text-slate-300">{j.vehicle?.vendor?.companyName || '—'}</td>
                      <td className="text-xs text-slate-300 max-w-[180px] truncate">{j.description}</td>
                      <td><span className={`text-[10px] font-600 ${PRIORITY_CLS[j.priority] || 'text-slate-400'}`}>{j.priority || 'NORMAL'}</span></td>
                      <td><span className={`pill text-[10px] ${pill.cls}`}>{pill.label}</span></td>
                      <td className="text-[10px] text-[var(--text3)]">{j.createdAt ? new Date(j.createdAt).toLocaleDateString('en-NG') : '—'}</td>
                      <td><ChevronRight size={14} className="text-slate-600" /></td>
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
