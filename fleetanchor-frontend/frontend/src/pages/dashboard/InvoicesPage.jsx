import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Download, DollarSign, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { invoiceService } from '../../services/api';

const fmt = n => `₦${Number(n||0).toLocaleString()}`;
const fmtK = n => n >= 1000000 ? `₦${(n/1000000).toFixed(1)}M` : n >= 1000 ? `₦${(n/1000).toFixed(0)}K` : fmt(n);

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await invoiceService.list({ limit: 200 });
      setInvoices(res.data?.data || res.data?.invoices || []);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const paid = invoices.filter(i => i.paymentConfirmed || i.status === 'PAID');
  const outstanding = invoices.filter(i => !i.paymentConfirmed && i.status !== 'PAID');
  const totalPaid = paid.reduce((a,i) => a + (i.totalAmount||0), 0);
  const totalOutstanding = outstanding.reduce((a,i) => a + (i.totalAmount||0), 0);

  const handleDownload = async (inv) => {
    setDownloading(inv.id);
    try {
      const res = await invoiceService.downloadPDF(inv.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a'); a.href = url; a.download = `${inv.invoiceNumber||'invoice'}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('PDF download failed'); }
    finally { setDownloading(null); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Invoices & Costs</h1>
          {!loading && <p className="text-[10px] text-[var(--text3)] mt-0.5">{invoices.length} invoices</p>}
        </div>
        <button onClick={() => load(true)} disabled={refreshing} className="btn-ghost p-1.5 rounded-lg">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total Revenue', value: fmtK(totalPaid + totalOutstanding), icon: DollarSign, color: 'text-[var(--gold)]', bg: 'bg-[var(--gold)]/10' },
            { label: 'Paid', value: fmtK(totalPaid), icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
            { label: 'Outstanding', value: fmtK(totalOutstanding), icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="stat-card flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className={color} />
              </div>
              <div>
                <div className="text-[9px] uppercase text-[var(--text3)] mb-0.5">{label}</div>
                <div className={`text-lg font-bold ${color}`}>{value}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw size={13} className="animate-spin" /> Loading...
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">No invoices yet</div>
          ) : (
            <table className="tbl">
              <thead>
                <tr><th>Invoice #</th><th>Job #</th><th>Vehicle</th><th>Vendor</th><th>Amount</th><th>Status</th><th>Date</th><th>PDF</th></tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const isPaid = inv.paymentConfirmed || inv.status === 'PAID';
                  return (
                    <tr key={inv.id}>
                      <td className="font-mono text-[var(--gold)] text-[11px] font-600">{inv.invoiceNumber}</td>
                      <td className="font-mono text-[11px] text-slate-300">{inv.jobRequest?.jobNumber || '—'}</td>
                      <td className="text-xs font-medium text-[var(--text)]">{inv.jobRequest?.vehicle?.plateNumber || '—'}</td>
                      <td className="text-xs text-slate-300">{inv.jobRequest?.vehicle?.vendor?.companyName || '—'}</td>
                      <td className="text-[var(--gold)] font-600">{fmt(inv.totalAmount)}</td>
                      <td><span className={`pill text-[10px] ${isPaid ? 'pill-active' : 'pill-pending'}`}>{isPaid ? '✅ Paid' : '⏳ Pending'}</span></td>
                      <td className="text-[10px] text-[var(--text3)]">
                        {(inv.issuedAt || inv.createdAt) ? new Date(inv.issuedAt || inv.createdAt).toLocaleDateString('en-NG') : '—'}
                      </td>
                      <td>
                        <button onClick={() => handleDownload(inv)} disabled={downloading === inv.id}
                          className="btn-ghost text-[10px] py-1 px-2 flex items-center gap-1 disabled:opacity-50">
                          <Download size={11} /> {downloading === inv.id ? '...' : 'PDF'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
