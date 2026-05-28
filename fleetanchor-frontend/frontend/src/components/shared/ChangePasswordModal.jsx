import React, { useState } from 'react';
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

export default function ChangePasswordModal({ forced = false }) {
  const { user, setUser } = useAuthStore();
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!forced && !user?.mustChangePassword) return null;

  const checks = {
    length: newPw.length >= 8,
    upper: /[A-Z]/.test(newPw),
    number: /[0-9]/.test(newPw),
    match: newPw === confirm && newPw.length > 0,
  };
  const strong = Object.values(checks).every(Boolean);

  const handleSubmit = async () => {
    if (!current) { toast.error('Enter your current/temporary password'); return; }
    if (!strong) { toast.error('Password requirements not met'); return; }
    setLoading(true);
    try {
      await authService.changePassword(current, newPw);
      setDone(true);
      // Update store so banner disappears
      setUser({ ...user, mustChangePassword: false });
      toast.success('Password changed successfully!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to change password');
    } finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-sm p-5">
        {done ? (
          <div className="text-center py-4">
            <CheckCircle className="w-10 h-10 text-anchor-green mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Password Updated!</h3>
            <p className="text-xs text-[var(--text3)]">Your account is now fully set up. Welcome to FleetAnchor Pro!</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-gold/20 rounded-lg flex items-center justify-center">
                <Lock className="w-4 h-4 text-gold" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  {forced ? 'Set Your Password' : 'Change Password'}
                </h3>
                {forced && <p className="text-[10px] text-[var(--text3)]">You must change your temporary password before continuing</p>}
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="form-label">Temporary Password</label>
                <div className="relative">
                  <input value={current} onChange={e => setCurrent(e.target.value)}
                    type={show ? 'text' : 'password'} placeholder="Enter the password from your email"
                    className="form-input pr-8" autoFocus />
                  <button type="button" onClick={() => setShow(!show)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)]">
                    {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label">New Password</label>
                <input value={newPw} onChange={e => setNewPw(e.target.value)}
                  type={show ? 'text' : 'password'} placeholder="Min 8 characters"
                  className="form-input" />
              </div>

              <div>
                <label className="form-label">Confirm New Password</label>
                <input value={confirm} onChange={e => setConfirm(e.target.value)}
                  type={show ? 'text' : 'password'} placeholder="Repeat new password"
                  className="form-input" />
              </div>

              {/* Strength indicators */}
              <div className="grid grid-cols-2 gap-1">
                {[['length','8+ characters'],['upper','Uppercase letter'],['number','Number'],['match','Passwords match']].map(([k,l]) => (
                  <div key={k} className={`flex items-center gap-1 text-[10px] ${checks[k] ? 'text-anchor-green' : 'text-[var(--text3)]'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${checks[k] ? 'bg-anchor-green' : 'bg-white/20'}`} />{l}
                  </div>
                ))}
              </div>

              <button onClick={handleSubmit} disabled={loading || !strong}
                className="w-full btn-primary justify-center py-2.5 disabled:opacity-50">
                {loading ? 'Changing…' : 'Set New Password'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
