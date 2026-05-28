import React, { useState, useEffect } from 'react';
import { Users, Plus, Lock, UserCheck, Zap, Wrench, AlertTriangle, X, Mail, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { userService } from '../../services/api';
import { useAuthStore } from '../../context/authStore';

const ROLES = [
  {
    value: 'MAINTENANCE_SUPERVISOR',
    label: 'Maintenance Supervisor',
    icon: Wrench,
    desc: 'Manages job tickets, approves estimates, views repair progress. Cannot export reports.',
  },
  {
    value: 'FIELD_AGENT',
    label: 'Field Agent',
    icon: Zap,
    desc: 'Submits job requests, scans VINs, views job status. Cost data hidden.',
  },
];

const ROLE_COLORS = {
  FLEET_MANAGER: 'text-gold bg-gold/10',
  MAINTENANCE_SUPERVISOR: 'text-teal bg-teal/10',
  FIELD_AGENT: 'text-[var(--text3)] bg-white/[0.06]',
};

export default function VendorTeamPage() {
  const navigate = useNavigate();
  const { user: currentUser } = useAuthStore();

  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'FIELD_AGENT' });
  const [saving, setSaving] = useState(false);
  const [createdUser, setCreatedUser] = useState(null); // shows temp password after creation
  const [showPassword, setShowPassword] = useState(false);
  const [resending, setResending] = useState(null);

  const PLAN_LIMIT = 2; // GROWTH plan: Fleet Manager (owner) + 2 additional = 3 total, but owner counts as 1 so 2 more

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await userService.list({ vendorId: currentUser?.vendorId });
      setUsers(res.data.data || []);
    } catch { toast.error('Failed to load team'); }
    finally { setLoading(false); }
  };

  // Non-owner (non-Fleet Manager) count against the plan limit
  const additionalUsers = users.filter(u => u.role !== 'FLEET_MANAGER');
  const atLimit = additionalUsers.length >= PLAN_LIMIT;

  const handleAdd = async () => {
    if (!form.fullName.trim() || !form.email.trim()) { toast.error('Name and email are required'); return; }
    if (atLimit) { toast.error('Plan limit reached — upgrade to Enterprise for more users'); navigate('/vendor/subscription'); return; }
    setSaving(true);
    try {
      const res = await userService.create({
        ...form,
        vendorId: currentUser?.vendorId,
        oemId: currentUser?.oemId,
      });
      setCreatedUser(res.data.data); // { user, tempPassword, loginUrl }
      setShowAdd(false);
      setForm({ fullName: '', email: '', role: 'FIELD_AGENT' });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create user');
    } finally { setSaving(false); }
  };

  const handleResendCredentials = async (userId) => {
    setResending(userId);
    try {
      await userService.resendCredentials(userId);
      toast.success('Login details resent to their email');
    } catch { toast.error('Failed to resend credentials'); }
    finally { setResending(null); }
  };

  const handleToggle = async (userId, active) => {
    try {
      await userService.update(userId, { active: !active });
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, active: !active } : u));
      toast.success(active ? 'User deactivated' : 'User reactivated');
    } catch { toast.error('Failed to update user'); }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Team Members</h1>
          <p className="text-[10px] text-[var(--text3)]">
            {loading ? 'Loading…' : `${users.length} member${users.length !== 1 ? 's' : ''} · ${additionalUsers.length}/${PLAN_LIMIT} additional slots used`}
          </p>
        </div>
        <button
          onClick={() => atLimit
            ? (toast.error('Upgrade to Enterprise for more users'), navigate('/vendor/subscription'))
            : setShowAdd(true)}
          className="btn-primary"
        >
          <Plus className="w-3.5 h-3.5" />Add Team Member
        </button>
      </div>

      <div className="p-5 space-y-4">

        {/* Plan slot indicator */}
        <div className={`flex items-center gap-2.5 rounded-xl p-3 text-xs border
          ${atLimit
            ? 'bg-anchor-red/10 border-anchor-red/20 text-anchor-red'
            : 'bg-white/[0.04] border-white/[0.08] text-[var(--text3)]'}`}>
          <Lock className="w-3.5 h-3.5 shrink-0" />
          <span>
            Growth plan: <strong className="text-[var(--text)]">{additionalUsers.length}/{PLAN_LIMIT}</strong> additional user slots used.
            {atLimit
              ? ' Upgrade to Enterprise for unlimited team members.'
              : ` You can add ${PLAN_LIMIT - additionalUsers.length} more member${PLAN_LIMIT - additionalUsers.length !== 1 ? 's' : ''}.`}
          </span>
          {atLimit && (
            <button onClick={() => navigate('/vendor/subscription')} className="ml-auto shrink-0 text-[10px] font-semibold bg-gold text-navy px-2.5 py-1 rounded-lg">
              Upgrade
            </button>
          )}
        </div>

        {/* User list */}
        {loading ? (
          <div className="text-center py-8 text-xs text-[var(--text3)]">Loading team…</div>
        ) : (
          <div className="space-y-2">
            {users.map(u => {
              const roleInfo = ROLES.find(r => r.value === u.role);
              const isOwner = u.role === 'FLEET_MANAGER';
              const isMe = u.id === currentUser?.id;

              return (
                <div key={u.id} className={`card px-4 py-3.5 flex items-center gap-3 ${!u.active ? 'opacity-50' : ''}`}>
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-teal/20 flex items-center justify-center text-xs font-bold text-teal shrink-0">
                    {u.fullName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[var(--text)]">{u.fullName}</span>
                      {isMe && <span className="text-[9px] text-[var(--text3)] bg-white/[0.06] px-1.5 py-0.5 rounded">You</span>}
                      {isOwner && <span className="text-[9px] text-gold bg-gold/10 px-1.5 py-0.5 rounded">Account Owner</span>}
                      <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${ROLE_COLORS[u.role] || 'text-[var(--text3)]'}`}>
                        {u.role.replace(/_/g, ' ')}
                      </span>
                      {!u.active && <span className="text-[9px] text-anchor-red bg-anchor-red/10 px-1.5 py-0.5 rounded">Inactive</span>}
                    </div>
                    <p className="text-[10px] text-[var(--text3)] mt-0.5">{u.email}</p>
                    {roleInfo && <p className="text-[10px] text-[var(--text3)] mt-0.5 hidden sm:block">{roleInfo.desc}</p>}
                  </div>

                  {/* Actions — don't show for self or owner */}
                  {!isMe && !isOwner && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => handleResendCredentials(u.id)}
                        disabled={resending === u.id}
                        className="btn-ghost text-[10px] py-1"
                        title="Resend login details"
                      >
                        <Mail className="w-3 h-3" />
                        {resending === u.id ? 'Sending…' : 'Resend'}
                      </button>
                      <button
                        onClick={() => handleToggle(u.id, u.active)}
                        className={`text-[10px] px-2 py-1 rounded-lg border font-medium transition-colors
                          ${u.active
                            ? 'border-anchor-red/30 text-anchor-red hover:bg-anchor-red/10'
                            : 'border-anchor-green/30 text-anchor-green hover:bg-anchor-green/10'}`}
                      >
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Role guide */}
        <div className="card p-4">
          <p className="text-[11px] font-semibold text-[var(--text)] mb-2">Role Permissions</p>
          <div className="space-y-2">
            {[
              { role: 'Fleet Manager', color: 'text-gold', desc: 'Full access — approves estimates, views all costs, manages team, downloads reports. This is your account.' },
              ...ROLES.map(r => ({ role: r.label, color: 'text-[var(--text3)]', desc: r.desc })),
            ].map(({ role, color, desc }) => (
              <div key={role} className="flex gap-2 text-[10px]">
                <span className={`font-semibold shrink-0 w-36 ${color}`}>{role}</span>
                <span className="text-[var(--text3)]">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Add Member Modal ── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowAdd(false)}>
          <div className="card w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Add Team Member</h3>
              <button onClick={() => setShowAdd(false)}><X className="w-4 h-4 text-[var(--text3)]" /></button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="form-label">Full Name *</label>
                <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                  placeholder="e.g. Chidi Nwosu" className="form-input" autoFocus />
              </div>
              <div>
                <label className="form-label">Email Address *</label>
                <input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  type="email" placeholder="chidi@yourcompany.com" className="form-input" />
              </div>
              <div>
                <label className="form-label">Role</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="form-input">
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <p className="text-[10px] text-[var(--text3)] mt-1">
                  {ROLES.find(r => r.value === form.role)?.desc}
                </p>
              </div>

              <div className="bg-teal/10 border border-teal/20 rounded-lg px-3 py-2">
                <p className="text-[10px] text-teal">
                  A temporary password will be generated and sent to their email along with the login URL. They'll be prompted to change it on first login.
                </p>
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowAdd(false)} className="flex-1 btn-ghost justify-center py-2">Cancel</button>
                <button onClick={handleAdd} disabled={saving} className="flex-1 btn-primary justify-center py-2 disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create & Send Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Created User — Show Credentials Modal ── */}
      {createdUser && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <UserCheck className="w-5 h-5 text-anchor-green" />
              <h3 className="text-sm font-semibold text-[var(--text)]">User Created!</h3>
            </div>
            <p className="text-[11px] text-[var(--text3)] mb-3">
              Login details have been emailed to <strong className="text-[var(--text)]">{createdUser.user?.email}</strong>. You can also copy and share them manually:
            </p>

            <div className="bg-white/[0.04] border border-white/[0.08] rounded-lg p-3 space-y-2 mb-4">
              {[
                ['Login URL', createdUser.loginUrl || 'https://anchor-fleet-pro.vercel.app/login'],
                ['Email', createdUser.user?.email],
                ['Role', createdUser.user?.role?.replace(/_/g,' ')],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-[var(--text3)] w-20 shrink-0">{label}</span>
                  <span className="text-[10px] font-mono text-[var(--text)] truncate">{value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-[var(--text3)] w-20 shrink-0">Temp Password</span>
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <span className="text-[10px] font-mono text-gold font-bold tracking-wider">
                    {showPassword ? createdUser.tempPassword : '••••••••••••'}
                  </span>
                  <button onClick={() => setShowPassword(!showPassword)} className="text-[var(--text3)] shrink-0">
                    {showPassword ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => { navigator.clipboard.writeText(createdUser.tempPassword); toast.success('Password copied!'); }}
                    className="text-[9px] text-teal shrink-0 hover:underline"
                  >Copy</button>
                </div>
              </div>
            </div>

            <button onClick={() => { setCreatedUser(null); setShowPassword(false); }}
              className="w-full btn-primary justify-center py-2.5">
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
