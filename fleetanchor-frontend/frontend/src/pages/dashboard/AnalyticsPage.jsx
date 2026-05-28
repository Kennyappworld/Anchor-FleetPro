import React, { useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

const REVENUE = [
  {m:'Dec',rev:18.2,jobs:142},{m:'Jan',rev:13.8,jobs:109},{m:'Feb',rev:21.4,jobs:168},
  {m:'Mar',rev:17.1,jobs:134},{m:'Apr',rev:24.6,jobs:194},{m:'May',rev:28.4,jobs:223},
];
const CATEGORIES = [
  {name:'Engine',value:31},{name:'Brakes',value:18},{name:'Electrical',value:16},
  {name:'Transmission',value:14},{name:'Tyres',value:12},{name:'Other',value:9},
];
const TOP_VENDORS = [
  {name:'Julius Berger',spend:91.2,jobs:87},{name:'NNPC Logistics',spend:54.7,jobs:312},
  {name:'Coca-Cola NG',spend:28.4,jobs:187},{name:'Lafarge Cement',spend:12.3,jobs:61},
  {name:'Dangote Flour',spend:9.1,jobs:43},
];
const COLORS = ['#00C9A7','#F5A623','#3498DB','#9B59B6','#E84B4B','#8FA3BF'];
const TT = { contentStyle:{background:'#0F2040',border:'1px solid rgba(255,255,255,.1)',borderRadius:8,fontSize:11}, labelStyle:{color:'#8FA3BF'} };

export default function AnalyticsPage() {
  const [range, setRange] = useState('6M');

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Analytics & Insights</h1>
        <div className="flex gap-1">
          {['1M','3M','6M','1Y'].map(r=>(
            <button key={r} onClick={()=>setRange(r)} className={`px-2.5 py-1 rounded-md text-[10px] font-semibold transition-colors ${range===r?'bg-gold text-black':'bg-white/[0.04] text-[var(--text3)] hover:bg-white/[0.08]'}`}>{r}</button>
          ))}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3">
          {[['Total Revenue','₦185.4M','+34% YoY'],['Total Jobs','1,064','avg 4.2d turnaround'],['Active Vendors','6','2 on Enterprise'],['Fleet Size','1,236','across all vendors']].map(([l,v,s])=>(
            <div key={l} className="stat-card">
              <div className="text-[9px] uppercase tracking-wider text-[var(--text3)] mb-1">{l}</div>
              <div className="text-2xl font-bold text-[var(--text)] mb-1">{v}</div>
              <div className="text-[10px] text-anchor-green">{s}</div>
            </div>
          ))}
        </div>

        {/* Charts row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2 panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-3">Monthly Revenue & Job Volume</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={REVENUE}>
                <XAxis dataKey="m" tick={{fill:'#8FA3BF',fontSize:9}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fill:'#8FA3BF',fontSize:9}} axisLine={false} tickLine={false}/>
                <Tooltip {...TT} formatter={(v,n)=>[n==='rev'?`₦${v}M`:v,n==='rev'?'Revenue (₦M)':'Jobs']}/>
                <Bar dataKey="rev" fill="#F5A623" radius={[3,3,0,0]} opacity={0.9}/>
                <Bar dataKey="jobs" fill="#00C9A7" radius={[3,3,0,0]} opacity={0.7}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="panel">
            <div className="text-xs font-semibold text-[var(--text)] mb-3">Jobs by Category</div>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={CATEGORIES} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                  {CATEGORIES.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
                </Pie>
                <Tooltip {...TT} formatter={v=>[`${v}%`,'Share']}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1 mt-1">
              {CATEGORIES.map((c,i)=>(
                <div key={c.name} className="flex items-center gap-1.5 text-[10px]">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:COLORS[i%COLORS.length]}}/>
                  <span className="flex-1 text-[var(--text3)]">{c.name}</span>
                  <span className="text-[var(--text)] font-medium">{c.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top vendors */}
        <div className="panel">
          <div className="text-xs font-semibold text-[var(--text)] mb-3">Top Vendors by Spend</div>
          <div className="space-y-2">
            {TOP_VENDORS.map((v,i)=>{
              const pct = (v.spend/TOP_VENDORS[0].spend)*100;
              return (
                <div key={v.name} className="flex items-center gap-3">
                  <div className="text-[10px] text-[var(--text3)] w-4 text-right">{i+1}</div>
                  <div className="w-32 text-[11px] text-[var(--text)] truncate">{v.name}</div>
                  <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                    <div className="h-full bg-gold rounded-full" style={{width:`${pct}%`}}/>
                  </div>
                  <div className="text-[10px] text-gold font-medium w-16 text-right">₦{v.spend}M</div>
                  <div className="text-[10px] text-[var(--text3)] w-14 text-right">{v.jobs} jobs</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
