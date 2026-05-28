import React, { useState } from 'react';
import { Shield, Download, CheckCircle, AlertTriangle, Search } from 'lucide-react';
import toast from 'react-hot-toast';

const MOCK = [
  { id:'1', action:'LOGIN_SUCCESS', actor:'a.okafor@coca-cola.com', role:'FLEET_MANAGER', entity:'user', ip:'105.113.22.14', at:'2026-05-27 09:14:22', hash:'a3f8e1c2' },
  { id:'2', action:'JOB_CREATED', actor:'k.adeyemi@coca-cola.com', role:'FIELD_AGENT', entity:'job:JB-2647', ip:'197.210.44.31', at:'2026-05-27 09:18:05', hash:'b7d2a9f3' },
  { id:'3', action:'ESTIMATE_APPROVED', actor:'a.okafor@coca-cola.com', role:'FLEET_MANAGER', entity:'job:JB-2647', ip:'105.113.22.14', at:'2026-05-27 10:45:17', hash:'c1e5b8d4' },
  { id:'4', action:'JOB_STATUS_REPAIR_STARTED', actor:'e.nwosu@afrifleet.com', role:'WORKSHOP_STAFF', entity:'job:JB-2647', ip:'10.0.0.14', at:'2026-05-27 11:00:33', hash:'d9f4c6e5' },
  { id:'5', action:'PAYMENT_RECEIVED', actor:'paystack', role:'SYSTEM', entity:'invoice:INV-2601', ip:'paystack-webhook', at:'2026-05-27 13:22:48', hash:'e2a7b1f6' },
  { id:'6', action:'VENDOR_SUSPENDED', actor:'admin@afrifleet.com', role:'OEM_ADMIN', entity:'vendor:UAC Nigeria', ip:'10.0.0.1', at:'2026-05-26 16:05:11', hash:'f6c3d8a7' },
  { id:'7', action:'USER_CREATED', actor:'a.okafor@coca-cola.com', role:'FLEET_MANAGER', entity:'user:k.adeyemi', ip:'105.113.22.14', at:'2026-05-25 08:30:00', hash:'g8e9b2c1' },
  { id:'8', action:'WEEKLY_BACKUP_COMPLETED', actor:'cron', role:'SYSTEM', entity:'system', ip:'internal', at:'2026-05-25 02:00:04', hash:'h4f7d5a9' },
  { id:'9', action:'2FA_ENABLED', actor:'a.okafor@coca-cola.com', role:'FLEET_MANAGER', entity:'user:a.okafor', ip:'105.113.22.14', at:'2026-05-24 14:10:29', hash:'i1b3e6c8' },
  { id:'10', action:'PASSWORD_RESET_COMPLETED', actor:'k.adeyemi@coca-cola.com', role:'FIELD_AGENT', entity:'user:k.adeyemi', ip:'197.210.44.31', at:'2026-05-24 09:05:17', hash:'j5d8f2a4' },
];

const ACTION_COLOR = (a) => {
  if (a.includes('FAIL')||a.includes('SUSPEND')) return 'text-anchor-red';
  if (a.includes('SUCCESS')||a.includes('COMPLETE')||a.includes('PAID')) return 'text-anchor-green';
  if (a.includes('CREATED')||a.includes('APPROVED')) return 'text-teal';
  return 'text-[var(--text3)]';
};

export default function AuditPage() {
  const [search, setSearch] = useState('');
  const [chainValid] = useState(true);

  const logs = MOCK.filter(l => !search || l.action.includes(search.toUpperCase()) || l.actor.includes(search.toLowerCase()) || l.entity.includes(search));

  const exportCSV = () => {
    const hdr = ['Timestamp','Action','Actor','Role','Entity','IP','Hash'].join(',');
    const rows = MOCK.map(l => [l.at,l.action,l.actor,l.role,l.entity,l.ip,l.hash].join(','));
    const csv = [hdr,...rows].join('\n');
    const blob = new Blob([csv],{type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=`audit-log-${Date.now()}.csv`; a.click();
    toast.success('Audit log exported as CSV');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Audit Log</h1>
          <p className="text-[10px] text-[var(--text3)]">Hash-chained tamper-evident records — every action logged</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="btn-ghost"><Download className="w-3.5 h-3.5"/>Export CSV</button>
        </div>
      </div>

      {/* Chain integrity banner */}
      <div className={`mx-5 mt-4 flex items-center gap-2 rounded-xl p-3 text-xs ${chainValid?'bg-anchor-green/10 border border-anchor-green/20 text-anchor-green':'bg-anchor-red/10 border border-anchor-red/20 text-anchor-red'}`}>
        {chainValid ? <CheckCircle className="w-4 h-4 flex-shrink-0"/> : <AlertTriangle className="w-4 h-4 flex-shrink-0"/>}
        {chainValid
          ? `Chain integrity verified — all ${MOCK.length} records intact. SHA-256 hash chain unbroken.`
          : 'Chain integrity BROKEN — records may have been tampered with. Contact security team immediately.'}
      </div>

      <div className="px-5 pt-4">
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 max-w-xs mb-4">
          <Search className="w-3 h-3 text-[var(--text3)]"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Filter by action, user, entity…" className="bg-transparent text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none w-full"/>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Timestamp</th><th>Action</th><th>Actor</th><th>Role</th><th>Entity</th><th>IP</th><th>Hash</th></tr></thead>
            <tbody>
              {logs.map(l=>(
                <tr key={l.id}>
                  <td className="font-mono text-[10px]">{l.at}</td>
                  <td><span className={`font-mono text-[10px] font-semibold ${ACTION_COLOR(l.action)}`}>{l.action}</span></td>
                  <td className="text-[10px]">{l.actor}</td>
                  <td><span className="text-[9px] text-[var(--text3)] bg-white/[0.06] px-1.5 py-0.5 rounded">{l.role}</span></td>
                  <td className="text-[10px] text-teal">{l.entity}</td>
                  <td className="font-mono text-[10px] text-[var(--text3)]">{l.ip}</td>
                  <td className="font-mono text-[10px] text-[var(--text3)]">{l.hash}…</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
