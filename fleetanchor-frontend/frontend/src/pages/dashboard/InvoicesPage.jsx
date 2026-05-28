import React, { useState } from 'react';
import { Download, Search, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

const MOCK = [
  { id:'1', num:'INV-2601', job:'JB-2643', plate:'OG-341-KS', vendor:'Lafarge Cement', parts:310000, labour:175000, total:485000, status:'PAID', issued:'2026-05-27', paid:'2026-05-27', ref:'PS_REF_8821K' },
  { id:'2', num:'INV-2600', job:'JB-2640', plate:'KN-772-AA', vendor:'Coca-Cola Nigeria', parts:78000, labour:42000, total:120000, status:'UNPAID', issued:'2026-05-25', paid:null, ref:null },
  { id:'3', num:'INV-2599', job:'JB-2638', plate:'ABJ-009-FG', vendor:'Dangote Flour', parts:220000, labour:96000, total:316000, status:'PAID', issued:'2026-05-22', paid:'2026-05-23', ref:'PS_REF_7740A' },
  { id:'4', num:'INV-2598', job:'JB-2635', plate:'EN-207-GH', vendor:'Julius Berger', parts:540000, labour:240000, total:780000, status:'PAID', issued:'2026-05-20', paid:'2026-05-21', ref:'PS_REF_7391B' },
];

const fmt = n => `₦${n.toLocaleString()}`;

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState(MOCK);
  const [search, setSearch] = useState('');

  const filtered = invoices.filter(i => !search || i.num.includes(search) || i.vendor.toLowerCase().includes(search.toLowerCase()) || i.plate.includes(search.toUpperCase()));

  const confirmPayment = (id) => {
    setInvoices(prev => prev.map(i => i.id===id ? {...i, status:'PAID', paid: new Date().toISOString().slice(0,10)} : i));
    toast.success('Payment confirmed. Invoice closed.');
  };

  const exportPDF = (inv) => {
    const doc = new jsPDF();
    doc.setFontSize(20); doc.text('INVOICE', 14, 20);
    doc.setFontSize(10);
    doc.text(`FleetAnchor Pro · AfriFleet Motors`, 14, 28);
    doc.text(`Invoice #: ${inv.num}`, 140, 20);
    doc.text(`Job #: ${inv.job}`, 140, 26);
    doc.text(`Date: ${inv.issued}`, 140, 32);
    doc.text(`Vendor: ${inv.vendor}`, 14, 40);
    doc.text(`Vehicle: ${inv.plate}`, 14, 46);
    doc.autoTable({
      startY: 55,
      head: [['Description','Amount']],
      body: [['Parts & Materials', fmt(inv.parts)],['Labour', fmt(inv.labour)],['Total', fmt(inv.total)]],
      theme: 'grid',
      headStyles: { fillColor: [10, 22, 40] },
    });
    if (inv.status==='PAID') {
      doc.setFontSize(16); doc.setTextColor(46, 204, 113);
      doc.text('PAID', 14, doc.lastAutoTable.finalY + 14);
      doc.setTextColor(0);
    }
    doc.save(`${inv.num}.pdf`);
    toast.success('PDF exported');
  };

  const totalRevenue = invoices.filter(i=>i.status==='PAID').reduce((s,i)=>s+i.total,0);
  const totalPending = invoices.filter(i=>i.status==='UNPAID').reduce((s,i)=>s+i.total,0);

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Invoices & Payments</h1>
        <div className="flex gap-2">
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5">
            <Search className="w-3 h-3 text-[var(--text3)]"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" className="bg-transparent text-xs placeholder-[var(--text3)] text-[var(--text)] outline-none w-32"/>
          </div>
        </div>
      </div>

      <div className="p-5">
        <div className="grid grid-cols-3 gap-3 mb-5">
          <div className="stat-card"><div className="text-[9px] uppercase tracking-wider text-[var(--text3)] mb-1">Collected MTD</div><div className="text-xl font-bold text-anchor-green">{fmt(totalRevenue)}</div></div>
          <div className="stat-card"><div className="text-[9px] uppercase tracking-wider text-[var(--text3)] mb-1">Pending Collection</div><div className="text-xl font-bold text-gold">{fmt(totalPending)}</div></div>
          <div className="stat-card"><div className="text-[9px] uppercase tracking-wider text-[var(--text3)] mb-1">Total Invoices</div><div className="text-xl font-bold text-[var(--text)]">{invoices.length}</div></div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Invoice #</th><th>Job</th><th>Vehicle</th><th>Vendor</th><th>Parts</th><th>Labour</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(inv=>(
                <tr key={inv.id}>
                  <td><span className="font-mono text-[11px] font-semibold text-teal">{inv.num}</span></td>
                  <td className="text-gold">{inv.job}</td>
                  <td>{inv.plate}</td>
                  <td>{inv.vendor}</td>
                  <td>{fmt(inv.parts)}</td>
                  <td>{fmt(inv.labour)}</td>
                  <td className="font-bold text-[var(--text)]">{fmt(inv.total)}</td>
                  <td>
                    <span className={`pill ${inv.status==='PAID'?'pill-complete':'pill-pending'}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <button onClick={()=>exportPDF(inv)} className="btn-ghost text-[10px] py-1"><Download className="w-3 h-3"/>PDF</button>
                      {inv.status==='UNPAID' && (
                        <button onClick={()=>confirmPayment(inv.id)} className="btn-success text-[10px] py-1"><CheckCircle className="w-3 h-3"/>Paid</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
