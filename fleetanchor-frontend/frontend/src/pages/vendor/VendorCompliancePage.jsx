import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck, Plus, Upload, Trash2, X, FileSpreadsheet,
  AlertTriangle, CheckCircle, Clock, Search, Edit2,
  Download, RefreshCw, ChevronDown, Eye
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { complianceService, vehicleService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

// ─── Constants ─────────────────────────────────────────────────────────────────
const DOC_TYPES = [
  { value: 'ROAD_WORTHINESS',    label: 'Road Worthiness Certificate' },
  { value: 'VEHICLE_LICENCE',    label: 'Vehicle Licence' },
  { value: 'INSURANCE',          label: 'Insurance Certificate' },
  { value: 'HACKNEY_PERMIT',     label: 'Hackney Permit' },
  { value: 'ECOWAS_BROWN_CARD',  label: 'ECOWAS Brown Card' },
  { value: 'FIRE_EXTINGUISHER',  label: 'Fire Extinguisher Certificate' },
  { value: 'FIRST_AID_KIT',      label: 'First Aid Kit Certificate' },
  { value: 'SPEED_LIMITER',      label: 'Speed Limiter Certificate' },
  { value: 'DRIVERS_LICENCE',    label: "Driver's Licence" },
  { value: 'VEHICLE_REGISTRATION', label: 'Vehicle Registration' },
  { value: 'CUSTOMS_PAPER',      label: 'Customs Paper' },
  { value: 'OTHER',              label: 'Other Document' },
];

const STATUS_FILTERS = ['All', 'Expired', 'Due Soon (30d)', 'Compliant'];
const TEMPLATE_HEADERS = ['Plate Number', 'VIN', 'Document Type', 'Document Number', 'Issued Date (YYYY-MM-DD)', 'Expiry Date (YYYY-MM-DD)', 'Notes'];
const TEMPLATE_EXAMPLE = ['LND-421-XY', '', 'ROAD_WORTHINESS', 'RW-2024-00123', '2024-01-15', '2025-01-14', 'Issued by FRSC'];

function getStatus(daysLeft) {
  if (daysLeft < 0)  return { label: 'Expired',    cls: 'bg-red-500/20 text-red-400',    icon: '🚨', sort: 0 };
  if (daysLeft <= 7) return { label: '7 Days',     cls: 'bg-red-400/20 text-red-300',    icon: '⚠️', sort: 1 };
  if (daysLeft <= 15) return { label: '15 Days',   cls: 'bg-orange-500/20 text-orange-400', icon: '⚠️', sort: 2 };
  if (daysLeft <= 30) return { label: '30 Days',   cls: 'bg-yellow-500/20 text-yellow-400', icon: '📅', sort: 3 };
  return { label: 'Valid',    cls: 'bg-green-500/20 text-green-400',  icon: '✅', sort: 4 };
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function VendorCompliancePage() {
  const { user } = useAuthStore();
  const fileRef = useRef(null);

  const [docs, setDocs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [summary, setSummary] = useState({ total: 0, expired: 0, expiringSoon: 0, compliant: 0 });

  // Add modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({
    vehicleId: '', docType: '', docNumber: '', issuedDate: '', expiryDate: '', notes: '',
  });
  const [addLoading, setAddLoading] = useState(false);

  // Edit modal
  const [editDoc, setEditDoc] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editLoading, setEditLoading] = useState(false);

  // Bulk import
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Delete
  const [deleteId, setDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [docsRes, vehiclesRes, summaryRes] = await Promise.all([
        complianceService.list(),
        vehicleService.list({ limit: 500 }),
        complianceService.summary(),
      ]);
      setDocs(docsRes.data.data || []);
      setVehicles(vehiclesRes.data.data || []);
      setSummary(summaryRes.data.data || {});
    } catch (err) {
      toast.error('Failed to load compliance data');
    } finally { setLoading(false); }
  };

  // ─── Filter & Search ───────────────────────────────────────────────────────
  const filtered = docs.filter(d => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      d.vehicle?.plateNumber?.toLowerCase().includes(q) ||
      d.vehicle?.make?.toLowerCase().includes(q) ||
      d.docTypeLabel?.toLowerCase().includes(q) ||
      d.docNumber?.toLowerCase().includes(q);

    const matchFilter = filter === 'All' ? true
      : filter === 'Expired'       ? d.daysUntilExpiry < 0
      : filter === 'Due Soon (30d)' ? d.daysUntilExpiry >= 0 && d.daysUntilExpiry <= 30
      : d.daysUntilExpiry > 30;

    return matchSearch && matchFilter;
  }).sort((a, b) => {
    const sa = getStatus(a.daysUntilExpiry);
    const sb = getStatus(b.daysUntilExpiry);
    return sa.sort !== sb.sort ? sa.sort - sb.sort : a.daysUntilExpiry - b.daysUntilExpiry;
  });

  // ─── Add Document ──────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.vehicleId || !addForm.docType || !addForm.expiryDate) {
      toast.error('Vehicle, document type and expiry date are required');
      return;
    }
    setAddLoading(true);
    try {
      await complianceService.add(addForm);
      toast.success('Document added');
      setShowAdd(false);
      setAddForm({ vehicleId: '', docType: '', docNumber: '', issuedDate: '', expiryDate: '', notes: '' });
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add document');
    } finally { setAddLoading(false); }
  };

  // ─── Edit Document ─────────────────────────────────────────────────────────
  const openEdit = (doc) => {
    setEditDoc(doc);
    setEditForm({
      docType: doc.docType,
      docNumber: doc.docNumber || '',
      issuedDate: doc.issuedDate ? doc.issuedDate.split('T')[0] : '',
      expiryDate: doc.expiryDate.split('T')[0],
      notes: doc.notes || '',
    });
  };

  const handleEdit = async () => {
    if (!editForm.expiryDate) { toast.error('Expiry date required'); return; }
    setEditLoading(true);
    try {
      await complianceService.update(editDoc.id, editForm);
      toast.success('Document updated');
      setEditDoc(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally { setEditLoading(false); }
  };

  // ─── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await complianceService.remove(deleteId);
      toast.success('Document removed');
      setDeleteId(null);
      fetchAll();
    } catch {
      toast.error('Failed to delete');
    } finally { setDeleteLoading(false); }
  };

  // ─── Excel Import ──────────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' });
      // Prefer 'Document Compliance' sheet, then first sheet
      const sheetName = wb.SheetNames.find(n => /compliance|document/i.test(n)) || wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      // Find real header row (contains 'Plate Number' or 'Plate')
      let hIdx = raw.findIndex(r => r.some(c => /plate/i.test(String(c))));
      if (hIdx === -1) hIdx = 0;
      const dataRows = raw.slice(hIdx + 1).filter(r => r.some(c => String(c).trim()));
      const parsed = dataRows.map(row => ({
        plateNumber: String(row[0] || '').trim(),
        vin: String(row[1] || '').trim(),
        docType: String(row[2] || '').trim().toUpperCase().replace(/\s+/g, '_'),
        docNumber: String(row[3] || '').trim(),
        issuedDate: row[4] ? String(row[4]).trim() : '',
        expiryDate: row[5] ? String(row[5]).trim() : '',
        notes: String(row[6] || '').trim(),
      })).filter(r => r.plateNumber || r.vin);
      setImportRows(parsed);
      setShowImport(true);
      setImportResult(null);
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleBulkImport = async () => {
    setImportLoading(true);
    try {
      const res = await complianceService.bulkImport(importRows);
      setImportResult(res.data.data);
      fetchAll();
    } catch (err) {
      toast.error('Import failed: ' + (err.response?.data?.error || err.message));
    } finally { setImportLoading(false); }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 26 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Documents');
    XLSX.writeFile(wb, 'compliance-import-template.xlsx');
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldCheck size={22} className="text-yellow-400" />
            Document Compliance
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Track and manage all vehicle document renewals across your fleet</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2">
            <Download size={15} /> Template
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2">
            <Upload size={15} /> Import Excel
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2">
            <Plus size={16} /> Add Document
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Documents', value: summary.total, icon: ShieldCheck, color: 'text-blue-400', bg: 'bg-blue-500/10' },
          { label: 'Expired',         value: summary.expired, icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
          { label: 'Expiring Soon',   value: summary.expiringSoon, icon: Clock, color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'Compliant',       value: summary.compliant, icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="card p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={18} className={color} />
            </div>
            <div>
              <div className="text-xl font-bold text-white">{loading ? '—' : (value || 0)}</div>
              <div className="text-xs text-slate-400">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-8 py-2 text-sm w-full"
            placeholder="Search by plate, vehicle or document type..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                filter === f
                  ? 'bg-yellow-400 text-black border-yellow-400 font-600'
                  : 'border-white/10 text-slate-400 hover:border-white/30'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <button onClick={fetchAll} className="btn-ghost p-2 rounded-lg">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Loading documents...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck size={36} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm">
              {docs.length === 0
                ? 'No documents yet. Add your first vehicle document or import via Excel.'
                : 'No documents match your filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  <th className="text-left px-4 py-3 text-xs text-slate-400 font-500">Plate No.</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 font-500">Vehicle</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 font-500">Document Type</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 font-500">Doc Number</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 font-500">Expiry Date</th>
                  <th className="text-left px-4 py-3 text-xs text-slate-400 font-500">Status</th>
                  <th className="text-right px-4 py-3 text-xs text-slate-400 font-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(doc => {
                  const st = getStatus(doc.daysUntilExpiry);
                  const expiry = new Date(doc.expiryDate);
                  return (
                    <tr key={doc.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-700 text-white">{doc.vehicle?.plateNumber}</td>
                      <td className="px-4 py-3 text-slate-300">{doc.vehicle?.make} {doc.vehicle?.model} {doc.vehicle?.year}</td>
                      <td className="px-4 py-3 text-slate-300">{doc.docTypeLabel}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{doc.docNumber || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {expiry.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-500 ${st.cls}`}>
                          {st.icon} {st.label === 'Valid' ? 'Valid' : doc.daysUntilExpiry < 0 ? `${Math.abs(doc.daysUntilExpiry)}d overdue` : `${doc.daysUntilExpiry}d left`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button
                            onClick={() => openEdit(doc)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteId(doc.id)}
                            className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── ADD DOCUMENT MODAL ──────────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--navy-2)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="font-700 text-white flex items-center gap-2">
                <ShieldCheck size={18} className="text-yellow-400" /> Add Vehicle Document
              </h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div>
                <label className="label">Vehicle *</label>
                <select className="input w-full" value={addForm.vehicleId} onChange={e => setAddForm(p => ({ ...p, vehicleId: e.target.value }))}>
                  <option value="">Select vehicle...</option>
                  {vehicles.map(v => (
                    <option key={v.id} value={v.id}>{v.plateNumber} — {v.make} {v.model} {v.year}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Document Type *</label>
                <select className="input w-full" value={addForm.docType} onChange={e => setAddForm(p => ({ ...p, docType: e.target.value }))}>
                  <option value="">Select document type...</option>
                  {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Document Number</label>
                  <input className="input w-full" placeholder="e.g. RW-2024-00123" value={addForm.docNumber}
                    onChange={e => setAddForm(p => ({ ...p, docNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Issued Date</label>
                  <input type="date" className="input w-full" value={addForm.issuedDate}
                    onChange={e => setAddForm(p => ({ ...p, issuedDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Expiry Date *</label>
                <input type="date" className="input w-full" value={addForm.expiryDate}
                  onChange={e => setAddForm(p => ({ ...p, expiryDate: e.target.value }))} />
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input w-full" placeholder="Optional notes..." value={addForm.notes}
                  onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/10">
              <button onClick={() => setShowAdd(false)} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
              <button onClick={handleAdd} disabled={addLoading} className="btn-primary flex-1 py-2.5 text-sm">
                {addLoading ? 'Adding...' : 'Add Document'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EDIT MODAL ───────────────────────────────────────────────────── */}
      {editDoc && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--navy-2)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="font-700 text-white flex items-center gap-2">
                <Edit2 size={18} className="text-yellow-400" /> Update Document
              </h3>
              <button onClick={() => setEditDoc(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-white/[0.04] rounded-lg px-3 py-2 text-sm text-slate-300">
                <strong className="text-white">{editDoc.vehicle?.plateNumber}</strong> — {editDoc.vehicle?.make} {editDoc.vehicle?.model} {editDoc.vehicle?.year}
              </div>
              <div>
                <label className="label">Document Type</label>
                <select className="input w-full" value={editForm.docType} onChange={e => setEditForm(p => ({ ...p, docType: e.target.value }))}>
                  {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Document Number</label>
                  <input className="input w-full" value={editForm.docNumber}
                    onChange={e => setEditForm(p => ({ ...p, docNumber: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Issued Date</label>
                  <input type="date" className="input w-full" value={editForm.issuedDate}
                    onChange={e => setEditForm(p => ({ ...p, issuedDate: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="label">Expiry Date *</label>
                <input type="date" className="input w-full" value={editForm.expiryDate}
                  onChange={e => setEditForm(p => ({ ...p, expiryDate: e.target.value }))} />
                <p className="text-xs text-slate-500 mt-1">Updating expiry date will reset all alert flags so new alerts are sent at the right intervals.</p>
              </div>
              <div>
                <label className="label">Notes</label>
                <input className="input w-full" value={editForm.notes}
                  onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-3 p-5 border-t border-white/10">
              <button onClick={() => setEditDoc(null)} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
              <button onClick={handleEdit} disabled={editLoading} className="btn-primary flex-1 py-2.5 text-sm">
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── EXCEL IMPORT MODAL ───────────────────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--navy-2)] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10 flex-shrink-0">
              <h3 className="font-700 text-white flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-yellow-400" /> Import Documents from Excel
              </h3>
              <button onClick={() => { setShowImport(false); setImportResult(null); setImportRows([]); }} className="text-slate-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {!importResult ? (
                <>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                    <strong>Column order:</strong> Plate Number | VIN | Document Type | Document Number | Issued Date | Expiry Date | Notes<br/>
                    <strong>Document types:</strong> ROAD_WORTHINESS, VEHICLE_LICENCE, INSURANCE, HACKNEY_PERMIT, ECOWAS_BROWN_CARD, FIRE_EXTINGUISHER, FIRST_AID_KIT, SPEED_LIMITER, VEHICLE_REGISTRATION, CUSTOMS_PAPER, OTHER<br/>
                    <strong>Date format:</strong> YYYY-MM-DD (e.g. 2025-12-31)
                  </div>
                  <div className="text-sm text-slate-400">
                    <strong className="text-white">{importRows.length}</strong> rows ready to import:
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-white/10">
                          {['Plate / VIN', 'Doc Type', 'Doc Number', 'Expiry Date', 'Status'].map(h => (
                            <th key={h} className="text-left px-3 py-2 text-slate-400 font-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 15).map((row, i) => {
                          const vehicle = vehicles.find(v =>
                            v.plateNumber?.toLowerCase() === row.plateNumber?.toLowerCase() ||
                            v.vin?.toLowerCase() === row.vin?.toLowerCase()
                          );
                          return (
                            <tr key={i} className="border-b border-white/[0.04]">
                              <td className="px-3 py-2 text-white">{row.plateNumber || row.vin}</td>
                              <td className="px-3 py-2 text-slate-300">{row.docType}</td>
                              <td className="px-3 py-2 text-slate-400">{row.docNumber || '—'}</td>
                              <td className="px-3 py-2 text-slate-300">{row.expiryDate}</td>
                              <td className="px-3 py-2">
                                {vehicle
                                  ? <span className="text-green-400 text-xs">✅ Vehicle found</span>
                                  : <span className="text-red-400 text-xs">❌ Not found</span>
                                }
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {importRows.length > 15 && (
                      <p className="text-xs text-slate-500 mt-2 px-3">...and {importRows.length - 15} more rows</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                    <p className="text-green-400 font-700 text-sm">Import Complete</p>
                    <p className="text-white text-2xl font-800 mt-1">{importResult.created} <span className="text-sm font-400 text-slate-400">documents imported</span></p>
                  </div>
                  {importResult.failed?.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                      <p className="text-red-400 font-700 text-sm mb-2">{importResult.failed.length} failed:</p>
                      {importResult.failed.map((f, i) => (
                        <p key={i} className="text-xs text-slate-400">• {f.row?.plateNumber || f.row?.vin}: {f.reason}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-3 p-5 border-t border-white/10 flex-shrink-0">
              <button onClick={() => { setShowImport(false); setImportResult(null); setImportRows([]); }}
                className="btn-ghost flex-1 py-2.5 text-sm">
                {importResult ? 'Close' : 'Cancel'}
              </button>
              {!importResult && (
                <button onClick={handleBulkImport} disabled={importLoading || importRows.length === 0}
                  className="btn-primary flex-1 py-2.5 text-sm">
                  {importLoading ? 'Importing...' : `Import ${importRows.length} Documents`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── DELETE CONFIRM ───────────────────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--navy-2)] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="font-700 text-white mb-2">Remove Document?</h3>
            <p className="text-slate-400 text-sm mb-5">This document record will be permanently deleted. This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
              <button onClick={handleDelete} disabled={deleteLoading}
                className="flex-1 py-2.5 text-sm bg-red-500 hover:bg-red-600 text-white rounded-lg font-600 transition-colors">
                {deleteLoading ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
