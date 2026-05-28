import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, Clock, AlertTriangle, Send, DollarSign, FileText, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';

const JOB = {
  id:'1', jobNumber:'JB-2647', status:'REPAIR_STARTED', priority:'HIGH',
  vehicle:{ vin:'WNXNF4327A6', plate:'LND-421-XY', make:'Mercedes', model:'Actros', year:2021, engine:'OM471LA-89234' },
  vendor:{ name:'Coca-Cola Nigeria', contact:'a.okafor@coca-cola.com' },
  createdBy:'K. Adeyemi', category:'ENGINE', description:'Engine overheating at high load. Temperature gauge hitting red zone after 30 minutes of highway driving. Possible coolant system issue or thermostat fault.',
  submittedAt:'2026-05-25 09:14', diagnosedAt:'2026-05-25 14:30', estimateSentAt:'2026-05-26 10:00', approvedAt:'2026-05-26 15:45', repairStartAt:'2026-05-27 08:00',
  bay:'Bay 01', tech:'Emmanuel Nwosu',
  timeline:[
    { status:'SUBMITTED', note:'Job submitted by field agent', actor:'K. Adeyemi', at:'25 May 09:14', done:true },
    { status:'DIAGNOSED', note:'Thermostat seized, coolant leak found at radiator hose', actor:'E. Nwosu', at:'25 May 14:30', done:true },
    { status:'ESTIMATE_SENT', note:'Estimate sent: ₦485,000 (parts ₦310K + labour ₦175K)', actor:'System', at:'26 May 10:00', done:true },
    { status:'ESTIMATE_APPROVED', note:'Estimate approved by fleet manager', actor:'A. Okafor', at:'26 May 15:45', done:true },
    { status:'REPAIR_STARTED', note:'Repair commenced in Bay 01', actor:'E. Nwosu', at:'27 May 08:00', done:true },
    { status:'REPAIR_COMPLETE', note:'Awaiting completion', actor:'—', at:'Pending', done:false },
  ],
  estimate:{ partsCost:310000, labourCost:175000, totalCost:485000, status:'APPROVED', notes:'Thermostat replacement, radiator hose x2, full coolant flush, pressure test' },
};

const STATUS_STEPS = ['SUBMITTED','DIAGNOSED','ESTIMATE_SENT','ESTIMATE_APPROVED','REPAIR_STARTED','REPAIR_COMPLETE','AWAITING_PAYMENT','CLOSED'];

