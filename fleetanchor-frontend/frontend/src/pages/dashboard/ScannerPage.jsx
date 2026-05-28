import React, { useState } from 'react';
import { Scan, Download, Eye, EyeOff, Search, Printer } from 'lucide-react';
import { jobService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const MOCK_VEHICLE = {
  vin: 'WNXNF4327A6', plate: 'LND-421-XY', make: 'Mercedes', model: 'Actros',
  year: 2021, engine: 'OM471LA-89234', vendor: 'Coca-Cola Nigeria', status: 'IN_REPAIR',
  totalJobs: 8, totalSpend: 3247000,
};
const MOCK_HISTORY = [
  { date: 'May 2026', type: 'Engine Overhaul', tech: 'E. Nwosu', status: 'REPAIR_STARTED', cost: 485000 },
  { date: 'Jan 2026', type: 'Brake Reline', tech: 'K. Adeyemi', status: 'REPAIR_COMPLETE', cost: 142000 },
  { date: 'Oct 2025', type: 'Full Service', tech: 'E. Nwosu', status: 'REPAIR_COMPLETE', cost: 88500 },
  { date: 'Jul 2025', type: 'Transmission Flush', tech: 'T. Eze', status: 'REPAIR_COMPLETE', cost: 255000 },
  { date: 'Mar 2025', type: 'Tyre Replacement', tech: 'K. Adeyemi', status: 'REPAIR_COMPLETE', cost: 380000 },
  { date: 'Nov 2024', type: 'Electrical Fault', tech: 'T. Eze', status: 'REPAIR_COMPLETE', cost: 97500 },
];

const formatNaira = (n) => `₦${n.toLocaleString()}`;

export default function ScannerPage() {
  const { user } = useAuthStore();
  const [query, setQuery] = useState('');
  const [showCost, setShowCost] = useState(true);
  const [vehicle, setVehicle] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  const isFieldAgent = user?.role === 'FIELD_AGENT';

  const handleSearch = async () => {
    if (!query.trim()) { toast.error('Enter VIN or plate number'); return; }
    setLoading(true);
    try {
      // In production: const res = await jobService.vehicleHistory({ vin: query });
      // Mock for demo:
      setVehicle(MOCK_VEHICLE);
      setHistory(MOCK_HISTORY);
      toast.success('Vehicle found');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Vehicle not found');
    } finally { setLoading(false); }
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text('FleetAnchor Pro — Maintenance History', 14, 15);
    doc.setFontSize(10);
    doc.text(`VIN: ${vehicle.vin} · Plate: ${vehicle.plate}`, 14, 23);
    doc.text(`Generated: ${new Date().toLocaleString()} · Cost visibility: ${showCost ? 'Shown' : 'Hidden (audit export)'}`, 14, 29);

    const cols = showCost
      ? ['Date', 'Type', 'Technician', 'Status', 'Cost']
      : ['Date', 'Type', 'Technician', 'Status'];

    const rows = history.map(h => showCost
      ? [h.date, h.type, h.tech, h.status.replace(/_/g, ' '), formatNaira(h.cost)]
      : [h.date, h.type, h.tech, h.status.replace(/_/g, ' ')]
    );

    doc.autoTable({ startY: 35, head: [cols], body: rows, theme: 'striped', headStyles: { fillColor: [10, 22, 40] } });

    if (showCost) {
      const total = history.reduce((s, h) => s + h.cost, 0);
      const finalY = doc.lastAutoTable.finalY + 6;
      doc.setFontSize(11);
      doc.text(`Total maintenance cost: ${formatNaira(total)}`, 14, finalY);
    }

    doc.save(`maintenance-history-${vehicle.vin}-${Date.now()}.pdf`);
    toast.success('PDF exported');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">VIN / Chassis Scanner</h1>
        <div className="flex items-center gap-2">
          {!isFieldAgent && (
            <div className="flex items-center gap-2 text-xs text-[var(--text2)]">
              <button onClick={() => setShowCost(!showCost)} className={`w-8 h-4 rounded-full transition-colors relative ${showCost ? 'bg-teal' : 'bg-white/20'}`}>
                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${showCost ? 'left-4' : 'left-0.5'}`} />
              </button>
              <span className="flex items-center gap-1">
                {showCost ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                {showCost ? 'Cost visible' : 'Cost hidden (audit mode)'}
              </span>
            </div>
          )}
          {vehicle && (
            <button onClick={exportPDF} className="btn-primary">
              <Download className="w-3.5 h-3.5" /> Export PDF
            </button>
          )}
        </div>
      </div>

      <div className="p-5">
        {/* Scanner input */}
        <div
          className="border-2 border-dashed border-white/20 rounded-2xl p-8 text-center mb-4 cursor-pointer hover:border-gold/50 transition-colors"
          onClick={() => document.getElementById('vin-input')?.focus()}
        >
          <Scan className="w-10 h-10 text-[var(--text3)] mx-auto mb-3" />
          <p className="text-xs text-[var(--text3)] mb-3">Point camera at VIN barcode or type chassis/plate number below</p>
          <div className="flex gap-2 max-w-sm mx-auto">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
              <input
                id="vin-input"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="e.g. WNXNF4327A6 or LND-421-XY"
                className="form-input pl-8"
              />
            </div>
            <button onClick={handleSearch} disabled={loading} className="btn-primary disabled:opacity-50 whitespace-nowrap">
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
          {isFieldAgent && (
            <p className="text-[10px] text-purple-400 mt-2">Field Agent mode: cost data hidden</p>
          )}
        </div>

        {vehicle && (
          <div className="grid grid-cols-5 gap-4 animate-fade-in">
            {/* Vehicle info card */}
            <div className="col-span-2">
              <div className="card overflow-hidden">
                <div className="bg-navy-3 px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 bg-gold/20 rounded-xl flex items-center justify-center text-xl">🚛</div>
                  <div>
                    <div className="text-sm font-bold text-[var(--text)]">{vehicle.vin}</div>
                    <div className="text-[10px] text-[var(--text3)]">{vehicle.year} {vehicle.make} {vehicle.model} · {vehicle.plate}</div>
                  </div>
                  <span className={`pill ml-auto ${vehicle.status === 'IN_REPAIR' ? 'pill-repair' : 'pill-active'}`}>
                    {vehicle.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="px-4 py-3 space-y-2">
                  {[
                    ['Engine No.', vehicle.engine],
                    ['Vendor', vehicle.vendor],
                    ['Total Jobs', `${vehicle.totalJobs} maintenance events`],
                    ...(!isFieldAgent ? [['Total Spend', formatNaira(vehicle.totalSpend)]] : [['Cost (field)', 'Hidden — admin only']]),
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between py-1.5 border-b border-white/[0.06] last:border-0">
                      <span className="text-[10px] text-[var(--text3)]">{label}</span>
                      <span className={`text-[11px] font-medium ${label === 'Total Spend' ? 'text-gold' : label === 'Cost (field)' ? 'text-[var(--text3)]' : 'text-[var(--text)]'}`}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* History table */}
            <div className="col-span-3">
              <div className="flex items-center justify-between mb-2">
                <span className="section-title">Maintenance History</span>
                <span className="text-[10px] text-[var(--text3)]">{history.length} records</span>
              </div>
              <div className="table-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Date</th><th>Type</th><th>Technician</th><th>Status</th>
                      {showCost && !isFieldAgent && <th>Cost</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i}>
                        <td>{h.date}</td>
                        <td className="font-medium text-[var(--text)]">{h.type}</td>
                        <td>{h.tech}</td>
                        <td>
                          <span className={`pill ${h.status === 'REPAIR_COMPLETE' ? 'pill-complete' : 'pill-repair'}`}>
                            {h.status === 'REPAIR_COMPLETE' ? 'Completed' : 'Ongoing'}
                          </span>
                        </td>
                        {showCost && !isFieldAgent && <td className="text-gold font-medium">{formatNaira(h.cost)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {showCost && !isFieldAgent && (
                  <div className="px-3 py-2 bg-navy-3 flex justify-between border-t border-white/[0.08]">
                    <span className="text-xs text-[var(--text3)]">Total</span>
                    <span className="text-xs font-bold text-gold">{formatNaira(history.reduce((s, h) => s + h.cost, 0))}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
