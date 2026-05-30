import React, { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, HardDrive, CheckCircle, AlertTriangle, RefreshCw, ExternalLink, Clock, Send, Mail, DollarSign, Trash2, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService, platformService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

export default function SettingsPage() {
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const [showKey, setShowKey] = useState(false);
  const [form, setForm] = useState({
    workshopName: 'AnchorSuites Technologies Ltd',
    email: 'admin@fleetanchor.com',
    phone: '+234 901 234 5678',
    address: '3 Ladipo Oluwole Ave, Ikeja Industrial Estate, Lagos',
    paystackSecret: '',
    bankName: '', accountNumber: '', accountName: '',
    emailFrom: '', smtpHost: 'smtp.sendgrid.net', smtpKey: '',
  });

  // Demo reset state
  const [demoVendors, setDemoVendors] = useState([]);
  const [demoVendorId, setDemoVendorId] = useState('');
  const [demoResetting, setDemoResetting] = useState(false);
  const [demoResult, setDemoResult] = useState(null);
  const [showDemoConfirm, setShowDemoConfirm] = useState(false);

  // Backup state
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [lastBackupResult, setLastBackupResult] = useState(null);

  // Email test state
  const [testEmailAddr, setTestEmailAddr] = useState('');
  const [sendingTest, setSendingTest] = useState(false);

  // Pricing state
  const [pricing, setPricing] = useState(null);
  const [pricingDirty, setPricingDirty] = useState({});
  const [savingPricing, setSavingPricing] = useState(false);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const save = () => toast.success('Settings saved — update actual values in Railway environment variables.');

  useEffect(() => {
    if (isSuperAdmin) {
      fetchBackupStatus();
      platformService.getSettings().then(r => setPricing(r.data.data)).catch(() => {});
    }
  }, [isSuperAdmin]);

  const handleTestEmail = async () => {
    if (!testEmailAddr.includes('@')) { toast.error('Enter a valid email address'); return; }
    setSendingTest(true);
    try {
      await adminService.testEmail(testEmailAddr);
      toast.success(`Test email sent to ${testEmailAddr}! Check your inbox.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to send test email — check SENDGRID_API_KEY in Railway');
    } finally { setSendingTest(false); }
  };

  const handleSavePricing = async () => {
    if (Object.keys(pricingDirty).length === 0) { toast('No changes to save'); return; }
    setSavingPricing(true);
    try {
      const res = await platformService.updateSettings(pricingDirty);
      setPricing(res.data.data);
      setPricingDirty({});
      toast.success('Pricing rates updated!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update pricing');
    } finally { setSavingPricing(false); }
  };

  const updatePricing = (key, value) => {
    const num = parseInt(value.replace(/,/g, ''), 10);
    if (!isNaN(num)) {
      setPricing(prev => ({ ...prev, [key]: num }));
      setPricingDirty(prev => ({ ...prev, [key]: num }));
    }
  };

  const fetchBackupStatus = async () => {
    setBackupLoading(true);
    try {
      const res = await adminService.backupStatus();
      setBackupStatus(res.data);
    } catch { /* silently fail */ }
    finally { setBackupLoading(false); }
  };

  const handleRunBackup = async () => {
    setBackupRunning(true);
    setLastBackupResult(null);
    try {
      const res = await adminService.runBackup();
      setLastBackupResult(res.data.data);
      toast.success(`Backup complete — ${res.data.data.fileName} (${res.data.data.sizeKB} KB)`);
    } catch (err) {
      const msg = err.response?.data?.error || 'Backup failed';
      toast.error(msg);
      setLastBackupResult({ error: msg });
    } finally { setBackupRunning(false); }
  };

  const Section = ({ title, children }) => (
    <div className="card p-4 mb-4">
      <div className="text-xs font-bold text-gold uppercase tracking-wider mb-4 pb-2 border-b border-white/[0.08]">{title}</div>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </div>
  );

  const Field = ({ label, k, type = 'text', full }) => (
    <div className={full ? 'col-span-2' : ''}>
      <label className="form-label">{label}</label>
      <input type={type} value={form[k]} onChange={e => set(k, e.target.value)} className="form-input" />
    </div>
  );

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Platform Settings</h1>
        <button onClick={save} className="btn-primary"><Save className="w-3.5 h-3.5" />Save Changes</button>
      </div>

      <div className="p-5 max-w-2xl">

        <Section title="Workshop Profile">
          <Field label="Workshop Name" k="workshopName" />
          <Field label="Admin Email" k="email" />
          <Field label="Phone" k="phone" />
          <Field label="Address" k="address" full />
        </Section>

        <Section title="Paystack Integration">
          <div className="col-span-2 bg-gold/8 border border-gold/20 rounded-lg p-2.5 text-[10px] text-gold">
            Set your Paystack keys directly in Railway → Variables. Never paste live keys in this form.
          </div>
          <div className="col-span-2">
            <label className="form-label">Paystack Secret Key (Railway env: PAYSTACK_SECRET_KEY)</label>
            <div className="relative">
              <input type={showKey ? 'text' : 'password'} value={form.paystackSecret}
                onChange={e => set('paystackSecret', e.target.value)} className="form-input pr-8"
                placeholder="Set in Railway environment variables" />
              <button onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text3)]">
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          <Field label="Bank Name" k="bankName" />
          <Field label="Account Number" k="accountNumber" />
          <Field label="Account Name" k="accountName" full />
        </Section>

        <Section title="Email / SMTP (SendGrid)">
          <div className="col-span-2 text-[10px] text-[var(--text3)]">
            Configured via Railway env vars: SENDGRID_API_KEY, SENDGRID_FROM_EMAIL
          </div>
          <Field label="From Address" k="emailFrom" />
          <Field label="SMTP Host" k="smtpHost" />
          <div className="col-span-2">
            <label className="form-label">SendGrid API Key (Railway env: SENDGRID_API_KEY)</label>
            <input type="password" value={form.smtpKey} onChange={e => set('smtpKey', e.target.value)}
              className="form-input" placeholder="Set in Railway environment variables" />
          </div>
        </Section>

        {/* ── Subscription Pricing — Super Admin only */}
        {isSuperAdmin && pricing && (
          <div className="card p-4 mb-4">
            <div className="text-xs font-bold text-gold uppercase tracking-wider mb-4 pb-2 border-b border-white/[0.08] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-3.5 h-3.5" />Subscription Pricing
              </div>
              <button
                onClick={handleSavePricing}
                disabled={savingPricing || Object.keys(pricingDirty).length === 0}
                className="btn-primary text-[10px] py-1 px-3 disabled:opacity-40"
              >
                {savingPricing ? 'Saving…' : 'Save Rates'}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {[
                { plan: 'STARTER', monthlyKey: 'starterMonthly', annualKey: 'starterAnnual', color: 'text-teal' },
                { plan: 'GROWTH', monthlyKey: 'growthMonthly', annualKey: 'growthAnnual', color: 'text-gold' },
                { plan: 'ENTERPRISE', monthlyKey: 'enterpriseMonthly', annualKey: 'enterpriseAnnual', color: 'text-anchor-green' },
              ].map(({ plan, monthlyKey, annualKey, color }) => (
                <div key={plan} className="bg-white/[0.03] border border-white/[0.06] rounded-lg p-3">
                  <p className={`text-[11px] font-semibold ${color} mb-2`}>{plan}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="form-label">Monthly (₦)</label>
                      <input
                        value={(pricing[monthlyKey] || 0).toLocaleString()}
                        onChange={e => updatePricing(monthlyKey, e.target.value)}
                        className="form-input font-mono"
                        placeholder="e.g. 95000"
                      />
                    </div>
                    <div>
                      <label className="form-label">Annual (₦) <span className="text-[var(--text3)]">— 10 months</span></label>
                      <input
                        value={(pricing[annualKey] || 0).toLocaleString()}
                        onChange={e => updatePricing(annualKey, e.target.value)}
                        className="form-input font-mono"
                        placeholder="e.g. 950000"
                      />
                    </div>
                  </div>
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="form-label">Annual discount %</label>
                  <input
                    value={pricing.annualDiscountPct || 16.7}
                    onChange={e => {
                      const v = parseFloat(e.target.value) || 16.7;
                      setPricing(p => ({ ...p, annualDiscountPct: v }));
                      setPricingDirty(d => ({ ...d, annualDiscountPct: v }));
                    }}
                    type="number" step="0.1" min="0" max="50"
                    className="form-input"
                  />
                </div>
                <div>
                  <label className="form-label">Free trial (days)</label>
                  <input
                    value={pricing.trialDays || 30}
                    onChange={e => { const v = parseInt(e.target.value); setPricing(p => ({ ...p, trialDays: v })); setPricingDirty(d => ({ ...d, trialDays: v })); }}
                    type="number" min="1" max="365"
                    className="form-input"
                  />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-[var(--text3)] mt-2">
              Changes take effect immediately for new subscriptions. Existing subscribers keep their current rate until renewal.
            </p>
          </div>
        )}

        {/* ── Email Test ── Super Admin only */}
        {isSuperAdmin && (
          <div className="card p-4 mb-4">
            <div className="text-xs font-bold text-gold uppercase tracking-wider mb-4 pb-2 border-b border-white/[0.08] flex items-center gap-2">
              <Mail className="w-3.5 h-3.5" />Test Email Delivery
            </div>
            <p className="text-[11px] text-[var(--text3)] mb-3">
              Send a test email to verify your SendGrid configuration is working correctly.
            </p>
            <div className="flex gap-2">
              <input
                value={testEmailAddr}
                onChange={e => setTestEmailAddr(e.target.value)}
                type="email"
                placeholder="e.g. you@company.com"
                className="form-input flex-1"
                onKeyDown={e => e.key === 'Enter' && handleTestEmail()}
              />
              <button
                onClick={handleTestEmail}
                disabled={sendingTest || !testEmailAddr}
                className="btn-primary px-4 disabled:opacity-50 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                {sendingTest ? 'Sending…' : 'Send Test'}
              </button>
            </div>
          </div>
        )}

        {/* ── Google Drive Backup — Super Admin only ── */}
        {isSuperAdmin && (
          <div className="card p-4 mb-4">
            <div className="text-xs font-bold text-gold uppercase tracking-wider mb-4 pb-2 border-b border-white/[0.08] flex items-center gap-2">
              <HardDrive className="w-3.5 h-3.5" />Google Drive Backup
            </div>

            {/* Status indicator */}
            <div className={`flex items-start gap-3 rounded-lg p-3 mb-4 border ${backupStatus?.configured
              ? 'bg-anchor-green/8 border-anchor-green/20'
              : 'bg-gold/8 border-gold/20'}`}>
              {backupStatus?.configured
                ? <CheckCircle className="w-4 h-4 text-anchor-green shrink-0 mt-0.5" />
                : <AlertTriangle className="w-4 h-4 text-gold shrink-0 mt-0.5" />}
              <div>
                <p className={`text-xs font-semibold ${backupStatus?.configured ? 'text-anchor-green' : 'text-gold'}`}>
                  {backupLoading ? 'Checking configuration…'
                    : backupStatus?.configured ? 'Google Drive backup is configured and active'
                    : 'Google Drive backup not yet configured'}
                </p>
                <p className="text-[10px] text-[var(--text3)] mt-0.5">
                  {backupStatus?.configured
                    ? `Schedule: ${backupStatus.schedule}  •  Folder: ${backupStatus.hasFolderId ? 'Set ✅' : 'Not set ⚠'}`
                    : 'Add the 3 Railway environment variables below to enable automatic weekly backups.'}
                </p>
              </div>
            </div>

            {/* Last backup result */}
            {lastBackupResult && !lastBackupResult.error && (
              <div className="bg-anchor-green/8 border border-anchor-green/20 rounded-lg p-3 mb-4">
                <p className="text-xs font-semibold text-anchor-green mb-1">✅ Backup completed successfully</p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    ['File', lastBackupResult.fileName],
                    ['Size', `${lastBackupResult.sizeKB} KB`],
                    ['Duration', `${lastBackupResult.elapsed}s`],
                    ['Vendors', lastBackupResult.counts?.vendors],
                    ['Vehicles', lastBackupResult.counts?.vehicles],
                    ['Job Records', lastBackupResult.counts?.jobRequests],
                  ].map(([l, v]) => (
                    <div key={l} className="flex gap-1 text-[10px]">
                      <span className="text-[var(--text3)] w-20 shrink-0">{l}</span>
                      <span className="text-[var(--text)] font-medium">{v}</span>
                    </div>
                  ))}
                </div>
                {lastBackupResult.driveLink && (
                  <a href={lastBackupResult.driveLink} target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-teal mt-2 hover:underline">
                    <ExternalLink className="w-3 h-3" />View in Google Drive
                  </a>
                )}
              </div>
            )}

            {lastBackupResult?.error && (
              <div className="bg-anchor-red/10 border border-anchor-red/20 rounded-lg p-3 mb-4">
                <p className="text-xs text-anchor-red font-semibold">❌ Backup failed</p>
                <p className="text-[10px] text-[var(--text3)] mt-1">{lastBackupResult.error}</p>
              </div>
            )}

            {/* Schedule info */}
            <div className="flex items-center gap-2 text-[10px] text-[var(--text3)] mb-4">
              <Clock className="w-3 h-3" />
              <span>Automatic backups run every <strong className="text-[var(--text)]">Sunday at 2:00 AM WAT</strong>. Backups are retained for 90 days in Drive, then auto-deleted. A success/failure email is sent after each run.</span>
            </div>

            {/* Manual trigger */}
            <button
              onClick={handleRunBackup}
              disabled={backupRunning || !backupStatus?.configured}
              className="flex items-center gap-2 btn-ghost py-2 px-3 disabled:opacity-50 mb-4"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${backupRunning ? 'animate-spin' : ''}`} />
              {backupRunning ? 'Backing up…' : 'Run Backup Now'}
            </button>

            {/* Setup instructions */}
            <div className="border border-white/[0.06] rounded-lg p-3">
              <p className="text-[11px] font-semibold text-[var(--text)] mb-2">Setup Instructions</p>
              <p className="text-[10px] text-[var(--text3)] mb-2">
                Add these 3 environment variables to <strong className="text-[var(--text)]">Railway → Anchor-FleetPro → Variables</strong>:
              </p>
              {[
                { key: 'GOOGLE_SERVICE_ACCOUNT_EMAIL', desc: 'Service account email from Google Cloud Console' },
                { key: 'GOOGLE_PRIVATE_KEY', desc: 'Service account private key — base64 encoded' },
                { key: 'GOOGLE_DRIVE_FOLDER_ID', desc: 'ID from the Google Drive folder URL' },
                { key: 'BACKUP_NOTIFY_EMAIL', desc: '(Optional) Email to receive backup success/failure reports' },
              ].map(({ key, desc }) => (
                <div key={key} className="mb-2">
                  <code className="text-[10px] text-teal bg-teal/10 px-1.5 py-0.5 rounded">{key}</code>
                  <span className="text-[10px] text-[var(--text3)] ml-2">{desc}</span>
                </div>
              ))}
              <a
                href="https://console.cloud.google.com/iam-admin/serviceaccounts"
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-teal mt-1 hover:underline"
              >
                <ExternalLink className="w-3 h-3" />Open Google Cloud Console →
              </a>
            </div>
          </div>
        )}
      </div>

      {/* ── MONTHLY REPORTS ───────────────────────── */}
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">📊</span>
          <h3 className="font-semibold text-[var(--text)]">MONTHLY FLEET REPORTS</h3>
        </div>
        <p className="text-[12px] text-[var(--text3)] mb-4">
          Automatically sent on the <strong>1st of each month</strong> to all <strong>Growth</strong> and <strong>Enterprise</strong> vendors.
          Reports include: total jobs, cost breakdown, turnaround time, downtime analysis, top failure categories, most serviced vehicles, month-on-month comparison, and AI-driven insights.
        </p>
        <div className="bg-[var(--bg2)] rounded-lg p-3 mb-4 text-[12px] text-[var(--text3)] space-y-1">
          <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Cost analysis (parts vs labour, avg per job, projected annual)</div>
          <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Turnaround time (avg, fastest, slowest)</div>
          <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Fleet downtime rate + workshop utilisation %</div>
          <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Top 5 maintenance categories with frequency bars</div>
          <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Most serviced vehicles with cost per vehicle</div>
          <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Month-on-month comparison table</div>
          <div className="flex items-center gap-2"><span className="text-green-400">✓</span> Smart alerts (high downtime, repeat offender vehicles, cost spikes)</div>
        </div>
        <button
          onClick={async () => {
            try {
              setSendingTest(true);
              const res = await adminService.sendMonthlyReports();
              toast.success(`Reports sent — ${res.data.sent} vendors notified`);
            } catch (err) {
              toast.error(err.response?.data?.error || 'Failed to send reports');
            } finally {
              setSendingTest(false);
            }
          }}
          disabled={sendingTest}
          className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
        >
          <span>📤</span>
          {sendingTest ? 'Sending reports…' : 'Send This Month\'s Reports Now'}
        </button>
        <p className="text-[10px] text-[var(--text3)] mt-2">Only Growth + Enterprise vendors with active subscriptions will receive a report.</p>
      </div>

      {/* ── DEMO DATA RESET ───────────────────────── */}
      <div className="card p-5 border border-red-500/20">
        <div className="flex items-center gap-2 mb-1">
          <Trash2 className="w-5 h-5 text-red-400" />
          <h3 className="font-semibold text-[var(--text)]">DEMO DATA RESET</h3>
          <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-medium ml-1">Super Admin Only</span>
        </div>
        <p className="text-[12px] text-[var(--text3)] mb-4">
          Permanently delete all vehicles, vehicle documents, driver licences and related job requests for a selected vendor.
          Use this to clear dummy/demo data before a client goes live.
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-[var(--text3)] block mb-1">Select Vendor</label>
            <div className="relative">
              <select
                value={demoVendorId}
                onChange={e => { setDemoVendorId(e.target.value); setDemoResult(null); }}
                className="w-full appearance-none rounded-lg border border-white/[0.12] bg-white/[0.06] px-3 py-2.5 pr-8 text-[13px] text-white outline-none focus:border-red-400 transition-colors cursor-pointer"
                style={{ backgroundColor: 'rgba(15,30,55,0.95)' }}
              >
                <option value="" style={{ background: '#0f1e37' }}>Select vendor to reset...</option>
                {demoVendors.map(v => (
                  <option key={v.id} value={v.id} style={{ background: '#0f1e37' }}>
                    {v.companyName} — {v.contactEmail}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            </div>
          </div>

          {demoResult && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <p className="text-green-400 text-xs font-semibold mb-1">✅ Reset Complete</p>
              <div className="text-[11px] text-slate-300 space-y-0.5">
                <p>🚗 {demoResult.vehicles} vehicles deleted</p>
                <p>📋 {demoResult.documents} documents deleted</p>
                <p>👤 {demoResult.licences} driver licences deleted</p>
                <p>🔧 {demoResult.jobs} job requests deleted</p>
              </div>
            </div>
          )}

          {!showDemoConfirm ? (
            <button
              onClick={() => { if (!demoVendorId) { alert('Select a vendor first'); return; } setShowDemoConfirm(true); }}
              disabled={!demoVendorId}
              className="flex items-center gap-2 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Trash2 className="w-4 h-4" />
              Reset Demo Data
            </button>
          ) : (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 space-y-3">
              <p className="text-red-400 text-sm font-semibold">⚠️ Are you absolutely sure?</p>
              <p className="text-[12px] text-slate-300">
                This will permanently delete <strong>ALL vehicles, documents, driver licences and jobs</strong> for{' '}
                <strong className="text-white">{demoVendors.find(v => v.id === demoVendorId)?.companyName}</strong>.
                This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDemoConfirm(false)}
                  className="flex-1 btn-ghost text-sm py-2"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    setDemoResetting(true);
                    setShowDemoConfirm(false);
                    setDemoResult(null);
                    try {
                      const res = await adminService.resetDemoData(demoVendorId);
                      setDemoResult(res.data.data);
                      toast.success(res.data.message);
                    } catch (err) {
                      toast.error(err.response?.data?.error || 'Reset failed');
                    } finally {
                      setDemoResetting(false);
                    }
                  }}
                  disabled={demoResetting}
                  className="flex-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold py-2 transition-colors disabled:opacity-50"
                >
                  {demoResetting ? 'Resetting...' : 'Yes, Delete Everything'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
