import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wrench, Car, Building2, Receipt, BarChart2, Scan, CreditCard, Shield, Settings, Bell, LogOut, ChevronDown, Hammer, Menu, X } from 'lucide-react';
import { PoweredBy } from '../../pages/auth/ForgotPasswordPage';
import { useAuthStore } from '../../context/authStore';
import toast from 'react-hot-toast';

const NAV = [
  { section: 'Core', items: [
    { to: '/admin',             icon: LayoutDashboard, label: 'Dashboard',       end: true },
    { to: '/admin/jobs',        icon: Wrench,          label: 'Job Requests',    badge: 7 },
    { to: '/admin/repairs',     icon: Hammer,          label: 'Active Repairs' },
    { to: '/admin/scanner',     icon: Scan,            label: 'VIN Scanner' },
  ]},
  { section: 'Fleet', items: [
    { to: '/admin/vehicles',    icon: Car,             label: 'Vehicles' },
    { to: '/admin/vendors',     icon: Building2,       label: 'Vendors / OEM' },
  ]},
  { section: 'Finance', items: [
    { to: '/admin/invoices',    icon: Receipt,         label: 'Invoices & Costs' },
    { to: '/admin/analytics',   icon: BarChart2,       label: 'Analytics' },
  ]},
  { section: 'Platform', items: [
    { to: '/admin/subscriptions', icon: CreditCard,   label: 'Subscriptions',   badge: '!', badgeClass: 'bg-gold text-black' },
    { to: '/admin/audit',       icon: Shield,          label: 'Audit Log' },
    { to: '/admin/settings',    icon: Settings,        label: 'Settings' },
  ]},
];

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [tenantOpen, setTenantOpen] = useState(false);
  const drawerRef = useRef(null);

  // Close drawer on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Close drawer on outside click
  useEffect(() => {
    const handle = (e) => {
      if (open && drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Prevent body scroll when drawer open on mobile
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/[0.08] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gold rounded-lg flex items-center justify-center text-base shadow-lg shadow-gold/20">⚓</div>
          <div>
            <div className="text-xs font-bold text-[var(--text)] leading-tight">FleetAnchor Pro</div>
            <div className="text-[8px] text-gold tracking-widest uppercase">Workshop OS</div>
          </div>
        </div>
        {/* Close button — mobile only */}
        <button onClick={() => setOpen(false)} className="lg:hidden text-[var(--text3)] hover:text-[var(--text)] p-1">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <div className="px-3.5 py-1.5 text-[9px] uppercase tracking-widest text-[var(--text3)]">{section}</div>
            {items.map(({ to, icon: Icon, label, badge, badgeClass, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
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
        <button
          onClick={() => setTenantOpen(!tenantOpen)}
          className="w-full flex items-center gap-2 bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-2 hover:bg-white/[0.08] transition-colors"
        >
          <div className="w-2 h-2 rounded-full bg-teal flex-shrink-0" />
          <span className="text-[10px] text-[var(--text2)] flex-1 text-left truncate">
            {user?.fullName || 'Admin'}
          </span>
          <ChevronDown className={`w-3 h-3 text-[var(--text3)] transition-transform ${tenantOpen ? 'rotate-180' : ''}`} />
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 text-[var(--text3)] hover:text-anchor-red transition-colors text-xs px-2.5 py-1.5 rounded-lg hover:bg-red-500/5"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Desktop sidebar (hidden on mobile) ── */}
      <aside className="hidden lg:flex w-52 bg-[var(--navy-2)] border-r border-white/[0.08] flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile overlay backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <aside
        ref={drawerRef}
        className={`fixed top-0 left-0 h-full w-72 max-w-[85vw] bg-[var(--navy-2)] border-r border-white/[0.08] z-50 flex flex-col transform transition-transform duration-300 ease-out lg:hidden
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <SidebarContent />
      </aside>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Mobile top bar ── */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[var(--navy-2)] border-b border-white/[0.08] flex-shrink-0">
          <button
            onClick={() => setOpen(true)}
            className="text-[var(--text)] p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <div className="w-6 h-6 bg-gold rounded-md flex items-center justify-center text-sm">⚓</div>
            <span className="text-xs font-bold text-[var(--text)]">FleetAnchor Pro</span>
          </div>
          <button className="relative p-1.5">
            <Bell className="w-4.5 h-4.5 text-[var(--text3)]" />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-anchor-red rounded-full" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
