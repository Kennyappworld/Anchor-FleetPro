import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Eye, EyeOff, CheckCircle, Lock, Building2, AlertCircle, Gift } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/api';

export default function VendorSetupPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token');

  const [step, setStep] = useState('loading'); // loading | valid | invalid | done
  const [vendor, setVendor] = useState(null);
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const pwChecks = {
    length: password.length >= 12,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: password === confirmPassword && password.length > 0,
  };
  const pwStrong = Object.values(pwChecks).every(Boolean);

  useEffect(() => {
    if (!token) { setStep('invalid'); return; }
    authService.checkVendorInvite(token)
      .then(res => { setVendor(res.data.data); setStep('valid'); })
      .catch(err => {
        const msg = err.response?.data?.error || 'Invalid invite link';
        toast.error(msg);
        setStep('invalid');
      });
  }, [token]);

  const handleSetup = async () => {
    if (!fullName.trim()) { toast.error('Enter your full name'); return; }
    if (!pwStrong) { toast.error('Password requirements not met'); return; }
    setLoading(true);
    try {
      await authService.acceptVendorInvite({ token, fullName: fullName.trim(), password, confirmPassword });
      setStep('done');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Setup failed');
    } finally { setLoading(false); }
  };

  const trialDays = vendor?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(vendor.trialEndsAt) - Date.now()) / 86400000))
    : 30;

  if (step === 'loading') return (
    <div className="min-h-screen bg-navy flex items-center justify-center" style={{ background: 'radial-gradient(ellipse at 50% 0%, #162952 0%, #0A1628 60%)' }}>
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-[var(--text3)]">Verifying invite link…</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, #162952 0%, #0A1628 60%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-gold rounded-xl flex items-center justify-center text-2xl mx-auto mb-2">⚓</div>
          <h1 className="text-base font-bold text-white">FleetAnchor Pro</h1>
          <p className="text-[10px] text-[var(--text3)] mt-0.5">Vendor Account Setup</p>
        </div>

        {/* Invalid / expired */}
        {step === 'invalid' && (
          <div className="card p-6 text-center">
            <AlertCircle className="w-10 h-10 text-anchor-red mx-auto mb-3" />
            <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Invite Not Found</h2>
            <p className="text-xs text-[var(--text3)] mb-4">This invite link is invalid, expired, or has already been used.</p>
            <Link to="/login" className="btn-primary justify-center py-2.5 text-sm">Go to Login</Link>
          </div>
        )}

        {/* Setup form */}
        {step === 'valid' && (
          <div className="card p-5">
            {/* Company badge */}
            <div className="flex items-center gap-2.5 bg-gold/8 border border-gold/20 rounded-lg p-3 mb-4">
              <Building2 className="w-5 h-5 text-gold shrink-0" />
              <div>
                <p className="text-xs font-semibold text-gold">{vendor?.companyName}</p>
                <p className="text-[10px] text-[var(--text3)]">via {vendor?.oemName}</p>
              </div>
            </div>

            {/* Trial badge */}
            <div className="flex items-center gap-2 bg-anchor-green/8 border border-anchor-green/20 rounded-lg px-3 py-2 mb-4">
              <Gift className="w-4 h-4 text-anchor-green shrink-0" />
              <p className="text-[11px] text-anchor-green font-medium">
                {trialDays}-day free trial — {vendor?.plan || 'GROWTH'} plan included
              </p>
            </div>

            <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Create your account</h2>
            <p className="text-[11px] text-[var(--text3)] mb-4">
              You'll log in as Fleet Manager for <strong className="text-[var(--text)]">{vendor?.companyName}</strong> using <span className="text-gold">{vendor?.email}</span>
            </p>

            <div className="space-y-3">
              <div>
                <label className="form-label">Your Full Name</label>
                <input
                  value={fullName} onChange={e => setFullName(e.target.value)}
                  type="text" placeholder="e.g. Adaeze Okafor"
                  className="form-input" autoFocus
                />
              </div>

              <div>
                <label className="form-label">Password</label>
                <div className="relative">
                  <input
                    value={password} onChange={e => setPassword(e.target.value)}
                    type={showPw ? 'text' : 'password'} placeholder="Min 12 characters"
                    className="form-input pr-8"
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)]">
                    {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="form-label">Confirm Password</label>
                <input
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  type={showPw ? 'text' : 'password'} placeholder="Repeat password"
                  className="form-input"
                />
              </div>

              {/* Password strength */}
              <div className="grid grid-cols-2 gap-1">
                {[['length','12+ characters'],['upper','Uppercase letter'],['number','Number'],['special','Special character'],['match','Passwords match']].map(([k, l]) => (
                  <div key={k} className={`flex items-center gap-1 text-[10px] ${pwChecks[k] ? 'text-anchor-green' : 'text-[var(--text3)]'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${pwChecks[k] ? 'bg-anchor-green' : 'bg-white/20'}`} />{l}
                  </div>
                ))}
              </div>

              <button
                onClick={handleSetup}
                disabled={loading || !pwStrong || !fullName.trim()}
                className="w-full btn-primary justify-center py-2.5 disabled:opacity-50"
              >
                {loading ? 'Creating account…' : 'Activate Account'}
              </button>
            </div>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="card p-6 text-center">
            <CheckCircle className="w-12 h-12 text-anchor-green mx-auto mb-3" />
            <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Account ready!</h2>
            <p className="text-xs text-[var(--text3)] mb-4">
              Your FleetAnchor Pro account for <strong className="text-[var(--text)]">{vendor?.companyName}</strong> has been created.
              Your {trialDays}-day free trial is now active.
            </p>
            <button onClick={() => navigate('/login')} className="w-full btn-primary justify-center py-2.5">
              Log In Now
            </button>
          </div>
        )}

        <div className="text-center mt-4">
          <Link to="/login" className="text-xs text-[var(--text3)] hover:text-[var(--text)]">Already have an account? Log in</Link>
        </div>
      </div>
    </div>
  );
}
