// VendorVehiclesPage.jsx
import React, { useState } from 'react';
import { Scan, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const MOCK = [
  { id:'1', vin:'WNXNF4327A6', plate:'LND-421-XY', make:'Mercedes', model:'Actros', year:2021, status:'IN_REPAIR', jobs:8 },
  { id:'2', vin:'JHMCG56461C', plate:'ABJ-009-FG', make:'DAF', model:'XF 105', year:2019, status:'ACTIVE', jobs:5 },
  { id:'3', vin:'1FTFW1ET5FF', plate:'KN-772-AA', make:'Scania', model:'R730', year:2022, status:'ACTIVE', jobs:3 },
  { id:'4', vin:'5NPDH4AE7GH', plate:'PH-083-BA', make:'MAN', model:'TGX', year:2020, status:'IN_REPAIR', jobs:12 },
  { id:'5', vin:'2T1BURHE0JC', plate:'OG-341-KS', make:'Volvo', model:'FH 500', year:2021, status:'ACTIVE', jobs:6 },
];
const S = { ACTIVE:{label:'Active',cls:'pill-active'}, IN_REPAIR:{label:'In Repair',cls:'pill-repair'} };

export default function VendorVehiclesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const v = MOCK.filter(x=>!search||x.plate.toLowerCase().includes(search.toLowerCase())||x.vin.includes(search.toUpperCase()));
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">My Fleet</h1>
          <p className="text-[10px] text-[var(--text3)]">{MOCK.length} registered · {MOCK.filter(x=>x.status==='IN_REPAIR').length} in repair</p>
        </div>
        <button className="btn-primary"><Plus className="w-3.5 h-3.5"/>Add Vehicle</button>
      </div>
      <div className="p-5">
        <div className="flex items-center gap-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 max-w-xs mb-4">
          <Search className="w-3 h-3 text-[var(--text3)]"/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search plate or VIN…" className="bg-transparent text-xs placeholder-[var(--text3)] text-[var(--text)] outline-none w-full"/>
        </div>
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>VIN</th><th>Plate</th><th>Make & Model</th><th>Year</th><th>Status</th><th>Jobs</th><th>Scan</th></tr></thead>
            <tbody>
              {v.map(x=>{
                const s=S[x.status]||{label:x.status,cls:''};
                return (
                  <tr key={x.id}>
                    <td className="font-mono text-teal text-[11px] font-semibold">{x.vin}</td>
                    <td className="font-medium text-[var(--text)]">{x.plate}</td>
                    <td>{x.make} {x.model}</td>
                    <td>{x.year}</td>
                    <td><span className={`pill ${s.cls}`}>{s.label}</span></td>
                    <td>{x.jobs}</td>
                    <td><button onClick={()=>navigate(`/vendor/scanner`)} className="btn-ghost text-[10px] py-1"><Scan className="w-3 h-3"/>Scan</button></td>
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
