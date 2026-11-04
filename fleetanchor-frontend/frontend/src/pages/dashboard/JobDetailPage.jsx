import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock, Send, FileText, Wrench, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { jobService, invoiceService } from '../../services/api';

// Previously this page showed the same made-up job (JB-2647) for every job and
// its buttons only pretended to work. It now loads the real job and saves changes.

const STATUS_STEPS = ['SUBMITTED','DIAGNOSED','ESTIMATE_SENT','ESTIMATE_APPROVED','REPAIR_STARTED','REPAIR_COMPLETE','AWAITING_PAYMENT','CLOSED'];
const PILL = { SUBMITTED: 'pill-pending', DIAGNOSED: 'pill-approved', ESTIMATE_SENT: 'pill-pending', ESTIMATE_APPROVED: 'pill-approved',
  ESTIMATE_QUERIED: 'pill-query', REPAIR_STARTED: 'pill-repair', REPAIR_COMPLETE: 'pill-complete', AWAITING_PAYMENT: 'pill-pending', CLOSED: 'pill-complete' };

const label = (s) => String(s || '').replace(/_/g, ' ');
const money = (n) => `₦${Number(n || 0).toLocaleString('en-NG')}`;
const when = (d) => (d ? new Date(d).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—');
const errMsg = (e, fallback) => e?.response?.data?.error || e?.response?.data?.errors?.[0]?.msg || fallback;

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [noteInput, setNoteInput] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await jobService.getOne(id);
      setJob(res.data.job);
      setMissing(false);
    } catch (e) {
      if (e?.response?.status === 404 || e?.response?.status === 400) setMissing(true);
      else toast.error(errMsg(e, 'Could not load this job'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  if (loading) return <div className="loading">Loading job…</div>;
  if (missing || !job) {
    return (
      <div className="content text-center py-16">
        <p className="text-sm text-[var(--text)] mb-1">Job not found</p>
        <p className="text-xs text-[var(--text3)] mb-4">It may have been removed, or it belongs to another account.</p>
        <button onClick={() => navigate('/admin/jobs')} className="btn-ghost mx-auto"><ArrowLeft className="w-4 h-4" />Back to jobs</button>
      </div>
    );
  }

  const status = job.status === 'ESTIMATE_QUERIED' ? 'ESTIMATE_SENT' : job.status;
  const currentStep = STATUS_STEPS.indexOf(status);
  const next = STATUS_STEPS[currentStep + 1];
  const estimate = job.estimates?.[0];
  const v = job.vehicle || {};
  const hasInvoice = (job.invoices || []).length > 0;

  const changeStatus = async (newStatus, note) => {
    setBusy(newStatus ? 'status' : 'note');
    try {
      await jobService.updateStatus(job.id, { status: newStatus || job.status, ...(note ? { note } : {}) });
      toast.success(newStatus && newStatus !== job.status ? `Moved to ${label(newStatus)}` : 'Note added');
      setNoteInput('');
      await load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not update the job'));
    } finally {
      setBusy('');
    }
  };

  const addNote = () => {
    const note = noteInput.trim();
    if (!note) return;
    changeStatus(null, note.slice(0, 1000));
  };

  const generateInvoice = async () => {
    setBusy('invoice');
    try {
      await invoiceService.create({ jobId: job.id });
      toast.success('Invoice generated');
      await load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not generate the invoice'));
    } finally {
      setBusy('');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/admin/jobs')} className="btn-ghost p-1.5" aria-label="Back to jobs"><ArrowLeft className="w-4 h-4" /></button>
          <div className="min-w-0">
            <h1 className="text-sm font-semibold text-[var(--text)]">Job {job.jobNumber}</h1>
            <p className="text-[11px] text-[var(--text3)] truncate">{v.make} {v.model} · {v.plateNumber}</p>
          </div>
          <span className={`pill ${PILL[job.status] || 'pill-pending'}`}>{label(job.status)}</span>
          {job.priority && job.priority !== 'NORMAL' && <span className="pill bg-red-500/15 text-anchor-red">{job.priority}</span>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={load} className="btn-ghost p-1.5" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
          {next === 'ESTIMATE_APPROVED' && (
            <span className="text-[11px] text-[var(--text3)] self-center">
              {job.status === 'ESTIMATE_QUERIED' ? 'Fleet queried the estimate — revise and resend it' : 'Waiting for the fleet to approve the estimate'}
            </span>
          )}
          {next && next !== 'ESTIMATE_APPROVED' && (
            <button onClick={() => changeStatus(next)} disabled={!!busy} className="btn-teal disabled:opacity-50">
              <Wrench className="w-3.5 h-3.5" />{busy === 'status' ? 'Updating…' : `→ ${label(next)}`}
            </button>
          )}
          {['REPAIR_COMPLETE', 'AWAITING_PAYMENT', 'CLOSED'].includes(job.status) && !hasInvoice && (
            <button onClick={generateInvoice} disabled={!!busy} className="btn-primary disabled:opacity-50">
              <FileText className="w-3.5 h-3.5" />{busy === 'invoice' ? 'Generating…' : 'Generate Invoice'}
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      <div className="px-5 py-3 border-b border-white/[0.06] overflow-x-auto">
        <div className="flex items-center gap-0 min-w-[520px]">
          {STATUS_STEPS.slice(0, -1).map((s, i) => (
            <React.Fragment key={s}>
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] font-bold transition-all
                  ${i < currentStep ? 'border-teal bg-teal/20 text-teal' : i === currentStep ? 'border-gold bg-gold/20 text-gold' : 'border-white/20 text-[var(--text3)]'}`}>
                  {i < currentStep ? '✓' : i + 1}
                </div>
                <span className={`text-[10px] text-center leading-tight ${i === currentStep ? 'text-gold' : i < currentStep ? 'text-teal' : 'text-[var(--text3)]'}`}>
                  {label(s)}
                </span>
              </div>
              {i < STATUS_STEPS.length - 2 && <div className={`h-px flex-1 mb-4 ${i < currentStep ? 'bg-teal' : 'bg-white/10'}`} />}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-3">Job Timeline</div>
            {(job.timelines || []).length === 0 && <p className="text-xs text-[var(--text3)]">No updates yet.</p>}
            <div className="space-y-0">
              {(job.timelines || []).map((t, i, all) => (
                <div key={t.id || i} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 border-teal bg-teal/20">
                      {i === all.length - 1 ? <Clock className="w-3 h-3 text-gold" /> : <CheckCircle className="w-3 h-3 text-teal" />}
                    </div>
                    {i < all.length - 1 && <div className="w-px flex-1 bg-white/[0.08] my-1" />}
                  </div>
                  <div className="pb-2 min-w-0">
                    <div className="text-xs font-semibold text-[var(--text)]">{label(t.status)}</div>
                    {t.note && <div className="text-[11px] text-[var(--text2)] mt-0.5 break-words">{t.note}</div>}
                    <div className="text-[10px] text-[var(--text3)] mt-1">{t.actorName} · {when(t.createdAt)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-white/[0.08]">
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addNote(); }}>
                <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)} maxLength={1000}
                  placeholder="Add a note or update…" className="form-input flex-1" />
                <button type="submit" disabled={!noteInput.trim() || !!busy} className="btn-ghost disabled:opacity-50">
                  <Send className="w-3.5 h-3.5" />{busy === 'note' ? 'Saving…' : 'Send'}
                </button>
              </form>
            </div>
          </div>

          {estimate && (
            <div className="panel">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-[var(--text)]">Estimate{estimate.revision > 1 ? ` (revision ${estimate.revision})` : ''}</div>
                <span className={`pill ${estimate.status === 'APPROVED' ? 'pill-complete' : estimate.status === 'QUERIED' ? 'pill-query' : 'pill-pending'}`}>{estimate.status}</span>
              </div>
              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between text-xs"><span className="text-[var(--text3)]">Parts</span><span className="text-[var(--text)]">{money(estimate.partsCost)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-[var(--text3)]">Labour</span><span className="text-[var(--text)]">{money(estimate.labourCost)}</span></div>
                <div className="flex justify-between text-sm font-bold border-t border-white/[0.08] pt-1.5 mt-1.5">
                  <span className="text-[var(--text)]">Total</span><span className="text-gold">{money(estimate.totalCost)}</span>
                </div>
              </div>
              {estimate.notes && <div className="text-[11px] text-[var(--text3)] bg-white/[0.04] rounded-lg p-2">{estimate.notes}</div>}
              {estimate.queryNote && <div className="text-[11px] text-anchor-red bg-red-500/5 rounded-lg p-2 mt-2">Fleet query: {estimate.queryNote}</div>}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <InfoPanel title="Vehicle" rows={[['VIN', v.vin], ['Plate', v.plateNumber], ['Make/Model', [v.make, v.model, v.year].filter(Boolean).join(' ')],
            ['Engine', v.engineNumber], ['Bay', job.bayNumber || 'Unassigned']]} />
          <InfoPanel title="Fleet" rows={[['Company', v.vendor?.companyName], ['Contact', v.vendor?.email || v.vendor?.contactEmail],
            ['Submitted by', job.createdBy?.fullName], ['Category', label(job.category)], ['Submitted', when(job.submittedAt)]]} />
          <div className="panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-2">Complaint</div>
            <p className="text-xs text-[var(--text2)] leading-relaxed break-words">{job.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoPanel({ title, rows }) {
  return (
    <div className="panel">
      <div className="text-xs font-semibold text-[var(--text)] mb-2">{title}</div>
      {rows.map(([k, val]) => (
        <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-white/[0.05] last:border-0">
          <span className="text-[11px] text-[var(--text3)] flex-shrink-0">{k}</span>
          <span className="text-[11px] font-medium text-[var(--text)] text-right break-all">{val || '—'}</span>
        </div>
      ))}
    </div>
  );
}
