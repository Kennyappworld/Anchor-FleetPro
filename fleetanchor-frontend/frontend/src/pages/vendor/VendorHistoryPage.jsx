import React, { useState, useMemo } from 'react';
import { Search, Download, Lock, Calendar, X, Filter } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

const HISTORY = [
  { id:'1', date:'2026-05-14', plate:'LND-421-XY', type:'Engine Overhaul',       tech:'E. Nwosu',   status:'REPAIR_STARTED',  cost:485000 },
  { id:'2', date:'2026-01-20', plate:'ABJ-009-FG', type:'Brake Reline',           tech:'K. Adeyemi', status:'REPAIR_COMPLETE', cost:142000 },
  { id:'3', date:'2025-10-05', plate:'KN-772-AA',  type:'Full Service',           tech:'E. Nwosu',   status:'REPAIR_COMPLETE', cost:88500  },
  { id:'4', date:'2025-07-18', plate:'OG-341-KS',  type:'Transmission Flush',     tech:'T. Eze',     status:'REPAIR_COMPLETE', cost:255000 },
  { id:'5', date:'2025-03-09', plate:'PH-083-BA',  type:'Tyre Replacement x4',    tech:'K. Adeyemi', status:'REPAIR_COMPLETE', cost:380000 },
  { id:'6', date:'2025-02-14', plate:'LND-421-XY', type:'Electrical Fault',       tech:'T. Eze',     status:'REPAIR_COMPLETE', cost:67000  },
  { id:'7', date:'2024-11-28', plate:'ABJ-009-FG', type:'AC Compressor Replaced', tech:'E. Nwosu',   status:'REPAIR_COMPLETE', cost:198000 },
  { id:'8', date:'2024-09-03', plate:'KN-772-AA',  type:'Suspension Overhaul',    tech:'K. Adeyemi', status:'REPAIR_COMPLETE', cost:312000 },
];

const HAS_EXPORT = false;

const STATUS_CLS = {
  REPAIR_COMPLETE: 'bg-teal/15 text-teal',
  REPAIR_STARTED:  'bg-amber-400/15 text-amber-400',
};

function fmt(d) {
  return new Date(d).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}

