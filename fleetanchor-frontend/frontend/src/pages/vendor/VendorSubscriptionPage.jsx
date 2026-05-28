import React, { useState, useEffect } from 'react';
import { CreditCard, CheckCircle, Clock, AlertTriangle, Zap, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { subscriptionService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

const PLANS = [
  {
    key: 'GROWTH',
    name: 'Growth',
    price: '₦85,000',
    period: '/month',
    color: 'teal',
    colorHex: '00C9A7',
    features: [
      'Up to 2 user accounts',
      'Unlimited vehicles',
      'Unlimited job requests',
      'Maintenance history & reports',
      'Excel bulk vehicle import',
      'Team chat (4 channels)',
      'PDF invoice downloads',
      '30-day free trial included',
    ],
  },
  {
    key: 'ENTERPRISE',
    name: 'Enterprise',
    price: '₦250,000',
    period: '/month',
    color: 'gold',
    colorHex: 'F5A623',
    features: [
      'Unlimited user accounts',
      'Everything in Growth',
      'Advanced analytics dashboard',
      'API access for integrations',
      'Priority support',
      'Custom job categories',
      'Bulk invoice export',
      'Dedicated account manager',
    ],
  },
];

const STATUS_CONFIG = {
  ACTIVE: { label: 'Active', icon: CheckCircle, cls: 'text-anchor-green', bg: 'bg-anchor-green/10 border-anchor-green/20' },
  TRIAL:  { label: 'Free Trial', icon: Clock, cls: 'text-gold', bg: 'bg-gold/10 border-gold/20' },
  EXPIRED: { label: 'Expired', icon: AlertTriangle, cls: 'text-anchor-red', bg: 'bg-anchor-red/10 border-anchor-red/20' },
  CANCELLED: { label: 'Cancelled', icon: X, cls: 'text-anchor-red', bg: 'bg-anchor-red/10 border-anchor-red/20' },
};

export default function VendorSubscriptionPage() {
  const { user } = useAuthStore();
  const vendorId = user?.vendorId;

  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(null); // plan key being paid

  useEffect(() => {
    if (vendorId) fetchSub();
    // Check if returning from Paystack payment
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('reference') || urlParams.get('trxref');
    if (ref) handleVerify(ref);
  }, [vendorId]);

  const fetchSub = async () => {
    setLoading(true);
    try {
      const res = await subscriptionService.getForVendor(vendorId);
      setSub(res.data.data);
    } catch { /* no sub yet */ }
    finally { setLoading(false); }
  };

  const handleVerify = async (reference) => {
    try {
      await subscriptionService.verify(reference);
      toast.success('Payment confirmed! Your subscription is active.');
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
      fetchSub();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not verify payment');
    }
  };

  const handleSubscribe = async (planKey) => {
    if (!vendorId) { toast.error('Vendor account required'); return; }
    setPaying(planKey);
    try {
      const res = await subscriptionService.initiate(vendorId, planKey);
      const { authorizationUrl, isRenewal, daysRemaining, newStartDate, newExpiryDate } = res.data.data;

      // Show renewal info before redirecting
      if (isRenewal && daysRemaining > 0) {
        const start = new Date(newStartDate).toDateString();
        const expiry = new Date(newExpiryDate).toDateString();
        toast.success(
          `You have ${daysRemaining} days left on your current plan. Your new ${planKey} plan will start on ${start} and run to ${expiry}.`,
          { duration: 6000 }
        );
        // Small delay so user reads the toast
        await new Promise(r => setTimeout(r, 2000));
      }

      // Open Paystack — redirect to their checkout
      window.location.href = authorizationUrl;
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not initiate payment');
    } finally { setPaying(null); }
  };

  const daysLeft = sub?.daysLeft ?? (sub?.expiryDate
    ? Math.max(0, Math.ceil((new Date(sub.expiryDate) - Date.now()) / 86400000))
    : 0);

  const statusCfg = sub ? (STATUS_CONFIG[sub.status] || STATUS_CONFIG.ACTIVE) : null;
  const isExpired = sub?.status === 'EXPIRED' || sub?.status === 'CANCELLED' || daysLeft === 0;
  const isLowDays = daysLeft > 0 && daysLeft <= 7;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Subscription</h1>
          <p className="text-[10px] text-[var(--text3)]">Manage your FleetAnchor Pro plan</p>
        </div>
      </div>

      <div className="p-5 space-y-5">

        {/* ── Current Plan Status ── */}
        {loading ? (
          <div className="card p-4 text-xs text-[var(--text3)]">Loading subscription…</div>
        ) : sub ? (
          <div className={`card p-4 border ${statusCfg?.bg}`}>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                {statusCfg && <statusCfg.icon className={`w-5 h-5 ${statusCfg.cls}`} />}
                <div>
                  <p className="text-xs font-semibold text-[var(--text)]">
                    {sub.plan} Plan — <span className={statusCfg?.cls}>{statusCfg?.label}</span>
                  </p>
                  <p className="text-[10px] text-[var(--text3)] mt-0.5">
                    {sub.startDate && `Started ${new Date(sub.startDate).toDateString()}`}
                    {sub.expiryDate && ` · Expires ${new Date(sub.expiryDate).toDateString()}`}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {daysLeft > 0 && (
                  <p className={`text-sm font-bold ${isLowDays ? 'text-anchor-red' : 'text-anchor-green'}`}>
                    {daysLeft} day{daysLeft !== 1 ? 's' : ''} remaining
                  </p>
                )}
                {isExpired && <p className="text-xs text-anchor-red font-semibold">Plan expired — renew below</p>}
              </div>
            </div>

            {/* Low days warning */}
            {isLowDays && !isExpired && (
              <div className="mt-3 flex items-center gap-2 bg-gold/10 border border-gold/20 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 text-gold shrink-0" />
                <p className="text-[11px] text-gold">
                  Your plan expires in {daysLeft} days. Renew now and the new period starts automatically after your current plan ends — you won't lose a single day.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="card p-4 border border-gold/20 bg-gold/5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gold" />
              <p className="text-xs text-gold font-semibold">No active subscription — choose a plan below to get started</p>
            </div>
          </div>
        )}

        {/* ── Renewal Info Box ── */}
        <div className="card p-3.5 border border-teal/20 bg-teal/5">
          <div className="flex items-start gap-2">
            <RefreshCw className="w-4 h-4 text-teal mt-0.5 shrink-0" />
            <div>
              <p className="text-[11px] font-semibold text-teal mb-0.5">Smart Renewal — No Wasted Days</p>
              <p className="text-[10px] text-[var(--text3)]">
                If you still have days remaining on your current plan when you renew, your new period begins <strong className="text-[var(--text)]">automatically after your current plan expires</strong> — not immediately. You always get the full 30 days you paid for.
              </p>
            </div>
          </div>
        </div>

        {/* ── Plan Cards ── */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {PLANS.map(plan => {
            const isCurrentPlan = sub?.plan === plan.key && !isExpired;
            const isLoadingThis = paying === plan.key;

            return (
              <div
                key={plan.key}
                className={`card p-5 border-2 transition-all ${isCurrentPlan ? `border-[#${plan.colorHex}]` : 'border-white/[0.06] hover:border-white/20'}`}
              >
                {isCurrentPlan && (
                  <div className="inline-flex items-center gap-1 bg-anchor-green/20 text-anchor-green text-[10px] font-semibold px-2 py-0.5 rounded-full mb-3">
                    <CheckCircle className="w-3 h-3" />Current Plan
                  </div>
                )}

                <div className="flex items-end justify-between mb-3">
                  <div>
                    <p className="text-sm font-bold text-[var(--text)]">{plan.name}</p>
                    <p className="text-[10px] text-[var(--text3)]">30-day billing cycle</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xl font-bold text-${plan.color}`}>{plan.price}</span>
                    <span className="text-[10px] text-[var(--text3)]">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-1.5 mb-4">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-[11px] text-[var(--text3)]">
                      <div className={`w-1.5 h-1.5 rounded-full bg-[#${plan.colorHex}] shrink-0`} />
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => handleSubscribe(plan.key)}
                  disabled={isLoadingThis || paying !== null}
                  className={`w-full py-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50
                    ${isCurrentPlan
                      ? 'bg-white/[0.06] text-[var(--text)] border border-white/10 hover:bg-white/10'
                      : plan.key === 'ENTERPRISE'
                        ? 'bg-gold text-navy hover:bg-gold/90'
                        : 'bg-teal text-navy hover:bg-teal/90'
                    }`}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  {isLoadingThis ? 'Redirecting to Paystack…' :
                    isCurrentPlan ? (daysLeft <= 7 ? 'Renew Early' : 'Renew Plan') :
                    isExpired ? `Reactivate with ${plan.name}` : `Switch to ${plan.name}`}
                </button>

                {isCurrentPlan && daysLeft > 7 && (
                  <p className="text-[10px] text-[var(--text3)] text-center mt-1.5">
                    Renew early — new 30-day period starts after {new Date(sub.expiryDate).toDateString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Cancel link */}
        {sub && sub.status === 'ACTIVE' && (
          <p className="text-[10px] text-[var(--text3)] text-center">
            Want to cancel?{' '}
            <button
              onClick={async () => {
                if (!window.confirm('Cancel your subscription? You keep access until the expiry date.')) return;
                try {
                  await subscriptionService.cancel(sub.id);
                  toast.success('Subscription cancelled. Access continues until ' + new Date(sub.expiryDate).toDateString());
                  fetchSub();
                } catch { toast.error('Failed to cancel subscription'); }
              }}
              className="text-anchor-red hover:underline"
            >
              Cancel subscription
            </button>
            {' '}— you keep access until your plan expires.
          </p>
        )}
      </div>
    </div>
  );
}
