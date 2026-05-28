import React, { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/api';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const verifiedToken = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const checks = {
    length: password.length >= 12,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: password === confirm && password.length > 0,
  };
  const strong = Object.values(checks).every(Boolean);

  const handleReset = async () => {
    if (!strong) { toast.error('Password requirements not met'); return; }
    if (!verifiedToken) { toast.error('Invalid reset link'); return; }
    setLoading(true);
    try {
      await authService.resetPassword({ verifiedToken, password, confirmPassword: confirm });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset failed. Please start over.');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #162952 0%, #0A1628 60%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-gold rounded-xl flex items-center justify-center text-2xl mx-auto mb-2">⚓</div>
          <h1 className="text-base font-bold text-white">FleetAnchor Pro</h1>
        </div>
        <div className="card p-6 animate-slide-in">
          {!done ? (
            <>
              <div className="text-center mb-5">
                <Lock className="w-8 h-8 text-gold mx-auto mb-2" />
                <h2 className="text-sm font-semibold text-[var(--text)]">Set new password</h2>
                <p className="text-xs text-[var(--text3)] mt-1">Single-use link — expires after reset</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="form-label">New Password</label>
                  <div className="relative">
                    <input value={password} onChange={e => setPassword(e.target.value)}
                      type={showPw ? 'text' : 'password'} placeholder="Min 12 characters" className="form-input pr-8" />
                    <button type="button" onClick={() => setShowPw(!showPw)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)]">
                      {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label">Confirm Password</label>
                  <input value={confirm} onChange={e => setConfirm(e.target.value)}
                    type={showPw ? 'text' : 'password'} placeholder="Repeat password" className="form-input" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[['length','12+ characters'],['upper','Uppercase letter'],['number','Number'],['special','Special char'],['match','Passwords match']].map(([k,l]) => (
                    <div key={k} className={`flex items-center gap-1.5 text-[10px] ${checks[k] ? 'text-anchor-green' : 'text-[var(--text3)]'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${checks[k] ? 'bg-anchor-green' : 'bg-white/20'}`} />{l}
                    </div>
                  ))}
                </div>
                <button onClick={handleReset} disabled={loading || !strong}
                  className="w-full btn-primary justify-center py-2.5 text-sm font-semibold disabled:opacity-50">
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-anchor-green mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Password updated!</h2>
              <p className="text-xs text-[var(--text3)] mb-4">All other sessions invalidated for your security.</p>
              <Link to="/login" className="btn-primary justify-center py-2.5 text-sm">Back to Login</Link>
            </div>
          )}
        </div>
        <div className="text-center mt-4">
          <Link to="/login" className="text-xs text-[var(--text3)] hover:text-[var(--text)]">← Back to login</Link>
        </div>
      </div>
    </div>
  );
}
