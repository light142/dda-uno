import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, AreaChart, Area,
} from 'recharts';
import api from '../lib/api';
import PageHeader from '../components/ui/PageHeader';

interface MetricRow {
  episode: number;
  seat0_wr: number;
  bot_wr: number;
  loss: number;
  epsilon: number;
  avg_game_length: number;
  vd_s0: number;
  vd_s1: number;
  vd_s2: number;
  vd_s3: number;
  buffer_size: number;
}

interface TierConfig {
  learning_rate: number;
  batch_size: number;
  discount_factor: number;
  episodes: number;
  reward_params: Record<string, number>;
}

const chartStyle = {
  card: "bg-white rounded-2xl shadow-apple border border-apple-gray-200/60 p-6",
  title: "text-[17px] font-semibold text-apple-gray-800 mb-4",
};

const tooltipStyle = { contentStyle: { borderRadius: 10, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } };
const tickStyle = { fontSize: 11, fill: '#86868b' };

export default function TierDetail() {
  const { tier } = useParams<{ tier: string }>();

  const { data: metrics = [], isLoading: metricsLoading } = useQuery<MetricRow[]>({
    queryKey: ['training-metrics', tier],
    queryFn: () => api.get(`/api/admin/training/tiers/${tier}`).then((r) => r.data),
  });

  const { data: config } = useQuery<TierConfig>({
    queryKey: ['training-config', tier],
    queryFn: () => api.get(`/api/admin/training/tiers/${tier}/config`).then((r) => r.data),
  });

  const tierLabel = (tier || '').replace(/_/g, ' ');

  if (metricsLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-apple-blue/30 border-t-apple-blue rounded-full animate-spin" />
      </div>
    );
  }

  const hasVD = metrics.some((m) => m.vd_s1 > 0 || m.vd_s2 > 0);

  return (
    <div>
      <PageHeader
        title={`Training: ${tierLabel}`}
        subtitle={`${metrics.length * 1000} episodes evaluated`}
      />

      {config && (
        <div className={`${chartStyle.card} mb-5`}>
          <h2 className={chartStyle.title}>Training Configuration</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
            {[
              { label: 'Learning Rate', value: config.learning_rate },
              { label: 'Batch Size', value: config.batch_size },
              { label: 'Discount Factor', value: config.discount_factor },
              { label: 'Episodes', value: config.episodes?.toLocaleString() },
            ].map(({ label, value }) => (
              <div key={label}>
                <p className="text-[12px] font-medium text-apple-gray-400 mb-1">{label}</p>
                <p className="text-[15px] font-mono font-semibold text-apple-gray-800">{value}</p>
              </div>
            ))}
          </div>
          {config.reward_params && Object.keys(config.reward_params).length > 0 && (
            <div className="mt-5 pt-4 border-t border-apple-gray-100">
              <p className="text-[13px] font-medium text-apple-gray-600 mb-3">Reward Shaping</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(config.reward_params).map(([key, val]) => (
                  <span key={key} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-apple-gray-50 rounded-lg text-[12px]">
                    <span className="text-apple-gray-400">{key}</span>
                    <span className={`font-mono font-semibold ${val >= 0 ? 'text-apple-green' : 'text-apple-red'}`}>{val}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className={`${chartStyle.card} mb-5`}>
        <h2 className={chartStyle.title}>Win Rates Over Training</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={metrics}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
            <XAxis dataKey="episode" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={tickStyle} />
            <YAxis domain={[0, 1]} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} tick={tickStyle} />
            <Tooltip {...tooltipStyle} labelFormatter={(v) => `Episode ${v.toLocaleString()}`} formatter={(v: any) => `${(v * 100).toFixed(1)}%`} />
            <Legend />
            <Line type="monotone" dataKey="bot_wr" name="Bot WR" stroke="#0071e3" dot={false} strokeWidth={2} />
            <Line type="monotone" dataKey="seat0_wr" name="Seat 0 WR" stroke="#ff3b30" dot={false} strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className={chartStyle.card}>
          <h2 className={chartStyle.title}>DQN Loss</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
              <XAxis dataKey="episode" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => `Episode ${v.toLocaleString()}`} />
              <Line type="monotone" dataKey="loss" stroke="#ff9500" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className={chartStyle.card}>
          <h2 className={chartStyle.title}>Epsilon Schedule</h2>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
              <XAxis dataKey="episode" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={tickStyle} />
              <YAxis domain={[0, 1]} tick={tickStyle} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => `Episode ${v.toLocaleString()}`} />
              <Area type="monotone" dataKey="epsilon" stroke="#34c759" fill="#34c75920" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className={chartStyle.card}>
          <h2 className={chartStyle.title}>Average Game Length</h2>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={metrics}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
              <XAxis dataKey="episode" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={tickStyle} />
              <YAxis tick={tickStyle} />
              <Tooltip {...tooltipStyle} labelFormatter={(v) => `Episode ${v.toLocaleString()}`} />
              <Line type="monotone" dataKey="avg_game_length" name="Turns" stroke="#af52de" dot={false} strokeWidth={1.5} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {hasVD && (
          <div className={chartStyle.card}>
            <h2 className={chartStyle.title}>Voluntary Draws Per Seat</h2>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={metrics}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e8e8ed" />
                <XAxis dataKey="episode" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} tick={tickStyle} />
                <YAxis tick={tickStyle} />
                <Tooltip {...tooltipStyle} labelFormatter={(v) => `Episode ${v.toLocaleString()}`} />
                <Legend />
                <Line type="monotone" dataKey="vd_s0" name="S0" stroke="#ff3b30" dot={false} />
                <Line type="monotone" dataKey="vd_s1" name="S1" stroke="#0071e3" dot={false} />
                <Line type="monotone" dataKey="vd_s2" name="S2" stroke="#34c759" dot={false} />
                <Line type="monotone" dataKey="vd_s3" name="S3" stroke="#ff9500" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
