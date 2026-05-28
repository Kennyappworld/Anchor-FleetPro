import React, { useState } from 'react';
import { Scan, Search, Plus } from 'lucide-react';
import { useAuthStore } from '../../context/authStore';
import toast from 'react-hot-toast';

const MOCK_RESULT = {
  vin:'WNXNF4327A6', plate:'LND-421-XY', make:'Mercedes', model:'Actros', year:2021,
  status:'IN_REPAIR', lastService:'Jan 2026 — Brake Reline', totalJobs:8, cost:3247000,
};

export default function VendorScannerPage() {
  const { user } = useAuthStore();
  const isFieldAgent = user?.role === 'FIELD_AGENT';
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!query.trim()) { toast.error('Enter VIN or plate number'); return; }
    setLoading(true);
    await new Promise(r=>setTimeout(r,600));
    setResult(MOCK_RESULT);
    setLoading(false);
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">VIN Scanner</h1>
        {isFieldAgent && <span className="pill bg-purple-500/15 text-anchor-purple">Field Agent Mode — Cost Hidden</span>}
      </div>
      <div className="p-5">
        <div className="border-2 border-dashed border-white/20 hover:border-gold/40 transition-colors rounded-2xl p-8 text-center mb-4 cursor-pointer" onClick={()=>document.getElementById('vscan')?.focus()}>
          <Scan className="w-10 h-10 text-[var(--text3)] mx-auto mb-3"/>
          <p className="text-xs text-[var(--text3)] mb-3">Point camera at VIN barcode or type manually below</p>
          <div className="flex gap-2 max-w-xs mx-auto">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]"/>
              <input id="vscan" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&search()} placeholder="VIN or plate…" className="form-input pl-8"/>
            </div>
            <button onClick={search} disabled={loading} className="btn-primary disabled:opacity-50">{loading?'…':'Search'}</button>
          </div>
        </div>

        {result && (
          <div className="card overflow-hidden animate-fade-in">
            <div className="bg-navy-3 px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="text-2xl">🚛</div>
                <div>
                  <div className="text-sm font-bold text-[var(--text)]">{result.vin} · {result.plate}</div>
                  <div className="text-[10px] text-[var(--text3)]">{result.year} {result.make} {result.model}</div>
                </div>
              </div>
              <span className="pill pill-repair">{result.status.replace(/_/g,' ')}</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {[
                ['Last Service', result.lastService],
                ['Total Jobs', `${result.totalJobs} maintenance events`],
                ['Cost (YTD)', isFieldAgent ? '— Hidden in field mode' : `₦${result.cost.toLocaleString()}`],
              ].map(([k,v])=>(
                <div key={k} className="flex justify-between py-1.5 border-b border-white/[0.06] last:border-0">
                  <span className="text-[10px] text-[var(--text3)]">{k}</span>
                  <span className={`text-[11px] font-medium ${k==='Cost (YTD)'&&!isFieldAgent?'text-gold':k==='Cost (YTD)'?'text-[var(--text3)] italic':'text-[var(--text)]'}`}>{v}</span>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button className="flex-1 btn-primary justify-center"><Plus className="w-3.5 h-3.5"/>Submit Complaint</button>
                <button className="flex-1 btn-ghost justify-center">View Full History</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
