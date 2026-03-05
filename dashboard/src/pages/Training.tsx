import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import PageHeader from '../components/ui/PageHeader';

const TIER_COLORS: Record<string, string> = {
  selfish: '#ffcc00',
  adversarial: '#ff9500',
  altruistic: '#5ac8fa',
  hyper_adversarial: '#ff3b30',
  hyper_altruistic: '#34c759',
};

interface TierSummary {
  tier: string;
  episodes: number;
  final_bot_wr: number;
  final_seat0_wr: number;
  final_loss: number;
  avg_game_length: number;
}

export default function Training() {
  const { data: tiers = [], isLoading } = useQuery<TierSummary[]>({
    queryKey: ['training-tiers'],
    queryFn: () => api.get('/api/admin/training/tiers').then((r) => r.data),
  });

  return (
    <div>
      <PageHeader
        title="Training Data"
        subtitle="View training metrics and model performance"
        actions={
          <Link
            to="/training/compare"
            className="px-4 py-2.5 bg-apple-blue hover:bg-apple-blue-hover text-white rounded-xl text-[13px] font-medium shadow-apple"
          >
            Compare All Tiers
          </Link>
        }
      />

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-apple-blue/30 border-t-apple-blue rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tiers.map((tier) => (
            <Link
              key={tier.tier}
              to={`/training/${tier.tier}`}
              className="bg-white rounded-2xl shadow-apple border border-apple-gray-200/60 p-6 hover:shadow-apple-md transition-all group"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: TIER_COLORS[tier.tier] || '#86868b' }} />
                <h3 className="text-[17px] font-semibold text-apple-gray-800 capitalize">{tier.tier.replace(/_/g, ' ')}</h3>
              </div>
              <p className="text-[12px] text-apple-gray-400 mb-4">{tier.episodes.toLocaleString()} episodes</p>

              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Bot WR', value: `${(tier.final_bot_wr * 100).toFixed(1)}%` },
                  { label: 'Seat 0 WR', value: `${(tier.final_seat0_wr * 100).toFixed(1)}%` },
                  { label: 'Final Loss', value: tier.final_loss.toFixed(3) },
                  { label: 'Avg Length', value: `${tier.avg_game_length.toFixed(0)} turns` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[11px] font-medium text-apple-gray-400 uppercase tracking-wide">{label}</p>
                    <p className="text-[15px] font-semibold text-apple-gray-700 mt-0.5">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 pt-3 border-t border-apple-gray-100 flex items-center justify-end">
                <span className="text-[12px] font-medium text-apple-blue group-hover:text-apple-blue-hover flex items-center gap-1">
                  View details
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
