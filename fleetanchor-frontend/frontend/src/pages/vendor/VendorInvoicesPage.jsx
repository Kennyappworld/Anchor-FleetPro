import React, { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw, Receipt, CheckCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { invoiceService } from '../../services/api';

const fmt = n => `₦${Number(n || 0).toLocaleString()}`;

export default function VendorInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [downloading, setDownloading] = useState(null);

  const fetchInvoices = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const res = await invoiceService.list({ limit: 100 });
      const list = res.data?.data || res.data?.invoices || [];
      setInvoices(list);
    } catch { toast.error('Failed to load invoices'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchInvoices(); }, [fetchInvoices]);

  const handleDownload = async (inv) => {
    setDownloading(inv.id);
    try {
      const res = await invoiceService.downloadPDF(inv.id);
      const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${inv.invoiceNumber || 'invoice'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('PDF download failed'); }
    finally { setDownloading(null); }
  };

  const paid = invoices.filter(i => i.paymentConfirmed || i.status === 'PAID');
  const unpaid = invoices.filter(i => !i.paymentConfirmed && i.status !== 'PAID');
  const totalPaid = paid.reduce((a, i) => a + (i.totalAmount || 0), 0);
  const totalOutstanding = unpaid.reduce((a, i) => a + (i.totalAmount || 0), 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">My Invoices</h1>
          {!loading && <p className="text-[10px] text-[var(--text3)] mt-0.5">{invoices.length} invoices</p>}
        </div>
        <button onClick={() => fetchInvoices(true)} disabled={refreshing} className="btn-ghost p-1.5 rounded-lg">
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-5 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <div className="stat-card flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-green-500/15 flex items-center justify-center flex-shrink-0">
              <CheckCircle size={15} className="text-green-400" />
            </div>
            <div>
              <div className="text-[9px] uppercase text-[var(--text3)] mb-0.5">Total Paid</div>
              <div className="text-lg font-bold text-green-400">{fmt(totalPaid)}</div>
            </div>
          </div>
          <div className="stat-card flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--gold)]/15 flex items-center justify-center flex-shrink-0">
              <Clock size={15} className="text-[var(--gold)]" />
            </div>
            <div>
              <div className="text-[9px] uppercase text-[var(--text3)] mb-0.5">Outstanding</div>
              <div className="text-lg font-bold text-[var(--gold)]">{fmt(totalOutstanding)}</div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          {loading ? (
            <div className="p-10 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin" /> Loading invoices...
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-10 text-center">
              <Receipt size={32} className="mx-auto text-slate-600 mb-3" />
              <p className="text-slate-400 text-sm">No invoices yet</p>
              <p className="text-slate-500 text-xs mt-1">Invoices appear after job estimates are approved and work is completed</p>
            </div>
          ) : (
            <table className="tbl">
              <thead>
                <tr>
                  <th>Invoice #</th><th>Job</th><th>Vehicle</th><th>Amount</th><th>Status</th><th>Issued</th><th>PDF</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => {
                  const isPaid = inv.paymentConfirmed || inv.status === 'PAID';
                  const issuedDate = inv.issuedAt || inv.createdAt;
                  return (
                    <tr key={inv.id}>
                      <td className="font-mono text-teal font-semibold text-[11px]">{inv.invoiceNumber}</td>
                      <td className="text-[var(--gold)] text-[11px] font-mono">{inv.jobRequest?.jobNumber || '—'}</td>
                      <td className="font-medium text-[var(--text)] text-xs">
                        {inv.jobRequest?.vehicle?.plateNumber}
                        {inv.jobRequest?.vehicle?.make && (
                          <span className="text-[10px] text-slate-400 block">{inv.jobRequest.vehicle.make} {inv.jobRequest.vehicle.model}</span>
                        )}
                      </td>
                      <td className="text-[var(--gold)] font-medium">{fmt(inv.totalAmount)}</td>
                      <td>
                        <span className={`pill text-[10px] ${isPaid ? 'pill-active' : 'pill-pending'}`}>
                          {isPaid ? '✅ Paid' : '⏳ Pending'}
                        </span>
                      </td>
                      <td className="text-[10px] text-[var(--text3)]">
                        {issuedDate ? new Date(issuedDate).toLocaleDateString('en-NG') : '—'}
                      </td>
                      <td>
                        <button onClick={() => handleDownload(inv)} disabled={downloading === inv.id}
                          className="btn-ghost text-[10px] py-1 px-2 flex items-center gap-1 disabled:opacity-50">
                          <Download size={12} />
                          {downloading === inv.id ? '...' : 'PDF'}
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
