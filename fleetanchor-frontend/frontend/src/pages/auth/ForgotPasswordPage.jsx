import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, Clock, CheckCircle, Lock, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/api';

const steps = ['Email', 'Verify Code', 'New Password'];

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [accountType, setAccountType] = useState('vendor');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [countdown, setCountdown] = useState(900);
  const [verifiedToken, setVerifiedToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (step !== 1) return;
    const timer = setInterval(() => setCountdown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearInterval(timer);
  }, [step]);

  const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const pwChecks = {
    length: password.length >= 12,
    upper: /[A-Z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
    match: password === confirmPassword && password.length > 0,
  };
  const pwStrong = Object.values(pwChecks).every(Boolean);

  const handleSendEmail = async () => {
    if (!email || !email.includes('@')) { toast.error('Enter a valid email'); return; }
    setLoading(true);
    try {
      await authService.forgotPassword({ email, accountType });
      toast.success('Reset code sent!');
      setStep(1);
      setCountdown(900);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send reset email');
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join('');
    if (code.length !== 6) { toast.error('Enter all 6 digits'); return; }
    setLoading(true);
    try {
      const res = await authService.verifyOtp({ email, otp: code });
      setVerifiedToken(res.data.verifiedToken);
      setStep(2);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid OTP');
    } finally { setLoading(false); }
  };

  const handleReset = async () => {
    if (!pwStrong) { toast.error('Password requirements not met'); return; }
    setLoading(true);
    try {
      await authService.resetPassword({ verifiedToken, password, confirmPassword });
      setDone(true);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Reset failed');
    } finally { setLoading(false); }
  };

  const handleOtpChange = (i, val) => {
    const v = val.replace(/\D/g, '').slice(0, 1);
    const next = [...otp];
    next[i] = v;
    setOtp(next);
    if (v && i < 5) document.getElementById(`otp-${i + 1}`)?.focus();
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4" style={{ background: 'radial-gradient(ellipse at 50% 0%, #162952 0%, #0A1628 60%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-gold rounded-xl flex items-center justify-center text-2xl mx-auto mb-2">⚓</div>
          <h1 className="text-base font-bold text-white">FleetAnchor Pro</h1>
        </div>

        {/* Step indicators */}
        <div className="flex items-center justify-center gap-0 mb-5">
          {steps.map((s, i) => (
            <React.Fragment key={i}>
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-all ${i < step ? 'border-anchor-green bg-anchor-green/10 text-anchor-green' : i === step ? 'border-gold bg-gold/10 text-gold' : 'border-white/20 text-[var(--text3)]'}`}>
                  {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                <span className={`text-[9px] ${i === step ? 'text-gold' : 'text-[var(--text3)]'}`}>{s}</span>
              </div>
              {i < steps.length - 1 && <div className={`h-px w-12 mx-1 mb-4 transition-colors ${i < step ? 'bg-anchor-green' : 'bg-white/10'}`} />}
            </React.Fragment>
          ))}
        </div>

        <div className="card p-5 animate-slide-in">
          {/* STEP 0 — Email */}
          {step === 0 && (
            <>
              <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Forgot your password?</h2>
              <p className="text-xs text-[var(--text3)] mb-4">Enter your registered email. A 6-digit code will be sent — valid for 15 minutes.</p>
              <div className="bg-gold/8 border border-gold/20 rounded-lg p-2.5 text-[10px] text-gold mb-3">Reset requests limited to 3 per hour for security.</div>
              <div className="space-y-3">
                <div>
                  <label className="form-label">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
                    <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="your@company.com" className="form-input pl-8" autoFocus />
                  </div>
                </div>
                <div>
                  <label className="form-label">Account Type</label>
                  <select value={accountType} onChange={e => setAccountType(e.target.value)} className="form-input">
                    <option value="vendor">Vendor / Fleet Manager</option>
                    <option value="supervisor">Maintenance Supervisor</option>
                    <option value="field_agent">Field Agent</option>
                    <option value="oem">OEM Admin</option>
                    <option value="admin">Workshop Staff / Super Admin</option>
                  </select>
                </div>
                <button onClick={handleSendEmail} disabled={loading} className="w-full btn-primary justify-center py-2.5 disabled:opacity-50">
                  {loading ? 'Sending...' : 'Send Reset Code'}
                </button>
              </div>
            </>
          )}

          {/* STEP 1 — OTP */}
          {step === 1 && (
            <>
              <div className="text-center mb-4">
                <Mail className="w-8 h-8 text-teal mx-auto mb-2" />
                <h2 className="text-sm font-semibold text-[var(--text)]">Check your email</h2>
                <p className="text-xs text-[var(--text3)] mt-1">6-digit code sent to <span className="text-[var(--text)] font-medium">{email}</span></p>
              </div>
              <div className="flex gap-2 justify-center mb-3">
                {otp.map((d, i) => (
                  <input id={`otp-${i}`} key={i} type="text" maxLength={1} value={d}
                    onChange={e => handleOtpChange(i, e.target.value)}
                    onKeyDown={e => { if (e.key === 'Backspace' && !d && i > 0) document.getElementById(`otp-${i - 1}`)?.focus(); }}
                    className="w-10 h-12 bg-white/[0.05] border border-white/[0.08] rounded-lg text-center text-xl font-bold text-gold outline-none focus:border-gold transition-colors" />
                ))}
              </div>
              <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--text3)] mb-3">
                <Clock className="w-3 h-3" /> Code expires in <span className={`font-bold ${countdown < 60 ? 'text-anchor-red' : 'text-gold'}`}>{formatTime(countdown)}</span>
              </div>
              {countdown === 0 && <p className="text-center text-xs text-anchor-red mb-2">Code expired. Request a new one.</p>}
              <button onClick={handleVerifyOtp} disabled={loading || otp.join('').length !== 6} className="w-full btn-primary justify-center py-2.5 disabled:opacity-50">
                {loading ? 'Verifying...' : 'Verify Code'}
              </button>
              <button onClick={() => { setStep(0); setOtp(['','','','','','']); }} className="w-full text-center text-xs text-[var(--text3)] hover:text-[var(--text)] mt-2">← Resend code</button>
            </>
          )}

          {/* STEP 2 — New password */}
          {step === 2 && !done && (
            <>
              <div className="text-center mb-4">
                <Lock className="w-8 h-8 text-gold mx-auto mb-2" />
                <h2 className="text-sm font-semibold text-[var(--text)]">Set new password</h2>
                <p className="text-xs text-[var(--text3)] mt-1">This link is single-use and expires after reset.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="form-label">New Password</label>
                  <div className="relative">
                    <input value={password} onChange={e => setPassword(e.target.value)} type={showPw ? 'text' : 'password'} placeholder="Min 12 characters" className="form-input pr-8" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)]">
                      {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="form-label">Confirm Password</label>
                  <input value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} type={showPw ? 'text' : 'password'} placeholder="Repeat password" className="form-input" />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[['length','12+ characters'],['upper','Uppercase letter'],['number','Number'],['special','Special char'],['match','Passwords match']].map(([k,l]) => (
                    <div key={k} className={`flex items-center gap-1 text-[10px] ${pwChecks[k] ? 'text-anchor-green' : 'text-[var(--text3)]'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${pwChecks[k] ? 'bg-anchor-green' : 'bg-white/20'}`} /> {l}
                    </div>
                  ))}
                </div>
                <button onClick={handleReset} disabled={loading || !pwStrong} className="w-full btn-primary justify-center py-2.5 disabled:opacity-50">
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </>
          )}

          {/* Done */}
          {done && (
            <div className="text-center py-4">
              <CheckCircle className="w-12 h-12 text-anchor-green mx-auto mb-3" />
              <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Password updated!</h2>
              <p className="text-xs text-[var(--text3)] mb-4">All other sessions have been invalidated for your security.</p>
              <Link to="/login" className="btn-primary justify-center py-2.5 text-sm">Back to Login</Link>
            </div>
          )}
        </div>

        <div className="text-center mt-4">
          <Link to="/login" className="text-xs text-[var(--text3)] hover:text-[var(--text)] flex items-center justify-center gap-1">
            <ArrowLeft className="w-3 h-3" /> Back to login
          </Link>
        </div>
      </div>
    </div>
  );
}
