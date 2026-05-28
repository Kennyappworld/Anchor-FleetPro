import React from 'react';
import { Wrench, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const BAYS = [
  { bay:'Bay 01', job:'JB-2647', plate:'LND-421-XY', vendor:'Coca-Cola Nigeria', type:'Engine Overhaul', tech:'Emmanuel Nwosu', started:'2026-05-27 08:00', pct:72, est:'2026-05-28' },
  { bay:'Bay 03', job:'JB-2645', plate:'KN-772-AA', vendor:'NNPC Logistics', type:'Transmission Flush', tech:'Tobi Eze', started:'2026-05-26 14:30', pct:35, est:'2026-05-29' },
];
const QUEUE = [
  { job:'JB-2642', plate:'ABJ-014-RT', vendor:'Coca-Cola Nigeria', type:'Electrical Fault', priority:'HIGH' },
  { job:'JB-2646', plate:'ABJ-009-FG', vendor:'Dangote Flour', type:'Brake System', priority:'CRITICAL' },
];

export default function RepairsPage() {
  const navigate = useNavigate();
  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Active Repairs</h1>
        <p className="text-xs text-[var(--text3)]">{BAYS.length} bays active · {QUEUE.length} queued</p>
      </div>
      <div className="p-5">
        <h2 className="section-title mb-3">Active Bays</h2>
        <div className="grid grid-cols-2 gap-4 mb-6">
          {BAYS.map(b=>(
            <div key={b.bay} className="panel border-l-2 border-l-gold cursor-pointer hover:border-white/20 transition-colors" onClick={()=>navigate(`/admin/jobs/${b.job}`)}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-gold uppercase tracking-wider">{b.bay}</span>
                <span className="pill pill-repair">In Repair</span>
              </div>
              <div className="text-sm font-semibold text-[var(--text)] mb-1">{b.plate}</div>
              <div className="text-xs text-[var(--text3)] mb-1">{b.vendor}</div>
              <div className="text-xs text-[var(--text2)] mb-3">{b.type}</div>
              <div className="flex justify-between text-[10px] text-[var(--text3)] mb-1.5">
                <span>Progress</span><span>{b.pct}%</span>
              </div>
              <div className="h-2 bg-white/[0.08] rounded-full overflow-hidden mb-3">
                <div className="h-full bg-gold rounded-full transition-all" style={{width:`${b.pct}%`}}/>
              </div>
              <div className="flex justify-between text-[10px] text-[var(--text3)]">
                <span>Tech: {b.tech}</span><span>Est. done: {b.est}</span>
              </div>
            </div>
          ))}
          {/* Empty bays */}
          {['Bay 02','Bay 04'].map(b=>(
            <div key={b} className="panel border-2 border-dashed border-white/10 flex flex-col items-center justify-center py-8 opacity-50">
              <Wrench className="w-6 h-6 text-[var(--text3)] mb-2"/>
              <span className="text-xs text-[var(--text3)]">{b} — Available</span>
            </div>
          ))}
        </div>

        <h2 className="section-title mb-3">Repair Queue</h2>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Job</th><th>Vehicle</th><th>Vendor</th><th>Type</th><th>Priority</th><th>Action</th></tr></thead>
            <tbody>
              {QUEUE.map(q=>(
                <tr key={q.job} onClick={()=>navigate(`/admin/jobs/${q.job}`)} className="cursor-pointer">
                  <td className="font-mono text-gold text-[11px] font-semibold">{q.job}</td>
                  <td className="font-medium text-[var(--text)]">{q.plate}</td>
                  <td>{q.vendor}</td>
                  <td>{q.type}</td>
                  <td><span className={`pill ${q.priority==='CRITICAL'?'pill-suspended':'bg-gold/15 text-gold'}`}>{q.priority}</span></td>
                  <td><button className="btn-teal text-[10px] py-1"><Wrench className="w-3 h-3"/>Assign Bay</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
