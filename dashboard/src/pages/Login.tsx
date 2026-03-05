import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function CardNetwork() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let animId: number;
    let width = 0;
    let height = 0;

    const UNO_COLORS = ['#ff3b30', '#0071e3', '#34c759', '#ffcc00'];

    interface Node {
      x: number; y: number; vx: number; vy: number;
      radius: number; color: string; pulse: number; pulseSpeed: number;
    }

    const nodes: Node[] = [];

    function resize() {
      width = canvas!.width = window.innerWidth;
      height = canvas!.height = window.innerHeight;
    }

    function init() {
      resize();
      nodes.length = 0;
      for (let i = 0; i < 40; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.4,
          vy: (Math.random() - 0.5) * 0.4,
          radius: Math.random() * 2 + 1.5,
          color: UNO_COLORS[Math.floor(Math.random() * UNO_COLORS.length)],
          pulse: Math.random() * Math.PI * 2,
          pulseSpeed: 0.01 + Math.random() * 0.02,
        });
      }
    }

    function draw() {
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 180) {
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(255,255,255,${(1 - dist / 180) * 0.12})`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
          }
        }
      }

      for (const n of nodes) {
        n.pulse += n.pulseSpeed;
        const glow = 0.4 + Math.sin(n.pulse) * 0.25;

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius + Math.sin(n.pulse) * 0.5, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = glow;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 3, 0, Math.PI * 2);
        ctx.fillStyle = n.color;
        ctx.globalAlpha = glow * 0.08;
        ctx.fill();

        ctx.globalAlpha = 1;

        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
      }

      animId = requestAnimationFrame(draw);
    }

    init();
    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />;
}

function FloatingCard({ color, value, style }: { color: string; value: string; style: React.CSSProperties }) {
  return (
    <div
      className="absolute w-14 h-20 rounded-xl shadow-lg flex items-center justify-center text-white font-bold text-lg select-none"
      style={{ background: color, opacity: 0.12, ...style }}
    >
      {value}
    </div>
  );
}

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const ok = await login(password);
    setLoading(false);
    if (ok) {
      navigate('/');
    } else {
      setError('Invalid password');
      setShake(true);
      setTimeout(() => setShake(false), 500);
    }
  };

  const floatingCards = [
    { color: '#ff3b30', value: '7', top: '12%', left: '8%', rotate: '-15deg', delay: '0s' },
    { color: '#0071e3', value: '+2', top: '18%', right: '12%', rotate: '12deg', delay: '1s' },
    { color: '#34c759', value: '4', bottom: '20%', left: '6%', rotate: '20deg', delay: '2s' },
    { color: '#ffcc00', value: 'R', bottom: '15%', right: '10%', rotate: '-10deg', delay: '0.5s' },
    { color: '#af52de', value: 'W', top: '45%', left: '3%', rotate: '8deg', delay: '1.5s' },
    { color: '#ff9500', value: '0', top: '40%', right: '5%', rotate: '-20deg', delay: '2.5s' },
  ];

  return (
    <div
      className="min-h-screen flex items-center justify-center overflow-hidden relative"
      style={{ background: 'linear-gradient(135deg, #0a0a1a 0%, #1a1a3e 40%, #0d1b2a 100%)' }}
    >
      <CardNetwork />

      {floatingCards.map((card, i) => {
        const { color, value, delay, rotate, ...pos } = card;
        return (
          <FloatingCard
            key={i}
            color={color}
            value={value}
            style={{
              ...pos,
              transform: `rotate(${rotate})`,
              animation: `login-float ${4 + i * 0.5}s ease-in-out ${delay} infinite alternate`,
            }}
          />
        );
      })}

      <div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(0,113,227,0.08) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      <div className={`relative z-10 w-full max-w-md mx-4 ${shake ? 'login-shake' : ''}`}>
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-2 mb-6">
            <div className="w-3 h-3 rounded-full bg-[#ff3b30] opacity-80" />
            <div className="w-3 h-3 rounded-full bg-[#ffcc00] opacity-80" />
            <div className="w-3 h-3 rounded-full bg-[#34c759] opacity-80" />
            <div className="w-3 h-3 rounded-full bg-[#0071e3] opacity-80" />
          </div>

          <h1 className="text-[22px] font-semibold tracking-tight text-white leading-snug">
            Dynamic Difficulty Adjustment
            <br />
            <span className="text-white/50">in Multiplayer Card Games</span>
          </h1>
          <p className="text-[13px] text-white/30 mt-2 font-medium tracking-wide uppercase">
            Multi-Agent Reinforcement Learning
          </p>
        </div>

        <div
          className="rounded-3xl p-8 border border-white/10"
          style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(40px)',
            WebkitBackdropFilter: 'blur(40px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-white/50 mb-2">Admin Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3.5 rounded-xl text-[15px] text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#0071e3]/50 border border-white/10 focus:border-[#0071e3]/40"
                style={{ background: 'rgba(255,255,255,0.06)' }}
                placeholder="Enter password"
                autoFocus
              />
            </div>

            {error && (
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-medium"
                style={{ background: 'rgba(255,59,48,0.12)', color: '#ff6961' }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !password}
              className="w-full py-3.5 rounded-xl font-medium text-[15px] text-white disabled:opacity-30 disabled:cursor-not-allowed relative overflow-hidden group"
              style={{
                background: 'linear-gradient(135deg, #0071e3 0%, #5856d6 100%)',
                boxShadow: '0 4px 15px rgba(0,113,227,0.3)',
              }}
            >
              <span className="relative z-10">
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : 'Sign In'}
              </span>
              <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </form>

          <div className="mt-5 pt-4 border-t border-white/5 text-center">
            <p className="text-[11px] text-white/20">Research Admin Dashboard</p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes login-float {
          0% { transform: translateY(0px); }
          100% { transform: translateY(-20px); }
        }
        @keyframes login-shake-anim {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-10px); }
          40% { transform: translateX(10px); }
          60% { transform: translateX(-6px); }
          80% { transform: translateX(6px); }
        }
        .login-shake { animation: login-shake-anim 0.4s ease-in-out; }
      `}</style>
    </div>
  );
}
