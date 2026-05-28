import React, { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Ban } from 'lucide-react';

const MOCK = [
  { id:'1', vendor:'Coca-Cola Nigeria', plan:'ENTERPRISE', status:'ACTIVE', starts:'2026-05-01', expires:'2026-06-01', amount:250000, autoRenew:true },
  { id:'2', vendor:'Dangote Flour', plan:'GROWTH', status:'EXPIRING', starts:'2026-05-01', expires:'2026-05-30', amount:85000, autoRenew:true },
  { id:'3', vendor:'NNPC Logistics', plan:'ENTERPRISE', status:'ACTIVE', starts:'2026-05-01', expires:'2026-06-01', amount:250000, autoRenew:true },
  { id:'4', vendor:'UAC Nigeria', plan:'GROWTH', status:'EXPIRED', starts:'2026-04-01', expires:'2026-05-01', amount:85000, autoRenew:false },
  { id:'5', vendor:'Lafarge Cement', plan:'GROWTH', status:'ACTIVE', starts:'2026-05-10', expires:'2026-06-10', amount:85000, autoRenew:true },
  { id:'6', vendor:'Julius Berger', plan:'OEM_WHITE_LABEL', status:'ACTIVE', starts:'2026-01-01', expires:'2026-12-31', amount:500000, autoRenew:true },
];

const STATUS_META = {
  ACTIVE:    { cls:'pill-active',    icon:CheckCircle },
  EXPIRING:  { cls:'pill-pending',   icon:AlertTriangle },
  EXPIRED:   { cls:'pill-suspended', icon:Ban },
  SUSPENDED: { cls:'pill-suspended', icon:Ban },
};

const PLAN_COLOR = { ENTERPRISE:'text-teal', GROWTH:'text-gold', OEM_WHITE_LABEL:'text-anchor-purple' };

export default function SubscriptionsPage() {
  const [subs] = useState(MOCK);
  const totalMRR = subs.filter(s=>s.status==='ACTIVE'||s.status==='EXPIRING').reduce((a,s)=>a+s.amount,0);

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Subscriptions</h1>
        <div className="text-xs text-[var(--text3)]">Monthly Recurring Revenue: <span className="text-gold font-bold">₦{totalMRR.toLocaleString()}</span></div>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3 mb-5">
          {[['Active','ACTIVE','pill-active'],['Expiring Soon','EXPIRING','pill-pending'],['Expired / Suspended','EXPIRED','pill-suspended']].map(([l,st,cls])=>(
            <div key={st} className="stat-card">
              <div className="text-[9px] uppercase tracking-wider text-[var(--text3)] mb-1">{l}</div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-[var(--text)]">{subs.filter(s=>s.status===st).length}</div>
                <span className={`pill ${cls}`}>{st}</span>
              </div>
            </div>
          ))}
        </div>

        {subs.filter(s=>s.status==='EXPIRING').length>0 && (
          <div className="bg-gold/8 border border-gold/20 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-gold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0"/>
            {subs.filter(s=>s.status==='EXPIRING').length} vendor(s) expire within 7 days. Auto-warning emails have been sent.
          </div>
        )}

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Vendor</th><th>Plan</th><th>Status</th><th>Started</th><th>Expires</th><th>Amount</th><th>Auto-Renew</th></tr></thead>
            <tbody>
              {subs.map(s=>{
                const m = STATUS_META[s.status];
                const Icon = m.icon;
                return (
                  <tr key={s.id}>
                    <td className="font-medium text-[var(--text)]">{s.vendor}</td>
                    <td><span className={`text-[11px] font-semibold ${PLAN_COLOR[s.plan]}`}>{s.plan.replace(/_/g,' ')}</span></td>
                    <td>
                      <span className={`pill ${m.cls} flex items-center gap-1 w-fit`}>
                        <Icon className="w-2.5 h-2.5"/>{s.status}
                      </span>
                    </td>
                    <td className="text-[10px]">{s.starts}</td>
                    <td className={`text-[10px] ${s.status==='EXPIRING'?'text-gold font-semibold':''}`}>{s.expires}</td>
                    <td className="font-medium text-[var(--text)]">₦{s.amount.toLocaleString()}</td>
                    <td>
                      <div className={`w-7 h-3.5 rounded-full relative ${s.autoRenew?'bg-teal':'bg-white/20'}`}>
                        <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-transform ${s.autoRenew?'left-3.5':'left-0.5'}`}/>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
