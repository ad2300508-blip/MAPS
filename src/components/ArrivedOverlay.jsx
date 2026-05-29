import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, Search, Star } from 'lucide-react';
import { formatDistance, formatDuration } from '../data/mockData';

function isFavorite(dest) {
  try {
    const favs = JSON.parse(localStorage.getItem('via-favorites') ?? '[]');
    return favs.some((f) => f.name === dest?.name && f.coords?.join() === dest?.coords?.join());
  } catch { return false; }
}
function saveFavorite(dest) {
  if (!dest?.coords) return;
  try {
    const favs = JSON.parse(localStorage.getItem('via-favorites') ?? '[]');
    if (favs.some((f) => f.name === dest.name && f.coords?.join() === dest.coords?.join())) return;
    const updated = [{ name: dest.name, address: dest.address ?? '', coords: dest.coords, emoji: dest.emoji ?? '📍', type: dest.type ?? '' }, ...favs].slice(0, 20);
    localStorage.setItem('via-favorites', JSON.stringify(updated));
  } catch { }
}

export default function ArrivedOverlay({ destName, dest, stats, onDismiss, onSearchNearby }) {
  const [saved, setSaved] = useState(() => isFavorite(dest));

  useEffect(() => {
    const t = setTimeout(onDismiss, 10000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <motion.div
      className="absolute inset-0 flex items-center justify-center z-50 pointer-events-auto"
      style={{ background: 'rgba(9,9,15,0.82)', backdropFilter: 'blur(14px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onDismiss}
    >
      <motion.div
        initial={{ scale: 0.6, opacity: 0, y: 30 }}
        animate={{ scale: 1,   opacity: 1, y: 0  }}
        exit={{   scale: 0.8,  opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
        onClick={(e) => e.stopPropagation()}
        className="flex flex-col items-center gap-5 px-8 py-9 rounded-3xl text-center mx-6"
        style={{
          background: 'rgba(12,16,28,0.97)',
          border: '1.5px solid rgba(76,201,240,0.25)',
          boxShadow: '0 8px 60px rgba(0,0,0,0.7), 0 0 40px rgba(76,201,240,0.08)',
          maxWidth: 300,
        }}
      >
        {/* Animated checkmark */}
        <motion.div
          animate={{ scale: [1, 1.18, 1], rotate: [0, 8, -8, 0] }}
          transition={{ duration: 0.7, delay: 0.2 }}
          style={{ color: '#4cc9f0' }}
        >
          <CheckCircle size={64} strokeWidth={1.5} />
        </motion.div>

        <div className="flex flex-col gap-1">
          <p className="text-2xl font-bold text-white tracking-tight">Sei arrivato!</p>
          {destName && (
            <p className="text-sm text-slate-400 leading-snug">{destName}</p>
          )}
        </div>

        {/* Journey stats */}
        {stats && (stats.secs != null || stats.meters != null) && (
          <div
            className="flex items-center justify-center gap-4 px-4 py-2.5 rounded-2xl w-full"
            style={{ background: 'rgba(76,201,240,0.06)', border: '1px solid rgba(76,201,240,0.12)' }}
          >
            {stats.meters != null && (
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-0.5">Distanza</p>
                <p className="text-sm font-bold" style={{ color: '#4cc9f0' }}>
                  {formatDistance(stats.meters)}
                </p>
              </div>
            )}
            {stats.secs != null && stats.meters != null && (
              <div className="w-px h-8" style={{ background: 'rgba(76,201,240,0.15)' }} />
            )}
            {stats.secs != null && (
              <div className="text-center">
                <p className="text-xs text-slate-500 mb-0.5">Durata</p>
                <p className="text-sm font-bold" style={{ color: '#4cc9f0' }}>
                  {formatDuration(stats.secs)}
                </p>
              </div>
            )}
            {stats.co2Saved != null && (
              <>
                <div className="w-px h-8" style={{ background: 'rgba(76,201,240,0.15)' }} />
                <div className="text-center">
                  <p className="text-xs text-slate-500 mb-0.5">CO₂ risparmiata</p>
                  <p className="text-sm font-bold" style={{ color: '#10b981' }}>
                    🌱 {stats.co2Saved < 1000
                      ? `${stats.co2Saved} g`
                      : `${(stats.co2Saved / 1000).toFixed(2)} kg`}
                  </p>
                </div>
              </>
            )}
          </div>
        )}

        <div className="flex flex-col gap-2 w-full">
          {/* Save to favorites */}
          {dest?.coords && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              animate={saved ? { scale: [1, 1.1, 1] } : {}}
              transition={{ duration: 0.3 }}
              onClick={() => {
                if (!saved) {
                  saveFavorite(dest);
                  setSaved(true);
                  navigator.vibrate?.([20]);
                }
              }}
              className="flex items-center justify-center gap-2 px-7 py-3 rounded-2xl text-sm font-semibold focus:outline-none w-full"
              style={saved
                ? { background: 'rgba(251,191,36,0.12)', border: '1.5px solid rgba(251,191,36,0.35)', color: '#fbbf24' }
                : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8' }
              }
            >
              <Star size={15} strokeWidth={2.5} fill={saved ? '#fbbf24' : 'none'} />
              {saved ? 'Aggiunto ai preferiti' : 'Salva nei preferiti'}
            </motion.button>
          )}

          {onSearchNearby && (
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={onSearchNearby}
              className="flex items-center justify-center gap-2 px-7 py-3 rounded-2xl text-sm font-semibold focus:outline-none w-full"
              style={{
                background: 'rgba(76,201,240,0.12)',
                border: '1.5px solid rgba(76,201,240,0.35)',
                color: '#4cc9f0',
              }}
            >
              <Search size={15} strokeWidth={2.5} />
              Cerca nelle vicinanze
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={onDismiss}
            className="px-7 py-2.5 rounded-2xl text-sm font-medium focus:outline-none w-full"
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: '#64748b',
            }}
          >
            Chiudi
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
