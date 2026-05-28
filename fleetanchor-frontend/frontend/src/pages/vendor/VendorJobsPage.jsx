import React, { useState } from 'react';
import { Plus, CheckCircle, MessageSquare, X, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

const MOCK = [
  { id:'1', num:'JB-2647', plate:'LND-421-XY', issue:'Engine overheating', status:'REPAIR_STARTED', cost:null, submitted:'2026-05-25' },
  { id:'2', num:'JB-2646', plate:'ABJ-009-FG', issue:'Brake failure — front axle', status:'ESTIMATE_SENT', cost:142000, submitted:'2026-05-26' },
  { id:'3', num:'JB-2645', plate:'KN-772-AA', issue:'Transmission slipping', status:'ESTIMATE_APPROVED', cost:255000, submitted:'2026-05-24' },
  { id:'4', num:'JB-2644', plate:'OG-341-KS', issue:'AC compressor seized', status:'ESTIMATE_QUERIED', cost:98000, submitted:'2026-05-23' },
  { id:'5', num:'JB-2643', plate:'PH-083-BA', issue:'Tyre replacement x4', status:'REPAIR_COMPLETE', cost:380000, submitted:'2026-05-22' },
];

const S = {
  SUBMITTED:         { label:'Submitted', cls:'bg-blue-500/15 text-anchor-blue' },
  REPAIR_STARTED:    { label:'In Repair', cls:'pill-repair' },
  ESTIMATE_SENT:     { label:'Approve Estimate', cls:'pill-pending' },
  ESTIMATE_APPROVED: { label:'Approved', cls:'pill-complete' },
  ESTIMATE_QUERIED:  { label:'Queried', cls:'pill-query' },
  REPAIR_COMPLETE:   { label:'Ready for Pickup', cls:'pill-active' },
};

const CATEGORIES = [
  { value:'ENGINE',          label:'Engine' },
  { value:'BRAKES',          label:'Brakes' },
  { value:'TRANSMISSION',    label:'Transmission' },
  { value:'ELECTRICAL',      label:'Electrical' },
  { value:'CLIMATE_CONTROL', label:'Climate Control / AC' },
  { value:'TYRES_WHEELS',    label:'Tyres & Wheels' },
  { value:'SUSPENSION',      label:'Suspension' },
  { value:'BODY_FRAME',      label:'Body & Frame' },
  { value:'FUEL_SYSTEM',     label:'Fuel System' },
  { value:'OTHER',           label:'Other' },
];

const PRIORITIES = [
  { value:'LOW',      label:'Low — routine check', color:'text-green-400' },
  { value:'NORMAL',   label:'Normal — standard repair', color:'text-blue-400' },
  { value:'HIGH',     label:'High — vehicle off road', color:'text-amber-400' },
  { value:'CRITICAL', label:'Critical — safety risk', color:'text-red-400' },
];

/* Reusable styled select */
function StyledSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full appearance-none rounded-lg border border-white/[0.12] bg-white/[0.06]
                     px-3 py-2.5 pr-8 text-[13px] text-white outline-none
                     focus:border-[var(--accent)] focus:bg-white/[0.09]
                     transition-colors cursor-pointer"
          style={{ backgroundColor: 'rgba(15,30,55,0.95)' }}
        >
          {options.map(o => (
            <option
              key={o.value}
              value={o.value}
              style={{ backgroundColor: '#0f1e37', color: '#e2e8f0', padding: '8px' }}
            >
              {o.label}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
      </div>
    </div>
  );
}

export default function VendorJobsPage() {
  const [jobs, setJobs] = useState(MOCK);
  const [queryModal, setQueryModal] = useState(null);
  const [queryNote, setQueryNote] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ vehicle:'', category:'ENGINE', description:'', priority:'NORMAL' });

  const approve = (id) => {
    setJobs(prev => prev.map(j => j.id===id ? {...j, status:'ESTIMATE_APPROVED'} : j));
    toast.success('Estimate approved. Repair will begin shortly.');
  };
  const query = (id) => {
    setJobs(prev => prev.map(j => j.id===id ? {...j, status:'ESTIMATE_QUERIED'} : j));
    setQueryModal(null); setQueryNote('');
    toast.success('Query sent to workshop. They will revise the estimate.');
  };
  const submit = () => {
    if (!form.vehicle.trim()) { toast.error('Enter a vehicle plate or VIN'); return; }
    if (!form.description.trim()) { toast.error('Describe the fault'); return; }
    setShowNew(false);
    setForm({ vehicle:'', category:'ENGINE', description:'', priority:'NORMAL' });
    toast.success('Job request submitted. Workshop notified.');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">My Job Requests</h1>
        <button onClick={() => setShowNew(true)} className="btn-primary">
          <Plus className="w-3.5 h-3.5"/> New Request
        </button>
      </div>

      <div className="p-5">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Job #</th><th>Vehicle</th><th>Issue</th><th>Status</th><th>Est. Cost</th><th>Submitted</th><th>Actions</th></tr></thead>
            <tbody>
              {jobs.map(j => {
                const s = S[j.status] || { label: j.status, cls: '' };
                return (
                  <tr key={j.id}>
                    <td className="font-mono text-gold font-semibold text-[11px]">{j.num}</td>
                    <td className="font-medium text-[var(--text)]">{j.plate}</td>
                    <td>{j.issue}</td>
                    <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                    <td className={j.cost ? 'text-gold font-medium' : 'text-[var(--text3)]'}>
                      {j.cost ? `₦${j.cost.toLocaleString()}` : 'Pending'}
                    </td>
                    <td className="text-[10px] text-[var(--text3)]">{j.submitted}</td>
                    <td>
                      {j.status === 'ESTIMATE_SENT' && (
                        <div className="flex gap-1">
                          <button onClick={() => approve(j.id)} className="btn-success text-[10px] py-1">
                            <CheckCircle className="w-3 h-3"/> Approve
                          </button>
                          <button onClick={() => setQueryModal(j)} className="btn-ghost text-[10px] py-1">
                            <MessageSquare className="w-3 h-3"/> Query
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Query modal */}
      {queryModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-2 border border-white/[0.12] rounded-2xl p-5 w-full max-w-sm animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Query Estimate</h3>
              <button onClick={() => setQueryModal(null)}><X className="w-4 h-4 text-[var(--text3)]"/></button>
            </div>
            <p className="text-xs text-[var(--text3)] mb-3">Your query will be sent to the workshop. They will revise and resend the estimate.</p>
            <label className="form-label">Your concern or question</label>
            <textarea value={queryNote} onChange={e => setQueryNote(e.target.value)}
              placeholder="e.g. Labour cost seems high — can you itemise?" className="form-input resize-none mb-4" rows={4}/>
            <div className="flex gap-2">
              <button onClick={() => setQueryModal(null)} className="flex-1 btn-ghost justify-center">Cancel</button>
              <button onClick={() => query(queryModal.id)} disabled={!queryNote.trim()}
                className="flex-1 btn-primary justify-center disabled:opacity-50">Send Query</button>
            </div>
          </div>
        </div>
      )}

      {/* New Job Request modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="border border-white/[0.12] rounded-2xl p-6 w-full max-w-md animate-slide-in shadow-2xl"
               style={{ backgroundColor: '#0d1f38' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[15px] font-semibold text-white">New Job Request</h3>
                <p className="text-[11px] text-[var(--text3)] mt-0.5">Fill in the details below</p>
              </div>
              <button onClick={() => setShowNew(false)}
                className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-[var(--text3)]"/>
              </button>
            </div>

            <div className="space-y-4">
              {/* Vehicle */}
              <div>
                <label className="form-label">Vehicle (VIN or Plate Number)</label>
                <input
                  value={form.vehicle}
                  onChange={e => setForm(f => ({...f, vehicle: e.target.value}))}
                  placeholder="e.g. LND-421-XY or 1HGCM82633A004352"
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2.5
                             text-[13px] text-white placeholder-white/30 outline-none
                             focus:border-[var(--accent)] focus:bg-white/[0.09] transition-colors"
                />
              </div>

              {/* Category */}
              <StyledSelect
                label="Repair Category"
                value={form.category}
                onChange={v => setForm(f => ({...f, category: v}))}
                options={CATEGORIES}
              />

              {/* Description */}
              <div>
                <label className="form-label">Description of Complaint</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({...f, description: e.target.value}))}
                  placeholder="Describe the fault clearly, e.g. 'Engine knocking loudly at startup, oil pressure light on'"
                  className="w-full rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2.5
                             text-[13px] text-white placeholder-white/30 outline-none resize-none
                             focus:border-[var(--accent)] focus:bg-white/[0.09] transition-colors"
                  rows={3}
                />
              </div>

              {/* Priority */}
              <StyledSelect
                label="Priority Level"
                value={form.priority}
                onChange={v => setForm(f => ({...f, priority: v}))}
                options={PRIORITIES}
              />

              {/* Priority hint */}
              <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                {(() => {
                  const p = PRIORITIES.find(p => p.value === form.priority);
                  return <p className={`text-[11px] font-medium ${p?.color}`}>{p?.label}</p>;
                })()}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowNew(false)} className="flex-1 btn-ghost justify-center">Cancel</button>
                <button onClick={submit} className="flex-1 btn-primary justify-center">Submit Request</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
