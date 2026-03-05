import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';

export default function Dashboard() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api.get('/api/admin/stats').then((r) => r.data),
  });

  return (
    <div>
      <PageHeader title="Dashboard" subtitle="Dynamic Difficulty Adjustment in Multiplayer Card Games Using Multi-Agent Reinforcement Learning" />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-apple-blue/30 border-t-apple-blue rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Players" value={stats?.total_players ?? '-'} color="blue" />
            <StatCard label="Total Games" value={stats?.total_games ?? '-'} color="indigo" />
            <StatCard
              label="Avg Win Rate"
              value={stats?.avg_win_rate ? `${(stats.avg_win_rate * 100).toFixed(1)}%` : '-'}
              color="green"
            />
            <StatCard label="Simulations" value={stats?.total_simulations ?? '-'} color="orange" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white rounded-2xl shadow-apple p-6 border border-apple-gray-200/60">
              <h2 className="text-[17px] font-semibold text-apple-gray-800 mb-4">Quick Actions</h2>
              <div className="space-y-1">
                {[
                  { to: '/simulations', label: 'Run a new simulation', desc: 'Test adaptive difficulty with different configurations' },
                  { to: '/training', label: 'View training data', desc: 'Explore model performance across all tiers' },
                ].map(({ to, label, desc }) => (
                  <Link
                    key={to}
                    to={to}
                    className="flex items-center justify-between p-3 -mx-1 rounded-xl hover:bg-apple-gray-50 group"
                  >
                    <div>
                      <p className="text-[14px] font-medium text-apple-blue group-hover:text-apple-blue-hover">{label}</p>
                      <p className="text-[12px] text-apple-gray-400 mt-0.5">{desc}</p>
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-apple-gray-300 group-hover:text-apple-gray-400">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-apple p-6 border border-apple-gray-200/60">
              <h2 className="text-[17px] font-semibold text-apple-gray-800 mb-4">Tier Distribution</h2>
              {stats?.tier_distribution ? (
                <div className="space-y-3">
                  {Object.entries(stats.tier_distribution).map(([tier, count]) => {
                    const total = Object.values(stats.tier_distribution as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
                    const pct = total > 0 ? ((count as number) / total) * 100 : 0;
                    return (
                      <div key={tier}>
                        <div className="flex justify-between text-[13px] mb-1">
                          <span className="font-medium text-apple-gray-600 capitalize">{tier.replace(/_/g, ' ')}</span>
                          <span className="text-apple-gray-400">{count as number} games</span>
                        </div>
                        <div className="h-2 bg-apple-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-apple-blue rounded-full transition-all duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-[14px] text-apple-gray-400">No data yet</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
