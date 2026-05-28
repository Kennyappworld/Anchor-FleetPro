import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Plus, ChevronDown } from 'lucide-react';

const STATUSES = ['All','SUBMITTED','DIAGNOSED','ESTIMATE_SENT','ESTIMATE_APPROVED','ESTIMATE_QUERIED','REPAIR_STARTED','REPAIR_COMPLETE','AWAITING_PAYMENT','CLOSED'];

const STATUS_META = {
  SUBMITTED:        { label: 'Submitted',       cls: 'bg-blue-500/15 text-anchor-blue' },
  DIAGNOSED:        { label: 'Diagnosed',        cls: 'bg-purple-500/15 text-anchor-purple' },
  ESTIMATE_SENT:    { label: 'Est. Sent',        cls: 'pill-pending' },
  ESTIMATE_APPROVED:{ label: 'Approved',         cls: 'bg-teal/15 text-teal' },
  ESTIMATE_QUERIED: { label: 'Queried',          cls: 'pill-query' },
  REPAIR_STARTED:   { label: 'In Repair',        cls: 'pill-repair' },
  REPAIR_COMPLETE:  { label: 'Complete',         cls: 'pill-complete' },
  AWAITING_PAYMENT: { label: 'Awaiting Payment', cls: 'pill-pending' },
  CLOSED:           { label: 'Closed',           cls: 'bg-white/10 text-[var(--text3)]' },
};

const MOCK = [
  { id:'1', jobNumber:'JB-2647', vin:'WNXNF4327A6', plate:'LND-421-XY', vendor:'Coca-Cola Nigeria', category:'ENGINE', desc:'Engine overheating at high load', status:'REPAIR_STARTED', priority:'HIGH', submitted:'2026-05-25', bay:'Bay 01', tech:'E. Nwosu' },
  { id:'2', jobNumber:'JB-2646', vin:'JHMCG56461C', plate:'ABJ-009-FG', vendor:'Dangote Flour', category:'BRAKES', desc:'Complete brake failure front axle', status:'ESTIMATE_SENT', priority:'CRITICAL', submitted:'2026-05-26', bay:null, tech:'K. Adeyemi' },
  { id:'3', jobNumber:'JB-2645', vin:'1FTFW1ET5FF', plate:'KN-772-AA', vendor:'NNPC Logistics', category:'TRANSMISSION', desc:'Transmission slipping between gears', status:'ESTIMATE_APPROVED', priority:'NORMAL', submitted:'2026-05-24', bay:'Bay 03', tech:'T. Eze' },
  { id:'4', jobNumber:'JB-2644', vin:'5NPDH4AE7GH', plate:'PH-083-BA', vendor:'UAC Nigeria', category:'CLIMATE_CONTROL', desc:'AC compressor seized', status:'ESTIMATE_QUERIED', priority:'LOW', submitted:'2026-05-23', bay:null, tech:'E. Nwosu' },
  { id:'5', jobNumber:'JB-2643', vin:'2T1BURHE0JC', plate:'OG-341-KS', vendor:'Lafarge Cement', category:'TYRES_WHEELS', desc:'Wheel alignment + 4 tyre replacement', status:'REPAIR_COMPLETE', priority:'NORMAL', submitted:'2026-05-22', bay:null, tech:'K. Adeyemi' },
  { id:'6', jobNumber:'JB-2642', vin:'3VWFE21C04M', plate:'ABJ-014-RT', vendor:'Coca-Cola Nigeria', category:'ELECTRICAL', desc:'Alternator failure + wiring fault', status:'SUBMITTED', priority:'HIGH', submitted:'2026-05-27', bay:null, tech:null },
  { id:'7', jobNumber:'JB-2641', vin:'4T1BF3EK4AU', plate:'EN-207-GH', vendor:'Julius Berger', category:'ENGINE', desc:'Full engine overhaul scheduled', status:'CLOSED', priority:'NORMAL', submitted:'2026-05-10', bay:null, tech:'T. Eze' },
];

