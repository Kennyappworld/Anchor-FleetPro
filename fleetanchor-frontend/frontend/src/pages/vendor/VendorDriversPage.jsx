import React, { useState, useEffect, useRef } from 'react';
import {
  User, Plus, Upload, Trash2, X, FileSpreadsheet, Edit2,
  AlertTriangle, CheckCircle, Clock, Search, Download, RefreshCw, ShieldAlert
} from 'lucide-react';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { driverLicenceService } from '../../services/api';

const LICENCE_CATEGORIES = ['A', 'B', 'C', 'D', 'E', 'EC', 'B1', 'C1', 'D1', 'BE', 'CE'];
const STATUS_FILTERS = ['All', 'Expired', 'Due Soon (30d)', 'Valid'];
const TEMPLATE_HEADERS = ['Driver Name', 'Phone', 'Email', 'Licence Number', 'Licence Category', 'Issued Date (YYYY-MM-DD)', 'Expiry Date (YYYY-MM-DD)', 'Notes'];
const TEMPLATE_EXAMPLE = ['John Doe', '08012345678', 'john@example.com', 'FED-20-12345', 'B', '2022-03-01', '2027-03-01', ''];

function getStatus(days) {
  if (days < 0)   return { label: 'Expired',  cls: 'bg-red-500/20 text-red-400',     icon: '🚨', sort: 0 };
  if (days <= 7)  return { label: '7 Days',   cls: 'bg-red-400/20 text-red-300',     icon: '⚠️', sort: 1 };
  if (days <= 15) return { label: '15 Days',  cls: 'bg-orange-500/20 text-orange-400', icon: '⚠️', sort: 2 };
  if (days <= 30) return { label: '30 Days',  cls: 'bg-yellow-500/20 text-yellow-400', icon: '📅', sort: 3 };
  return           { label: 'Valid',          cls: 'bg-green-500/20 text-green-400',  icon: '✅', sort: 4 };
}

const EMPTY_FORM = { driverName: '', phone: '', email: '', licenceNumber: '', licenceCategory: '', issuedDate: '', expiryDate: '', notes: '' };

