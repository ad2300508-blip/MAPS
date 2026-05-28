import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  formatDistance,
  formatDuration,
  maneuverIcon,
  maneuverToItalian,
} from '../data/mockData';

export default function NavigationHUD({ route, currentStepIdx, modeColor, onStop }) {
  if (!route) return null;

  const steps = route.legs?.[0]?.steps ?? [];
  const step = steps[currentStepIdx] ?? steps[steps.length - 1];
  const nextStep = steps[currentStepIdx + 1];

  const type     = step?.maneuver?.type ?? 'straight';
  const modifier = step?.maneuver?.modifier;
  const name     = step?.name ?? '';

  const icon        = maneuverIcon(type, modifier);
  const instruction = maneuverToItalian(type, modifier, name);
  const stepDist    = formatDistance(step?.distance ?? 0);

  // Remaining distance: sum of current + future steps
  const remainingMeters = steps
    .slice(currentStepIdx)
    .reduce((sum, s) => sum + (s.distance ?? 0), 0);
  const remainingSecs = steps
    .slice(currentStepIdx)
    .reduce((sum, s) => sum + (s.duration ?? 0), 0);

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-40"
      initial={{ y: 160, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 160, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
    >
      <div
        className="mx-3 mb-3 rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(9,9,15,0.96)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          border: `1.5px solid ${modeColor}40`,
          boxShadow: `0 -4px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04), 0 0 30px ${modeColor}15`,
        }}
      >
        {/* Current instruction */}
        <div className="flex items-center gap-4 px-5 pt-5 pb-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
            style={{
              background: `${modeColor}18`,
              border: `1.5px solid ${modeColor}40`,
            }}
          >
            {icon}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-2xl font-bold text-white tabular-nums">{stepDist}</p>
            <p className="text-sm text-slate-300 leading-snug mt-0.5 line-clamp-2">
              {instruction}
            </p>
          </div>

          <button
            onClick={onStop}
            className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center focus:outline-none"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.3)' }}
          >
            <X size={20} className="text-red-400" />
          </button>
        </div>

        {/* Divider */}
        <div className="mx-5 h-px" style={{ background: `${modeColor}20` }} />

        {/* Remaining + ETA + next */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-[11px] text-slate-500 mb-0.5 uppercase tracking-wide">Rimane</p>
            <p className="text-sm font-bold text-white">{formatDistance(remainingMeters)}</p>
          </div>

          <div className="text-center">
            <p className="text-[11px] text-slate-500 mb-0.5 uppercase tracking-wide">ETA</p>
            <p className="text-sm font-bold" style={{ color: modeColor }}>
              {formatDuration(remainingSecs)}
            </p>
          </div>

          <div className="text-right max-w-[120px]">
            {nextStep ? (
              <>
                <p className="text-[11px] text-slate-500 mb-0.5 uppercase tracking-wide">Poi</p>
                <p className="text-sm font-semibold text-slate-300 truncate">
                  {maneuverIcon(nextStep.maneuver?.type, nextStep.maneuver?.modifier)}{' '}
                  {nextStep.name || 'Continua'}
                </p>
              </>
            ) : (
              <p className="text-sm font-bold" style={{ color: modeColor }}>Destinazione</p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
