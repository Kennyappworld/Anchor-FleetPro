import React, { useState } from 'react';
import { Scan, CheckCircle, AlertCircle, User, Phone, Mail, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../services/api';

const STEPS = ['details', 'scan', 'submitted'];

export default function DriverSignupPage() {
  const [step, setStep] = useState('details');
  const [form, setForm] = useState({ fullName: '', phone: '', email: '', vehicleScan: '' });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.fullName.trim()) { setError('Enter your full name'); return; }
    if (!form.phone.trim() || form.phone.length < 8) { setError('Enter a valid phone number'); return; }
    if (!form.vehicleScan.trim()) { setError('Enter your vehicle plate or chassis number'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await api.post('/drivers/signup', form);
      setResult(res.data);
      setStep('submitted');
    } catch (err) {
      const msg = err.response?.data?.error || 'Something went wrong. Try again.';
      setError(msg);
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #162952 0%, #0A1628 60%)' }}>

      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-gold rounded-2xl flex items-center justify-center text-3xl mx-auto mb-3 shadow-lg shadow-gold/20">⚓</div>
          <h1 className="text-base font-bold text-white">FleetAnchor Pro</h1>
          <p className="text-[10px] text-[var(--text3)] mt-0.5">Driver Account Request</p>
        </div>

        {step === 'details' && (
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Join your fleet</h2>
            <p className="text-[11px] text-[var(--text3)] mb-4">
              Enter your details and scan your vehicle's plate number or chassis (VIN). Your fleet manager will approve your account.
            </p>

            {error && (
              <div className="flex items-center gap-2 bg-anchor-red/10 border border-anchor-red/20 rounded-lg px-3 py-2 mb-3">
                <AlertCircle className="w-4 h-4 text-anchor-red shrink-0" />
                <p className="text-[11px] text-anchor-red">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="form-label">Full Name *</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
                  <input value={form.fullName} onChange={e => set('fullName', e.target.value)}
                    placeholder="e.g. Emeka Okonkwo" className="form-input pl-9" autoFocus />
                </div>
              </div>

              <div>
                <label className="form-label">Phone Number *</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
                  <input value={form.phone} onChange={e => set('phone', e.target.value)}
                    type="tel" placeholder="e.g. 08012345678" className="form-input pl-9" />
                </div>
              </div>

              <div>
                <label className="form-label">Email <span className="text-[var(--text3)]">(optional — for login)</span></label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
                  <input value={form.email} onChange={e => set('email', e.target.value)}
                    type="email" placeholder="your@email.com" className="form-input pl-9" />
                </div>
              </div>

              <div>
                <label className="form-label">Plate Number or Chassis (VIN) *</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text3)]" />
                  <input value={form.vehicleScan}
                    onChange={e => set('vehicleScan', e.target.value.toUpperCase())}
                    placeholder="e.g. LND-421-XY or WNXNF432..."
                    className="form-input pl-9 font-mono tracking-wide uppercase"
                    onFocus={e => e.target.select()}
                  />
                </div>
                <p className="text-[10px] text-[var(--text3)] mt-1">
                  Type or scan the plate/VIN of the vehicle assigned to you
                </p>
              </div>

              <button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full btn-primary justify-center py-3 text-sm disabled:opacity-50 mt-2"
              >
                {loading ? 'Sending request…' : 'Request Access →'}
              </button>
            </div>
          </div>
        )}

        {step === 'submitted' && result && (
          <div className="card p-6 text-center">
            <CheckCircle className="w-12 h-12 text-anchor-green mx-auto mb-3" />
            <h2 className="text-sm font-semibold text-[var(--text)] mb-1">Request sent!</h2>
            <p className="text-[11px] text-[var(--text3)] mb-4">
              Your request has been sent to <strong className="text-[var(--text)]">{result.companyName}</strong>.
              Your fleet manager will review and approve your account.
            </p>
            {result.vehicleFound && (
              <div className="bg-teal/10 border border-teal/20 rounded-lg px-3 py-2 mb-4">
                <p className="text-[11px] text-teal">
                  ✅ Vehicle confirmed: <strong>{result.vehicleFound}</strong>
                </p>
              </div>
            )}
            <p className="text-[11px] text-[var(--text3)]">
              {form.email
                ? 'You will receive your login details by email once approved.'
                : 'Ask your fleet manager to share your login details once approved.'}
            </p>
            <button
              onClick={() => { setStep('details'); setForm({ fullName: '', phone: '', email: '', vehicleScan: '' }); setResult(null); }}
              className="btn-ghost mt-4 text-xs py-2 w-full justify-center"
            >
              Submit another request
            </button>
          </div>
        )}

        <p className="text-center text-[10px] text-[var(--text3)] mt-4">
          Already have an account?{' '}
          <a href="/login" className="text-gold hover:underline">Log in here</a>
        </p>
      </div>
    </div>
  );
}