const PRIORITY_COLORS = { CRITICAL:'text-anchor-red', HIGH:'text-gold', NORMAL:'text-[var(--text3)]', LOW:'text-[var(--text3)]' };

export default function JobsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');

  const jobs = MOCK.filter(j => {
    const q = search.toLowerCase();
    const matchSearch = !q || j.jobNumber.toLowerCase().includes(q) || j.vin.toLowerCase().includes(q) || j.vendor.toLowerCase().includes(q) || j.desc.toLowerCase().includes(q);
    const matchStatus = statusFilter === 'All' || j.status === statusFilter;
    const matchPriority = priorityFilter === 'All' || j.priority === priorityFilter;
    return matchSearch && matchStatus && matchPriority;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Job Requests</h1>
          <p className="text-[10px] text-[var(--text3)]">{jobs.length} jobs · {MOCK.filter(j=>j.status==='REPAIR_STARTED').length} in repair</p>
        </div>
        <button className="btn-primary"><Plus className="w-3.5 h-3.5" />New Job</button>
      </div>

      {/* Filters */}
      <div className="px-5 py-3 flex gap-2 flex-wrap border-b border-white/[0.06]">
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 flex-1 min-w-36">
          <Search className="w-3 h-3 text-[var(--text3)]" />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search jobs, VIN, vendor…" className="bg-transparent text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none w-full" />
        </div>
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} className="form-input w-auto text-xs py-1.5">
          {STATUSES.map(s=><option key={s}>{s}</option>)}
        </select>
        <select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)} className="form-input w-auto text-xs py-1.5">
          {['All','CRITICAL','HIGH','NORMAL','LOW'].map(p=><option key={p}>{p}</option>)}
        </select>
      </div>

      {/* Status summary pills */}
      <div className="px-5 py-3 flex gap-2 flex-wrap border-b border-white/[0.06]">
        {Object.entries(STATUS_META).map(([k,{label,cls}])=>{
          const count = MOCK.filter(j=>j.status===k).length;
          if (!count) return null;
          return (
            <button key={k} onClick={()=>setStatusFilter(statusFilter===k?'All':k)}
              className={`pill ${cls} cursor-pointer hover:opacity-80 ${statusFilter===k?'ring-1 ring-white/30':''}`}>
              {label} {count}
            </button>
          );
        })}
      </div>

      <div className="px-5 py-4">
        <div className="table-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th style={{width:'10%'}}>Job #</th>
                <th style={{width:'16%'}}>Vehicle</th>
                <th style={{width:'18%'}}>Vendor</th>
                <th style={{width:'20%'}}>Issue</th>
                <th style={{width:'12%'}}>Status</th>
                <th style={{width:'8%'}}>Priority</th>
                <th style={{width:'10%'}}>Submitted</th>
                <th style={{width:'6%'}}>Bay/Tech</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map(j=>{
                const s = STATUS_META[j.status];
                return (
                  <tr key={j.id} onClick={()=>navigate(`/admin/jobs/${j.id}`)}>
                    <td><span className="font-mono text-gold text-[11px] font-semibold">{j.jobNumber}</span></td>
                    <td>
                      <div className="text-teal font-semibold text-[11px]">{j.vin}</div>
                      <div className="text-[10px] text-[var(--text3)]">{j.plate}</div>
                    </td>
                    <td>{j.vendor}</td>
                    <td><span className="text-[var(--text)] text-[11px]">{j.desc.slice(0,38)}{j.desc.length>38?'…':''}</span></td>
                    <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                    <td><span className={`text-[10px] font-semibold ${PRIORITY_COLORS[j.priority]}`}>{j.priority}</span></td>
                    <td className="text-[10px]">{j.submitted}</td>
                    <td className="text-[10px] text-[var(--text3)]">{j.bay||j.tech||'—'}</td>
                  </tr>
                );
              })}
              {!jobs.length && (
                <tr><td colSpan={8} className="text-center py-8 text-[var(--text3)]">No jobs match your filter</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
