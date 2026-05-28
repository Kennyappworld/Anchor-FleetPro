import React, { useState } from 'react';
import { Search, Plus, Ban, CheckCircle, Building2, X } from 'lucide-react';
import toast from 'react-hot-toast';

const MOCK = [
  { id:'1', name:'Coca-Cola Nigeria', email:'fleet@coca-cola.ng', plan:'ENTERPRISE', vehicles:187, users:8, status:'ACTIVE', joined:'Jan 2025', spend:'₦28.4M' },
  { id:'2', name:'Dangote Flour Mills', email:'fleet@dangote.com', plan:'GROWTH', vehicles:43, users:2, status:'ACTIVE', joined:'Mar 2025', spend:'₦9.1M' },
  { id:'3', name:'NNPC Logistics', email:'maint@nnpc.gov.ng', plan:'ENTERPRISE', vehicles:312, users:14, status:'ACTIVE', joined:'Nov 2024', spend:'₦54.7M' },
  { id:'4', name:'UAC Nigeria', email:'fleet@uac.ng', plan:'GROWTH', vehicles:28, users:2, status:'SUSPENDED', joined:'Feb 2025', spend:'₦5.2M' },
  { id:'5', name:'Lafarge Cement', email:'transport@lafarge.ng', plan:'GROWTH', vehicles:61, users:3, status:'ACTIVE', joined:'Apr 2025', spend:'₦12.3M' },
  { id:'6', name:'Julius Berger', email:'fleet@juliusberger.com', plan:'OEM_WHITE_LABEL', vehicles:524, users:22, status:'ACTIVE', joined:'Jun 2024', spend:'₦91.2M' },
];

const PLAN_COLORS = { ENTERPRISE:'bg-teal/15 text-teal', GROWTH:'bg-gold/15 text-gold', OEM_WHITE_LABEL:'bg-purple-500/15 text-anchor-purple' };

export default function VendorsPage() {
  const [vendors, setVendors] = useState(MOCK);
  const [search, setSearch] = useState('');
  const [suspendModal, setSuspendModal] = useState(null);
  const [reason, setReason] = useState('');

  const filtered = vendors.filter(v => !search || v.name.toLowerCase().includes(search.toLowerCase()) || v.email.toLowerCase().includes(search.toLowerCase()));

  const doSuspend = (id) => {
    setVendors(prev => prev.map(v => v.id===id ? {...v, status:'SUSPENDED'} : v));
    setSuspendModal(null); setReason('');
    toast.success('Vendor suspended. Notification sent.');
  };
  const doReinstate = (id) => {
    setVendors(prev => prev.map(v => v.id===id ? {...v, status:'ACTIVE'} : v));
    toast.success('Vendor reinstated.');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Vendors & Fleet Companies</h1>
          <p className="text-[10px] text-[var(--text3)]">{vendors.filter(v=>v.status==='ACTIVE').length} active · {vendors.filter(v=>v.status==='SUSPENDED').length} suspended</p>
        </div>
        <button className="btn-primary"><Plus className="w-3.5 h-3.5"/>Add Vendor</button>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 max-w-xs mb-4">
          <Search className="w-3 h-3 text-[var(--text3)]"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search vendors…" className="bg-transparent text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none w-full"/>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Company</th><th>Plan</th><th>Vehicles</th><th>Users</th><th>YTD Spend</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
            <tbody>
              {filtered.map(v=>(
                <tr key={v.id}>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-md bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-3.5 h-3.5 text-[var(--text3)]"/>
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold text-[var(--text)]">{v.name}</div>
                        <div className="text-[10px] text-[var(--text3)]">{v.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className={`pill ${PLAN_COLORS[v.plan]}`}>{v.plan.replace(/_/g,' ')}</span></td>
                  <td>{v.vehicles}</td>
                  <td>{v.users}</td>
                  <td className="text-gold font-medium">{v.spend}</td>
                  <td><span className={`pill ${v.status==='ACTIVE'?'pill-active':'pill-suspended'}`}>{v.status}</span></td>
                  <td className="text-[10px] text-[var(--text3)]">{v.joined}</td>
                  <td>
                    {v.status==='ACTIVE'
                      ? <button onClick={()=>setSuspendModal(v)} className="btn-danger text-[10px] py-1"><Ban className="w-3 h-3"/>Suspend</button>
                      : <button onClick={()=>doReinstate(v.id)} className="btn-success text-[10px] py-1"><CheckCircle className="w-3 h-3"/>Reinstate</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Suspend modal */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-2 border border-white/[0.12] rounded-2xl p-5 w-full max-w-sm animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-anchor-red">Suspend Vendor</h3>
              <button onClick={()=>setSuspendModal(null)} className="text-[var(--text3)]"><X className="w-4 h-4"/></button>
            </div>
            <p className="text-xs text-[var(--text2)] mb-3">Suspend <strong className="text-[var(--text)]">{suspendModal.name}</strong>? Their team will lose access immediately and be notified by email.</p>
            <div className="mb-4">
              <label className="form-label">Reason (optional)</label>
              <textarea value={reason} onChange={e=>setReason(e.target.value)} placeholder="e.g. Non-payment of invoices" className="form-input resize-none" rows={3}/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setSuspendModal(null)} className="flex-1 btn-ghost justify-center">Cancel</button>
              <button onClick={()=>doSuspend(suspendModal.id)} className="flex-1 btn-danger justify-center"><Ban className="w-3.5 h-3.5"/>Confirm Suspend</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
