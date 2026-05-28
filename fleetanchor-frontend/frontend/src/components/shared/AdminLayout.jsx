import React, { useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Wrench, Car, Building2, Receipt, BarChart2, Scan, CreditCard, Shield, Settings, Bell, LogOut, ChevronDown, Hammer } from 'lucide-react';
import { useAuthStore } from '../../context/authStore';
import toast from 'react-hot-toast';

const NAV = [
  { section: 'Core', items: [
    { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
    { to: '/admin/jobs', icon: Wrench, label: 'Job Requests', badge: 7 },
    { to: '/admin/repairs', icon: Hammer, label: 'Active Repairs' },
    { to: '/admin/scanner', icon: Scan, label: 'VIN Scanner' },
  ]},
  { section: 'Fleet', items: [
    { to: '/admin/vehicles', icon: Car, label: 'Vehicles' },
    { to: '/admin/vendors', icon: Building2, label: 'Vendors / OEM' },
  ]},
  { section: 'Finance', items: [
    { to: '/admin/invoices', icon: Receipt, label: 'Invoices & Costs' },
    { to: '/admin/analytics', icon: BarChart2, label: 'Analytics' },
  ]},
  { section: 'Platform', items: [
    { to: '/admin/subscriptions', icon: CreditCard, label: 'Subscriptions', badge: '!', badgeClass: 'bg-gold text-black' },
    { to: '/admin/audit', icon: Shield, label: 'Audit Log' },
    { to: '/admin/settings', icon: Settings, label: 'Settings' },
  ]},
];

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [tenantOpen, setTenantOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Sidebar ── */}
      <aside className="w-52 bg-navy-2 border-r border-white/[0.08] flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="px-4 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gold rounded-lg flex items-center justify-center text-base shadow-lg shadow-gold/20">⚓</div>
            <div>
              <div className="text-xs font-bold text-[var(--text)] leading-tight">FleetAnchor Pro</div>
              <div className="text-[8px] text-gold tracking-widest uppercase">Workshop OS</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(({ section, items }) => (
            <div key={section}>
              <div className="px-3.5 py-1.5 text-[9px] uppercase tracking-widest text-[var(--text3)]">{section}</div>
              {items.map(({ to, icon: Icon, label, badge, badgeClass, end }) => (
                <NavLink key={to} to={to} end={end}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? 'nav-item-active' : ''}`
                  }>
                  <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 text-xs">{label}</span>
                  {badge && (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${badgeClass || 'bg-anchor-red text-white'}`}>
                      {badge}
                    </span>
                  )}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Tenant + User */}
        <div className="p-3 border-t border-white/[0.08] space-y-2">
          <button onClick={() => setTenantOpen(!tenantOpen)} className="w-full flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 hover:bg-white/[0.08] transition-colors">
            <div className="w-2 h-2 rounded-full bg-teal flex-shrink-0" />
            <span className="text-[10px] text-[var(--text2)] flex-1 text-left truncate">AfriFleet Motors</span>
            <ChevronDown className={`w-3 h-3 text-[var(--text3)] transition-transform ${tenantOpen ? 'rotate-180' : ''}`} />
          </button>
          <button onClick={handleLogout} className="w-full flex items-center gap-2 text-[var(--text3)] hover:text-anchor-red transition-colors text-xs px-2.5 py-1.5 rounded-lg hover:bg-red-500/5">
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
