import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wrench, Scan, Truck, History, Receipt, Users, CreditCard, LogOut, MessageCircle } from 'lucide-react';
import { useAuthStore } from '../../context/authStore';
import toast from 'react-hot-toast';

const NAV = [
  { section:'Fleet', items:[
    { to:'/vendor',            icon:LayoutDashboard, label:'Dashboard',       end:true },
    { to:'/vendor/jobs',       icon:Wrench,          label:'My Job Requests', badge:3  },
    { to:'/vendor/scanner',    icon:Scan,            label:'VIN Scanner'              },
    { to:'/vendor/vehicles',   icon:Truck,           label:'My Fleet'                 },
  ]},
  { section:'Reports', items:[
    { to:'/vendor/history',    icon:History,         label:'Maintenance History' },
    { to:'/vendor/invoices',   icon:Receipt,         label:'Invoices'           },
  ]},
  { section:'Communication', items:[
    { to:'/vendor/chat',       icon:MessageCircle,   label:'Team Chat', badge:'new' },
  ]},
  { section:'Team & Account', items:[
    { to:'/vendor/team',         icon:Users,       label:'Team Members' },
    { to:'/vendor/subscription', icon:CreditCard,  label:'Subscription' },
  ]},
];

export default function VendorLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();

  const handleLogout = async () => { await logout(); toast.success('Logged out'); navigate('/login'); };

  const companyName = user?.vendor?.companyName || user?.companyName || 'My Company';

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="w-52 bg-navy-2 border-r border-white/[0.08] flex flex-col flex-shrink-0">
        <div className="px-4 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2 mb-2.5">
            <div className="w-7 h-7 bg-gold rounded-lg flex items-center justify-center text-base">⚓</div>
            <div>
              <div className="text-xs font-bold text-[var(--text)]">FleetAnchor Pro</div>
              <div className="text-[8px] text-teal tracking-widest uppercase">Vendor Portal</div>
            </div>
          </div>
          <div className="bg-teal/10 border border-teal/20 rounded-lg px-2.5 py-2">
            <div className="text-xs font-semibold text-teal truncate">{companyName}</div>
            <div className="text-[9px] text-[var(--text3)] mt-0.5">
              {user?.role?.replace(/_/g,' ')} · {user?.role==='FIELD_AGENT' ? 'Field View' : 'Full Access'}
            </div>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <div className="px-3.5 py-1.5 text-[9px] uppercase tracking-widest text-[var(--text3)]">{section}</div>
              {items.map(({ to, icon:Icon, label, badge, end }) => (
                <NavLink key={to} to={to} end={end}
                  className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0"/>
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                      ${badge==='new' ? 'bg-teal/20 text-teal' : 'bg-[var(--accent)]/20 text-[var(--accent)]'}`}>
                      {badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="p-3 border-t border-white/[0.08] space-y-1.5">
          <div className="text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-1.5">
            Growth plan: 2 users max
          </div>
          <button className="w-full btn-primary justify-center text-[10px] py-1.5">Upgrade Plan</button>
          <button onClick={handleLogout} className="w-full nav-item text-anchor-red hover:text-anchor-red">
            <LogOut className="w-3.5 h-3.5"/> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto bg-navy">
        <Outlet/>
      </main>
    </div>
  );
}
