import React, { useState, useEffect, useCallback } from 'react';
import { Plus, CheckCircle, MessageSquare, X, ChevronDown, RefreshCw, Search, Wrench, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { jobService, vehicleService } from '../../services/api';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_MAP = {
  SUBMITTED:          { label: 'Submitted',        cls: 'bg-blue-500/15 text-blue-300' },
  DIAGNOSED:          { label: 'Diagnosed',         cls: 'bg-purple-500/15 text-purple-300' },
  ESTIMATE_SENT:      { label: 'Approve Estimate',  cls: 'bg-yellow-500/15 text-yellow-300' },
  ESTIMATE_APPROVED:  { label: 'Approved',          cls: 'bg-teal-500/15 text-teal-300' },
  ESTIMATE_QUERIED:   { label: 'Queried',           cls: 'bg-orange-500/15 text-orange-300' },
  ESTIMATE_REJECTED:  { label: 'Rejected',          cls: 'bg-red-500/15 text-red-300' },
  REPAIR_STARTED:     { label: 'In Repair',         cls: 'bg-orange-400/15 text-orange-400' },
  REPAIR_COMPLETE:    { label: 'Ready for Pickup',  cls: 'bg-green-500/15 text-green-400' },
  AWAITING_PAYMENT:   { label: 'Awaiting Payment',  cls: 'bg-yellow-500/15 text-yellow-300' },
  CLOSED:             { label: 'Closed',            cls: 'bg-slate-500/15 text-slate-400' },
  CANCELLED:          { label: 'Cancelled',         cls: 'bg-red-500/15 text-red-400' },
};

const CATEGORIES = [
  { value: 'ENGINE',          label: 'Engine' },
  { value: 'BRAKES',          label: 'Brakes' },
  { value: 'TRANSMISSION',    label: 'Transmission' },
  { value: 'ELECTRICAL',      label: 'Electrical' },
  { value: 'CLIMATE_CONTROL', label: 'Climate Control / AC' },
  { value: 'TYRES_WHEELS',    label: 'Tyres & Wheels' },
  { value: 'SUSPENSION',      label: 'Suspension' },
  { value: 'BODY_FRAME',      label: 'Body & Frame' },
  { value: 'FUEL_SYSTEM',     label: 'Fuel System' },
  { value: 'OTHER',           label: 'Other' },
];

const PRIORITIES = [
  { value: 'LOW',      label: 'Low — routine check',      color: 'text-green-400' },
  { value: 'NORMAL',   label: 'Normal — standard repair', color: 'text-blue-400' },
  { value: 'HIGH',     label: 'High — vehicle off road',  color: 'text-amber-400' },
  { value: 'CRITICAL', label: 'Critical — safety risk',   color: 'text-red-400' },
];

const fmt = n => n ? `₦${Number(n).toLocaleString()}` : 'Pending';

function StyledSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2.5 pr-8 text-[13px] text-white outline-none focus:border-[var(--gold)] transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(15,30,55,0.95)' }}>
          {options.map(o => (
            <option key={o.value} value={o.value} style={{ backgroundColor: '#0f1e37', color: '#e2e8f0' }}>{o.label}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VendorJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [total, setTotal] = useState(0);

  // New job modal
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ vehicleId: '', category: 'ENGINE', description: '', priority: 'NORMAL' });
  const [submitting, setSubmitting] = useState(false);

  // Query modal
  const [queryJob, setQueryJob] = useState(null);
  const [queryNote, setQueryNote] = useState('');
  const [queryLoading, setQueryLoading] = useState(false);

  // Approve loading tracker
  const [approvingId, setApprovingId] = useState(null);

  const fetchJobs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const params = { limit: 50, sort: 'createdAt_desc' };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await jobService.list(params);
      // API returns { jobs: [...] } or { data: [...] }
      const list = res.data?.jobs || res.data?.data || [];
      setJobs(list);
      setTotal(res.data?.pagination?.total || list.length);
    } catch (err) {
      toast.error('Failed to load jobs');
    } finally { setLoading(false); setRefreshing(false); }
  }, [statusFilter, search]);

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await vehicleService.list({ limit: 500 });
      setVehicles(res.data?.data || []);
    } catch { /* silently fail */ }
  }, []);

  useEffect(() => { fetchJobs(); fetchVehicles(); }, [fetchJobs, fetchVehicles]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchJobs(), 400);
    return () => clearTimeout(t);
  }, [search]);

  // ─── Submit New Job ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.vehicleId) { toast.error('Select a vehicle'); return; }
    if (!form.description.trim()) { toast.error('Describe the fault'); return; }
    setSubmitting(true);
    try {
      await jobService.create({
        vehicleId: form.vehicleId,
        category: form.category,
        description: form.description.trim(),
        priority: form.priority,
      });
      toast.success('Job request submitted. Workshop notified.');
      setShowNew(false);
      setForm({ vehicleId: '', category: 'ENGINE', description: '', priority: 'NORMAL' });
      fetchJobs(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to submit job');
    } finally { setSubmitting(false); }
  };

  // ─── Approve Estimate ────────────────────────────────────────────────────
  const handleApprove = async (job) => {
    setApprovingId(job.id);
    try {
      await jobService.approveEstimate(job.id);
      toast.success('Estimate approved. Repair will begin shortly.');
      fetchJobs(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to approve');
    } finally { setApprovingId(null); }
  };

  // ─── Query Estimate ──────────────────────────────────────────────────────
  const handleQuery = async () => {
    if (!queryNote.trim()) { toast.error('Enter your query'); return; }
    setQueryLoading(true);
    try {
      await jobService.queryEstimate(queryJob.id, queryNote.trim());
      toast.success('Query sent to workshop. They will revise and resend.');
      setQueryJob(null);
      setQueryNote('');
      fetchJobs(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send query');
    } finally { setQueryLoading(false); }
  };

  // ─── Render ──────────────────────────────────────────────────────────────
  const activeCount = jobs.filter(j => ['SUBMITTED','DIAGNOSED','ESTIMATE_SENT','ESTIMATE_APPROVED','REPAIR_STARTED'].includes(j.status)).length;

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">My Job Requests</h1>
          {!loading && <p className="text-[10px] text-[var(--text3)] mt-0.5">{total} total · {activeCount} active</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => fetchJobs(true)} disabled={refreshing} className="btn-ghost p-1.5 rounded-lg">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowNew(true)} className="btn-primary">
            <Plus className="w-3.5 h-3.5" /> New Request
          </button>
        </div>
      </div>

      <div className="p-5 space-y-4">

        {/* Filters */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              className="w-full pl-7 pr-3 py-1.5 text-xs bg-white/[0.05] border border-white/10 rounded-lg text-white placeholder-slate-500 outline-none focus:border-[var(--gold)]"
              placeholder="Search job #, plate, description..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => { setStatusFilter(e.target.value); }}
            className="text-xs bg-white/[0.05] border border-white/10 rounded-lg px-3 py-1.5 text-white outline-none focus:border-[var(--gold)] cursor-pointer"
            style={{ backgroundColor: 'rgba(15,30,55,0.95)' }}>
            <option value="" style={{ background: '#0f1e37' }}>All Statuses</option>
            {Object.entries(STATUS_MAP).map(([v, { label }]) => (
              <option key={v} value={v} style={{ background: '#0f1e37' }}>{label}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        <div className="table-wrap">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin" /> Loading jobs...
            </div>
          ) : jobs.length === 0 ? (
            <div className="p-10 text-center">
              <Wrench size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">No job requests yet</p>
              <p className="text-slate-500 text-xs mt-1">Click "New Request" to submit your first job</p>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Job #</th>
                  <th>Vehicle</th>
                  <th>Issue</th>
                  <th>Status</th>
                  <th>Est. Cost</th>
                  <th>Submitted</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(j => {
                  const s = STATUS_MAP[j.status] || { label: j.status, cls: 'bg-slate-500/15 text-slate-400' };
                  const estimate = j.estimates?.[0];
                  const cost = estimate?.totalCost || null;
                  const submittedDate = j.submittedAt || j.createdAt;
                  return (
                    <tr key={j.id}>
                      <td className="font-mono text-[var(--gold)] font-semibold text-[11px]">
                        {j.jobNumber}
                      </td>
                      <td className="font-medium text-[var(--text)]">
                        {j.vehicle?.plateNumber}
                        {j.vehicle?.make && <span className="text-[10px] text-slate-400 block">{j.vehicle.make} {j.vehicle.model}</span>}
                      </td>
                      <td className="max-w-[200px]">
                        <span className="truncate block text-xs">{j.description}</span>
                        <span className="text-[10px] text-slate-500">{j.category?.replace(/_/g, ' ')}</span>
                      </td>
                      <td><span className={`pill text-[10px] ${s.cls}`}>{s.label}</span></td>
                      <td className={cost ? 'text-[var(--gold)] font-medium' : 'text-[var(--text3)]'}>
                        {fmt(cost)}
                      </td>
                      <td className="text-[10px] text-[var(--text3)]">
                        {submittedDate ? new Date(submittedDate).toLocaleDateString('en-NG') : '—'}
                      </td>
                      <td>
                        {j.status === 'ESTIMATE_SENT' && (
                          <div className="flex gap-1">
                            <button
                              onClick={() => handleApprove(j)}
                              disabled={approvingId === j.id}
                              className="btn-success text-[10px] py-1 px-2 flex items-center gap-1 disabled:opacity-50">
                              <CheckCircle className="w-3 h-3" />
                              {approvingId === j.id ? '...' : 'Approve'}
                            </button>
                            <button
                              onClick={() => { setQueryJob(j); setQueryNote(''); }}
                              className="btn-ghost text-[10px] py-1 px-2 flex items-center gap-1">
                              <MessageSquare className="w-3 h-3" /> Query
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* ─── Query Modal ──────────────────────────────────────────────────── */}
      {queryJob && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0d1f38] border border-white/[0.12] rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Query Estimate</h3>
              <button onClick={() => setQueryJob(null)}><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <p className="text-xs text-slate-400 mb-1">Job: <span className="text-[var(--gold)] font-mono">{queryJob.jobNumber}</span></p>
            <p className="text-xs text-slate-400 mb-4">Your query will be sent to the workshop. They will revise and resend the estimate.</p>
            <label className="form-label">Your concern or question</label>
            <textarea value={queryNote} onChange={e => setQueryNote(e.target.value)}
              placeholder="e.g. Labour cost seems high — can you itemise the parts?"
              className="form-input resize-none mb-4 w-full" rows={4} />
            <div className="flex gap-2">
              <button onClick={() => setQueryJob(null)} className="flex-1 btn-ghost justify-center text-sm py-2">Cancel</button>
              <button onClick={handleQuery} disabled={!queryNote.trim() || queryLoading}
                className="flex-1 btn-primary justify-center text-sm py-2 disabled:opacity-50">
                {queryLoading ? 'Sending...' : 'Send Query'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── New Job Modal ────────────────────────────────────────────────── */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="border border-white/[0.12] rounded-2xl p-6 w-full max-w-md shadow-2xl" style={{ backgroundColor: '#0d1f38' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[15px] font-semibold text-white">New Job Request</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Fill in the details below</p>
              </div>
              <button onClick={() => setShowNew(false)}
                className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Vehicle dropdown */}
              <div>
                <label className="form-label">Vehicle *</label>
                <div className="relative">
                  <select value={form.vehicleId} onChange={e => setForm(f => ({ ...f, vehicleId: e.target.value }))}
                    className="w-full appearance-none rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2.5 pr-8 text-[13px] text-white outline-none focus:border-[var(--gold)] transition-colors cursor-pointer"
                    style={{ backgroundColor: 'rgba(15,30,55,0.95)' }}>
                    <option value="" style={{ background: '#0f1e37' }}>Select vehicle...</option>
                    {vehicles.map(v => (
                      <option key={v.id} value={v.id} style={{ background: '#0f1e37' }}>
                        {v.plateNumber} — {v.make} {v.model} {v.year}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                </div>
                {vehicles.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> No vehicles registered yet. Add vehicles in My Fleet first.
                  </p>
                )}
              </div>

              {/* Category */}
              <StyledSelect label="Repair Category" value={form.category}
                onChange={v => setForm(f => ({ ...f, category: v }))} options={CATEGORIES} />

              {/* Description */}
              <div>
                <label className="form-label">Description of Complaint *</label>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Describe the fault clearly, e.g. 'Engine knocking loudly at startup, oil pressure light on'"
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2.5 text-[13px] text-white placeholder-white/30 outline-none resize-none focus:border-[var(--gold)] transition-colors"
                  rows={3} />
              </div>

              {/* Priority */}
              <StyledSelect label="Priority Level" value={form.priority}
                onChange={v => setForm(f => ({ ...f, priority: v }))} options={PRIORITIES} />

              {/* Priority hint */}
              <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                {(() => {
                  const p = PRIORITIES.find(p => p.value === form.priority);
                  return <p className={`text-[11px] font-medium ${p?.color}`}>{p?.label}</p>;
                })()}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowNew(false)} className="flex-1 btn-ghost justify-center text-sm py-2.5">Cancel</button>
                <button onClick={handleSubmit} disabled={submitting || vehicles.length === 0}
                  className="flex-1 btn-primary justify-center text-sm py-2.5 disabled:opacity-50">
                  {submitting ? 'Submitting...' : 'Submit Request'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