export default function VendorDriversPage() {
  const fileRef = useRef(null);
  const [licences, setLicences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('All');
  const [summary, setSummary] = useState({ total: 0, expired: 0, expiringSoon: 0, compliant: 0 });

  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formLoading, setFormLoading] = useState(false);

  const [editItem, setEditItem] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editLoading, setEditLoading] = useState(false);

  const [deleteId, setDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [listRes, sumRes] = await Promise.all([
        driverLicenceService.list(),
        driverLicenceService.summary(),
      ]);
      setLicences(listRes.data.data || []);
      setSummary(sumRes.data.data || {});
    } catch { toast.error('Failed to load driver licences'); }
    finally { setLoading(false); }
  };

  const filtered = licences.filter(l => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      l.driverName?.toLowerCase().includes(q) ||
      l.licenceNumber?.toLowerCase().includes(q) ||
      l.licenceCategory?.toLowerCase().includes(q) ||
      l.phone?.includes(q);
    const matchFilter = filter === 'All' ? true
      : filter === 'Expired'        ? l.daysUntilExpiry < 0
      : filter === 'Due Soon (30d)' ? l.daysUntilExpiry >= 0 && l.daysUntilExpiry <= 30
      : l.daysUntilExpiry > 30;
    return matchSearch && matchFilter;
  }).sort((a, b) => {
    const sa = getStatus(a.daysUntilExpiry), sb = getStatus(b.daysUntilExpiry);
    return sa.sort !== sb.sort ? sa.sort - sb.sort : a.daysUntilExpiry - b.daysUntilExpiry;
  });

  const handleAdd = async () => {
    if (!form.driverName || !form.licenceCategory || !form.expiryDate) {
      toast.error('Driver name, category and expiry date are required');
      return;
    }
    setFormLoading(true);
    try {
      await driverLicenceService.add(form);
      toast.success('Driver licence added');
      setShowAdd(false);
      setForm(EMPTY_FORM);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add');
    } finally { setFormLoading(false); }
  };

  const openEdit = (item) => {
    setEditItem(item);
    setEditForm({
      driverName: item.driverName,
      phone: item.phone || '',
      email: item.email || '',
      licenceNumber: item.licenceNumber || '',
      licenceCategory: item.licenceCategory,
      issuedDate: item.issuedDate ? item.issuedDate.split('T')[0] : '',
      expiryDate: item.expiryDate.split('T')[0],
      notes: item.notes || '',
    });
  };

  const handleEdit = async () => {
    if (!editForm.expiryDate) { toast.error('Expiry date required'); return; }
    setEditLoading(true);
    try {
      await driverLicenceService.update(editItem.id, editForm);
      toast.success('Updated');
      setEditItem(null);
      fetchAll();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update');
    } finally { setEditLoading(false); }
  };

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await driverLicenceService.remove(deleteId);
      toast.success('Removed');
      setDeleteId(null);
      fetchAll();
    } catch { toast.error('Failed to delete'); }
    finally { setDeleteLoading(false); }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: 'binary' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }).slice(1).filter(r => r.some(c => c));
      const parsed = rows.map(r => ({
        driverName: r[0] || '',
        phone: r[1] || '',
        email: r[2] || '',
        licenceNumber: r[3] || '',
        licenceCategory: r[4] || '',
        issuedDate: r[5] ? String(r[5]) : '',
        expiryDate: r[6] ? String(r[6]) : '',
        notes: r[7] || '',
      }));
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
      const res = await driverLicenceService.bulkImport(importRows);
      setImportResult(res.data.data);
      fetchAll();
    } catch (err) {
      toast.error('Import failed: ' + (err.response?.data?.error || err.message));
    } finally { setImportLoading(false); }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);
    ws['!cols'] = TEMPLATE_HEADERS.map(() => ({ wch: 24 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Drivers');
    XLSX.writeFile(wb, 'driver-licences-template.xlsx');
  };

  const LicenceForm = ({ data, setData }) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="label">Driver Name *</label>
          <input className="input w-full" placeholder="e.g. John Doe" value={data.driverName}
            onChange={e => setData(p => ({ ...p, driverName: e.target.value }))} />
        </div>
        <div>
          <label className="label">Phone</label>
          <input className="input w-full" placeholder="08012345678" value={data.phone}
            onChange={e => setData(p => ({ ...p, phone: e.target.value }))} />
        </div>
        <div>
          <label className="label">Email</label>
          <input type="email" className="input w-full" placeholder="driver@email.com" value={data.email}
            onChange={e => setData(p => ({ ...p, email: e.target.value }))} />
        </div>
        <div>
          <label className="label">Licence Number</label>
          <input className="input w-full" placeholder="FED-20-12345" value={data.licenceNumber}
            onChange={e => setData(p => ({ ...p, licenceNumber: e.target.value }))} />
        </div>
        <div>
          <label className="label">Licence Category *</label>
          <select className="input w-full" value={data.licenceCategory}
            onChange={e => setData(p => ({ ...p, licenceCategory: e.target.value }))}>
            <option value="">Select category...</option>
            {LICENCE_CATEGORIES.map(c => <option key={c} value={c}>Class {c}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Issued Date</label>
          <input type="date" className="input w-full" value={data.issuedDate}
            onChange={e => setData(p => ({ ...p, issuedDate: e.target.value }))} />
        </div>
        <div>
          <label className="label">Expiry Date *</label>
          <input type="date" className="input w-full" value={data.expiryDate}
            onChange={e => setData(p => ({ ...p, expiryDate: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <label className="label">Notes</label>
          <input className="input w-full" placeholder="Optional notes..." value={data.notes}
            onChange={e => setData(p => ({ ...p, notes: e.target.value }))} />
        </div>
      </div>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ShieldAlert size={22} className="text-yellow-400" /> Driver Licences
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">Track driver licence expiry and receive automated renewal reminders</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={downloadTemplate} className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2">
            <Download size={15} /> Template
          </button>
          <button onClick={() => fileRef.current?.click()} className="btn-ghost flex items-center gap-1.5 text-sm px-3 py-2">
            <Upload size={15} /> Import Excel
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2">
            <Plus size={16} /> Add Driver
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileUpload} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Drivers',   value: summary.total,        icon: User,          color: 'text-blue-400',   bg: 'bg-blue-500/10' },
          { label: 'Expired',         value: summary.expired,      icon: AlertTriangle, color: 'text-red-400',    bg: 'bg-red-500/10' },
          { label: 'Expiring Soon',   value: summary.expiringSoon, icon: Clock,         color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'Valid',           value: summary.compliant,    icon: CheckCircle,   color: 'text-green-400',  bg: 'bg-green-500/10' },
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
          <input className="input pl-8 py-2 text-sm w-full" placeholder="Search by name, licence number..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${filter === f ? 'bg-yellow-400 text-black border-yellow-400 font-600' : 'border-white/10 text-slate-400 hover:border-white/30'}`}>
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
          <div className="p-8 text-center text-slate-400 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center">
            <User size={36} className="mx-auto text-slate-600 mb-3" />
            <p className="text-slate-400 text-sm">
              {licences.length === 0 ? 'No driver licences yet. Add your first driver or import via Excel.' : 'No results match your filters.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.07]">
                  {['Driver Name', 'Category', 'Licence No.', 'Phone', 'Expiry Date', 'Status', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs text-slate-400 font-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(l => {
                  const st = getStatus(l.daysUntilExpiry);
                  return (
                    <tr key={l.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-4 py-3 font-700 text-white">{l.driverName}</td>
                      <td className="px-4 py-3">
                        <span className="bg-blue-500/20 text-blue-300 text-xs px-2 py-0.5 rounded-full font-600">Class {l.licenceCategory}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-400 text-xs font-mono">{l.licenceNumber || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs">{l.phone || '—'}</td>
                      <td className="px-4 py-3 text-slate-300">
                        {new Date(l.expiryDate).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-500 ${st.cls}`}>
                          {st.icon} {l.daysUntilExpiry < 0 ? `${Math.abs(l.daysUntilExpiry)}d overdue` : l.daysUntilExpiry === 0 ? 'Today' : `${l.daysUntilExpiry}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex gap-1.5 justify-end">
                          <button onClick={() => openEdit(l)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-colors"><Edit2 size={14} /></button>
                          <button onClick={() => setDeleteId(l.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
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

      {/* ADD MODAL */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--navy-2)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="font-700 text-white flex items-center gap-2"><ShieldAlert size={18} className="text-yellow-400" /> Add Driver Licence</h3>
              <button onClick={() => setShowAdd(false)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto"><LicenceForm data={form} setData={setForm} /></div>
            <div className="flex gap-3 p-5 border-t border-white/10">
              <button onClick={() => setShowAdd(false)} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
              <button onClick={handleAdd} disabled={formLoading} className="btn-primary flex-1 py-2.5 text-sm">
                {formLoading ? 'Adding...' : 'Add Driver'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {editItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--navy-2)] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="font-700 text-white flex items-center gap-2"><Edit2 size={18} className="text-yellow-400" /> Update Driver Licence</h3>
              <button onClick={() => setEditItem(null)} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto"><LicenceForm data={editForm} setData={setEditForm} /></div>
            <div className="flex gap-3 p-5 border-t border-white/10">
              <button onClick={() => setEditItem(null)} className="btn-ghost flex-1 py-2.5 text-sm">Cancel</button>
              <button onClick={handleEdit} disabled={editLoading} className="btn-primary flex-1 py-2.5 text-sm">
                {editLoading ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* IMPORT MODAL */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--navy-2)] border border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="font-700 text-white flex items-center gap-2"><FileSpreadsheet size={18} className="text-yellow-400" /> Import Driver Licences</h3>
              <button onClick={() => { setShowImport(false); setImportResult(null); setImportRows([]); }} className="text-slate-400 hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {!importResult ? (
                <>
                  <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300">
                    <strong>Column order:</strong> Driver Name | Phone | Email | Licence Number | Licence Category (A/B/C/D/E/EC) | Issued Date | Expiry Date | Notes
                  </div>
                  <p className="text-sm text-slate-400"><strong className="text-white">{importRows.length}</strong> rows ready:</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead><tr className="border-b border-white/10">
                        {['Name', 'Category', 'Licence No.', 'Expiry'].map(h => <th key={h} className="text-left px-3 py-2 text-slate-400 font-500">{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {importRows.slice(0, 12).map((r, i) => (
                          <tr key={i} className="border-b border-white/[0.04]">
                            <td className="px-3 py-2 text-white">{r.driverName}</td>
                            <td className="px-3 py-2 text-slate-300">{r.licenceCategory}</td>
                            <td className="px-3 py-2 text-slate-400">{r.licenceNumber || '—'}</td>
                            <td className="px-3 py-2 text-slate-300">{r.expiryDate}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importRows.length > 12 && <p className="text-xs text-slate-500 mt-2 px-3">...and {importRows.length - 12} more rows</p>}
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
                    <p className="text-green-400 font-700 text-sm">Import Complete</p>
                    <p className="text-white text-2xl font-800 mt-1">{importResult.created} <span className="text-sm font-400 text-slate-400">drivers imported</span></p>
                  </div>
                  {importResult.failed?.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
                      <p className="text-red-400 font-700 text-sm mb-2">{importResult.failed.length} failed:</p>
                      {importResult.failed.map((f, i) => <p key={i} className="text-xs text-slate-400">• {f.row?.driverName}: {f.reason}</p>)}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 p-5 border-t border-white/10">
              <button onClick={() => { setShowImport(false); setImportResult(null); setImportRows([]); }} className="btn-ghost flex-1 py-2.5 text-sm">
                {importResult ? 'Close' : 'Cancel'}
              </button>
              {!importResult && (
                <button onClick={handleBulkImport} disabled={importLoading || importRows.length === 0} className="btn-primary flex-1 py-2.5 text-sm">
                  {importLoading ? 'Importing...' : `Import ${importRows.length} Drivers`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRM */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-[var(--navy-2)] border border-white/10 rounded-2xl w-full max-w-sm shadow-2xl p-6">
            <h3 className="font-700 text-white mb-2">Remove Driver?</h3>
            <p className="text-slate-400 text-sm mb-5">This driver licence record will be permanently deleted.</p>
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
