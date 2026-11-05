import React, { useCallback, useEffect, useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Ban, Plus, ToggleLeft, ToggleRight, Calendar, X, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorService, subscriptionService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

// Real subscriptions for every fleet (this page used to show a fixed made-up list).
const DAY = 24 * 60 * 60 * 1000;
// Must match PLAN_AMOUNTS in the API's subscriptionController (what Paystack actually charges).
const PRICES = { GROWTH: 85000, ENTERPRISE: 250000 };
const ymd = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '—');

function rowFor(v, prices) {
  const sub = v.subscriptions?.[0];
  const now = Date.now();
  let status, plan, expires;
  if (sub && new Date(sub.expiryDate) > now) {
    plan = sub.plan; expires = sub.expiryDate;
    status = new Date(sub.expiryDate) - now < 7 * DAY ? 'EXPIRING' : 'ACTIVE';
  } else if (v.trialEndsAt && new Date(v.trialEndsAt) > now) {
    plan = v.trialPlan || 'GROWTH'; expires = v.trialEndsAt; status = 'TRIAL';
  } else {
    plan = sub?.plan || v.trialPlan || 'GROWTH'; expires = sub?.expiryDate || v.trialEndsAt; status = 'EXPIRED';
  }
  if (v.status === 'SUSPENDED') status = 'SUSPENDED';
  const amount = status === 'TRIAL' ? 0 : (prices[plan] || 0);
  return { id: v.id, vendor: v.companyName, plan, status: v.demoMode ? 'DEMO' : status, baseStatus: status, expires: ymd(expires), amount, demo: !!v.demoMode, extended: false };
}

const STATUS_META = {
  ACTIVE:    { cls:'pill-active',    icon:CheckCircle,  label:'Active' },
  EXPIRING:  { cls:'pill-pending',   icon:AlertTriangle,label:'Expiring' },
  EXPIRED:   { cls:'pill-suspended', icon:Ban,          label:'Expired' },
  SUSPENDED: { cls:'pill-suspended', icon:Ban,          label:'Suspended' },
  TRIAL:     { cls:'bg-purple-500/15 text-purple-400', icon:Shield, label:'Trial' },
  DEMO:      { cls:'bg-blue-500/15 text-blue-400',     icon:ToggleRight, label:'Demo Mode' },
};

const PLAN_COLOR = { ENTERPRISE:'text-teal', GROWTH:'text-gold', OEM_WHITE_LABEL:'text-anchor-purple' };

const PLANS = [
  { value:'GROWTH',          label:'Growth — ₦85,000/mo' },
  { value:'ENTERPRISE',      label:'Enterprise — ₦250,000/mo' },
];

const selectStyle = { backgroundColor: '#0d1f38' };

