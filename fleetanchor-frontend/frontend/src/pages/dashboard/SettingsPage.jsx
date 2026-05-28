import React, { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, HardDrive, CheckCircle, AlertTriangle, RefreshCw, ExternalLink, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/api';
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

  // Backup state
  const [backupStatus, setBackupStatus] = useState(null);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupRunning, setBackupRunning] = useState(false);
  const [lastBackupResult, setLastBackupResult] = useState(null);

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const save = () => toast.success('Settings saved — update actual values in Railway environment variables.');

  useEffect(() => {
    if (isSuperAdmin) fetchBackupStatus();
  }, [isSuperAdmin]);

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
    </div>
  );
}
