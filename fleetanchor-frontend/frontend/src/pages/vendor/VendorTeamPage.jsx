import React, { useState } from 'react';
import { Users, Plus, Lock, UserCheck, Zap, Wrench, AlertTriangle, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { userService } from '../../services/api';

const ROLES = [
  { value: 'FLEET_MANAGER', label: 'Fleet Manager', icon: UserCheck, desc: 'Full access: approves estimates, views costs, downloads reports, manages team.' },
  { value: 'MAINTENANCE_SUPERVISOR', label: 'Maintenance Supervisor', icon: Wrench, desc: 'Manages job tickets, can query estimates, views repair progress. Cannot export reports.' },
  { value: 'FIELD_AGENT', label: 'Field Agent', icon: Zap, desc: 'Scans VINs, views status, submits complaints. Cost data hidden. Cannot export.' },
];

const MOCK_USERS = [
  { id: '1', fullName: 'Adebayo Okafor', email: 'a.okafor@coca-cola.com', role: 'FLEET_MANAGER', active: true, isOwner: true },
  { id: '2', fullName: 'Kemi Adeyemi', email: 'k.adeyemi@coca-cola.com', role: 'FIELD_AGENT', active: true, isOwner: false },
];

export default function VendorTeamPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState(MOCK_USERS);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', role: 'FIELD_AGENT' });
  const [loading, setLoading] = useState(false);

  const planLimit = 2;
  const activeCount = users.filter(u => u.active).length;
  const atLimit = activeCount >= planLimit;

  const handleAdd = async () => {
    if (!form.fullName || !form.email) { toast.error('Fill all fields'); return; }
    if (atLimit) { toast.error('Upgrade plan to add more users'); navigate('/vendor/subscription'); return; }
    setLoading(true);
    try {
      // await userService.create({ ...form, password: 'TempPass@' + Math.random().toString(36).slice(2, 8) });
      setUsers(prev => [...prev, { id: Date.now().toString(), ...form, active: true, isOwner: false }]);
      setShowAdd(false);
      setForm({ fullName: '', email: '', role: 'FIELD_AGENT' });
      toast.success('Team member added. Welcome email sent.');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to add user';
      if (err.response?.data?.upgradeRequired) {
        toast.error('Growth plan limit reached. Upgrade to continue.');
        navigate('/vendor/subscription');
      } else toast.error(msg);
    } finally { setLoading(false); }
  };

  const toggleSuspend = (id) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, active: !u.active } : u));
    toast.success('User status updated');
  };

  return (
    <div>
      <div className="page-header">
        <h1 className="text-sm font-semibold text-[var(--text)]">Team Members</h1>
        <button onClick={() => atLimit ? (toast.error('Upgrade plan to add more users'), navigate('/vendor/subscription')) : setShowAdd(true)} className="btn-primary">
          <Plus className="w-3.5 h-3.5" /> Add User
        </button>
      </div>

      <div className="p-5">
        {/* Plan cap warning */}
        <div className={`flex items-center gap-2 rounded-xl p-3 mb-4 text-xs ${atLimit ? 'bg-anchor-red/10 border border-anchor-red/20 text-anchor-red' : 'bg-white/[0.04] border border-white/[0.08] text-[var(--text3)]'}`}>
          <Lock className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Growth plan: <strong>{activeCount}/{planLimit}</strong> users. {atLimit ? 'Upgrade to Enterprise for unlimited seats.' : `${planLimit - activeCount} slot${planLimit - activeCount !== 1 ? 's' : ''} remaining.`}</span>
          {atLimit && <button onClick={() => navigate('/vendor/subscription')} className="ml-auto btn-teal text-[10px] py-1">Upgrade</button>}
        </div>

        {/* User list */}
        <div className="space-y-2 mb-6">
          {users.map(user => {
            const role = ROLES.find(r => r.value === user.role);
            return (
              <div key={user.id} className={`card px-4 py-3 flex items-center gap-3 ${!user.active ? 'opacity-50' : ''}`}>
                <div className="w-8 h-8 rounded-full bg-teal/20 flex items-center justify-center text-xs font-bold text-teal flex-shrink-0">
                  {user.fullName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[var(--text)] truncate">{user.fullName}</span>
                    {user.isOwner && <span className="pill bg-teal/10 text-teal text-[9px]">Owner</span>}
                    {!user.active && <span className="pill pill-suspended text-[9px]">Suspended</span>}
                  </div>
                  <div className="text-[10px] text-[var(--text3)]">{user.email}</div>
                </div>
                <span className="pill pill-active text-[9px]">{role?.label || user.role.replace(/_/g, ' ')}</span>
                {!user.isOwner && (
                  <button onClick={() => toggleSuspend(user.id)} className={user.active ? 'btn-danger text-[10px] py-1' : 'btn-success text-[10px] py-1'}>
                    {user.active ? 'Suspend' : 'Reinstate'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Role guide */}
        <div>
          <h2 className="section-title mb-3">Role permissions</h2>
          <div className="grid grid-cols-3 gap-3">
            {ROLES.map(({ value, label, icon: Icon, desc }) => (
              <div key={value} className="panel">
                <div className="flex items-center gap-2 mb-2">
                  <Icon className="w-4 h-4 text-gold" />
                  <span className="text-xs font-semibold text-[var(--text)]">{label}</span>
                </div>
                <p className="text-[10px] text-[var(--text3)] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Add user modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-navy-2 border border-white/[0.12] rounded-2xl p-5 w-full max-w-sm animate-slide-in">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-[var(--text)]">Add Team Member</h3>
                <button onClick={() => setShowAdd(false)} className="text-[var(--text3)] hover:text-[var(--text)]"><X className="w-4 h-4" /></button>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="form-label">Full Name</label>
                  <input value={form.fullName} onChange={e => setForm(p => ({ ...p, fullName: e.target.value }))} placeholder="e.g. Tolu Eze" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Email Address</label>
                  <input value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} type="email" placeholder="tolu@company.com" className="form-input" />
                </div>
                <div>
                  <label className="form-label">Role</label>
                  <select value={form.role} onChange={e => setForm(p => ({ ...p, role: e.target.value }))} className="form-input">
                    <option value="FIELD_AGENT">Field Agent</option>
                    <option value="MAINTENANCE_SUPERVISOR">Maintenance Supervisor</option>
                    <option value="FLEET_MANAGER">Fleet Manager</option>
                  </select>
                </div>
                <div className="bg-gold/8 border border-gold/20 rounded-lg p-2.5 text-[10px] text-gold flex items-start gap-1.5">
                  <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                  A temporary password will be emailed to the new user. They must change it on first login.
                </div>
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowAdd(false)} className="flex-1 btn-ghost justify-center">Cancel</button>
                  <button onClick={handleAdd} disabled={loading} className="flex-1 btn-primary justify-center disabled:opacity-50">
                    {loading ? 'Adding...' : 'Add Member'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
