import React, { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, Ban, Plus, ToggleLeft, ToggleRight, Calendar, X, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';

const INIT = [
  { id:'1', vendor:'Coca-Cola Nigeria',  plan:'ENTERPRISE',      status:'ACTIVE',    starts:'2026-05-01', expires:'2026-06-01', amount:250000, autoRenew:true,  demo:false, extended:false },
  { id:'2', vendor:'Dangote Flour',      plan:'GROWTH',          status:'EXPIRING',  starts:'2026-05-01', expires:'2026-05-30', amount:85000,  autoRenew:true,  demo:false, extended:false },
  { id:'3', vendor:'NNPC Logistics',     plan:'ENTERPRISE',      status:'ACTIVE',    starts:'2026-05-01', expires:'2026-06-01', amount:250000, autoRenew:true,  demo:false, extended:false },
  { id:'4', vendor:'UAC Nigeria',        plan:'GROWTH',          status:'EXPIRED',   starts:'2026-04-01', expires:'2026-05-01', amount:85000,  autoRenew:false, demo:false, extended:false },
  { id:'5', vendor:'Lafarge Cement',     plan:'GROWTH',          status:'ACTIVE',    starts:'2026-05-10', expires:'2026-06-10', amount:85000,  autoRenew:true,  demo:false, extended:false },
  { id:'6', vendor:'Julius Berger',      plan:'OEM_WHITE_LABEL', status:'ACTIVE',    starts:'2026-01-01', expires:'2026-12-31', amount:500000, autoRenew:true,  demo:false, extended:false },
  { id:'7', vendor:'PMC FAW Motors',     plan:'GROWTH',          status:'TRIAL',     starts:'2026-05-28', expires:'2026-06-28', amount:0,      autoRenew:false, demo:false, extended:false },
];

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
  { value:'OEM_WHITE_LABEL', label:'OEM White-Label' },
];

const selectStyle = { backgroundColor: '#0d1f38' };

export default function SubscriptionsPage() {
  const [subs, setSubs]           = useState(INIT);
  const [extModal, setExtModal]   = useState(null);   // { sub, days, plan }
  const [extDays, setExtDays]     = useState('30');
  const [extPlan, setExtPlan]     = useState('');

  const totalMRR = subs.filter(s => s.status==='ACTIVE' || s.status==='EXPIRING')
                       .reduce((a, s) => a + s.amount, 0);

  /* Toggle demo mode */
  const toggleDemo = (id) => {
    setSubs(prev => prev.map(s => {
      if (s.id !== id) return s;
      const isDemo = !s.demo;
      toast.success(isDemo
        ? `${s.vendor} set to Demo Mode. Full access granted temporarily.`
        : `${s.vendor} demo ended. Reverted to ${s.plan} plan.`);
      return { ...s, demo: isDemo, status: isDemo ? 'DEMO' : (s.extended ? 'ACTIVE' : s.status === 'DEMO' ? 'ACTIVE' : s.status) };
    }));
  };

  /* Extend plan without payment */
  const doExtend = () => {
    if (!extModal) return;
    const days = parseInt(extDays) || 30;
    const plan = extPlan || extModal.plan;
    setSubs(prev => prev.map(s => {
      if (s.id !== extModal.id) return s;
      const base = new Date(s.expires) > new Date() ? new Date(s.expires) : new Date();
      base.setDate(base.getDate() + days);
      return { ...s, plan, status: 'ACTIVE', extended: true,
               expires: base.toISOString().slice(0, 10) };
    }));
    toast.success(`${extModal.vendor} extended by ${days} days${plan !== extModal.plan ? ` and upgraded to ${plan}` : ''} — no payment required.`);
    setExtModal(null);
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
        <div className="grid grid-cols-4 gap-3 mb-5">
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
            {subs.filter(s => s.status==='EXPIRING').length} vendor(s) expire within 7 days. Auto-warning emails sent.
          </div>
        )}

        {/* Trial notice */}
        {subs.filter(s => s.status==='TRIAL').length > 0 && (
          <div className="bg-purple-500/8 border border-purple-500/20 rounded-xl p-3 mb-4 flex items-center gap-2 text-xs text-purple-300">
            <Shield className="w-4 h-4 flex-shrink-0"/>
            {subs.filter(s => s.status==='TRIAL').length} vendor(s) on free 1-month trial. Auto-reminder will be sent 7 days before expiry.
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
              {subs.map(s => {
                const m = STATUS_META[s.status] || STATUS_META['ACTIVE'];
                const Icon = m.icon;
                return (
                  <tr key={s.id}>
                    <td>
                      <div className="text-[11px] font-semibold text-[var(--text)]">{s.vendor}</div>
                      {s.extended && <div className="text-[9px] text-teal mt-0.5">⚡ Admin extended</div>}
                      {s.status === 'TRIAL' && <div className="text-[9px] text-purple-400 mt-0.5">🆓 1-month free trial</div>}
                    </td>
                    <td>
                      <span className={`text-[11px] font-semibold ${PLAN_COLOR[s.plan]}`}>
                        {s.plan.replace(/_/g,' ')}
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
                      <button onClick={() => toggleDemo(s.id)}
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
                        onClick={() => { setExtModal(s); setExtDays('30'); setExtPlan(s.plan); }}
                        className="btn-ghost text-[10px] py-1">
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
                        ${extDays===d ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                                      : 'border-white/[0.10] text-[var(--text3)] hover:border-white/30'}`}>
                      {d}d
                    </button>
                  ))}
                </div>
                <input type="number" value={extDays} onChange={e => setExtDays(e.target.value)} min="1" max="365"
                  placeholder="Custom days"
                  className="w-full rounded-lg border border-white/[0.12] px-3 py-2 text-[12px] text-white outline-none focus:border-[var(--accent)]"
                  style={{ backgroundColor: '#0d1f38' }}/>
              </div>

              {/* Plan override */}
              <div>
                <label className="block text-[10px] font-medium text-white/40 uppercase tracking-wide mb-1.5">
                  Plan (can upgrade/downgrade)
                </label>
                <div className="relative">
                  <select value={extPlan} onChange={e => setExtPlan(e.target.value)}
                    className="w-full appearance-none rounded-lg border border-white/[0.12] px-3 py-2.5 pr-8 text-[12px] text-white outline-none focus:border-[var(--accent)] cursor-pointer"
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
                <button onClick={doExtend} className="flex-1 btn-primary justify-center">
                  <Calendar className="w-3.5 h-3.5"/> Confirm Extension
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
