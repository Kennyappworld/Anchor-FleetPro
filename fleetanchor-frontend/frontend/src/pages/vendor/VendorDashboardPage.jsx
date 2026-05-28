import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Wrench, CheckCircle, Bell, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../context/authStore';

const PENDING = [
  { job:'JB-2647', plate:'LND-421-XY', issue:'Engine overheating', cost:485000 },
  { job:'JB-2646', plate:'ABJ-009-FG', issue:'Brake failure', cost:142000 },
  { job:'JB-2644', plate:'OG-341-KS', issue:'AC compressor', cost:98000 },
];
const RECENT = [
  { job:'JB-2643', plate:'KN-772-AA', work:'Full service', cost:120000, status:'PAID' },
  { job:'JB-2641', plate:'PH-083-BA', work:'Tyre replacement', cost:380000, status:'READY' },
];

export default function VendorDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const fmt = n => `₦${n.toLocaleString()}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Fleet Overview</h1>
          <p className="text-[10px] text-[var(--text3)]">Welcome back, {user?.fullName?.split(' ')[0] || 'Fleet Manager'}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative bg-white/[0.04] border border-white/[0.08] rounded-lg p-1.5">
            <Bell className="w-4 h-4 text-[var(--text2)]"/>
            <div className="absolute top-0.5 right-0.5 w-1.5 h-1.5 bg-anchor-red rounded-full"/>
          </div>
        </div>
      </div>

      <div className="p-5">
        {/* Suspension notice demo */}
        {/* <div className="mb-4 bg-anchor-red/10 border border-anchor-red/30 rounded-xl p-3 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-anchor-red flex-shrink-0"/>
          <div className="flex-1">
            <div className="text-xs font-bold text-anchor-red">Account Suspended</div>
            <div className="text-[10px] text-[var(--text3)]">Suspended by AfriFleet Motors. Contact support@fleetanchor.com</div>
          </div>
          <button className="btn-ghost text-[10px] py-1">Appeal</button>
        </div> */}

        <div className="grid grid-cols-4 gap-3 mb-5">
          {[
            {label:'My Fleet',value:'187',sub:'vehicles',icon:Truck,color:'text-teal',onClick:()=>navigate('/vendor/vehicles')},
            {label:'Active Jobs',value:'8',sub:'3 need approval',icon:Wrench,color:'text-gold',onClick:()=>navigate('/vendor/jobs')},
            {label:'In Repair',value:'5',sub:'2 completing today',icon:CheckCircle,color:'text-anchor-green'},
            {label:'YTD Spend',value:'₦12.4M',sub:'187 vehicles',icon:AlertTriangle,color:'text-anchor-purple'},
          ].map(({label,value,sub,icon:Icon,color,onClick})=>(
            <div key={label} className="stat-card" onClick={onClick}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className={`w-3.5 h-3.5 ${color}`}/>
                <span className="text-[9px] uppercase tracking-wider text-[var(--text3)]">{label}</span>
              </div>
              <div className={`text-2xl font-bold leading-none mb-1 ${color}`}>{value}</div>
              <div className="text-[10px] text-[var(--text3)]">{sub}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-title">Pending Approval</span>
              <button onClick={()=>navigate('/vendor/jobs')} className="btn-ghost text-[10px] py-1">View all →</button>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Vehicle</th><th>Issue</th><th>Est. Cost</th><th>Action</th></tr></thead>
                <tbody>
                  {PENDING.map(p=>(
                    <tr key={p.job} onClick={()=>navigate('/vendor/jobs')}>
                      <td><div className="text-teal font-semibold text-[11px]">{p.plate}</div></td>
                      <td>{p.issue}</td>
                      <td className="text-gold font-medium">{fmt(p.cost)}</td>
                      <td><span className="pill pill-pending cursor-pointer hover:opacity-80">Approve</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="section-title">Recently Completed</span>
            </div>
            <div className="table-wrap">
              <table className="tbl">
                <thead><tr><th>Vehicle</th><th>Work</th><th>Cost</th><th>Status</th></tr></thead>
                <tbody>
                  {RECENT.map(r=>(
                    <tr key={r.job}>
                      <td className="text-[var(--text)] font-medium">{r.plate}</td>
                      <td>{r.work}</td>
                      <td>{fmt(r.cost)}</td>
                      <td><span className={`pill ${r.status==='PAID'?'pill-complete':'pill-pending'}`}>{r.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 bg-anchor-green/10 border border-anchor-green/20 rounded-lg p-2 text-[10px] text-anchor-green">
              🔔 KN-772-AA is ready for pickup — payment confirmed
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
