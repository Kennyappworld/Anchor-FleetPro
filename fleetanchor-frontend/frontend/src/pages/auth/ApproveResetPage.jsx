import React, { useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { CheckCircle, XCircle, Loader } from 'lucide-react';
import api from '../../services/api';
import { PoweredBy } from './ForgotPasswordPage';

export default function ApproveResetPage() {
  const { token } = useParams();
  const [params] = useSearchParams();
  const action = params.get('action') || 'approve';

  // Nothing happens until the manager presses the button. Previously opening the
  // link approved the reset at once, so an email link-scanner could approve it.
  const [status, setStatus] = useState('confirm'); // confirm | loading | done | error
  const [msg, setMsg] = useState('');

  const run = async () => {
    setStatus('loading');
    try {
      const res = await api.post(`/auth/approve-reset/${encodeURIComponent(token)}`, { action });
      setMsg(res.data.message);
      setStatus('done');
    } catch (err) {
      setMsg(err.response?.data?.error || 'This link has expired or already been used.');
      setStatus('error');
    }
  };

  const approved = action === 'approve';

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #162952 0%, #0A1628 60%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-gold rounded-xl flex items-center justify-center text-2xl mx-auto mb-2">⚓</div>
          <h1 className="text-sm font-bold text-white">FleetAnchor Pro</h1>
          <p className="text-xs text-slate-400 mt-1">Password Reset Review</p>
        </div>

        <div className="card p-6 text-center">
          {status === 'confirm' && (
            <>
              <h2 className="text-base font-bold text-white mb-2">
                {action === 'approve' ? 'Approve this password reset?' : 'Reject this password reset?'}
              </h2>
              <p className="text-sm text-slate-300 mb-4">
                Only approve if you know this person asked for it.
              </p>
              <button type="button" onClick={run} className="btn-primary justify-center py-2.5 text-sm w-full">
                {action === 'approve' ? 'Yes, approve reset' : 'Yes, reject reset'}
              </button>
              <Link to="/login" className="text-xs text-slate-400 hover:text-white block mt-3">Cancel</Link>
            </>
          )}

          {status === 'loading' && (
            <>
              <Loader className="w-10 h-10 text-gold mx-auto mb-3 animate-spin" />
              <p className="text-sm text-slate-300">Processing your response...</p>
            </>
          )}

          {status === 'done' && (
            <>
              <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${approved ? 'bg-green-500/15' : 'bg-red-500/15'}`}>
                {approved
                  ? <CheckCircle className="w-8 h-8 text-green-400" />
                  : <XCircle className="w-8 h-8 text-red-400" />
                }
              </div>
              <h2 className={`text-base font-bold mb-2 ${approved ? 'text-green-400' : 'text-red-400'}`}>
                {approved ? 'Reset Approved ✓' : 'Reset Rejected'}
              </h2>
              <p className="text-sm text-slate-300 mb-2">{msg}</p>
              {approved && (
                <p className="text-xs text-slate-400 mb-4">
                  The user has been notified by email and can now sign in with their new password.
                </p>
              )}
              <Link to="/login" className="btn-primary justify-center py-2.5 text-sm w-full block text-center mt-2">
                Go to Login
              </Link>
            </>
          )}

          {status === 'error' && (
            <>
              <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-4">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-base font-bold text-red-400 mb-2">Link Unavailable</h2>
              <p className="text-sm text-slate-300 mb-4">{msg}</p>
              <Link to="/login" className="text-xs text-slate-400 hover:text-white">← Back to login</Link>
            </>
          )}
        </div>
        <PoweredBy />
      </div>
    </div>
  );
}
