import React, { useState, useEffect, useRef } from 'react';
import { Scan, Plus, Search, Upload, Trash2, X, FileSpreadsheet, CheckCircle, AlertCircle, ChevronDown, Car, Wrench, Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import * as XLSX from 'xlsx';
import { vehicleService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

const STATUS_MAP = {
  ACTIVE: { label: 'Active', cls: 'pill-active' },
  IN_REPAIR: { label: 'In Repair', cls: 'pill-repair' },
  DECOMMISSIONED: { label: 'Decommissioned', cls: 'pill-suspended' },
};

const TEMPLATE_HEADERS = ['VIN', 'Plate Number', 'Make', 'Model', 'Year', 'Engine Number', 'Category'];
const TEMPLATE_EXAMPLE = ['WNXNF4327A6000001', 'LND-421-XY', 'Mercedes', 'Actros', '2021', 'ENG-001234', 'Heavy Truck'];

export default function VendorVehiclesPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const fileRef = useRef(null);

  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Add vehicle modal
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState({ vin:'', plateNumber:'', make:'', model:'', year:'', engineNumber:'' });
  const [addLoading, setAddLoading] = useState(false);

  // Excel import modal
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // Delete confirm
  const [deleteId, setDeleteId] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Service schedule modal
  const [serviceModal, setServiceModal] = useState(null); // vehicle object
  const [serviceForm, setServiceForm] = useState({
    lastServiceDate: '', lastServiceOdometer: '',
    currentOdometer: '', serviceIntervalDays: '', serviceIntervalKm: '',
  });
  const [serviceLoading, setServiceLoading] = useState(false);

  useEffect(() => { fetchVehicles(); }, []);

  const fetchVehicles = async () => {
    setLoading(true);
    try {
      const res = await vehicleService.list({ limit: 200 });
      setVehicles(res.data.data || []);
    } catch (err) {
      toast.error('Failed to load vehicles');
    } finally { setLoading(false); }
  };

  const filtered = vehicles.filter(v =>
    !search ||
    v.plateNumber?.toLowerCase().includes(search.toLowerCase()) ||
    v.vin?.toLowerCase().includes(search.toLowerCase()) ||
    v.make?.toLowerCase().includes(search.toLowerCase()) ||
    v.model?.toLowerCase().includes(search.toLowerCase())
  );

  
  const handleAdd = async () => {
    const { vin, plateNumber, make, model, year, engineNumber } = addForm;
    if (!vin || !plateNumber || !make || !model || !year) { toast.error('Fill all required fields'); return; }
    setAddLoading(true);
    try {
      await vehicleService.create({ vin: vin.toUpperCase(), plateNumber: plateNumber.toUpperCase(), make, model, year: parseInt(year), engineNumber });
      toast.success('Vehicle added!');
      setShowAdd(false);
      setAddForm({ vin:'', plateNumber:'', make:'', model:'', year:'', engineNumber:'' });
      fetchVehicles();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add vehicle');
    } finally { setAddLoading(false); }
  };

  
  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      await vehicleService.remove(deleteId);
      toast.success('Vehicle removed');
      setDeleteId(null);
      fetchVehicles();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to remove vehicle');
    } finally { setDeleteLoading(false); }
  };

  
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: 'binary' });
        // Try 'Vehicles' sheet first, then first sheet
        const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('vehicle')) || wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];

        // Read as raw array-of-arrays to find the real header row (contains 'VIN')
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
        let headerRowIdx = raw.findIndex(row =>
          row.some(cell => String(cell).trim().toUpperCase() === 'VIN')
        );
        if (headerRowIdx === -1) headerRowIdx = 0; // fallback

        // Re-parse from the real header row
        const rows = XLSX.utils.sheet_to_json(ws, {
          header: 1,
          defval: '',
          range: headerRowIdx,
        });
        if (rows.length < 2) { toast.error('No data rows found in sheet'); return; }

        // rows[0] = headers, rows[1..] = data
        const headers = rows[0].map(h => String(h).trim());
        const dataRows = rows.slice(1).filter(r => r.some(c => String(c).trim()));

        // Map to objects using the actual header names
        const mapped = dataRows.map(row => {
          const obj = {};
          headers.forEach((h, i) => { obj[h] = row[i] !== undefined ? String(row[i]).trim() : ''; });
          return obj;
        });

        if (!mapped.length) { toast.error('No data rows found in sheet'); return; }
        setImportRows(mapped);
        setImportResult(null);
        setShowImport(true);
      } catch (err) {
        toast.error('Could not read file. Use .xlsx or .xls format');
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  };

  const handleImport = async () => {
    setImportLoading(true);
    try {
      const res = await vehicleService.bulkImport(importRows, user?.vendorId);
      setImportResult(res.data);
      toast.success(`Imported ${res.data.created} vehicles!`);
      fetchVehicles();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally { setImportLoading(false); }
  };

  const downloadTemplate = () => {
    const ws = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, TEMPLATE_EXAMPLE]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Vehicles');
    XLSX.writeFile(wb, 'fleet_import_template.xlsx');
  };

  const inRepair = vehicles.filter(v => v.status === 'IN_REPAIR').length;

  const openServiceModal = (v) => {
    setServiceModal(v);
    setServiceForm({
      lastServiceDate: v.lastServiceDate ? v.lastServiceDate.split('T')[0] : '',
      lastServiceOdometer: v.lastServiceOdometer || '',
      currentOdometer: v.currentOdometer || '',
      serviceIntervalDays: v.serviceIntervalDays || '',
      serviceIntervalKm: v.serviceIntervalKm || '',
    });
  };

  const handleSaveSchedule = async () => {
    setServiceLoading(true);
    try {
      const res = await vehicleService.updateServiceSchedule(serviceModal.id, serviceForm);
      setVehicles(prev => prev.map(v => v.id === serviceModal.id ? { ...v, ...res.data.data } : v));
      toast.success('Service schedule saved!');
      setServiceModal(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save');
    } finally { setServiceLoading(false); }
  };

  const getServiceStatus = (v) => {
    const now = new Date();
    const in30 = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const overdueDate = v.nextServiceDate && new Date(v.nextServiceDate) < now;
    const dueDate = v.nextServiceDate && new Date(v.nextServiceDate) <= in30;
    const kmLeft = v.nextServiceOdometer && v.currentOdometer ? v.nextServiceOdometer - v.currentOdometer : null;
    if (overdueDate || (kmLeft !== null && kmLeft < 0)) return { label: 'Overdue', cls: 'bg-red-500/20 text-red-400', icon: '🚨' };
    if (dueDate || (kmLeft !== null && kmLeft <= 700)) return { label: 'Due Soon', cls: 'bg-amber-500/20 text-amber-400', icon: '⚠️' };
    if (v.nextServiceDate || v.nextServiceOdometer) return { label: 'On Schedule', cls: 'bg-green-500/20 text-green-400', icon: '✅' };
    return null;
  };

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">My Fleet</h1>
          <p className="text-[10px] text-[var(--text3)]">
            {loading ? 'Loading…' : `${vehicles.length} registered · ${inRepair} in repair`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
          <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
            <Upload className="w-3.5 h-3.5" />Import Excel
          </button>
          <button className="btn-primary" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" />Add Vehicle
          </button>
        </div>
      </div>

      <div className="p-5">
        {/* Search */}
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 max-w-xs mb-4">
          <Search className="w-3 h-3 text-[var(--text3)]" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search plate, VIN, make…"
            className="bg-transparent text-xs placeholder-[var(--text3)] text-[var(--text)] outline-none w-full"
          />
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-12 text-[var(--text3)] text-xs">Loading fleet…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Car className="w-8 h-8 text-[var(--text3)] mx-auto mb-2" />
            <p className="text-xs text-[var(--text3)]">No vehicles found. Add one or import from Excel.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>VIN</th><th>Plate</th><th>Make & Model</th><th>Year</th>
                  <th>Status</th><th>Jobs</th><th>Scan</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(v => {
                  const s = STATUS_MAP[v.status] || { label: v.status, cls: '' };
                  return (
                    <tr key={v.id}>
                      <td className="font-mono text-teal text-[11px] font-semibold">{v.vin}</td>
                      <td className="font-medium text-[var(--text)]">{v.plateNumber}</td>
                      <td>{v.make} {v.model}</td>
                      <td>{v.year}</td>
                      <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                      <td>
                        {(() => { const ss = getServiceStatus(v); return ss
                          ? <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${ss.cls}`}>{ss.icon} {ss.label}</span>
                          : <span className="text-[10px] text-[var(--text3)]">—</span>; })()}
                      </td>
                      <td>{v._count?.jobRequests ?? '-'}</td>
                      <td>
                        <button onClick={() => navigate('/vendor/scanner')} className="btn-ghost text-[10px] py-1">
                          <Scan className="w-3 h-3" />Scan
                        </button>
                      </td>
                      <td>
                        <button onClick={() => openServiceModal(v)} className="btn-ghost text-[10px] py-1 text-amber-400 hover:bg-amber-400/10" title="Service Schedule">
                          <Wrench className="w-3 h-3" />
                        </button>
                      </td>
                      <td>
                        <button
                          onClick={() => setDeleteId(v.id)}
                          className="btn-ghost text-[10px] py-1 text-anchor-red hover:bg-anchor-red/10"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Add Vehicle Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="card w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Add Vehicle</h3>
              <button onClick={() => setShowAdd(false)} className="text-[var(--text3)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['vin', 'VIN *', 'WNXNF4327A6...'],
                ['plateNumber', 'Plate Number *', 'LND-421-XY'],
                ['make', 'Make *', 'Mercedes'],
                ['model', 'Model *', 'Actros'],
                ['year', 'Year *', '2021'],
                ['engineNumber', 'Engine No.', 'Optional'],
              ].map(([k, label, ph]) => (
                <div key={k} className={k === 'vin' || k === 'engineNumber' ? 'col-span-2' : ''}>
                  <label className="form-label">{label}</label>
                  <input
                    value={addForm[k]}
                    onChange={e => setAddForm(f => ({ ...f, [k]: e.target.value }))}
                    placeholder={ph}
                    type={k === 'year' ? 'number' : 'text'}
                    className="form-input"
                  />
                </div>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowAdd(false)} className="flex-1 btn-ghost justify-center py-2">Cancel</button>
              <button onClick={handleAdd} disabled={addLoading} className="flex-1 btn-primary justify-center py-2 disabled:opacity-50">
                {addLoading ? 'Adding…' : 'Add Vehicle'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Excel Import Modal ── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !importLoading && setShowImport(false)}>
          <div className="card w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-anchor-green" />
                <h3 className="text-sm font-semibold text-[var(--text)]">Import Vehicles from Excel</h3>
              </div>
              {!importLoading && (
                <button onClick={() => setShowImport(false)} className="text-[var(--text3)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
              )}
            </div>

            {/* Result */}
            {importResult ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-anchor-green/10 border border-anchor-green/20 rounded-lg p-3">
                  <CheckCircle className="w-5 h-5 text-anchor-green" />
                  <div>
                    <p className="text-xs font-semibold text-anchor-green">{importResult.created} vehicles imported</p>
                    {importResult.skipped > 0 && <p className="text-[10px] text-[var(--text3)]">{importResult.skipped} rows skipped (duplicates or missing data)</p>}
                  </div>
                </div>
                {importResult.errors?.length > 0 && (
                  <div className="bg-anchor-red/10 border border-anchor-red/20 rounded-lg p-3 max-h-32 overflow-y-auto">
                    {importResult.errors.slice(0,5).map((e,i) => (
                      <p key={i} className="text-[10px] text-anchor-red">{e.row?.plateNumber || e.row?.VIN}: {e.error}</p>
                    ))}
                  </div>
                )}
                <button onClick={() => setShowImport(false)} className="w-full btn-primary justify-center py-2">Done</button>
              </div>
            ) : (
              <>
                {/* Preview */}
                <div className="mb-3">
                  <p className="text-[11px] text-[var(--text3)] mb-2">{importRows.length} rows detected</p>
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-[10px]">
                      <thead className="bg-white/[0.04] sticky top-0">
                        <tr>
                          {Object.keys(importRows[0] || {}).slice(0,6).map(h => (
                            <th key={h} className="px-2 py-1.5 text-left text-[var(--text3)] font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 10).map((r, i) => (
                          <tr key={i} className="border-t border-white/[0.04]">
                            {Object.values(r).slice(0,6).map((v,j) => (
                              <td key={j} className="px-2 py-1.5 text-[var(--text3)]">{String(v).slice(0,20)}</td>
                            ))}
                          </tr>
                        ))}
                        {importRows.length > 10 && (
                          <tr className="border-t border-white/[0.04]">
                            <td colSpan={6} className="px-2 py-1.5 text-[var(--text3)] text-center italic">…and {importRows.length - 10} more rows</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-gold/8 border border-gold/20 rounded-lg p-2.5 text-[10px] text-gold mb-3">
                  Required columns: <strong>VIN</strong>, <strong>Plate Number</strong>, <strong>Make</strong>, <strong>Model</strong>, <strong>Year</strong>. 
                  Optional: Engine Number, Category. Duplicates (same VIN) will be updated, not doubled.
                </div>

                <div className="flex gap-2">
                  <button onClick={downloadTemplate} className="btn-ghost text-[11px] py-2">
                    <FileSpreadsheet className="w-3.5 h-3.5" />Download Template
                  </button>
                  <button onClick={handleImport} disabled={importLoading} className="flex-1 btn-primary justify-center py-2 disabled:opacity-50">
                    {importLoading ? 'Importing…' : `Import ${importRows.length} Vehicles`}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Delete Confirm ── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !deleteLoading && setDeleteId(null)}>
          <div className="card w-full max-w-xs p-5 text-center" onClick={e => e.stopPropagation()}>
            <AlertCircle className="w-8 h-8 text-anchor-red mx-auto mb-2" />
            <h3 className="text-sm font-semibold text-[var(--text)] mb-1">Remove Vehicle?</h3>
            <p className="text-[11px] text-[var(--text3)] mb-4">This cannot be undone. Job history linked to this vehicle will be preserved.</p>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} disabled={deleteLoading} className="flex-1 btn-ghost justify-center py-2">Cancel</button>
              <button onClick={handleDelete} disabled={deleteLoading} className="flex-1 btn-primary bg-anchor-red hover:bg-anchor-red/80 justify-center py-2 disabled:opacity-50">
                {deleteLoading ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Service Schedule Modal ── */}
      {serviceModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => !serviceLoading && setServiceModal(null)}>
          <div className="card w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-[var(--text)]">Service Schedule</h3>
              </div>
              <button onClick={() => setServiceModal(null)} className="text-[var(--text3)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-[11px] text-[var(--text3)] mb-4">
              {serviceModal.plateNumber} · {serviceModal.make} {serviceModal.model} {serviceModal.year}
            </p>

            <div className="space-y-4">
              {/* Last service */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text)] mb-2 uppercase tracking-wide">Last Service</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[var(--text3)] mb-1 block">Date</label>
                    <input type="date" value={serviceForm.lastServiceDate}
                      onChange={e => setServiceForm(f => ({ ...f, lastServiceDate: e.target.value }))}
                      className="input text-[12px] py-1.5 w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--text3)] mb-1 block">Odometer (km)</label>
                    <input type="number" placeholder="e.g. 45000" value={serviceForm.lastServiceOdometer}
                      onChange={e => setServiceForm(f => ({ ...f, lastServiceOdometer: e.target.value }))}
                      className="input text-[12px] py-1.5 w-full" />
                  </div>
                </div>
              </div>

              {/* Current odometer */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text)] mb-2 uppercase tracking-wide">Current Odometer</p>
                <input type="number" placeholder="e.g. 48500" value={serviceForm.currentOdometer}
                  onChange={e => setServiceForm(f => ({ ...f, currentOdometer: e.target.value }))}
                  className="input text-[12px] py-1.5 w-full" />
              </div>

              {/* Service intervals */}
              <div>
                <p className="text-[11px] font-semibold text-[var(--text)] mb-2 uppercase tracking-wide">Service Intervals (alert when either is reached)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-[var(--text3)] mb-1 block">Every N days</label>
                    <input type="number" placeholder="e.g. 90" value={serviceForm.serviceIntervalDays}
                      onChange={e => setServiceForm(f => ({ ...f, serviceIntervalDays: e.target.value }))}
                      className="input text-[12px] py-1.5 w-full" />
                  </div>
                  <div>
                    <label className="text-[10px] text-[var(--text3)] mb-1 block">Every N km</label>
                    <input type="number" placeholder="e.g. 5000" value={serviceForm.serviceIntervalKm}
                      onChange={e => setServiceForm(f => ({ ...f, serviceIntervalKm: e.target.value }))}
                      className="input text-[12px] py-1.5 w-full" />
                  </div>
                </div>
              </div>

              {/* Preview next service */}
              {(serviceForm.lastServiceDate && serviceForm.serviceIntervalDays) || (serviceForm.lastServiceOdometer && serviceForm.serviceIntervalKm) ? (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-[11px]">
                  <p className="font-semibold text-amber-400 mb-1">📅 Next service will be due:</p>
                  {serviceForm.lastServiceDate && serviceForm.serviceIntervalDays && (
                    <p className="text-[var(--text3)]">By date: <strong className="text-[var(--text)]">
                      {new Date(new Date(serviceForm.lastServiceDate).getTime() + parseInt(serviceForm.serviceIntervalDays) * 86400000).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </strong></p>
                  )}
                  {serviceForm.lastServiceOdometer && serviceForm.serviceIntervalKm && (
                    <p className="text-[var(--text3)]">By odometer: <strong className="text-[var(--text)]">
                      {(parseInt(serviceForm.lastServiceOdometer) + parseInt(serviceForm.serviceIntervalKm)).toLocaleString()} km
                    </strong></p>
                  )}
                  <p className="text-[var(--text3)] mt-1">You'll receive an email alert 30 days before the date or 700 km before the odometer target.</p>
                </div>
              ) : null}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setServiceModal(null)} disabled={serviceLoading} className="flex-1 btn-ghost justify-center py-2">Cancel</button>
              <button onClick={handleSaveSchedule} disabled={serviceLoading} className="flex-1 btn-primary justify-center py-2 disabled:opacity-50">
                {serviceLoading ? 'Saving…' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
