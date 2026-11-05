import React, { useCallback, useEffect, useState } from 'react';
import { Wrench, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { jobService } from '../../services/api';

// Live workshop floor: jobs being repaired and jobs waiting (this page used to show fixed made-up bays).

const BAYS = ['Bay 01', 'Bay 02', 'Bay 03', 'Bay 04'];
const IN_REPAIR = ['REPAIR_STARTED'];
const WAITING = ['ESTIMATE_APPROVED', 'DIAGNOSED', 'SUBMITTED'];
const nice = (c) => String(c || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());
const since = (d) => {
  if (!d) return '—';
  const h = Math.max(0, Math.round((Date.now() - new Date(d)) / 36e5));
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};
const PRIORITY_CLS = { CRITICAL: 'pill-suspended', HIGH: 'bg-gold/15 text-gold', NORMAL: 'bg-white/[0.06] text-[var(--text2)]', LOW: 'bg-white/[0.06] text-[var(--text3)]' };
const PRIORITY_RANK = { CRITICAL: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

export default function RepairsPage() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await jobService.list({ limit: 100 });
      setJobs(res.data.jobs || res.data.data || []);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not load repairs');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const active = jobs.filter((j) => IN_REPAIR.includes(j.status));
  const queue = jobs.filter((j) => WAITING.includes(j.status))
    .sort((a, b) => (PRIORITY_RANK[a.priority] ?? 2) - (PRIORITY_RANK[b.priority] ?? 2) || new Date(a.submittedAt) - new Date(b.submittedAt));
  const used = new Set(active.map((j) => j.bayNumber).filter(Boolean));
  const freeBays = BAYS.filter((b) => !used.has(b));

  const startRepair = async (job, bay) => {
    setStarting(job.id);
    try {
      await jobService.updateStatus(job.id, { status: 'REPAIR_STARTED', bayNumber: bay, note: `Repair started in ${bay}` });
      toast.success(`${job.jobNumber} started in ${bay}`);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not start the repair');
    } finally { setStarting(null); }
  };

  if (loading) return <div className="loading">Loading repairs…</div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Active Repairs</h1>
          <p className="text-[11px] text-[var(--text3)]">{active.length} in repair · {queue.length} waiting</p>
        </div>
        <button onClick={load} className="btn-ghost p-1.5" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
      </div>
      <div className="p-5">
        <h2 className="section-title mb-3">Workshop bays</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {active.map((j) => (
            <div key={j.id} className="panel border-l-2 border-l-gold cursor-pointer hover:border-white/20 transition-colors" onClick={() => navigate(`/admin/jobs/${j.id}`)}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gold uppercase tracking-wider">{j.bayNumber || 'No bay set'}</span>
                <span className="pill pill-repair">In Repair</span>
              </div>
              <div className="text-sm font-semibold text-[var(--text)] mb-1">{j.vehicle?.plateNumber} <span className="text-[var(--text3)] font-normal">· {j.jobNumber}</span></div>
              <div className="text-xs text-[var(--text3)] mb-1">{j.vehicle?.vendor?.companyName}</div>
              <div className="text-xs text-[var(--text2)] mb-3">{nice(j.category)} — {j.description}</div>
              <div className="flex justify-between text-[10px] text-[var(--text3)]">
                <span>{j.vehicle?.make} {j.vehicle?.model}</span><span>Started {since(j.repairStartAt || j.updatedAt)}</span>
              </div>
            </div>
          ))}
          {freeBays.map((b) => (
            <div key={b} className="panel border-2 border-dashed border-white/10 flex flex-col items-center justify-center py-8 opacity-60">
              <Wrench className="w-6 h-6 text-[var(--text3)] mb-2" />
              <span className="text-xs text-[var(--text3)]">{b} — Available</span>
            </div>
          ))}
        </div>

        <h2 className="section-title mb-3">Waiting for a bay</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Vehicle</th><th>Fleet</th><th>Type</th><th>Stage</th><th>Priority</th><th>Action</th></tr></thead>
            <tbody>
              {queue.length === 0 && <tr><td colSpan={7} className="text-center py-6 text-[var(--text3)]">Nothing waiting.</td></tr>}
              {queue.map((j) => (
                <tr key={j.id} onClick={() => navigate(`/admin/jobs/${j.id}`)} className="cursor-pointer">
                  <td className="font-mono text-gold text-[11px] font-semibold">{j.jobNumber}</td>
                  <td className="font-medium text-[var(--text)]">{j.vehicle?.plateNumber}</td>
                  <td>{j.vehicle?.vendor?.companyName || '—'}</td>
                  <td>{nice(j.category)}</td>
                  <td className="text-[11px]">{nice(j.status)}</td>
                  <td><span className={`pill ${PRIORITY_CLS[j.priority] || PRIORITY_CLS.NORMAL}`}>{j.priority || 'NORMAL'}</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {j.status === 'ESTIMATE_APPROVED' ? (
                      freeBays.length ? (
                        <select disabled={starting === j.id} defaultValue="" onChange={(e) => e.target.value && startRepair(j, e.target.value)}
                          className="form-input w-auto py-1 text-[11px]" aria-label="Start repair in bay">
                          <option value="" disabled>{starting === j.id ? 'Starting…' : 'Start in bay…'}</option>
                          {freeBays.map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      ) : <span className="text-[10px] text-[var(--text3)]">All bays busy</span>
                    ) : <span className="text-[10px] text-[var(--text3)]">{j.status === 'SUBMITTED' ? 'Needs diagnosis' : 'Needs estimate approval'}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
