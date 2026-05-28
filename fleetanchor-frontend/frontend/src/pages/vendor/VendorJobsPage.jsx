import React, { useState } from 'react';
import { Plus, CheckCircle, MessageSquare, X } from 'lucide-react';
import toast from 'react-hot-toast';

const MOCK = [
  { id:'1', num:'JB-2647', plate:'LND-421-XY', issue:'Engine overheating', status:'REPAIR_STARTED', cost:null, submitted:'2026-05-25' },
  { id:'2', num:'JB-2646', plate:'ABJ-009-FG', issue:'Brake failure — front axle', status:'ESTIMATE_SENT', cost:142000, submitted:'2026-05-26' },
  { id:'3', num:'JB-2645', plate:'KN-772-AA', issue:'Transmission slipping', status:'ESTIMATE_APPROVED', cost:255000, submitted:'2026-05-24' },
  { id:'4', num:'JB-2644', plate:'OG-341-KS', issue:'AC compressor seized', status:'ESTIMATE_QUERIED', cost:98000, submitted:'2026-05-23' },
  { id:'5', num:'JB-2643', plate:'PH-083-BA', issue:'Tyre replacement x4', status:'REPAIR_COMPLETE', cost:380000, submitted:'2026-05-22' },
];

const S = {
  SUBMITTED:        {label:'Submitted',cls:'bg-blue-500/15 text-anchor-blue'},
  REPAIR_STARTED:   {label:'In Repair',cls:'pill-repair'},
  ESTIMATE_SENT:    {label:'Approve Estimate',cls:'pill-pending'},
  ESTIMATE_APPROVED:{label:'Approved',cls:'pill-complete'},
  ESTIMATE_QUERIED: {label:'Queried',cls:'pill-query'},
  REPAIR_COMPLETE:  {label:'Ready for Pickup',cls:'pill-active'},
};

export default function VendorJobsPage() {
  const [jobs, setJobs] = useState(MOCK);
  const [queryModal, setQueryModal] = useState(null);
  const [queryNote, setQueryNote] = useState('');
  const [showNew, setShowNew] = useState(false);

  const approve = (id) => {
    setJobs(prev=>prev.map(j=>j.id===id?{...j,status:'ESTIMATE_APPROVED'}:j));
    toast.success('Estimate approved. Repair will begin shortly.');
  };
  const query = (id) => {
    setJobs(prev=>prev.map(j=>j.id===id?{...j,status:'ESTIMATE_QUERIED'}:j));
    setQueryModal(null); setQueryNote('');
    toast.success('Query sent to workshop. They will revise the estimate.');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">My Job Requests</h1>
        <button onClick={()=>setShowNew(true)} className="btn-primary"><Plus className="w-3.5 h-3.5"/>New Request</button>
      </div>
      <div className="p-5">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Job #</th><th>Vehicle</th><th>Issue</th><th>Status</th><th>Est. Cost</th><th>Submitted</th><th>Actions</th></tr></thead>
            <tbody>
              {jobs.map(j=>{
                const s=S[j.status]||{label:j.status,cls:''};
                return (
                  <tr key={j.id}>
                    <td className="font-mono text-gold font-semibold text-[11px]">{j.num}</td>
                    <td className="font-medium text-[var(--text)]">{j.plate}</td>
                    <td>{j.issue}</td>
                    <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                    <td className={j.cost?'text-gold font-medium':'text-[var(--text3)]'}>{j.cost?`₦${j.cost.toLocaleString()}`:'Pending'}</td>
                    <td className="text-[10px] text-[var(--text3)]">{j.submitted}</td>
                    <td>
                      {j.status==='ESTIMATE_SENT'&&(
                        <div className="flex gap-1">
                          <button onClick={()=>approve(j.id)} className="btn-success text-[10px] py-1"><CheckCircle className="w-3 h-3"/>Approve</button>
                          <button onClick={()=>setQueryModal(j)} className="btn-ghost text-[10px] py-1"><MessageSquare className="w-3 h-3"/>Query</button>
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

      {queryModal&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-2 border border-white/[0.12] rounded-2xl p-5 w-full max-w-sm animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Query Estimate</h3>
              <button onClick={()=>setQueryModal(null)}><X className="w-4 h-4 text-[var(--text3)]"/></button>
            </div>
            <p className="text-xs text-[var(--text3)] mb-3">Your query will be sent to the workshop. They will revise and resend the estimate.</p>
            <label className="form-label">Your concern or question</label>
            <textarea value={queryNote} onChange={e=>setQueryNote(e.target.value)} placeholder="e.g. Labour cost seems high — can you itemise?" className="form-input resize-none mb-4" rows={4}/>
            <div className="flex gap-2">
              <button onClick={()=>setQueryModal(null)} className="flex-1 btn-ghost justify-center">Cancel</button>
              <button onClick={()=>query(queryModal.id)} disabled={!queryNote.trim()} className="flex-1 btn-primary justify-center disabled:opacity-50">Send Query</button>
            </div>
          </div>
        </div>
      )}

      {showNew&&(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-2 border border-white/[0.12] rounded-2xl p-5 w-full max-w-sm animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">New Job Request</h3>
              <button onClick={()=>setShowNew(false)}><X className="w-4 h-4 text-[var(--text3)]"/></button>
            </div>
            <div className="space-y-3">
              <div><label className="form-label">Vehicle (VIN or Plate)</label><input className="form-input" placeholder="e.g. LND-421-XY"/></div>
              <div><label className="form-label">Category</label>
                <select className="form-input">
                  {['ENGINE','BRAKES','TRANSMISSION','ELECTRICAL','CLIMATE_CONTROL','TYRES_WHEELS','OTHER'].map(c=><option key={c}>{c.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div><label className="form-label">Description of complaint</label><textarea className="form-input resize-none" rows={3} placeholder="Describe the fault in detail…"/></div>
              <div><label className="form-label">Priority</label>
                <select className="form-input"><option>NORMAL</option><option>HIGH</option><option>CRITICAL</option></select>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={()=>setShowNew(false)} className="flex-1 btn-ghost justify-center">Cancel</button>
                <button onClick={()=>{setShowNew(false);toast.success('Job request submitted. Workshop notified.');}} className="flex-1 btn-primary justify-center">Submit Request</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