export default function VendorHistoryPage() {
  const navigate = useNavigate();
  const [search, setSearch]       = useState('');
  const [showFilter, setShowFilter] = useState(false);
  const [dateFrom, setDateFrom]   = useState('');
  const [dateTo, setDateTo]       = useState('');
  const [statusFilter, setStatus] = useState('ALL');
  const [vehicleFilter, setVehicle] = useState('ALL');

  const vehicles = useMemo(() => ['ALL', ...new Set(HISTORY.map(h => h.plate))], []);

  const filtered = useMemo(() => {
    return HISTORY.filter(h => {
      const d = new Date(h.date);
      if (search && !h.plate.toLowerCase().includes(search.toLowerCase()) &&
          !h.type.toLowerCase().includes(search.toLowerCase())) return false;
      if (dateFrom && d < new Date(dateFrom)) return false;
      if (dateTo   && d > new Date(dateTo + 'T23:59:59')) return false;
      if (statusFilter !== 'ALL' && h.status !== statusFilter) return false;
      if (vehicleFilter !== 'ALL' && h.plate !== vehicleFilter) return false;
      return true;
    });
  }, [search, dateFrom, dateTo, statusFilter, vehicleFilter]);

  const totalCost = filtered.reduce((a, h) => a + h.cost, 0);
  const activeFilters = [dateFrom, dateTo, statusFilter !== 'ALL', vehicleFilter !== 'ALL'].filter(Boolean).length;

  const clearFilters = () => { setDateFrom(''); setDateTo(''); setStatus('ALL'); setVehicle('ALL'); };

  const tryExport = () => {
    if (!HAS_EXPORT) {
      toast.error('Export requires Growth plan or above. Upgrade to continue.');
      navigate('/vendor/subscription');
    } else {
      toast.success('Exporting…');
    }
  };

  const selectCls = `w-full appearance-none rounded-lg border border-white/[0.12] px-3 py-2 pr-8
                     text-[12px] text-white outline-none focus:border-[var(--accent)] transition-colors cursor-pointer`;
  const selectStyle = { backgroundColor: '#0d1f38' };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Maintenance History</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowFilter(s => !s)}
            className={`btn-ghost relative ${activeFilters ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}>
            <Filter className="w-3.5 h-3.5"/>
            Filter
            {activeFilters > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--accent)] text-white text-[9px] flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
          </button>
          <button onClick={tryExport} className="btn-ghost">
            <Lock className="w-3.5 h-3.5"/> Export PDF/CSV
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Export gate banner */}
        {!HAS_EXPORT && (
          <div className="flex items-center gap-3 bg-gold/8 border border-gold/20 rounded-xl p-3 mb-4">
            <Lock className="w-5 h-5 text-gold flex-shrink-0"/>
            <div className="flex-1">
              <div className="text-xs font-semibold text-gold">Export requires Growth plan or above</div>
              <div className="text-[10px] text-[var(--text3)] mt-0.5">View history below. Upgrade to download PDF/CSV with optional cost-hide for audits.</div>
            </div>
            <button onClick={() => navigate('/vendor/subscription')} className="btn-primary text-[10px] py-1 whitespace-nowrap">Upgrade</button>
          </div>
        )}

        {/* Filter panel */}
        {showFilter && (
          <div className="border border-white/[0.10] rounded-xl p-4 mb-4 space-y-3" style={{ backgroundColor: '#0d1f38' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-semibold text-[var(--text)]">Filter Results</span>
              <div className="flex gap-2">
                {activeFilters > 0 && (
                  <button onClick={clearFilters} className="text-[10px] text-[var(--text3)] hover:text-anchor-red transition-colors">
                    Clear all
                  </button>
                )}
                <button onClick={() => setShowFilter(false)}><X className="w-3.5 h-3.5 text-[var(--text3)]"/></button>
              </div>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wide mb-1.5">
                  <Calendar className="inline w-3 h-3 mr-1"/>From Date
                </label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.12] px-3 py-2 text-[12px] text-white outline-none focus:border-[var(--accent)] transition-colors"
                  style={{ backgroundColor: '#0d1f38', colorScheme: 'dark' }}/>
              </div>
              <div>
                <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wide mb-1.5">
                  <Calendar className="inline w-3 h-3 mr-1"/>To Date
                </label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                  className="w-full rounded-lg border border-white/[0.12] px-3 py-2 text-[12px] text-white outline-none focus:border-[var(--accent)] transition-colors"
                  style={{ backgroundColor: '#0d1f38', colorScheme: 'dark' }}/>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Status filter */}
              <div>
                <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wide mb-1.5">Status</label>
                <div className="relative">
                  <select value={statusFilter} onChange={e => setStatus(e.target.value)}
                    className={selectCls} style={selectStyle}>
                    <option value="ALL" style={{ backgroundColor:'#0d1f38' }}>All Statuses</option>
                    <option value="REPAIR_COMPLETE" style={{ backgroundColor:'#0d1f38' }}>Completed</option>
                    <option value="REPAIR_STARTED" style={{ backgroundColor:'#0d1f38' }}>In Progress</option>
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 text-[10px]">▼</span>
                </div>
              </div>

              {/* Vehicle filter */}
              <div>
                <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wide mb-1.5">Vehicle</label>
                <div className="relative">
                  <select value={vehicleFilter} onChange={e => setVehicle(e.target.value)}
                    className={selectCls} style={selectStyle}>
                    {vehicles.map(v => (
                      <option key={v} value={v} style={{ backgroundColor:'#0d1f38' }}>{v === 'ALL' ? 'All Vehicles' : v}</option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 text-[10px]">▼</span>
                </div>
              </div>
            </div>

            {/* Quick date shortcuts */}
            <div className="flex gap-2 flex-wrap">
              {[
                ['This Month', () => { const n=new Date(); setDateFrom(n.toISOString().slice(0,7)+'-01'); setDateTo(new Date(n.getFullYear(),n.getMonth()+1,0).toISOString().slice(0,10)); }],
                ['Last 3 Months', () => { const n=new Date(); const p=new Date(n); p.setMonth(p.getMonth()-3); setDateFrom(p.toISOString().slice(0,10)); setDateTo(n.toISOString().slice(0,10)); }],
                ['This Year', () => { const y=new Date().getFullYear(); setDateFrom(`${y}-01-01`); setDateTo(`${y}-12-31`); }],
                ['All Time', () => { setDateFrom(''); setDateTo(''); }],
              ].map(([label, fn]) => (
                <button key={label} onClick={fn}
                  className="text-[10px] px-2.5 py-1 rounded-full border border-white/[0.10] text-[var(--text3)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 max-w-xs mb-3">
          <Search className="w-3 h-3 text-[var(--text3)]"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search plate, repair type…"
            className="bg-transparent text-xs placeholder-[var(--text3)] text-[var(--text)] outline-none w-full"/>
        </div>

        {/* Summary */}
        <div className="flex items-center gap-4 mb-3">
          <span className="text-[11px] text-[var(--text3)]">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
          {filtered.length > 0 && (
            <span className="text-[11px] text-gold font-medium">Total: ₦{totalCost.toLocaleString()}</span>
          )}
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Date</th><th>Vehicle</th><th>Repair Type</th><th>Technician</th><th>Status</th><th>Cost</th></tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-8 text-[var(--text3)] text-xs">No records match your filters</td></tr>
              ) : filtered.map(h => (
                <tr key={h.id}>
                  <td className="text-[11px] text-[var(--text3)]">{fmt(h.date)}</td>
                  <td className="font-medium text-[var(--text)]">{h.plate}</td>
                  <td>{h.type}</td>
                  <td className="text-[var(--text3)]">{h.tech}</td>
                  <td>
                    <span className={`pill text-[10px] ${STATUS_CLS[h.status] || ''}`}>
                      {h.status === 'REPAIR_COMPLETE' ? 'Completed' : 'In Progress'}
                    </span>
                  </td>
                  <td className="text-gold font-medium">₦{h.cost.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
