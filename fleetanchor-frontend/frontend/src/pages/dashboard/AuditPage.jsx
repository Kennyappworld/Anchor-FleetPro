import React, { useCallback, useEffect, useState } from 'react';
import { Download, CheckCircle, AlertTriangle, Search, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { auditService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

// Real audit trail from the server (this page used to show a fixed made-up list).

const ACTION_COLOR = (a = '') => {
  if (a.includes('FAIL') || a.includes('SUSPEND') || a.includes('DELETE')) return 'text-anchor-red';
  if (a.includes('SUCCESS') || a.includes('COMPLETE') || a.includes('PAID') || a.includes('CONFIRM')) return 'text-anchor-green';
  if (a.includes('CREATED') || a.includes('APPROVED')) return 'text-teal';
  return 'text-[var(--text3)]';
};
const when = (d) => new Date(d).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });

export default function AuditPage() {
  const isSuper = useAuthStore((s) => s.user?.role === 'SUPER_ADMIN');
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [chain, setChain] = useState(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await auditService.list({ page: p, limit: 100 });
      setLogs(res.data.logs || res.data.data || []);
      setTotal(res.data.total || 0);
      setPages(res.data.pages || 1);
      setPage(p);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not load the audit log');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(1); }, [load]);
  useEffect(() => {
    if (!isSuper) return;
    auditService.verifyChain().then((r) => setChain(r.data.data)).catch(() => setChain(null));
  }, [isSuper]);

  const q = search.trim().toLowerCase();
  const shown = logs.filter((l) => !q || [l.action, l.actorLabel, l.user?.email, l.user?.fullName, l.entityType, l.entityId].some((v) => String(v || '').toLowerCase().includes(q)));

  const exportCSV = async () => {
    try {
      const res = await auditService.export('csv');
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      URL.revokeObjectURL(url);
      toast.success('Audit log exported');
    } catch (e) {
      toast.error('Export failed — your account may not have export permission');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Audit Log</h1>
          <p className="text-[10px] text-[var(--text3)]">Every sign-in, change and payment, with who did it and from where · {total.toLocaleString()} records</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => load(page)} className="btn-ghost p-1.5" aria-label="Refresh"><RefreshCw className="w-3.5 h-3.5" /></button>
          <button onClick={exportCSV} className="btn-ghost"><Download className="w-3.5 h-3.5" />Export CSV</button>
        </div>
      </div>

      {chain && (
        <div className={`mx-5 mt-4 flex items-center gap-2 rounded-xl p-3 text-xs ${chain.valid ? 'bg-anchor-green/10 border border-anchor-green/20 text-anchor-green' : 'bg-anchor-red/10 border border-anchor-red/20 text-anchor-red'}`}>
          {chain.valid ? <CheckCircle className="w-4 h-4 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
          {chain.valid ? 'Tamper check passed — the record chain is unbroken.' : 'Tamper check failed — a record in the chain does not match. Investigate before relying on this log.'}
        </div>
      )}

      <div className="px-5 pt-4">
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 max-w-xs mb-4">
          <Search className="w-3 h-3 text-[var(--text3)]" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter by action, user, item…" className="bg-transparent text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none w-full" />
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Time</th><th>Action</th><th>Who</th><th>Role</th><th>Item</th><th>IP address</th></tr></thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center py-6 text-[var(--text3)]">Loading…</td></tr>}
              {!loading && shown.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-[var(--text3)]">No records{q ? ' match this filter' : ' yet'}.</td></tr>}
              {!loading && shown.map((l) => (
                <tr key={l.id}>
                  <td className="font-mono text-[10px]">{when(l.createdAt)}</td>
                  <td><span className={`font-mono text-[10px] font-semibold ${ACTION_COLOR(l.action)}`}>{l.action}</span></td>
                  <td className="text-[11px]">{l.user?.fullName || l.actorLabel || 'System'}<span className="block text-[10px] text-[var(--text3)]">{l.user?.email || ''}</span></td>
                  <td><span className="text-[9px] text-[var(--text3)] bg-white/[0.06] px-1.5 py-0.5 rounded">{l.user?.role || 'SYSTEM'}</span></td>
                  <td className="text-[10px] text-teal">{l.entityType}{l.entityId ? ` · ${String(l.entityId).slice(0, 8)}` : ''}</td>
                  <td className="font-mono text-[10px] text-[var(--text3)]">{l.ipAddress || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 pb-6 text-xs text-[var(--text3)]">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => load(page - 1)}>Newer</button>
            <span>Page {page} of {pages}</span>
            <button className="btn-ghost" disabled={page >= pages} onClick={() => load(page + 1)}>Older</button>
          </div>
        )}
      </div>
    </div>
  );
}
