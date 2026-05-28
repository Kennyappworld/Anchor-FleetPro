import React, { useState } from 'react';
import { Search, Plus, Scan } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MOCK = [
  { id:'1', vin:'WNXNF4327A6', plate:'LND-421-XY', make:'Mercedes', model:'Actros', year:2021, vendor:'Coca-Cola Nigeria', status:'IN_REPAIR', jobs:8 },
  { id:'2', vin:'JHMCG56461C', plate:'ABJ-009-FG', make:'DAF', model:'XF 105', year:2019, vendor:'Dangote Flour', status:'ACTIVE', jobs:5 },
  { id:'3', vin:'1FTFW1ET5FF', plate:'KN-772-AA', make:'Scania', model:'R730', year:2022, vendor:'NNPC Logistics', status:'ACTIVE', jobs:3 },
  { id:'4', vin:'5NPDH4AE7GH', plate:'PH-083-BA', make:'MAN', model:'TGX 26.540', year:2020, vendor:'UAC Nigeria', status:'IN_REPAIR', jobs:12 },
  { id:'5', vin:'2T1BURHE0JC', plate:'OG-341-KS', make:'Volvo', model:'FH 500', year:2021, vendor:'Lafarge Cement', status:'ACTIVE', jobs:6 },
  { id:'6', vin:'3VWFE21C04M', plate:'ABJ-014-RT', make:'Mercedes', model:'Actros', year:2018, vendor:'Coca-Cola Nigeria', status:'DECOMMISSIONED', jobs:21 },
];

const STATUS = { ACTIVE:{label:'Active',cls:'pill-active'}, IN_REPAIR:{label:'In Repair',cls:'pill-repair'}, DECOMMISSIONED:{label:'Decommissioned',cls:'pill-suspended'} };

export default function VehiclesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const v = MOCK.filter(x=>!search||x.vin.includes(search.toUpperCase())||x.plate.toLowerCase().includes(search.toLowerCase())||x.vendor.toLowerCase().includes(search.toLowerCase()));

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Fleet Vehicles</h1>
          <p className="text-[10px] text-[var(--text3)]">{MOCK.length} registered · {MOCK.filter(x=>x.status==='IN_REPAIR').length} in repair</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>navigate('/admin/scanner')} className="btn-ghost"><Scan className="w-3.5 h-3.5"/>Scanner</button>
          <button className="btn-primary"><Plus className="w-3.5 h-3.5"/>Register Vehicle</button>
        </div>
      </div>
      <div className="p-5">
        <div className="flex gap-2 mb-4">
          <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 flex-1 max-w-xs">
            <Search className="w-3 h-3 text-[var(--text3)]"/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search VIN, plate, vendor…" className="bg-transparent text-xs text-[var(--text)] placeholder-[var(--text3)] outline-none w-full"/>
          </div>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>VIN / Chassis</th><th>Plate</th><th>Make & Model</th><th>Year</th><th>Vendor</th><th>Status</th><th>Jobs</th><th>Action</th></tr></thead>
            <tbody>
              {v.map(x=>{
                const s=STATUS[x.status];
                return (
                  <tr key={x.id}>
                    <td><span className="font-mono text-teal text-[11px] font-semibold">{x.vin}</span></td>
                    <td className="font-medium text-[var(--text)]">{x.plate}</td>
                    <td>{x.make} {x.model}</td>
                    <td>{x.year}</td>
                    <td>{x.vendor}</td>
                    <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                    <td>{x.jobs}</td>
                    <td><button onClick={()=>navigate(`/admin/scanner?vin=${x.vin}`)} className="btn-ghost text-[10px] py-1"><Scan className="w-3 h-3"/>Scan</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
