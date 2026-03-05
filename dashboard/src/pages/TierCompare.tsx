import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
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

interface MetricRow {
  episode: number;
  bot_wr: number;
  seat0_wr: number;
  loss: number;
}

const chartStyle = {
  card: "bg-white rounded-2xl shadow-apple border border-apple-gray-200/60 p-6",
  title: "text-[17px] font-semibold text-apple-gray-800 mb-4",
};

const tooltipStyle = { contentStyle: { borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } };
const tickStyle = { fontSize: 11, fill: '#86868b' };

export default function TierCompare() {
  const { data: tiers = [] } = useQuery<TierSummary[]>({
    queryKey: ['training-tiers'],
    queryFn: () => api.get('/api/admin/training/tiers').then((r) => r.data),
  });

  const tierNames = tiers.map((t) => t.tier);
  const { data: allMetrics = {} } = useQuery<Record<string, MetricRow[]>>({
    queryKey: ['training-all-metrics', tierNames],
    queryFn: async () => {
      const results: Record<string, MetricRow[]> = {};
      for (const name of tierNames) {
        const { data } = await api.get(`/api/admin/training/tiers/${name}`);
        results[name] = data;
      }
      return results;
    },
    enabled: tierNames.length > 0,
  });

  const perfData = tiers.map((t) => ({
    tier: t.tier.replace('hyper_', 'h_'),
    fullTier: t.tier,
    botWR: +(t.final_bot_wr * 100).toFixed(1),
    seat0WR: +(t.final_seat0_wr * 100).toFixed(1),
  }));

  const gameLenData = tiers.map((t) => ({
    tier: t.tier.replace('hyper_', 'h_'),
    avgLength: +t.avg_game_length.toFixed(0),
  }));

  const maxEpisodes = Math.max(...Object.values(allMetrics).map((m) => m.length), 0);
  const learningData = Array.from({ length: maxEpisodes }, (_, i) => {
    const point: any = { episode: (i + 1) * 1000 };
    for (const [name, rows] of Object.entries(allMetrics)) {
      if (i < rows.length) {
        point[name] = +(rows[i].bot_wr * 100).toFixed(1);
      }
    }
    return point;
  });

  return (
    <div>
      <PageHeader title="Tier Comparison" subtitle="Compare all tiers side-by-side" />

      <div className={`${chartStyle.card} mb-5`}>
        <h2 className={chartStyle.title}>Final Performance</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={perfData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
            <XAxis dataKey="tier" tick={tickStyle} />
            <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={tickStyle} />
            <Tooltip {...tooltipStyle} formatter={(v: any) => `${v}%`} />
            <Legend />
            <Bar dataKey="botWR" name="Bot Win Rate" fill="#0071e3" radius={[6, 6, 0, 0]} />
            <Bar dataKey="seat0WR" name="Seat 0 Win Rate" fill="#ff3b30" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {learningData.length > 0 && (
        <div className={`${chartStyle.card} mb-5`}>
          <h2 className={chartStyle.title}>Learning Speed (Bot WR)</h2>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={learningData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
              <XAxis dataKey="episode" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={tickStyle} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={tickStyle} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => `Episode ${v.toLocaleString()}`} formatter={(v: any) => `${v}%`} />
              <Legend />
              {Object.keys(allMetrics).map((name) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={TIER_COLORS[name] || '#86868b'}
                  dot={false}
                  strokeWidth={2}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className={chartStyle.card}>
        <h2 className={chartStyle.title}>Average Game Length</h2>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={gameLenData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
            <XAxis dataKey="tier" tick={tickStyle} />
            <YAxis tick={tickStyle} />
            <Tooltip {...tooltipStyle} />
            <Bar dataKey="avgLength" name="Avg Turns" radius={[6, 6, 0, 0]}>
              {gameLenData.map((_, i) => (
                <rect key={i} fill={TIER_COLORS[tiers[i]?.tier] || '#86868b'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
