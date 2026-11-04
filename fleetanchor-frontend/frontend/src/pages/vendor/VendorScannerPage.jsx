import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Scan, Search, Plus } from 'lucide-react';
import { useAuthStore } from '../../context/authStore';
import { vehicleService } from '../../services/api';
import toast from 'react-hot-toast';

// Previously always showed the same made-up truck; now looks up the real vehicle.
const jobCost = (j) => Number(j.invoices?.[0]?.totalAmount ?? j.estimates?.find((e) => e.status === 'APPROVED')?.totalCost ?? 0);
const nice = (c) => String(c || '').replace(/_/g, ' ').toLowerCase().replace(/^\w/, (x) => x.toUpperCase());

export default function VendorScannerPage() {
  const { user } = useAuthStore();
  const isFieldAgent = user?.role === 'FIELD_AGENT';
  const [query, setQuery] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const search = async () => {
    if (!query.trim()) { toast.error('Enter VIN or plate number'); return; }
    setLoading(true);
    try {
      const q = query.trim().toUpperCase();
      const found = (await vehicleService.search(q)).data.data || [];
      const v = found.find((x) => x.vin?.toUpperCase() === q || x.plateNumber?.toUpperCase() === q) || found[0];
      if (!v) { setResult(null); toast.error('No vehicle in your fleet with that VIN or plate'); return; }
      const jobs = (await vehicleService.history(v.id, isFieldAgent)).data.data?.jobs || [];
      const yearStart = new Date(new Date().getFullYear(), 0, 1);
      const last = jobs.find((j) => ['REPAIR_COMPLETE', 'AWAITING_PAYMENT', 'CLOSED'].includes(j.status));
      setResult({
        id: v.id, vin: v.vin, plate: v.plateNumber, make: v.make, model: v.model, year: v.year, status: v.status || 'ACTIVE',
        lastService: last ? `${new Date(last.completedAt || last.submittedAt).toLocaleDateString('en-NG', { month: 'short', year: 'numeric' })} — ${nice(last.category)}` : 'No completed service yet',
        totalJobs: jobs.length,
        cost: jobs.filter((j) => new Date(j.submittedAt) >= yearStart).reduce((t, j) => t + jobCost(j), 0),
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Search failed — please try again');
    } finally {
      setLoading(false);
    }
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
              <span className={`pill ${result.status === 'IN_REPAIR' ? 'pill-repair' : 'pill-active'}`}>{result.status.replace(/_/g,' ')}</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {[
                ['Last Service', result.lastService],
                ['Total Jobs', `${result.totalJobs} maintenance events`],
                ['Cost (YTD)', isFieldAgent ? '— Hidden in field mode' : `₦${result.cost.toLocaleString('en-NG')}`],
              ].map(([k,v])=>(
                <div key={k} className="flex justify-between py-1.5 border-b border-white/[0.06] last:border-0">
                  <span className="text-[10px] text-[var(--text3)]">{k}</span>
                  <span className={`text-[11px] font-medium ${k==='Cost (YTD)'&&!isFieldAgent?'text-gold':k==='Cost (YTD)'?'text-[var(--text3)] italic':'text-[var(--text)]'}`}>{v}</span>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <button onClick={() => navigate(`/vendor/jobs?new=${result.id}`)} className="flex-1 btn-primary justify-center"><Plus className="w-3.5 h-3.5"/>Submit Complaint</button>
                <button onClick={() => navigate('/vendor/history')} className="flex-1 btn-ghost justify-center">View Full History</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
