import React from 'react';
import { CheckCircle, X, Download } from 'lucide-react';
import toast from 'react-hot-toast';

const PLANS = [
  { id:'growth', name:'Growth', price:85000, current:true, features:['Up to 10 vendors','Up to 250 vehicles','2 users per vendor','Job lifecycle management','VIN scanner + history view','PDF/CSV export (cost-hide)'], locked:['More than 2 users','Advanced analytics','API access'] },
  { id:'enterprise', name:'Enterprise', price:250000, current:false, features:['Unlimited vendors','Unlimited vehicles','Unlimited users','Everything in Growth','Advanced analytics & reports','API access','Priority support'], locked:[] },
];

const BILLING = [
  { date:'May 1, 2026', plan:'Growth', amount:85000, status:'PAID' },
  { date:'Apr 1, 2026', plan:'Growth', amount:85000, status:'PAID' },
  { date:'Mar 1, 2026', plan:'Growth', amount:85000, status:'PAID' },
];

export default function VendorSubscriptionPage() {
  const initiatePaystack = () => {
    toast.success('Redirecting to Paystack checkout…');
    // In prod: window.open(paystackUrl)
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Subscription & Billing</h1>
      </div>
      <div className="p-5">
        {/* Plan cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          {PLANS.map(p=>(
            <div key={p.id} className={`panel ${p.current?'border-white/20':'border-gold/40'} ${!p.current?'ring-1 ring-gold/20':''}`}>
              {!p.current&&<div className="bg-gold text-black text-[9px] font-bold px-2 py-0.5 rounded-md inline-block mb-3">Recommended</div>}
              <div className={`text-sm font-bold mb-1 ${p.current?'text-[var(--text2)]':'text-gold'}`}>{p.name} Plan</div>
              <div className={`text-2xl font-bold mb-1 ${p.current?'text-[var(--text)]':'text-gold'}`}>₦{p.price.toLocaleString()}<span className="text-xs font-normal text-[var(--text3)]">/mo</span></div>
              <div className="space-y-1.5 my-3">
                {p.features.map(f=>(
                  <div key={f} className="flex items-center gap-2 text-[11px] text-[var(--text2)]">
                    <CheckCircle className="w-3 h-3 text-anchor-green flex-shrink-0"/>{f}
                  </div>
                ))}
                {p.locked.map(f=>(
                  <div key={f} className="flex items-center gap-2 text-[11px] text-[var(--text3)] opacity-50">
                    <X className="w-3 h-3 flex-shrink-0"/>{f}
                  </div>
                ))}
              </div>
              {p.current
                ? <div className="w-full btn-ghost justify-center pointer-events-none opacity-60">Current Plan</div>
                : <button onClick={initiatePaystack} className="w-full btn-primary justify-center py-2.5 font-semibold">Upgrade via Paystack</button>
              }
            </div>
          ))}
        </div>

        {/* Billing history */}
        <div>
          <h2 className="section-title mb-3">Billing History</h2>
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th><th>Receipt</th></tr></thead>
              <tbody>
                {BILLING.map((b,i)=>(
                  <tr key={i}>
                    <td>{b.date}</td>
                    <td>{b.plan}</td>
                    <td className="font-medium text-[var(--text)]">₦{b.amount.toLocaleString()}</td>
                    <td><span className="pill pill-complete">{b.status}</span></td>
                    <td><button onClick={()=>toast.success('Receipt downloaded')} className="btn-ghost text-[10px] py-1"><Download className="w-3 h-3"/>PDF</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
