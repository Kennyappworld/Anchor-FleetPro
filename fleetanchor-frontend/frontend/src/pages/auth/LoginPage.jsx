import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, Lock, Mail, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../context/authStore';

export default function LoginPage() {
  const { login } = useAuthStore();
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [pendingCreds, setPendingCreds] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const result = await login(data.email, data.password, requires2FA ? totpCode : undefined);
      if (result.requires2FA) {
        setRequires2FA(true);
        setPendingCreds(data);
        setLoading(false);
        return;
      }
      const vendorRoles = ['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'FIELD_AGENT'];
      toast.success(`Welcome back!`);
      navigate(vendorRoles.includes(result.user.role) ? '/vendor' : '/admin');
    } catch (err) {
      const msg = err.response?.data?.error || 'Login failed';
      if (err.response?.data?.suspended) {
        toast.error('Account suspended. Contact your OEM administrator.', { duration: 6000 });
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handle2FA = async () => {
    if (!totpCode || totpCode.length !== 6) { toast.error('Enter 6-digit code'); return; }
    setLoading(true);
    try {
      const result = await login(pendingCreds.email, pendingCreds.password, totpCode);
      const vendorRoles = ['FLEET_MANAGER', 'MAINTENANCE_SUPERVISOR', 'FIELD_AGENT'];
      toast.success('Welcome back!');
      navigate(vendorRoles.includes(result.user.role) ? '/vendor' : '/admin');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid 2FA code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, #162952 0%, #0A1628 60%)' }}>
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gold rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg shadow-gold/20">⚓</div>
          <h1 className="text-xl font-bold text-white tracking-tight">FleetAnchor Pro</h1>
          <p className="text-xs text-[var(--text3)] mt-1 tracking-widest uppercase">Maintenance Management Platform</p>
        </div>

        <div className="card p-6 animate-slide-in">
          {!requires2FA ? (
            <>
              <h2 className="text-sm font-semibold text-[var(--text)] mb-4">Sign in to your account</h2>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
                <div>
                  <label className="form-label">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
                    <input
                      {...register('email', { required: 'Email required', pattern: { value: /^\S+@\S+\.\S+$/, message: 'Invalid email' } })}
                      type="email"
                      placeholder="you@company.com"
                      className="form-input pl-8"
                      autoComplete="email"
                    />
                  </div>
                  {errors.email && <p className="text-[10px] text-anchor-red mt-1">{errors.email.message}</p>}
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="form-label">Password</label>
                    <Link to="/forgot-password" className="text-[10px] text-gold hover:text-gold-dark">Forgot password?</Link>
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
                    <input
                      {...register('password', { required: 'Password required' })}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••••••"
                      className="form-input pl-8 pr-8"
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)] hover:text-[var(--text)]">
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-[10px] text-anchor-red mt-1">{errors.password.message}</p>}
                </div>

                <button type="submit" disabled={loading} className="w-full btn-primary justify-center py-2.5 mt-2 text-sm font-semibold disabled:opacity-50">
                  {loading ? 'Signing in...' : 'Sign In'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-4">
                <div className="w-10 h-10 bg-gold/10 border border-gold/25 rounded-xl flex items-center justify-center mx-auto mb-2">
                  <Lock className="w-5 h-5 text-gold" />
                </div>
                <h2 className="text-sm font-semibold text-[var(--text)]">Two-factor authentication</h2>
                <p className="text-xs text-[var(--text3)] mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>
              <div className="flex gap-2 justify-center mb-4">
                {[...Array(6)].map((_, i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={1}
                    value={totpCode[i] || ''}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '');
                      const chars = totpCode.split('');
                      chars[i] = val;
                      setTotpCode(chars.join('').slice(0, 6));
                      if (val && e.target.nextSibling) e.target.nextSibling.focus();
                    }}
                    className="w-10 h-12 bg-white/[0.05] border border-white/[0.08] rounded-lg text-center text-lg font-bold text-gold outline-none focus:border-gold transition-colors"
                  />
                ))}
              </div>
              <button onClick={handle2FA} disabled={loading || totpCode.length !== 6} className="w-full btn-primary justify-center py-2.5 text-sm font-semibold disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify'}
              </button>
              <button onClick={() => { setRequires2FA(false); setTotpCode(''); }} className="w-full text-center text-xs text-[var(--text3)] hover:text-[var(--text)] mt-3">
                ← Back to login
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-2 mt-4 p-3 bg-white/[0.03] border border-white/[0.06] rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-[var(--text3)] flex-shrink-0" />
          <p className="text-[10px] text-[var(--text3)]">Protected by 2FA, rate limiting, and end-to-end encryption</p>
        </div>
      </div>
    </div>
  );
}
