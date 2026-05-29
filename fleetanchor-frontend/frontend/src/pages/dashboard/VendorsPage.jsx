import React, { useState, useEffect } from 'react';
import { Search, Plus, Ban, CheckCircle, Building2, X, ChevronDown, Mail, Phone, MapPin, User, Trash2, AlertTriangle, RotateCcw, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { vendorService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

const MOCK = [
  { id:'1', name:'Coca-Cola Nigeria', email:'fleet@coca-cola.ng', phone:'+234 801 234 5678', plan:'ENTERPRISE', vehicles:187, users:8, status:'ACTIVE', joined:'Jan 2025', spend:'₦28.4M' },
  { id:'2', name:'Dangote Flour Mills', email:'fleet@dangote.com', phone:'+234 802 345 6789', plan:'GROWTH', vehicles:43, users:2, status:'ACTIVE', joined:'Mar 2025', spend:'₦9.1M' },
  { id:'3', name:'NNPC Logistics', email:'maint@nnpc.gov.ng', phone:'+234 803 456 7890', plan:'ENTERPRISE', vehicles:312, users:14, status:'ACTIVE', joined:'Nov 2024', spend:'₦54.7M' },
  { id:'4', name:'UAC Nigeria', email:'fleet@uac.ng', phone:'+234 804 567 8901', plan:'GROWTH', vehicles:28, users:2, status:'SUSPENDED', joined:'Feb 2025', spend:'₦5.2M' },
  { id:'5', name:'Lafarge Cement', email:'transport@lafarge.ng', phone:'+234 805 678 9012', plan:'GROWTH', vehicles:61, users:3, status:'ACTIVE', joined:'Apr 2025', spend:'₦12.3M' },
  { id:'6', name:'Julius Berger', email:'fleet@juliusberger.com', phone:'+234 806 789 0123', plan:'OEM_WHITE_LABEL', vehicles:524, users:22, status:'ACTIVE', joined:'Jun 2024', spend:'₦91.2M' },
];

const PLAN_COLORS = {
  ENTERPRISE: 'bg-teal/15 text-teal',
  GROWTH: 'bg-gold/15 text-gold',
  OEM_WHITE_LABEL: 'bg-purple-500/15 text-anchor-purple',
};

const PLAN_OPTIONS = [
  { value:'GROWTH',          label:'Growth — up to 10 vendors, 250 vehicles' },
  { value:'ENTERPRISE',      label:'Enterprise — unlimited vendors & vehicles' },
  { value:'OEM_WHITE_LABEL', label:'OEM White-Label — custom contract' },
];

const EMPTY_FORM = { name:'', email:'', phone:'', contactName:'', address:'', plan:'GROWTH' };

function Field({ label, icon: Icon, value, onChange, placeholder, type='text' }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--text3)] uppercase tracking-wide mb-1.5">{label}</label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30"/>}
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-white/[0.12] bg-white/[0.06] py-2.5 text-[13px] text-white
                      placeholder-white/25 outline-none focus:border-[var(--accent)] focus:bg-white/[0.09] transition-colors
                      ${Icon ? 'pl-9 pr-3' : 'px-3'}`}
        />
      </div>
    </div>
  );
}

export default function VendorsPage() {
  const { user } = useAuthStore();
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [suspendModal, setSuspendModal] = useState(null);
  const [deleteModal, setDeleteModal] = useState(null);
  const [reason, setReason] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchVendors(); }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await vendorService.list();
      setVendors(res.data.data || []);
    } catch { toast.error('Failed to load vendors'); }
    finally { setLoading(false); }
  };

  const filtered = vendors.filter(v =>
    !search ||
    (v.companyName || v.name || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.contactEmail || v.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const doSuspend = async (id) => {
    try {
      await vendorService.suspend(id, reason);
      setVendors(prev => prev.map(v => v.id === id ? { ...v, status: 'SUSPENDED' } : v));
      setSuspendModal(null); setReason('');
      toast.success('Vendor suspended. Notification sent.');
    } catch { toast.error('Failed to suspend vendor'); }
  };

  const doReinstate = async (id) => {
    try {
      await vendorService.reinstate(id);
      setVendors(prev => prev.map(v => v.id === id ? { ...v, status: 'ACTIVE' } : v));
      toast.success('Vendor reinstated.');
    } catch { toast.error('Failed to reinstate vendor'); }
  };

  const [deletedVendors, setDeletedVendors] = useState([]);
  const [showRecycleBin, setShowRecycleBin] = useState(false);
  const [loadingDeleted, setLoadingDeleted] = useState(false);
  const [restoring, setRestoring] = useState(null);

  const fetchDeleted = async () => {
    setLoadingDeleted(true);
    try {
      const res = await vendorService.listDeleted();
      setDeletedVendors(res.data.data || []);
    } catch { toast.error('Failed to load deleted vendors'); }
    finally { setLoadingDeleted(false); }
  };

  const doRestore = async (vendor) => {
    setRestoring(vendor.id);
    try {
      await vendorService.restore(vendor.id);
      setDeletedVendors(prev => prev.filter(v => v.id !== vendor.id));
      toast.success(`"${vendor.companyName}" restored! All accounts reactivated.`);
      fetchVendors(); // refresh main list
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to restore vendor');
    } finally { setRestoring(null); }
  };

  const doDelete = async () => {
    if (!deleteModal) return;
    setDeleting(true);
    try {
      await vendorService.remove(deleteModal.id);
      setVendors(prev => prev.filter(v => v.id !== deleteModal.id));
      setDeleteModal(null);
      toast.success(`"${deleteModal.companyName || deleteModal.name}" moved to recycle bin. Restorable for 90 days.`);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete vendor');
    } finally { setDeleting(false); }
  };

  const handleAddVendor = async () => {
    if (!form.name.trim()) { toast.error('Company name is required'); return; }
    if (!form.email.trim()) { toast.error('Email is required'); return; }
    setSaving(true);
    try {
      const res = await vendorService.create({
        companyName: form.name,
        contactEmail: form.email,
        contactPhone: form.phone,
        contactPerson: form.contactName,
        address: form.address,
        plan: form.plan,
        oemId: user?.oemId,
      });
      setVendors(prev => [res.data.data, ...prev]);
      setShowAdd(false);
      setForm(EMPTY_FORM);
      toast.success(`${form.name} added! Login details sent to ${form.email}.`);
    } catch (err) {
      const errData = err.response?.data;
      const msg = errData?.details?.map(d => `${d.field}: ${d.message}`).join(', ') || errData?.error || 'Failed to add vendor';
      toast.error(msg);
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Vendors & Fleet Companies</h1>
          <p className="text-[10px] text-[var(--text3)]">
            {loading ? 'Loading…' : `${vendors.filter(v => v.status==='ACTIVE').length} active · ${vendors.filter(v => v.status==='SUSPENDED').length} suspended`}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary">
          <Plus className="w-3.5 h-3.5"/> Add Vendor
        </button>
      </div>

      <div className="p-5">
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 max-w-xs mb-4">
          <Search className="w-3 h-3 text-[var(--text3)]"/>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…"
            className="bg-transparent text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none w-full"/>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>Company</th><th>Plan</th><th>Vehicles</th><th>Users</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center text-[var(--text3)] text-xs py-8">Loading vendors…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center text-[var(--text3)] text-xs py-8">No vendors found</td></tr>
              ) : filtered.map(v => {
                const name = v.companyName || v.name;
                const email = v.contactEmail || v.email;
                const plan = v.trialPlan || v.plan || 'GROWTH';
                return (
                  <tr key={v.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-md bg-white/[0.08] flex items-center justify-center flex-shrink-0">
                          <Building2 className="w-3.5 h-3.5 text-[var(--text3)]"/>
                        </div>
                        <div>
                          <div className="text-[11px] font-semibold text-[var(--text)]">{name}</div>
                          <div className="text-[10px] text-[var(--text3)]">{email}</div>
                        </div>
                      </div>
                    </td>
                    <td><span className={`pill ${PLAN_COLORS[plan] || 'bg-white/10 text-[var(--text3)]'}`}>{plan.replace(/_/g,' ')}</span></td>
                    <td>{v._count?.vehicles ?? '—'}</td>
                    <td>{v._count?.users ?? '—'}</td>
                    <td><span className={`pill ${v.status==='ACTIVE' ? 'pill-active' : 'pill-suspended'}`}>{v.status}</span></td>
                    <td className="text-[10px] text-[var(--text3)]">{v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-GB', { month:'short', year:'numeric' }) : '—'}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {v.status === 'ACTIVE'
                          ? <button onClick={() => setSuspendModal(v)} className="btn-danger text-[10px] py-1"><Ban className="w-3 h-3"/> Suspend</button>
                          : <button onClick={() => doReinstate(v.id)} className="btn-success text-[10px] py-1"><CheckCircle className="w-3 h-3"/> Reinstate</button>
                        }
                        <button
                          onClick={() => setDeleteModal(v)}
                          className="text-[10px] py-1 px-2 rounded-lg border border-anchor-red/30 text-anchor-red hover:bg-anchor-red/10 transition-colors flex items-center gap-1"
                          title="Delete vendor permanently"
                        >
                          <Trash2 className="w-3 h-3"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="card w-full max-w-sm p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-anchor-red/20 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-anchor-red" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-anchor-red">Delete Vendor</h3>
                <p className="text-[10px] text-[var(--text3)]">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-xs text-[var(--text)] mb-1">
              You are about to delete <strong>{deleteModal.companyName || deleteModal.name}</strong>.
            </p>
            <p className="text-[11px] text-[var(--text3)] mb-4">
              Their data will be <strong className="text-[var(--text)]">retained for 90 days</strong> and can be fully restored by Super Admin during that window. After 90 days it is permanently removed.
            </p>
            <div className="bg-anchor-red/10 border border-anchor-red/20 rounded-lg px-3 py-2 mb-4">
              <p className="text-[11px] text-anchor-red">
                ⚠ Type the vendor name to confirm you understand this is permanent.
              </p>
              <input
                placeholder={deleteModal.companyName || deleteModal.name}
                className="form-input mt-2 text-xs"
                id="delete-confirm-input"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteModal(null)} disabled={deleting} className="flex-1 btn-ghost justify-center py-2">
                Cancel
              </button>
              <button
                onClick={() => {
                  const val = document.getElementById('delete-confirm-input')?.value;
                  if (val !== (deleteModal.companyName || deleteModal.name)) {
                    toast.error('Name does not match — type exactly as shown');
                    return;
                  }
                  doDelete();
                }}
                disabled={deleting}
                className="flex-1 justify-center py-2 rounded-lg bg-anchor-red text-white text-xs font-semibold flex items-center gap-1.5 hover:bg-anchor-red/80 disabled:opacity-50 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {deleting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suspend modal */}
      {suspendModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-navy-2 border border-white/[0.12] rounded-2xl p-5 w-full max-w-sm animate-slide-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-anchor-red">Suspend Vendor</h3>
              <button onClick={() => setSuspendModal(null)}><X className="w-4 h-4 text-[var(--text3)]"/></button>
            </div>
            <p className="text-xs text-[var(--text2)] mb-3">
              Suspend <strong className="text-[var(--text)]">{suspendModal.name}</strong>? Their team will lose access immediately.
            </p>
            <div className="mb-4">
              <label className="form-label">Reason (optional)</label>
              <textarea value={reason} onChange={e => setReason(e.target.value)}
                placeholder="e.g. Non-payment of invoices" className="form-input resize-none" rows={3}/>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSuspendModal(null)} className="flex-1 btn-ghost justify-center">Cancel</button>
              <button onClick={() => doSuspend(suspendModal.id)} className="flex-1 btn-danger justify-center">
                <Ban className="w-3.5 h-3.5"/> Confirm Suspend
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Recycle Bin ── Super Admin only */}
      {user?.role === 'SUPER_ADMIN' && (
        <div className="px-5 pb-5">
          <button
            onClick={() => { setShowRecycleBin(!showRecycleBin); if (!showRecycleBin) fetchDeleted(); }}
            className="flex items-center gap-2 text-xs text-[var(--text3)] hover:text-[var(--text)] transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Recycle Bin</span>
            {deletedVendors.length > 0 && (
              <span className="bg-anchor-red/20 text-anchor-red text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {deletedVendors.length}
              </span>
            )}
            <ChevronDown className={`w-3 h-3 transition-transform ${showRecycleBin ? 'rotate-180' : ''}`} />
          </button>

          {showRecycleBin && (
            <div className="mt-3 card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Trash2 className="w-4 h-4 text-anchor-red" />
                <h3 className="text-xs font-semibold text-[var(--text)]">Deleted Vendors</h3>
                <span className="text-[10px] text-[var(--text3)]">— restorable within 90 days of deletion</span>
              </div>

              {loadingDeleted ? (
                <p className="text-xs text-[var(--text3)] py-2">Loading…</p>
              ) : deletedVendors.length === 0 ? (
                <p className="text-xs text-[var(--text3)] py-2">No deleted vendors. Recycle bin is empty.</p>
              ) : (
                <div className="space-y-2">
                  {deletedVendors.map(v => (
                    <div key={v.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
                      <Building2 className="w-4 h-4 text-[var(--text3)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-[var(--text)]">{v.companyName}</p>
                        <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                          <span className="text-[10px] text-[var(--text3)]">{v.contactEmail}</span>
                          <span className="text-[10px] text-[var(--text3)]">via {v.oem?.name}</span>
                          <span className="text-[10px] text-[var(--text3)]">
                            Deleted {v.deletedAt ? new Date(v.deletedAt).toDateString() : '—'}
                          </span>
                          <span className={`flex items-center gap-1 text-[10px] font-semibold ${v.daysUntilPurge <= 14 ? 'text-anchor-red' : 'text-anchor-green'}`}>
                            <Clock className="w-3 h-3" />
                            {v.canRestore ? `${v.daysUntilPurge} days until permanent deletion` : 'Expired — cannot restore'}
                          </span>
                        </div>
                      </div>
                      {v.canRestore && (
                        <button
                          onClick={() => doRestore(v)}
                          disabled={restoring === v.id}
                          className="shrink-0 flex items-center gap-1.5 text-[10px] font-semibold text-anchor-green border border-anchor-green/30 px-2.5 py-1.5 rounded-lg hover:bg-anchor-green/10 disabled:opacity-50 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" />
                          {restoring === v.id ? 'Restoring…' : 'Restore'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Add Vendor modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="border border-white/[0.12] rounded-2xl p-6 w-full max-w-lg my-4 shadow-2xl animate-slide-in"
               style={{ backgroundColor: '#0d1f38' }}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-[15px] font-semibold text-white">Add New Vendor</h3>
                <p className="text-[11px] text-white/40 mt-0.5">Register a new fleet company to this OEM</p>
              </div>
              <button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }}
                className="w-7 h-7 rounded-full bg-white/[0.06] flex items-center justify-center hover:bg-white/[0.12] transition-colors">
                <X className="w-4 h-4 text-white/50"/>
              </button>
            </div>

            <div className="space-y-4">
              {/* Company name */}
              <Field label="Company Name *" icon={Building2} value={form.name}
                onChange={v => setForm(f => ({...f, name:v}))} placeholder="e.g. Coca-Cola Nigeria Ltd"/>

              {/* Email */}
              <Field label="Fleet Email Address *" icon={Mail} value={form.email} type="email"
                onChange={v => setForm(f => ({...f, email:v}))} placeholder="fleet@company.com"/>

              {/* Phone & Contact Name */}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Phone Number" icon={Phone} value={form.phone}
                  onChange={v => setForm(f => ({...f, phone:v}))} placeholder="+234 800 000 0000"/>
                <Field label="Contact Person" icon={User} value={form.contactName}
                  onChange={v => setForm(f => ({...f, contactName:v}))} placeholder="Fleet Manager name"/>
              </div>

              {/* Address */}
              <Field label="Business Address" icon={MapPin} value={form.address}
                onChange={v => setForm(f => ({...f, address:v}))} placeholder="Street, City, State"/>

              {/* Plan */}
              <div>
                <label className="block text-[11px] font-medium text-white/50 uppercase tracking-wide mb-1.5">Subscription Plan</label>
                <div className="relative">
                  <select
                    value={form.plan}
                    onChange={e => setForm(f => ({...f, plan: e.target.value}))}
                    className="w-full appearance-none rounded-lg border border-white/[0.12] px-3 py-2.5 pr-8
                               text-[13px] text-white outline-none focus:border-[var(--accent)] transition-colors cursor-pointer"
                    style={{ backgroundColor: '#0f1e37' }}
                  >
                    {PLAN_OPTIONS.map(p => (
                      <option key={p.value} value={p.value}
                        style={{ backgroundColor: '#0f1e37', color: '#e2e8f0', padding: '8px' }}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/40"/>
                </div>
                {/* Plan summary */}
                <div className="mt-2 rounded-lg bg-white/[0.04] border border-white/[0.06] px-3 py-2">
                  {form.plan === 'GROWTH' && <p className="text-[11px] text-gold">Growth: up to 10 vendors, 250 vehicles — ₦85,000/mo. First 2 users free.</p>}
                  {form.plan === 'ENTERPRISE' && <p className="text-[11px] text-teal">Enterprise: unlimited vendors & vehicles — ₦250,000/mo. Full access.</p>}
                  {form.plan === 'OEM_WHITE_LABEL' && <p className="text-[11px] text-purple-400">OEM White-Label: custom pricing, full branding rights. Contact sales.</p>}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowAdd(false); setForm(EMPTY_FORM); }} className="flex-1 btn-ghost justify-center">
                  Cancel
                </button>
                <button onClick={handleAddVendor} disabled={saving} className="flex-1 btn-primary justify-center disabled:opacity-60">
                  {saving ? 'Creating…' : <><Plus className="w-3.5 h-3.5"/> Create Vendor</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
