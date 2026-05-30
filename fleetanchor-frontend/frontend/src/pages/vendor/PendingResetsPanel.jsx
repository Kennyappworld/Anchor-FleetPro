import React, { useState, useEffect } from 'react';
import { ShieldCheck, Clock, CheckCircle, XCircle, RefreshCw, User } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/api';

export default function PendingResetsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await authService.getPendingResets();
      setRequests(res.data?.data || []);
    } catch { /* silently fail */ }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handle = async (token, action) => {
    setActing(token);
    try {
      await authService.approveReset(token, action, '');
      toast.success(action === 'approve' ? '✅ Password reset approved — user notified' : '❌ Request rejected');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action failed');
    } finally { setActing(null); }
  };

  if (requests.length === 0 && !loading) return null;

  return (
    <div className="card p-4 border border-yellow-500/20 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-yellow-400" />
          <span className="text-sm font-700 text-white">Password Reset Requests</span>
          {requests.length > 0 && (
            <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-2 py-0.5 rounded-full font-600">
              {requests.length} pending
            </span>
          )}
        </div>
        <button onClick={load} className="btn-ghost p-1.5 rounded-lg">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {loading ? (
        <div className="text-xs text-slate-400 py-2">Loading...</div>
      ) : (
        <div className="space-y-2">
          {requests.map(r => (
            <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/15 flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-yellow-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-600 text-white truncate">{r.fullName}</p>
                <p className="text-xs text-slate-400 truncate">{r.email}</p>
                <div className="flex items-center gap-1 mt-1">
                  <Clock size={10} className="text-slate-500" />
                  <span className="text-[10px] text-slate-500">
                    {new Date(r.requestedAt).toLocaleDateString('en-NG', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                  </span>
                  <span className="text-[10px] text-slate-600 ml-1">· {r.user?.role?.replace(/_/g,' ')}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => handle(r.token || r.id, 'approve')}
                  disabled={!!acting}
                  className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-green-500/15 text-green-400 hover:bg-green-500/25 transition-colors disabled:opacity-40 font-600"
                >
                  <CheckCircle size={12} />
                  {acting === (r.token || r.id) ? '...' : 'Approve'}
                </button>
                <button
                  onClick={() => handle(r.token || r.id, 'reject')}
                  disabled={!!acting}
                  className="flex items-center gap-1 text-[11px] px-3 py-1.5 rounded-lg bg-red-500/15 text-red-400 hover:bg-red-500/25 transition-colors disabled:opacity-40 font-600"
                >
                  <XCircle size={12} />
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
