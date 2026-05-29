import React, { useState, useEffect, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wrench, Scan, Truck, History, Receipt, Users, CreditCard, LogOut, MessageCircle, Menu, X, Bell, ChevronRight, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuthStore } from '../../context/authStore';
import ChangePasswordModal from './ChangePasswordModal';
import toast from 'react-hot-toast';

const NAV = [
  { section: 'Fleet', items: [
    { to: '/vendor',              icon: LayoutDashboard, label: 'Dashboard',           end: true },
    { to: '/vendor/jobs',         icon: Wrench,          label: 'My Job Requests',     badge: 3  },
    { to: '/vendor/scanner',      icon: Scan,            label: 'VIN Scanner' },
    { to: '/vendor/vehicles',     icon: Truck,           label: 'My Fleet' },
    { to: '/vendor/compliance',   icon: ShieldCheck,     label: 'Doc Compliance' },
    { to: '/vendor/drivers',      icon: UserCheck,       label: 'Driver Licences' },
  ]},
  { section: 'Reports', items: [
    { to: '/vendor/history',      icon: History,         label: 'Maintenance History' },
    { to: '/vendor/invoices',     icon: Receipt,         label: 'Invoices' },
  ]},
  { section: 'Communication', items: [
    { to: '/vendor/chat',         icon: MessageCircle,   label: 'Team Chat',           badge: 'new' },
  ]},
  { section: 'Team & Account', items: [
    { to: '/vendor/team',         icon: Users,           label: 'Team Members' },
    { to: '/vendor/subscription', icon: CreditCard,      label: 'Subscription' },
  ]},
];

export default function VendorLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef(null);

  // Close on route change
  useEffect(() => { setOpen(false); }, [location.pathname]);

  // Close on outside click
  useEffect(() => {
    const handle = (e) => {
      if (open && drawerRef.current && !drawerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleLogout = async () => {
    await logout();
    toast.success('Logged out');
    navigate('/login');
  };

  const companyName = user?.vendor?.companyName || user?.companyName || 'My Company';

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-4 border-b border-white/[0.08]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gold rounded-lg flex items-center justify-center text-base">⚓</div>
            <div>
              <div className="text-xs font-bold text-[var(--text)]">FleetAnchor Pro</div>
              <div className="text-[8px] text-teal tracking-widest uppercase">Vendor Portal</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden text-[var(--text3)] hover:text-[var(--text)] p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Company badge */}
        <div className="bg-teal/10 border border-teal/20 rounded-lg px-2.5 py-2">
          <div className="text-xs font-semibold text-teal truncate">{companyName}</div>
          <div className="text-[9px] text-[var(--text3)] mt-0.5">
            {user?.role?.replace(/_/g, ' ')} · {user?.role === 'FIELD_AGENT' ? 'Field View' : 'Full Access'}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-2">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            <div className="px-3.5 py-1.5 text-[9px] uppercase tracking-widest text-[var(--text3)]">{section}</div>
            {items.map(({ to, icon: Icon, label, badge, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) => `nav-item ${isActive ? 'nav-item-active' : ''}`}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {badge && (
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                    ${badge === 'new' ? 'bg-teal/20 text-teal' : 'bg-anchor-red/20 text-anchor-red'}`}>
                    {badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-white/[0.08] space-y-2">
        <div className="text-[9px] text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-2 py-1.5">
          Growth plan · Trial active
        </div>
        <button
          onClick={() => { navigate('/vendor/subscription'); setOpen(false); }}
          className="w-full btn-primary justify-center text-[10px] py-1.5"
        >
          Upgrade Plan
        </button>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 text-anchor-red hover:bg-anchor-red/5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:flex w-52 bg-[var(--navy-2)] border-r border-white/[0.08] flex-col flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile backdrop ── */}
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
            className="text-[var(--text)] p-1.5 rounded-lg hover:bg-white/[0.08] active:bg-white/[0.12] transition-colors"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-bold text-[var(--text)] truncate">{companyName}</div>
            <div className="text-[9px] text-teal">FleetAnchor Pro</div>
          </div>
          <button className="relative p-1.5 text-[var(--text3)]">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-anchor-red rounded-full" />
          </button>
        </header>

        <main className="flex-1 overflow-y-auto bg-navy">
          <Outlet />
        </main>
      </div>

      {user?.mustChangePassword && <ChangePasswordModal forced={true} />}
    </div>
  );
}
