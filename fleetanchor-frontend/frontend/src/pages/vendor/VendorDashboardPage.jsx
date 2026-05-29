import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Truck, Wrench, CheckCircle, AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import { useAuthStore } from '../../context/authStore';
import { vehicleService, jobService, subscriptionService } from '../../services/api';

export default function VendorDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const fmt = n => `₦${Number(n || 0).toLocaleString()}`;

  const [stats, setStats] = useState({ vehicles: 0, openJobs: 0, inRepair: 0, ytdSpend: 0 });
  const [recentJobs, setRecentJobs] = useState([]);
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // All 3 requests fire in parallel — don't await one by one
      const [vehiclesRes, jobsRes, subRes] = await Promise.allSettled([
        vehicleService.list({ limit: 5 }),
        jobService.list({ limit: 5, sort: 'createdAt_desc' }),
        user?.vendorId ? subscriptionService.getForVendor(user.vendorId) : Promise.resolve(null),
      ]);

      const vehicles = vehiclesRes.status === 'fulfilled' ? vehiclesRes.value.data?.data || [] : [];
      const jobs = jobsRes.status === 'fulfilled' ? jobsRes.value.data?.data || [] : [];
      const subscription = subRes?.status === 'fulfilled' ? subRes.value?.data?.data : null;

      const inRepair = vehicles.filter(v => v.status === 'IN_REPAIR').length;
      const openJobs = jobs.filter(j => ['PENDING','ASSIGNED','IN_PROGRESS'].includes(j.status)).length;

      setStats({
        vehicles: vehiclesRes.status === 'fulfilled' ? (vehiclesRes.value.data?.total || vehicles.length) : 0,
        openJobs,
        inRepair,
        ytdSpend: 0,
      });
      setRecentJobs(jobs.slice(0, 5));
      setSub(subscription);
    } catch { /* silently fail — show zeros */ }
    finally { setLoading(false); }
  }, [user?.vendorId]);

  useEffect(() => { load(); }, [load]);

  const trialDays = sub?.daysLeft ?? (sub?.expiryDate
    ? Math.max(0, Math.ceil((new Date(sub.expiryDate) - Date.now()) / 86400000)) : null);

  const PRIORITY_COLORS = {
    CRITICAL: 'text-anchor-red', HIGH: 'text-gold',
    NORMAL: 'text-teal', LOW: 'text-anchor-green',
  };
  const STATUS_LABELS = {
    PENDING: '⏳ Pending', ASSIGNED: '👤 Assigned',
    IN_PROGRESS: '🔧 In Progress', COMPLETED: '✅ Done', CANCELLED: '✖ Cancelled',
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="text-sm font-semibold text-[var(--text)]">Fleet Overview</h1>
          <p className="text-[10px] text-[var(--text3)]">
            Welcome back, {user?.fullName?.split(' ')[0] || 'Fleet Manager'}
          </p>
        </div>
        <button onClick={() => navigate('/vendor/jobs')} className="btn-primary">
          <Wrench className="w-3.5 h-3.5" />New Job Request
        </button>
      </div>

      <div className="p-5 space-y-4">

        {/* Trial / subscription banner */}
        {sub?.status === 'TRIAL' && trialDays !== null && trialDays <= 10 && (
          <div className="flex items-center gap-3 bg-gold/10 border border-gold/20 rounded-xl px-4 py-2.5">
            <Clock className="w-4 h-4 text-gold shrink-0" />
            <p className="text-xs text-gold flex-1">
              <strong>{trialDays} days</strong> left on your free trial.
            </p>
            <button onClick={() => navigate('/vendor/subscription')}
              className="text-[10px] font-bold text-navy bg-gold px-2.5 py-1 rounded-lg shrink-0">
              Upgrade
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'My Fleet', value: loading ? '—' : stats.vehicles, sub: 'vehicles', icon: Truck, color: 'text-teal', onClick: () => navigate('/vendor/vehicles') },
            { label: 'Open Jobs', value: loading ? '—' : stats.openJobs, sub: 'need attention', icon: Wrench, color: 'text-gold', onClick: () => navigate('/vendor/jobs') },
            { label: 'In Repair', value: loading ? '—' : stats.inRepair, sub: 'vehicles down', icon: AlertTriangle, color: 'text-anchor-red' },
            { label: 'YTD Spend', value: loading ? '—' : fmt(stats.ytdSpend), sub: 'this year', icon: CheckCircle, color: 'text-anchor-green' },
          ].map(({ label, value, sub: subLabel, icon: Icon, color, onClick }) => (
            <div key={label} className={`stat-card ${onClick ? 'cursor-pointer hover:border-white/20' : ''}`} onClick={onClick}>
              <div className="flex items-center gap-1.5 mb-2">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-[9px] uppercase tracking-wider text-[var(--text3)]">{label}</span>
              </div>
              <div className={`text-2xl font-bold leading-none mb-1 ${color}`}>{value}</div>
              <div className="text-[10px] text-[var(--text3)]">{subLabel}</div>
            </div>
          ))}
        </div>

        {/* Recent jobs */}
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-[var(--text)]">Recent Job Requests</h2>
            <button onClick={() => navigate('/vendor/jobs')}
              className="flex items-center gap-1 text-[10px] text-teal hover:underline">
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {loading ? (
            <div className="text-xs text-[var(--text3)] py-4 text-center">Loading…</div>
          ) : recentJobs.length === 0 ? (
            <div className="text-center py-6">
              <Wrench className="w-6 h-6 text-[var(--text3)] mx-auto mb-2" />
              <p className="text-xs text-[var(--text3)]">No job requests yet.</p>
              <button onClick={() => navigate('/vendor/jobs')} className="btn-primary mt-3 text-xs py-1.5">
                Create your first request
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {recentJobs.map(job => (
                <div key={job.id} className="flex items-center gap-3 bg-white/[0.03] border border-white/[0.05] rounded-lg px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-[var(--text)]">
                        {job.jobNumber || job.id?.slice(0,8)}
                      </span>
                      <span className="text-[10px] text-[var(--text3)]">
                        {job.vehicle?.plateNumber || '—'}
                      </span>
                      <span className={`text-[10px] font-medium ${PRIORITY_COLORS[job.priority] || 'text-[var(--text3)]'}`}>
                        {job.priority}
                      </span>
                    </div>
                    <p className="text-[10px] text-[var(--text3)] mt-0.5 truncate">{job.description || job.category}</p>
                  </div>
                  <span className="text-[10px] text-[var(--text3)] shrink-0">
                    {STATUS_LABELS[job.status] || job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
