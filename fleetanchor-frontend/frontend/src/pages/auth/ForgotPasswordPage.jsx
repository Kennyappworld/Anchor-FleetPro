import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, ArrowLeft, Clock, CheckCircle, Lock, Eye, EyeOff, User, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { authService } from '../../services/api';

const pwChecks = (pw, cpw) => ({
  length:  pw.length >= 8,
  upper:   /[A-Z]/.test(pw),
  number:  /[0-9]/.test(pw),
  match:   pw === cpw && pw.length > 0,
});

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  // Flow: 'choose' → 'otp' (OTP flow) or 'manager' (approval flow)
  const [flow, setFlow] = useState('choose');
  const [step, setStep] = useState(0);      // within chosen flow
  const [loading, setLoading] = useState(false);

  // Shared
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');

  // OTP flow
  const [otp, setOtp] = useState(['','','','','','']);
  const [countdown, setCountdown] = useState(900);
  const [verifiedToken, setVerifiedToken] = useState('');

  // Password
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [done, setDone] = useState(false);
  const [doneMsg, setDoneMsg] = useState('');

  useEffect(() => {
    if (flow !== 'otp' || step !== 1) return;
    const t = setInterval(() => setCountdown(c => c > 0 ? c - 1 : 0), 1000);
    return () => clearInterval(t);
  }, [flow, step]);

  const fmt = s => `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  const checks = pwChecks(password, confirmPw);
  const pwOk = Object.values(checks).every(Boolean);

  // ── OTP flow ───────────────────────────────────────────────────────────────
  const sendOtp = async () => {
    if (!email.includes('@')) { toast.error('Enter a valid email'); return; }
    setLoading(true);
    try {
      await authService.forgotPassword({ email, accountType: 'vendor' });
      toast.success('Reset code sent to your email');
      setStep(1); setCountdown(900);
    } catch (err) { toast.error(err.response?.data?.error || 'Failed to send code'); }
    finally { setLoading(false); }
  };

  const verifyOtp = async () => {
    const code = otp.join('');
    if (code.length !== 6) { toast.error('Enter all 6 digits'); return; }
    setLoading(true);
    try {
      const res = await authService.verifyOtp({ email, otp: code });
      setVerifiedToken(res.data.verifiedToken);
      setStep(2);
    } catch (err) { toast.error(err.response?.data?.error || 'Invalid code'); }
    finally { setLoading(false); }
  };

  const resetViaOtp = async () => {
    if (!pwOk) { toast.error('Check password requirements'); return; }
    setLoading(true);
    try {
      await authService.resetPassword({ verifiedToken, password, confirmPassword: confirmPw });
      setDone(true); setDoneMsg('Password updated! You can now log in.');
    } catch (err) { toast.error(err.response?.data?.error || 'Reset failed'); }
    finally { setLoading(false); }
  };

  // ── Manager approval flow ──────────────────────────────────────────────────
  const submitManagerRequest = async () => {
    if (!email.includes('@')) { toast.error('Enter a valid email'); return; }
    if (!pwOk) { toast.error('Check password requirements'); return; }
    setLoading(true);
    try {
      const res = await authService.requestReset?.({ email, newPassword: password, fullName }) ||
        await fetch('/api/auth/request-reset', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email, newPassword: password, fullName }) }).then(r=>r.json());
      if (res?.useOtp) {
        toast('Using email OTP instead — check your inbox');
        setFlow('otp'); setStep(1); setCountdown(900);
      } else {
        setDone(true); setDoneMsg('Request sent! Your manager will review and approve. You\'ll receive an email once approved.');
      }
    } catch (err) { toast.error('Failed to submit request'); }
    finally { setLoading(false); }
  };

  const handleOtpKey = (i, val, e) => {
    const v = val.replace(/\D/g,'').slice(0,1);
    const next = [...otp]; next[i] = v; setOtp(next);
    if (v && i < 5) document.getElementById(`otp-${i+1}`)?.focus();
    if (e.key === 'Backspace' && !otp[i] && i > 0) document.getElementById(`otp-${i-1}`)?.focus();
  };

  if (done) return (
    <PageWrap>
      <Card>
        <div className="text-center py-4">
          <div className="w-16 h-16 rounded-full bg-green-500/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-400" />
          </div>
          <h2 className="text-base font-bold text-white mb-2">
            {flow === 'manager' ? 'Request Submitted!' : 'Password Updated!'}
          </h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">{doneMsg}</p>
          <Link to="/login" className="btn-primary justify-center py-2.5 text-sm w-full block text-center">
            Back to Login
          </Link>
        </div>
      </Card>
      <PoweredBy />
    </PageWrap>
  );

  return (
    <PageWrap>
      <Card>
        {/* ── Choose flow ─────────────────────────────────────────────── */}
        {flow === 'choose' && (
          <>
            <div className="text-center mb-6">
              <div className="w-12 h-12 bg-gold/15 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Lock className="w-6 h-6 text-gold" />
              </div>
              <h2 className="text-base font-bold text-white">Reset Password</h2>
              <p className="text-xs text-slate-400 mt-1">Choose how you'd like to reset your password</p>
            </div>

            <div className="space-y-3">
              {/* Option A - OTP */}
              <button
                onClick={() => { setFlow('otp'); setStep(0); }}
                className="w-full text-left p-4 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-gold/40 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Mail className="w-4 h-4 text-teal" />
                  </div>
                  <div>
                    <div className="text-sm font-600 text-white group-hover:text-gold transition-colors">
                      Email Code Reset
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Receive a 6-digit code by email. Verify and set a new password instantly.
                    </div>
                    <div className="text-[10px] text-teal mt-1 font-500">Instant · Best for OTP access</div>
                  </div>
                </div>
              </button>

              {/* Option B - Manager approval */}
              <button
                onClick={() => { setFlow('manager'); setStep(0); }}
                className="w-full text-left p-4 rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-gold/40 transition-all group"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <ShieldCheck className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <div className="text-sm font-600 text-white group-hover:text-gold transition-colors">
                      Manager Approval Reset
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                      Submit your new password for approval by your fleet manager or supervisor.
                    </div>
                    <div className="text-[10px] text-purple-400 mt-1 font-500">Secure · Manager reviews before applying</div>
                  </div>
                </div>
              </button>
            </div>

            <div className="mt-4 p-3 rounded-lg bg-gold/8 border border-gold/15 text-[10px] text-gold">
              🔒 Face ID / biometric login available in the mobile app — no password needed after first login.
            </div>
          </>
        )}

        {/* ── OTP flow — step 0: enter email ─────────────────────────── */}
        {flow === 'otp' && step === 0 && (
          <>
            <BackBtn onClick={() => setFlow('choose')} />
            <h2 className="text-sm font-bold text-white mb-1">Verify by Email</h2>
            <p className="text-xs text-slate-400 mb-4">Enter your email — a 6-digit code will be sent (valid 15 min).</p>
            <label className="form-label">Email Address</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="your@company.com" className="form-input mb-4" autoFocus />
            <button onClick={sendOtp} disabled={loading} className="w-full btn-primary justify-center py-2.5 disabled:opacity-50">
              {loading ? 'Sending...' : 'Send Code →'}
            </button>
          </>
        )}

        {/* ── OTP flow — step 1: enter code ──────────────────────────── */}
        {flow === 'otp' && step === 1 && (
          <>
            <BackBtn onClick={() => setStep(0)} />
            <div className="text-center mb-4">
              <Mail className="w-8 h-8 text-teal mx-auto mb-2" />
              <h2 className="text-sm font-bold text-white">Check your email</h2>
              <p className="text-xs text-slate-400 mt-1">Code sent to <span className="text-white font-500">{email}</span></p>
            </div>
            <div className="flex gap-2 justify-center mb-3">
              {otp.map((d,i) => (
                <input key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1} value={d}
                  onChange={e => handleOtpKey(i, e.target.value, e)}
                  onKeyDown={e => handleOtpKey(i, otp[i], e)}
                  className="w-10 h-12 bg-white/[0.05] border border-white/10 rounded-lg text-center text-xl font-bold text-gold outline-none focus:border-gold transition-colors"
                />
              ))}
            </div>
            <div className="text-center text-xs text-slate-400 mb-3 flex items-center justify-center gap-1">
              <Clock className="w-3 h-3" /> Expires in <span className={`font-bold ml-1 ${countdown < 60 ? 'text-red-400' : 'text-gold'}`}>{fmt(countdown)}</span>
            </div>
            <button onClick={verifyOtp} disabled={loading || otp.join('').length !== 6} className="w-full btn-primary justify-center py-2.5 disabled:opacity-50">
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>
            <button onClick={() => { setStep(0); setOtp(['','','','','','']); }} className="w-full text-xs text-slate-400 hover:text-white mt-2 text-center py-1">
              Resend code
            </button>
          </>
        )}

        {/* ── OTP flow — step 2: set new password ────────────────────── */}
        {flow === 'otp' && step === 2 && (
          <>
            <BackBtn onClick={() => setStep(1)} />
            <h2 className="text-sm font-bold text-white mb-4">Set new password</h2>
            <PwFields password={password} setPassword={setPassword} confirmPw={confirmPw} setConfirmPw={setConfirmPw} showPw={showPw} setShowPw={setShowPw} checks={checks} />
            <button onClick={resetViaOtp} disabled={loading || !pwOk} className="w-full btn-primary justify-center py-2.5 mt-3 disabled:opacity-50">
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </>
        )}

        {/* ── Manager flow ────────────────────────────────────────────── */}
        {flow === 'manager' && (
          <>
            <BackBtn onClick={() => setFlow('choose')} />
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Manager Approval Reset</h2>
                <p className="text-[10px] text-slate-400">Your manager will approve before applying</p>
              </div>
            </div>

            <div className="space-y-3 mb-4">
              <div>
                <label className="form-label">Your Full Name</label>
                <input value={fullName} onChange={e=>setFullName(e.target.value)} type="text" placeholder="e.g. John Doe" className="form-input" />
              </div>
              <div>
                <label className="form-label">Your Email Address</label>
                <input value={email} onChange={e=>setEmail(e.target.value)} type="email" placeholder="your@company.com" className="form-input" />
              </div>
            </div>

            <div className="mb-4 p-3 rounded-lg bg-white/[0.03] border border-white/10">
              <p className="text-[10px] text-slate-400 mb-2 font-500">Set your desired new password:</p>
              <PwFields password={password} setPassword={setPassword} confirmPw={confirmPw} setConfirmPw={setConfirmPw} showPw={showPw} setShowPw={setShowPw} checks={checks} />
            </div>

            <div className="p-3 rounded-lg bg-purple-500/8 border border-purple-500/15 text-[10px] text-purple-300 mb-4">
              📧 Your request will be emailed to your fleet manager or supervisor. Once approved, your password updates automatically and you receive a confirmation.
            </div>

            <button onClick={submitManagerRequest} disabled={loading || !pwOk || !email || !fullName} className="w-full btn-primary justify-center py-2.5 disabled:opacity-50">
              {loading ? 'Submitting...' : 'Submit Reset Request →'}
            </button>
          </>
        )}
      </Card>

      <div className="text-center mt-4">
        <Link to="/login" className="text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1">
          <ArrowLeft className="w-3 h-3" /> Back to login
        </Link>
      </div>
      <PoweredBy />
    </PageWrap>
  );
}

function PageWrap({ children }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #162952 0%, #0A1628 60%)' }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-gold rounded-xl flex items-center justify-center text-2xl mx-auto mb-2">⚓</div>
          <h1 className="text-sm font-bold text-white">FleetAnchor Pro</h1>
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ children }) {
  return <div className="card p-5">{children}</div>;
}

function BackBtn({ onClick }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white mb-4">
      <ArrowLeft className="w-3 h-3" /> Back
    </button>
  );
}

function PwFields({ password, setPassword, confirmPw, setConfirmPw, showPw, setShowPw, checks }) {
  return (
    <div className="space-y-3">
      <div>
        <label className="form-label">New Password</label>
        <div className="relative">
          <input value={password} onChange={e=>setPassword(e.target.value)} type={showPw?'text':'password'} placeholder="Min 8 characters" className="form-input pr-8" />
          <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
            {showPw ? <EyeOff className="w-3.5 h-3.5"/> : <Eye className="w-3.5 h-3.5"/>}
          </button>
        </div>
      </div>
      <div>
        <label className="form-label">Confirm Password</label>
        <input value={confirmPw} onChange={e=>setConfirmPw(e.target.value)} type={showPw?'text':'password'} placeholder="Repeat password" className="form-input" />
      </div>
      <div className="grid grid-cols-2 gap-1">
        {[['length','8+ characters'],['upper','Uppercase'],['number','Number'],['match','Passwords match']].map(([k,l]) => (
          <div key={k} className={`flex items-center gap-1 text-[10px] ${checks[k]?'text-green-400':'text-slate-500'}`}>
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${checks[k]?'bg-green-400':'bg-white/20'}`}/>{l}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PoweredBy({ compact = false }) {
  if (compact) {
    return (
      <div className="select-none text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
          style={{ background: 'linear-gradient(135deg, rgba(245,166,35,0.08) 0%, rgba(0,201,167,0.06) 100%)', border: '0.5px solid rgba(245,166,35,0.2)' }}>
          <span className="text-[9px] text-slate-500">Powered by</span>
          <span className="text-[10px] font-700 tracking-wider" style={{ background: 'linear-gradient(90deg, #F5A623, #00C9A7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            ⚓ AnchorSuites
          </span>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-6 text-center select-none">
      <div className="inline-flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-2 px-5 py-2.5 rounded-2xl"
          style={{ background: 'linear-gradient(135deg, rgba(245,166,35,0.07) 0%, rgba(0,201,167,0.05) 100%)', border: '0.5px solid rgba(245,166,35,0.18)', boxShadow: '0 2px 12px rgba(245,166,35,0.06)' }}>
          <div className="w-5 h-5 rounded-md flex items-center justify-center text-xs" style={{ background: 'linear-gradient(135deg, #F5A623, #00C9A7)' }}>⚓</div>
          <div className="flex flex-col">
            <span className="text-[9px] text-slate-500 leading-none tracking-widest uppercase">Powered by</span>
            <span className="text-[11px] font-700 tracking-wide leading-tight" style={{ background: 'linear-gradient(90deg, #F5A623 0%, #00C9A7 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              AnchorSuites Technologies
            </span>
          </div>
        </div>
        <span className="text-[9px] text-slate-600 tracking-wider">Enterprise Fleet Intelligence</span>
      </div>
    </div>
  );
}
