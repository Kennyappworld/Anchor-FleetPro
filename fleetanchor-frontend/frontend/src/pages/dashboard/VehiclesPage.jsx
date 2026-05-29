import React, { useState, useEffect } from 'react';
import { Search, Plus, Scan, Trash2, AlertTriangle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { vehicleService, vendorService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

const STATUS = {
  ACTIVE:        { label: 'Active',          cls: 'pill-active' },
  IN_REPAIR:     { label: 'In Repair',        cls: 'pill-repair' },
  DECOMMISSIONED:{ label: 'Decommissioned',   cls: 'pill-suspended' },
};

const EMPTY = { vin:'', plateNumber:'', make:'', model:'', year:'', engineNumber:'', vendorId:'' };

export default function VehiclesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [vehicles, setVehicles] = useState([]);
  const [vendors, setVendors]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [vRes, vdRes] = await Promise.allSettled([
        vehicleService.list({ limit: 500 }),
        vendorService.list(),
      ]);
      if (vRes.status === 'fulfilled')  setVehicles(vRes.value.data?.data || []);
      if (vdRes.status === 'fulfilled') setVendors(vdRes.value.data?.data || []);
    } catch { toast.error('Failed to load vehicles'); }
    finally { setLoading(false); }
  };

  const filtered = vehicles.filter(v =>
    !search ||
    v.vin?.toLowerCase().includes(search.toLowerCase()) ||
    v.plateNumber?.toLowerCase().includes(search.toLowerCase()) ||
    (v.vendor?.companyName || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async () => {
    if (!form.vin || !form.plateNumber || !form.make || !form.model || !form.year) {
      toast.error('VIN, plate, make, model and year are required'); return;
    }
    if (!form.vendorId) { toast.error('Select a vendor'); return; }
    setSaving(true);
    try {
      await vehicleService.create({
        vin: form.vin.toUpperCase().trim(),
        plateNumber: form.plateNumber.toUpperCase().trim(),
        make: form.make.trim(), model: form.model.trim(),
        year: parseInt(form.year),
        engineNumber: form.engineNumber.trim() || undefined,
        vendorId: form.vendorId,
      });
      toast.success('Vehicle registered!');
      setShowAdd(false); setForm(EMPTY); fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to register vehicle');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await vehicleService.remove(deleteId);
      toast.success('Vehicle removed');
      setDeleteId(null); fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove');
    } finally { setDeleting(false); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Fleet Vehicles</h1>
          <p className="text-[10px] text-[var(--text3)]">
            {loading ? 'Loading…' : `${vehicles.length} registered · ${vehicles.filter(v=>v.status==='IN_REPAIR').length} in repair`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => navigate('/admin/scanner')} className="btn-ghost">
            <Scan className="w-3.5 h-3.5"/>Scanner
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary">
            <Plus className="w-3.5 h-3.5"/>Register Vehicle
          </button>
        </div>
      </div>

      <div className="p-5">
        <div className="flex gap-2 mb-4">
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 flex-1 max-w-xs">
            <Search className="w-3 h-3 text-[var(--text3)]"/>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search VIN, plate, vendor…"
              className="bg-transparent text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none w-full"/>
          </div>
        </div>

        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr><th>VIN / Chassis</th><th>Plate</th><th>Make & Model</th><th>Year</th><th>Vendor</th><th>Status</th><th>Jobs</th><th></th></tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center text-[var(--text3)] text-xs py-8">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={8} className="text-center text-[var(--text3)] text-xs py-8">No vehicles found</td></tr>
              ) : filtered.map(v => {
                const s = STATUS[v.status] || STATUS.ACTIVE;
                return (
                  <tr key={v.id}>
                    <td><span className="font-mono text-teal text-[11px] font-semibold">{v.vin}</span></td>
                    <td className="font-medium text-[var(--text)]">{v.plateNumber}</td>
                    <td>{v.make} {v.model}</td>
                    <td>{v.year}</td>
                    <td>{v.vendor?.companyName || '—'}</td>
                    <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                    <td>{v._count?.jobRequests ?? '—'}</td>
                    <td>
                      <div className="flex gap-1">
                        <button onClick={() => navigate(`/admin/scanner?vin=${v.vin}`)} className="btn-ghost text-[10px] py-1">
                          <Scan className="w-3 h-3"/>
                        </button>
                        <button onClick={() => setDeleteId(v.id)}
                          className="text-[10px] py-1 px-1.5 rounded text-anchor-red hover:bg-anchor-red/10">
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

      {/* Add Vehicle Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Register Vehicle</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-[var(--text3)]"/></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="form-label">Vendor *</label>
                <select value={form.vendorId} onChange={e => setForm(f => ({ ...f, vendorId: e.target.value }))} className="form-input">
                  <option value="">Select vendor…</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.companyName}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ['vin','VIN / Chassis *','WNXNF4327A6…',false],
                  ['plateNumber','Plate Number *','LND-421-XY',false],
                  ['make','Make *','Mercedes',false],
                  ['model','Model *','Actros',false],
                  ['year','Year *','2021',false],
                  ['engineNumber','Engine No.','Optional',false],
                ].map(([k,label,ph]) => (
                  <div key={k}>
                    <label className="form-label">{label}</label>
                    <input value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                      placeholder={ph} type={k==='year'?'number':'text'} className="form-input"/>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdd(false)} className="flex-1 btn-ghost justify-center py-2">Cancel</button>
                <button onClick={handleAdd} disabled={saving} className="flex-1 btn-primary justify-center py-2 disabled:opacity-50">
                  {saving ? 'Registering…' : 'Register Vehicle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirm */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-xs p-5 text-center">
            <AlertTriangle className="w-8 h-8 text-anchor-red mx-auto mb-2"/>
            <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Remove Vehicle?</h3>
            <p className="text-[11px] text-[var(--text3)] mb-4">Job history will be preserved.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} disabled={deleting} className="flex-1 btn-ghost justify-center py-2">Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2 rounded-lg bg-anchor-red text-white text-xs font-semibold disabled:opacity-50">
                {deleting ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
