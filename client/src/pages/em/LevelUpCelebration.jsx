// client/src/pages/em/LevelUpCelebration.jsx
// Full-screen celebration shown the moment a student crosses the unlock
// threshold (30 questions answered + 70% accuracy) for a level. Triggered
// from PracticeSession when POST /sessions returns newly_unlocked_level.
//
// Pure CSS/SVG confetti — no animation library, no network asset — so it
// always renders instantly regardless of connection quality.

import { useEffect, useState } from 'react';

const LEVEL_META = {
  Intermediate: { emoji: '🔥', from: '#3B82F6', to: '#6366F1', label: 'Intermediate' },
  Advanced:     { emoji: '⚡', from: '#A855F7', to: '#D946EF', label: 'Advanced' },
};

const CONFETTI_COLORS = ['#FACC15', '#F472B6', '#60A5FA', '#4ADE80', '#FB923C', '#A78BFA'];

function Confetti() {
  // 28 pieces, randomised once per mount via useState initialiser.
  const [pieces] = useState(() =>
    Array.from({ length: 28 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.4,
      duration: 2.2 + Math.random() * 1.2,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 6,
    }))
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {pieces.map(p => (
        <span
          key={p.id}
          style={{
            position: 'absolute',
            top: '-20px',
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.4,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            animation: `em-confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  );
}

export default function LevelUpCelebration({ level, onDismiss }) {
  const meta = LEVEL_META[level];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!level) return;
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, [level]);

  if (!level || !meta) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${meta.label} level unlocked`}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${visible ? 'opacity-100' : 'opacity-0'}`}
      onClick={onDismiss}
    >
      <style>{`
        @keyframes em-confetti-fall {
          to { top: 110%; opacity: 0; }
        }
        @keyframes em-badge-pop {
          0%   { transform: scale(0.4) rotate(-8deg); opacity: 0; }
          60%  { transform: scale(1.08) rotate(3deg); opacity: 1; }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes em-badge-glow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,255,255,0.35); }
          50%      { box-shadow: 0 0 0 18px rgba(255,255,255,0); }
        }
        .em-badge {
          animation: em-badge-pop 0.55s cubic-bezier(0.34,1.56,0.64,1) forwards, em-badge-glow 1.8s ease-out 0.55s 2;
        }
      `}</style>

      <div
        className="relative w-full max-w-sm mx-4 rounded-3xl p-8 text-center text-white shadow-2xl overflow-hidden"
        style={{ background: `linear-gradient(135deg, ${meta.from}, ${meta.to})` }}
        onClick={(e) => e.stopPropagation()}
      >
        <Confetti />

        <div
          className="em-badge relative mx-auto mb-5 flex items-center justify-center rounded-full bg-white/15 border-2 border-white/40"
          style={{ width: 96, height: 96, fontSize: 44 }}
          aria-hidden="true"
        >
          {meta.emoji}
        </div>

        <p className="text-xs font-semibold tracking-widest uppercase text-white/80 mb-1">Level unlocked</p>
        <h2 className="text-2xl font-bold mb-2">{meta.label}</h2>
        <p className="text-sm text-white/85 leading-relaxed mb-6">
          You answered 30+ questions at 70% accuracy or better. New categories are waiting for you.
        </p>

        <button
          type="button"
          onClick={onDismiss}
          className="w-full py-3 rounded-xl bg-white font-semibold text-sm shadow-sm hover:bg-white/90 transition-colors"
          style={{ color: meta.to }}
        >
          Keep going
        </button>
      </div>
    </div>
  );
}
