import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api from '../lib/api';
import PageHeader from '../components/ui/PageHeader';

const MODE_OPTIONS = ['single', 'adaptive'];
const AGENT_CHOICES = [
  'random', 'rule-v1', 'noob', 'casual', 'pro',
  'selfish', 'adversarial', 'altruistic',
  'hyper_adversarial', 'hyper_altruistic',
];

interface Simulation {
  id: string;
  mode: string;
  status: string;
  config: any;
  games_total: number;
  games_done: number;
  final_win_rate?: number;
  created_at: string;
}

const statusStyles: Record<string, string> = {
  pending: 'bg-apple-gray-100 text-apple-gray-500',
  running: 'bg-blue-50 text-apple-blue',
  completed: 'bg-green-50 text-apple-green',
  failed: 'bg-red-50 text-apple-red',
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[12px] font-medium ${statusStyles[status] || statusStyles.pending}`}>
      {status === 'running' && <span className="w-1.5 h-1.5 bg-apple-blue rounded-full animate-pulse" />}
      {status}
    </span>
  );
}

function NewSimulationDialog({ onClose }: { onClose: () => void }) {
  const [mode, setMode] = useState('adaptive');
  const [seat0, setSeat0] = useState('casual');
  const [seats, setSeats] = useState(['selfish', 'selfish', 'selfish']);
  const [games, setGames] = useState(1000);
  const [targetWr, setTargetWr] = useState(0.25);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const startMutation = useMutation({
    mutationFn: (config: any) => api.post('/api/admin/simulations', config).then((r) => r.data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['simulations'] });
      navigate(`/simulations/${data.id}`);
    },
  });

  const handleStart = () => {
    const config: any = { mode, seat0, games };
    if (mode === 'adaptive') {
      config.target_win_rate = targetWr;
    } else {
      config.seat1 = seats[0];
      config.seat2 = seats[1];
      config.seat3 = seats[2];
    }
    startMutation.mutate(config);
  };

  const selectClass = "w-full px-3 py-2.5 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-[14px] text-apple-gray-800 focus:outline-none focus:ring-2 focus:ring-apple-blue/30 focus:border-apple-blue appearance-none";
  const labelClass = "block text-[13px] font-medium text-apple-gray-600 mb-1.5";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-apple-lg p-7 w-full max-w-md border border-apple-gray-200/60" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-[20px] font-semibold text-apple-gray-800 mb-5">New Simulation</h2>

        <div className="space-y-4">
          <div>
            <label className={labelClass}>Mode</label>
            <select value={mode} onChange={(e) => setMode(e.target.value)} className={selectClass}>
              {MODE_OPTIONS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className={labelClass}>Seat 0 (Player)</label>
            <select value={seat0} onChange={(e) => setSeat0(e.target.value)} className={selectClass}>
              {AGENT_CHOICES.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {mode === 'single' && [0, 1, 2].map((i) => (
            <div key={i}>
              <label className={labelClass}>Seat {i + 1} (Bot)</label>
              <select
                value={seats[i]}
                onChange={(e) => { const next = [...seats]; next[i] = e.target.value; setSeats(next); }}
                className={selectClass}
              >
                {AGENT_CHOICES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          ))}

          {mode === 'adaptive' && (
            <div>
              <label className={labelClass}>Target Win Rate: {(targetWr * 100).toFixed(0)}%</label>
              <input
                type="range"
                min="0.20" max="0.60" step="0.01"
                value={targetWr}
                onChange={(e) => setTargetWr(parseFloat(e.target.value))}
                className="w-full accent-apple-blue"
              />
            </div>
          )}

          <div>
            <label className={labelClass}>Games</label>
            <input
              type="number"
              value={games}
              onChange={(e) => setGames(parseInt(e.target.value) || 100)}
              min={100} max={50000}
              className="w-full px-3 py-2.5 bg-apple-gray-50 border border-apple-gray-200 rounded-xl text-[14px] text-apple-gray-800 focus:outline-none focus:ring-2 focus:ring-apple-blue/30 focus:border-apple-blue"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleStart}
            disabled={startMutation.isPending}
            className="flex-1 py-2.5 bg-apple-blue hover:bg-apple-blue-hover disabled:opacity-40 text-white rounded-xl font-medium text-[14px]"
          >
            {startMutation.isPending ? 'Starting...' : 'Start Simulation'}
          </button>
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-apple-gray-100 hover:bg-apple-gray-200 text-apple-gray-600 rounded-xl font-medium text-[14px]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Simulations() {
  const [showNew, setShowNew] = useState(false);
  const queryClient = useQueryClient();

  const { data: simulations = [], isLoading } = useQuery<Simulation[]>({
    queryKey: ['simulations'],
    queryFn: () => api.get('/api/admin/simulations').then((r) => r.data),
    refetchInterval: 5000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/admin/simulations/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['simulations'] }),
  });

  return (
    <div>
      <PageHeader
        title="Simulations"
        subtitle="Run and manage simulation experiments"
        actions={
          <button
            onClick={() => setShowNew(true)}
            className="px-4 py-2.5 bg-apple-blue hover:bg-apple-blue-hover text-white rounded-xl text-[13px] font-medium shadow-apple"
          >
            New Simulation
          </button>
        }
      />

      {showNew && <NewSimulationDialog onClose={() => setShowNew(false)} />}

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-apple-blue/30 border-t-apple-blue rounded-full animate-spin" />
        </div>
      ) : simulations.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-apple border border-apple-gray-200/60 p-12 text-center">
          <p className="text-apple-gray-400 text-[15px]">No simulations yet</p>
          <p className="text-apple-gray-300 text-[13px] mt-1">Click "New Simulation" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {simulations.map((sim) => (
            <div
              key={sim.id}
              className="bg-white rounded-2xl shadow-apple border border-apple-gray-200/60 p-5 hover:shadow-apple-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div>
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="text-[15px] font-semibold text-apple-gray-800 capitalize">{sim.mode}</span>
                      <StatusBadge status={sim.status} />
                    </div>
                    <p className="text-[12px] text-apple-gray-400">
                      s0={sim.config?.seat0}
                      {sim.mode === 'adaptive' && ` \u00b7 target=${((sim.config?.target_win_rate ?? 0) * 100).toFixed(0)}%`}
                      {' \u00b7 '}{new Date(sim.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-3">
                    <div className="w-24 h-1.5 bg-apple-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-apple-blue rounded-full transition-all"
                        style={{ width: `${(sim.games_done / sim.games_total) * 100}%` }}
                      />
                    </div>
                    <span className="text-[12px] text-apple-gray-400 tabular-nums w-20 text-right">
                      {sim.games_done}/{sim.games_total}
                    </span>
                  </div>

                  {sim.final_win_rate != null && (
                    <span className="text-[14px] font-semibold text-apple-gray-800 tabular-nums">
                      {(sim.final_win_rate * 100).toFixed(1)}%
                    </span>
                  )}

                  <div className="flex items-center gap-2">
                    <Link
                      to={`/simulations/${sim.id}`}
                      className="px-3 py-1.5 text-[12px] font-medium text-apple-blue hover:bg-blue-50 rounded-lg"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => { if (window.confirm('Delete this simulation?')) deleteMutation.mutate(sim.id); }}
                      className="px-3 py-1.5 text-[12px] font-medium text-apple-red hover:bg-red-50 rounded-lg"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
