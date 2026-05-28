import React from 'react';
import { Download } from 'lucide-react';
import toast from 'react-hot-toast';

const MOCK = [
  { id:'1', num:'INV-2601', job:'JB-2643', plate:'OG-341-KS', work:'Wheel alignment', total:205000, status:'PAID', issued:'2026-05-22' },
  { id:'2', num:'INV-2599', job:'JB-2638', plate:'ABJ-009-FG', work:'Electrical repair', total:97500, status:'UNPAID', issued:'2026-05-18' },
  { id:'3', num:'INV-2595', job:'JB-2630', plate:'KN-772-AA', work:'Full service', total:120000, status:'PAID', issued:'2026-05-10' },
];

export default function VendorInvoicesPage() {
  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">My Invoices</h1>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="stat-card"><div className="text-[9px] uppercase text-[var(--text3)] mb-1">Total Paid</div><div className="text-xl font-bold text-anchor-green">₦{MOCK.filter(i=>i.status==='PAID').reduce((a,i)=>a+i.total,0).toLocaleString()}</div></div>
          <div className="stat-card"><div className="text-[9px] uppercase text-[var(--text3)] mb-1">Outstanding</div><div className="text-xl font-bold text-gold">₦{MOCK.filter(i=>i.status==='UNPAID').reduce((a,i)=>a+i.total,0).toLocaleString()}</div></div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Invoice #</th><th>Job</th><th>Vehicle</th><th>Work</th><th>Amount</th><th>Status</th><th>Date</th><th>PDF</th></tr></thead>
            <tbody>
              {MOCK.map(inv=>(
                <tr key={inv.id}>
                  <td className="font-mono text-teal font-semibold text-[11px]">{inv.num}</td>
                  <td className="text-gold">{inv.job}</td>
                  <td className="font-medium text-[var(--text)]">{inv.plate}</td>
                  <td>{inv.work}</td>
                  <td className="font-bold text-[var(--text)]">₦{inv.total.toLocaleString()}</td>
                  <td><span className={`pill ${inv.status==='PAID'?'pill-complete':'pill-pending'}`}>{inv.status}</span></td>
                  <td className="text-[10px]">{inv.issued}</td>
                  <td><button onClick={()=>toast.success('PDF downloaded')} className="btn-ghost text-[10px] py-1"><Download className="w-3 h-3"/></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