export default function SubscriptionsPage() {
  const isSuper = useAuthStore((st) => st.user?.role === 'SUPER_ADMIN');
  const [subs, setSubs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [extModal, setExtModal]   = useState(null);
  const [extDays, setExtDays]     = useState('30');
  const [extPlan, setExtPlan]     = useState('');
  const [saving, setSaving]       = useState(false);

  const load = useCallback(async () => {
    try {
      const vRes = await vendorService.list({ limit: 100 });
      setSubs((vRes.data.data || []).map((v) => rowFor(v, PRICES)));
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not load subscriptions');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const totalMRR = subs.filter(s => s.baseStatus==='ACTIVE' || s.baseStatus==='EXPIRING').reduce((a, s) => a + s.amount, 0);

  /* Demo mode: full access without payment (super admin only) */
  const toggleDemo = async (id) => {
    const s = subs.find((x) => x.id === id);
    if (!s) return;
    if (!isSuper) { toast.error('Only the super admin can switch demo mode'); return; }
    try {
      await subscriptionService.toggleDemo(id, !s.demo);
      toast.success(!s.demo ? `${s.vendor} set to Demo Mode.` : `${s.vendor} demo ended.`);
      load();
    } catch (e) { toast.error(e?.response?.data?.error || 'Could not change demo mode'); }
  };

  /* Extend plan without payment (super admin only, logged in the audit trail) */
  const doExtend = async () => {
    if (!extModal) return;
    const days = parseInt(extDays) || 30;
    setSaving(true);
    try {
      const res = await subscriptionService.extend(extModal.id, days, extPlan || extModal.plan);
      toast.success(res.data.message || 'Plan extended');
      setExtModal(null);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not extend the plan');
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Subscriptions</h1>
        <div className="text-xs text-[var(--text3)]">
          MRR: <span className="text-gold font-bold">₦{totalMRR.toLocaleString()}</span>
        </div>
      </div>

      <div className="p-5">
        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {[
            ['Active',        subs.filter(s => s.status==='ACTIVE').length,    'pill-active'],
            ['Trial',         subs.filter(s => s.status==='TRIAL').length,     'bg-purple-500/15 text-purple-400'],
            ['Expiring Soon', subs.filter(s => s.status==='EXPIRING').length,  'pill-pending'],
            ['Expired',       subs.filter(s => s.status==='EXPIRED').length,   'pill-suspended'],
          ].map(([l, n, cls]) => (
            <div key={l} className="stat-card">
              <div className="text-[9px] uppercase tracking-wider text-[var(--text3)] mb-1">{l}</div>
              <div className="flex items-center gap-2">
                <div className="text-2xl font-bold text-[var(--text)]">{n}</div>
                <span className={`pill ${cls}`}>{l}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Expiry warning */}
        {subs.filter(s => s.status==='EXPIRING').length > 0 && (
          <div className="bg-gold/8 border border-gold/20 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-gold">
            <AlertTriangle className="w-4 h-4 flex-shrink-0"/>
            {subs.filter(s => s.status==='EXPIRING').length} fleet(s) expire within 7 days. Reminder emails go out automatically.
          </div>
        )}

        {/* Trial notice */}
        {subs.filter(s => s.status==='TRIAL').length > 0 && (
          <div className="bg-purple-500/8 border border-purple-500/20 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-purple-300">
            <Shield className="w-4 h-4 flex-shrink-0"/>
            {subs.filter(s => s.status==='TRIAL').length} fleet(s) on a free trial.
          </div>
        )}

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Vendor</th><th>Plan</th><th>Status</th>
                <th>Expires</th><th>Amount</th>
                <th>Demo</th><th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="text-center text-[var(--text3)] py-6">Loading…</td></tr>}
              {!loading && subs.length === 0 && <tr><td colSpan={7} className="text-center text-[var(--text3)] py-6">No fleets yet. Add one under Vendors / OEM.</td></tr>}
              {subs.map(s => {
                const m = STATUS_META[s.status] || STATUS_META['ACTIVE'];
                const Icon = m.icon;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="text-[11px] font-semibold text-[var(--text)]">{s.vendor}</div>
                      {s.extended && <div className="text-[9px] text-teal mt-0.5">⚡ Admin extended</div>}
                      {s.baseStatus === 'TRIAL' && <div className="text-[9px] text-purple-400 mt-0.5">Free trial</div>}
                    </td>
                    <td>
                      <span className={`text-[11px] font-semibold ${PLAN_COLOR[s.plan]}`}>
                        {String(s.plan).replace(/_/g,' ')}
                      </span>
                    </td>
                    <td>
                      <span className={`pill ${m.cls} flex items-center gap-1 w-fit`}>
                        <Icon className="w-3 h-3"/>{m.label}
                      </span>
                    </td>
                    <td className="text-[11px] text-[var(--text3)]">{s.expires}</td>
                    <td className={s.amount > 0 ? 'text-gold font-medium' : 'text-[var(--text3)]'}>
                      {s.amount > 0 ? `₦${s.amount.toLocaleString()}` : 'Free trial'}
                    </td>
                    {/* Demo toggle */}
                    <td>
                      <button onClick={() => toggleDemo(s.id)} disabled={!isSuper} title={isSuper ? '' : 'Super admin only'}
                        className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition-colors
                          ${s.demo
                            ? 'border-blue-400/40 bg-blue-400/10 text-blue-400'
                            : 'border-white/[0.10] text-[var(--text3)] hover:border-blue-400/40 hover:text-blue-400'}`}>
                        {s.demo ? <ToggleRight className="w-3.5 h-3.5"/> : <ToggleLeft className="w-3.5 h-3.5"/>}
                        {s.demo ? 'ON' : 'OFF'}
                      </button>
                    </td>
                    {/* Extend button */}
                    <td>
                      <button
                        onClick={() => { setExtModal(s); setExtDays('30'); setExtPlan(s.plan); }} disabled={!isSuper} title={isSuper ? '' : 'Super admin only'}
                        className="btn-ghost text-[10px] py-1 disabled:opacity-40">
                        <Calendar className="w-3 h-3"/> Extend
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Extend modal */}
      {extModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="border border-white/[0.12] rounded-2xl p-6 w-full max-w-sm shadow-2xl animate-slide-in"
               style={{ backgroundColor: '#0d1f38' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[14px] font-semibold text-white">Extend / Override Plan</h3>
                <p className="text-[11px] text-white/40 mt-0.5">{extModal.vendor}</p>
              </div>
              <button onClick={() => setExtModal(null)}
                className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12]">
                <X className="w-4 h-4 text-white/50"/>
              </button>
            </div>

            <div className="space-y-4">
              {/* Days */}
              <div>
                <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wide mb-1.5">
                  Extend by (days)
                </label>
                <div className="flex gap-2 mb-2">
                  {['7','30','60','90'].map(d => (
                    <button key={d} onClick={() => setExtDays(d)}
                      className={`flex-1 py-1.5 rounded-lg text-[11px] border transition-colors
                        ${extDays===d ? 'border-teal bg-teal/10 text-teal'
                                      : 'border-white/[0.10] text-[var(--text3)] hover:border-white/30'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
                <input type="number" value={extDays} onChange={e => setExtDays(e.target.value)} min="1" max="365"
                  placeholder="Custom days"
                  className="w-full rounded-lg border border-white/[0.12] px-3 py-2 text-[12px] text-white outline-none focus:border-teal"
                  style={{ backgroundColor: '#0d1f38' }}/>
              </div>

              {/* Plan override */}
              <div>
                <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wide mb-1.5">
                  Plan (can upgrade/downgrade)
                </label>
                <div className="relative">
                  <select value={extPlan} onChange={e => setExtPlan(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-white/[0.12] px-3 py-2.5 pr-8 text-[12px] text-white outline-none focus:border-teal cursor-pointer"
                    style={selectStyle}>
                    {PLANS.map(p => (
                      <option key={p.value} value={p.value} style={selectStyle}>{p.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40"/>
                </div>
              </div>

              <div className="rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2.5">
                <p className="text-[11px] text-teal font-medium">⚡ No payment required</p>
                <p className="text-[10px] text-white/40 mt-0.5">This extension is admin-granted. The vendor will not be charged. It will be logged in the audit trail.</p>
              </div>

              <div className="flex gap-2">
                <button onClick={() => setExtModal(null)} className="flex-1 btn-ghost justify-center">Cancel</button>
                <button onClick={doExtend} disabled={saving} className="flex-1 btn-primary justify-center disabled:opacity-50">
                  <Calendar className="w-3.5 h-3.5"/> {saving ? 'Saving…' : 'Confirm Extension'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
