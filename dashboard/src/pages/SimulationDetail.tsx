import React, { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
} from 'recharts';
import api from '../lib/api';
import { useSSE } from '../hooks/useSSE';
import PageHeader from '../components/ui/PageHeader';
import StatCard from '../components/ui/StatCard';

const TIER_COLORS: Record<string, string> = {
  hyper_adversarial: '#ff3b30',
  adversarial: '#ff9500',
  selfish: '#ffcc00',
  random: '#86868b',
  altruistic: '#5ac8fa',
  hyper_altruistic: '#34c759',
};

const chartStyle = {
  card: "bg-white rounded-2xl shadow-apple border border-apple-gray-200/60 p-6",
  title: "text-[17px] font-semibold text-apple-gray-800 mb-4",
};

export default function SimulationDetail() {
  const { id } = useParams<{ id: string }>();
  const [liveData, setLiveData] = useState<any[]>([]);

  const { data: simulation, isLoading } = useQuery({
    queryKey: ['simulation', id],
    queryFn: () => api.get(`/api/admin/simulations/${id}`).then((r) => r.data),
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 3000 : false,
  });

  const onProgress = useCallback((data: any) => {
    setLiveData((prev) => [...prev, data]);
  }, []);

  const onComplete = useCallback(() => {
    setLiveData([]);
  }, []);

  const { connected } = useSSE(
    simulation?.status === 'running' ? id! : null,
    { onProgress, onComplete }
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-apple-blue/30 border-t-apple-blue rounded-full animate-spin" />
      </div>
    );
  }
  if (!simulation) return <p className="text-apple-red p-6">Simulation not found</p>;

  const result = simulation.result;
  const isAdaptive = simulation.mode === 'adaptive';
  const wrTrajectory = result?.wr_trajectory || [];
  const tierUsage = result?.tier_usage || {};
  const tierWinRates = result?.tier_seat0_win_rates || {};

  const trajectoryData = wrTrajectory.map((wr: number, i: number) => ({
    game: i + 1,
    winRate: wr,
    target: result?.metadata?.target_win_rate,
  }));

  const tierBarData = Object.entries(tierUsage).map(([tier, count]) => ({
    tier,
    count: count as number,
    winRate: tierWinRates[tier] ?? 0,
  }));

  const tierWrData = Object.entries(tierWinRates)
    .filter(([, v]) => v != null)
    .map(([tier, wr]) => ({
      tier: tier.replace('hyper_', 'h_'),
      fullTier: tier,
      winRate: +((wr as number) * 100).toFixed(1),
    }));

  const liveChartData = liveData.map((d, i) => ({
    game: d.game || i,
    winRate: d.win_rate,
  }));

  const tooltipStyle = { contentStyle: { borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } };

  return (
    <div>
      <PageHeader
        title={`Simulation: ${simulation.mode}`}
        subtitle={`s0=${simulation.config?.seat0} \u00b7 ${simulation.games_total} games`}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Status"
          value={simulation.status}
          color={simulation.status === 'completed' ? 'green' : simulation.status === 'running' ? 'blue' : 'orange'}
        />
        <StatCard label="Progress" value={`${simulation.games_done}/${simulation.games_total}`} color="indigo" />
        {result && (
          <>
            <StatCard
              label="Final Win Rate"
              value={`${(result.final_win_rate * 100).toFixed(1)}%`}
              color={Math.abs(result.final_error) < 0.03 ? 'green' : 'red'}
            />
            <StatCard
              label="Converged"
              value={result.convergence?.converged ? `Game ${result.convergence.game}` : 'No'}
              color={result.convergence?.converged ? 'green' : 'orange'}
            />
          </>
        )}
      </div>

      {connected && liveChartData.length > 0 && (
        <div className={`${chartStyle.card} mb-6`}>
          <h2 className={chartStyle.title}>
            Live Progress
            <span className="ml-2 inline-block w-2 h-2 bg-apple-green rounded-full animate-pulse" />
          </h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={liveChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
              <XAxis dataKey="game" tick={{ fontSize: 11, fill: '#86868b' }} />
              <YAxis domain={[0, 0.6]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: '#86868b' }} />
              <Tooltip {...tooltipStyle} formatter={(v: any) => `${(v * 100).toFixed(2)}%`} />
              <Line type="monotone" dataKey="winRate" stroke="#0071e3" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {result && (
        <div className="space-y-5">
          {isAdaptive && trajectoryData.length > 0 && (
            <div className={chartStyle.card}>
              <h2 className={chartStyle.title}>Win Rate Convergence</h2>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={trajectoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
                  <XAxis dataKey="game" tick={{ fontSize: 11, fill: '#86868b' }} />
                  <YAxis domain={[0, 0.6]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: '#86868b' }} />
                  <Tooltip {...tooltipStyle} formatter={(v: any) => `${(v * 100).toFixed(2)}%`} />
                  <Legend />
                  <Line type="monotone" dataKey="winRate" name="Win Rate" stroke="#0071e3" dot={false} strokeWidth={2} />
                  <Line type="monotone" dataKey="target" name="Target" stroke="#ff3b30" dot={false} strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {isAdaptive && wrTrajectory.length > 0 && (
            <div className={chartStyle.card}>
              <h2 className={chartStyle.title}>Error Over Time</h2>
              <ResponsiveContainer width="100%" height={250}>
                <AreaChart data={wrTrajectory.map((wr: number, i: number) => ({
                  game: i + 1,
                  error: wr - (result.metadata?.target_win_rate ?? 0),
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
                  <XAxis dataKey="game" tick={{ fontSize: 11, fill: '#86868b' }} />
                  <YAxis tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={{ fontSize: 11, fill: '#86868b' }} />
                  <Tooltip {...tooltipStyle} formatter={(v: any) => `${(v * 100).toFixed(2)}%`} />
                  <Area type="monotone" dataKey="error" stroke="#5856d6" fill="#5856d620" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {tierBarData.length > 0 && (
              <div className={chartStyle.card}>
                <h2 className={chartStyle.title}>Tier Usage</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={tierBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
                    <XAxis dataKey="tier" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 10, fill: '#86868b' }} />
                    <YAxis tick={{ fontSize: 11, fill: '#86868b' }} />
                    <Tooltip {...tooltipStyle} />
                    <Bar dataKey="count" name="Games" radius={[6, 6, 0, 0]}>
                      {tierBarData.map((entry) => (
                        <rect key={entry.tier} fill={TIER_COLORS[entry.tier] || '#86868b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {tierWrData.length > 0 && (
              <div className={chartStyle.card}>
                <h2 className={chartStyle.title}>Tier Win Rates (Seat 0)</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={tierWrData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
                    <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#86868b' }} />
                    <YAxis type="category" dataKey="tier" width={60} tick={{ fontSize: 10, fill: '#86868b' }} />
                    <Tooltip {...tooltipStyle} formatter={(v: any) => `${v}%`} />
                    <Bar dataKey="winRate" name="Seat 0 WR" radius={[0, 6, 6, 0]}>
                      {tierWrData.map((entry) => (
                        <rect key={entry.fullTier} fill={TIER_COLORS[entry.fullTier] || '#86868b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {!isAdaptive && result.win_rates && (
            <div className={chartStyle.card}>
              <h2 className={chartStyle.title}>Per-Seat Win Rates</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={Object.entries(result.win_rates).map(([seat, wr]) => ({
                  seat: `Seat ${seat.replace('s', '')}`,
                  winRate: ((wr as number) * 100),
                  label: result.seats?.[seat] || seat,
                }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#86868b' }} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#86868b' }} />
                  <Tooltip {...tooltipStyle} formatter={(v: any) => `${v.toFixed(1)}%`} />
                  <Bar dataKey="winRate" fill="#0071e3" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {result.stats && (
            <div className={chartStyle.card}>
              <h2 className={chartStyle.title}>Game Statistics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { label: 'Avg Game Length', value: `${result.stats.game_length?.mean?.toFixed(1)} turns` },
                  { label: 'Median Game Length', value: `${result.stats.game_length?.median} turns` },
                  { label: 'Avg Win Margin', value: `${result.stats.win_margin?.mean?.toFixed(1)} cards` },
                  { label: 'Game Length Range', value: `${result.stats.game_length?.min} - ${result.stats.game_length?.max}` },
                ].map(({ label, value }) => (
                  <div key={label}>
                    <p className="text-[12px] font-medium text-apple-gray-400 mb-1">{label}</p>
                    <p className="text-[16px] font-semibold text-apple-gray-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