export default function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [noteInput, setNoteInput] = useState('');
  const [sending, setSending] = useState(false);

  const currentStep = STATUS_STEPS.indexOf(JOB.status);

  const advanceStatus = async () => {
    if (currentStep >= STATUS_STEPS.length - 1) return;
    setSending(true);
    await new Promise(r => setTimeout(r, 700));
    toast.success(`Status advanced to ${STATUS_STEPS[currentStep+1].replace(/_/g,' ')}`);
    setSending(false);
  };

  const fmt = (n) => `₦${n.toLocaleString()}`;

  return (
    <div>
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={()=>navigate('/admin/jobs')} className="btn-ghost p-1.5"><ArrowLeft className="w-4 h-4" /></button>
          <div>
            <h1 className="text-sm font-semibold text-[var(--text)]">Job {JOB.jobNumber}</h1>
            <p className="text-[10px] text-[var(--text3)]">{JOB.vehicle.make} {JOB.vehicle.model} · {JOB.vehicle.plate}</p>
          </div>
          <span className="pill pill-repair">{JOB.status.replace(/_/g,' ')}</span>
          <span className="pill bg-red-500/15 text-anchor-red">{JOB.priority}</span>
        </div>
        <div className="flex gap-2">
          <button onClick={advanceStatus} disabled={sending} className="btn-teal disabled:opacity-50">
            <Wrench className="w-3.5 h-3.5" />{sending?'Updating…':`→ ${(STATUS_STEPS[currentStep+1]||'Done').replace(/_/g,' ')}`}
          </button>
          <button className="btn-primary"><FileText className="w-3.5 h-3.5" />Generate Invoice</button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-0">
          {STATUS_STEPS.slice(0,-1).map((s,i)=>(
            <React.Fragment key={s}>
              <div className={`flex flex-col items-center gap-1 flex-1`}>
                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[9px] font-bold transition-all
                  ${i<currentStep?'border-teal bg-teal/20 text-teal':i===currentStep?'border-gold bg-gold/20 text-gold animate-pulse-gold':'border-white/20 text-[var(--text3)]'}`}>
                  {i<currentStep?'✓':i+1}
                </div>
                <span className={`text-[8px] text-center leading-tight ${i===currentStep?'text-gold':i<currentStep?'text-teal':'text-[var(--text3)]'}`}>
                  {s.replace(/_/g,' ')}
                </span>
              </div>
              {i<STATUS_STEPS.length-2&&<div className={`h-px flex-1 mb-4 ${i<currentStep?'bg-teal':'bg-white/10'}`}/>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="p-5 grid grid-cols-3 gap-4">
        {/* Left — Timeline */}
        <div className="col-span-2 space-y-4">
          <div className="panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-3">Job Timeline</div>
            <div className="space-y-0">
              {JOB.timeline.map((t,i)=>(
                <div key={i} className="flex gap-3 pb-4 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0
                      ${t.done?'border-teal bg-teal/20':i===JOB.timeline.findIndex(x=>!x.done)?'border-gold bg-gold/20':'border-white/20'}`}>
                      {t.done?<CheckCircle className="w-3 h-3 text-teal"/>:<Clock className="w-3 h-3 text-[var(--text3)]"/>}
                    </div>
                    {i<JOB.timeline.length-1&&<div className="w-px flex-1 bg-white/[0.08] my-1"/>}
                  </div>
                  <div className="pb-2">
                    <div className="text-[11px] font-semibold text-[var(--text)]">{t.status.replace(/_/g,' ')}</div>
                    <div className="text-[10px] text-[var(--text2)] mt-0.5">{t.note}</div>
                    <div className="text-[9px] text-[var(--text3)] mt-1">{t.actor} · {t.at}</div>
                  </div>
                </div>
              ))}
            </div>
            {/* Add note */}
            <div className="mt-4 pt-3 border-t border-white/[0.08]">
              <div className="flex gap-2">
                <input value={noteInput} onChange={e=>setNoteInput(e.target.value)} placeholder="Add note or status update…" className="form-input flex-1 text-xs" />
                <button className="btn-ghost"><Send className="w-3.5 h-3.5"/>Send</button>
              </div>
            </div>
          </div>

          {/* Estimate card */}
          {JOB.estimate && (
            <div className="panel">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-[var(--text)]">Estimate</div>
                <span className="pill pill-complete">{JOB.estimate.status}</span>
              </div>
              <div className="space-y-1.5 mb-3">
                <div className="flex justify-between text-xs"><span className="text-[var(--text3)]">Parts</span><span className="text-[var(--text)]">{fmt(JOB.estimate.partsCost)}</span></div>
                <div className="flex justify-between text-xs"><span className="text-[var(--text3)]">Labour</span><span className="text-[var(--text)]">{fmt(JOB.estimate.labourCost)}</span></div>
                <div className="flex justify-between text-sm font-bold border-t border-white/[0.08] pt-1.5 mt-1.5">
                  <span className="text-[var(--text)]">Total</span><span className="text-gold">{fmt(JOB.estimate.totalCost)}</span>
                </div>
              </div>
              <div className="text-[10px] text-[var(--text3)] bg-white/[0.04] rounded-lg p-2">{JOB.estimate.notes}</div>
            </div>
          )}
        </div>

        {/* Right — Details */}
        <div className="space-y-3">
          <div className="panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-2">Vehicle</div>
            {[['VIN',JOB.vehicle.vin],['Plate',JOB.vehicle.plate],['Make/Model',`${JOB.vehicle.make} ${JOB.vehicle.model} ${JOB.vehicle.year}`],['Engine',JOB.vehicle.engine],['Bay',JOB.bay||'Unassigned'],['Technician',JOB.tech||'Unassigned']].map(([k,v])=>(
              <div key={k} className="flex justify-between py-1.5 border-b border-white/[0.05] last:border-0">
                <span className="text-[10px] text-[var(--text3)]">{k}</span>
                <span className="text-[10px] font-medium text-[var(--text)] text-right">{v}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-2">Vendor</div>
            {[['Company',JOB.vendor.name],['Contact',JOB.vendor.contact],['Submitted by',JOB.createdBy],['Category',JOB.category]].map(([k,v])=>(
              <div key={k} className="flex justify-between py-1.5 border-b border-white/[0.05] last:border-0">
                <span className="text-[10px] text-[var(--text3)]">{k}</span>
                <span className="text-[10px] font-medium text-[var(--text)] text-right max-w-[60%] truncate">{v}</span>
              </div>
            ))}
          </div>

          <div className="panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-2">Complaint</div>
            <p className="text-[11px] text-[var(--text2)] leading-relaxed">{JOB.description}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
