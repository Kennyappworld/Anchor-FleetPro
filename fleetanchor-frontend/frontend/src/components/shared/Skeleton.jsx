import React from 'react';

// Pulse skeleton for content loading
export function Skeleton({ className = '', ...props }) {
  return (
    <div
      className={`animate-pulse bg-white/[0.06] rounded ${className}`}
      {...props}
    />
  );
}

// Full page loading spinner (shown during lazy-loaded route transitions)
export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-navy">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-gold border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-[11px] text-[var(--text3)]">Loading…</p>
      </div>
    </div>
  );
}

// Stats card skeleton
export function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="stat-card">
          <Skeleton className="h-3 w-16 mb-3" />
          <Skeleton className="h-7 w-12 mb-2" />
          <Skeleton className="h-2.5 w-20" />
        </div>
      ))}
    </div>
  );
}

// Table row skeleton
export function TableSkeleton({ rows = 5, cols = 5 }) {
  return (
    <>
      {[...Array(rows)].map((_, i) => (
        <tr key={i} className="border-t border-white/[0.04]">
          {[...Array(cols)].map((_, j) => (
            <td key={j} className="px-3 py-2.5">
              <Skeleton className={`h-3 ${j === 0 ? 'w-28' : j === cols - 1 ? 'w-12' : 'w-16'}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
