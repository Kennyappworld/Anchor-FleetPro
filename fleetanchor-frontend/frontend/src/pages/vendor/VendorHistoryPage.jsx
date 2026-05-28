import React, { useState } from 'react';
import { Search, Download, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const HISTORY = [
  { date:'May 2026', plate:'LND-421-XY', type:'Engine Overhaul', tech:'E. Nwosu', status:'REPAIR_STARTED', cost:485000 },
  { date:'Jan 2026', plate:'ABJ-009-FG', type:'Brake Reline', tech:'K. Adeyemi', status:'REPAIR_COMPLETE', cost:142000 },
  { date:'Oct 2025', plate:'KN-772-AA', type:'Full Service', tech:'E. Nwosu', status:'REPAIR_COMPLETE', cost:88500 },
  { date:'Jul 2025', plate:'OG-341-KS', type:'Transmission Flush', tech:'T. Eze', status:'REPAIR_COMPLETE', cost:255000 },
  { date:'Mar 2025', plate:'PH-083-BA', type:'Tyre Replacement', tech:'K. Adeyemi', status:'REPAIR_COMPLETE', cost:380000 },
];

// Assume vendor is on Growth plan (no export)
const HAS_EXPORT = false;

export default function VendorHistoryPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const rows = HISTORY.filter(h => !search || h.plate.toLowerCase().includes(search.toLowerCase()) || h.type.toLowerCase().includes(search.toLowerCase()));

  const tryExport = () => {
    if (!HAS_EXPORT) {
      toast.error('Export requires Growth plan or above. Upgrade to continue.');
      navigate('/vendor/subscription');
      return;
    }
    toast.success('Exporting…');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Maintenance History</h1>
        <button onClick={tryExport} className="btn-ghost">
          <Lock className="w-3.5 h-3.5"/>Export PDF/CSV
        </button>
      </div>

      <div className="p-5">
        {/* Export gate */}
        {!HAS_EXPORT && (
          <div className="flex items-center gap-3 bg-gold/8 border border-gold/20 rounded-xl p-3 mb-4">
            <Lock className="w-5 h-5 text-gold flex-shrink-0"/>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gold">Export requires Growth plan or above</div>
              <div className="text-[10px] text-[var(--text3)] mt-0.5">You can view full history below. Upgrade to download as PDF or CSV (with optional cost-hide for audits).</div>
            </div>
            <button onClick={()=>navigate('/vendor/subscription')} className="btn-primary text-[10px] py-1 whitespace-nowrap">Upgrade Now</button>
          </div>
        )}

        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 max-w-xs mb-4">
          <Search className="w-3 h-3 text-[var(--text3)]"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search plate, repair type…" className="bg-transparent text-xs placeholder-[var(--text3)] text-[var(--text)] outline-none w-full"/>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Date</th><th>Vehicle</th><th>Type</th><th>Technician</th><th>Status</th><th>Cost</th></tr></thead>
            <tbody>
              {rows.map((h,i)=>(
                <tr key={i}>
                  <td>{h.date}</td>
                  <td className="font-medium text-[var(--text)]">{h.plate}</td>
                  <td>{h.type}</td>
                  <td>{h.tech}</td>
                  <td><span className={`pill ${h.status==='REPAIR_COMPLETE'?'pill-complete':'pill-repair'}`}>{h.status==='REPAIR_COMPLETE'?'Completed':'Ongoing'}</span></td>
                  <td className="text-gold font-medium">₦{h.cost.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 bg-navy-3 flex justify-between border-t border-white/[0.08]">
            <span className="text-xs text-[var(--text3)]">Total (shown)</span>
            <span className="text-xs font-bold text-gold">₦{rows.reduce((a,h)=>a+h.cost,0).toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
