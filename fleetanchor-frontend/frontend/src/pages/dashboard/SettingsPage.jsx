import React, { useState } from 'react';
import { Save, Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({
    workshopName:'AfriFleet Motors Ltd',
    email:'admin@afrifleet.com',
    phone:'+234 901 234 5678',
    address:'14 Broad Street, Lagos Island, Lagos',
    paystackSecret:'sk_live_••••••••••••••••••••••••••',
    bankName:'GTBank',
    accountNumber:'0234567890',
    accountName:'AfriFleet Motors Ltd',
    emailFrom:'noreply@fleetanchor.com',
    smtpHost:'smtp.sendgrid.net',
    smtpKey:'••••••••••••••••••••••••••••',
  });

  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const save = () => toast.success('Settings saved');

  const Section = ({title, children}) => (
    <div className="panel mb-4">
      <div className="text-xs font-bold text-gold uppercase tracking-wider mb-4 pb-2 border-b border-white/[0.08]">{title}</div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );

  const Field = ({label, k, type='text', full}) => (
    <div className={full?'col-span-2':''}>
      <label className="form-label">{label}</label>
      <input type={type} value={form[k]} onChange={e=>set(k,e.target.value)} className="form-input"/>
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Platform Settings</h1>
        <button onClick={save} className="btn-primary"><Save className="w-3.5 h-3.5"/>Save Changes</button>
      </div>
      <div className="p-5 max-w-2xl">
        <Section title="Workshop Profile">
          <Field label="Workshop Name" k="workshopName"/>
          <Field label="Admin Email" k="email"/>
          <Field label="Phone" k="phone"/>
          <Field label="Address" k="address" full/>
        </Section>

        <Section title="Paystack Integration">
          <div className="col-span-2 bg-gold/8 border border-gold/20 rounded-lg p-2.5 text-[10px] text-gold">
            All subscription payments route directly to your configured bank account. Never share your secret key.
          </div>
          <div className="col-span-2">
            <label className="form-label">Paystack Secret Key</label>
            <div className="relative">
              <input type={showKey?'text':'password'} value={form.paystackSecret} onChange={e=>set('paystackSecret',e.target.value)} className="form-input pr-8"/>
              <button onClick={()=>setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)]">
                {showKey?<EyeOff className="w-3.5 h-3.5"/>:<Eye className="w-3.5 h-3.5"/>}
              </button>
            </div>
          </div>
          <Field label="Bank Name" k="bankName"/>
          <Field label="Account Number" k="accountNumber"/>
          <Field label="Account Name" k="accountName" full/>
        </Section>

        <Section title="Email / SMTP">
          <Field label="From Address" k="emailFrom"/>
          <Field label="SMTP Host" k="smtpHost"/>
          <div className="col-span-2">
            <label className="form-label">SMTP API Key</label>
            <input type="password" value={form.smtpKey} onChange={e=>set('smtpKey',e.target.value)} className="form-input"/>
          </div>
        </Section>
      </div>
    </div>
  );
}
