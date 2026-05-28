import { motion } from 'framer-motion';
import { X, AlertTriangle } from 'lucide-react';
import {
  formatDistance,
  formatDuration,
  maneuverIcon,
  maneuverToItalian,
  haversineMeters,
} from '../data/mockData';

function formatSpeed(mps) {
  if (mps == null || mps < 0) return null;
  return `${Math.round(mps * 3.6)}`;
}

function arrivalTime(remainSecs) {
  const d = new Date(Date.now() + remainSecs * 1000);
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

export default function NavigationHUD({
  route,
  currentStepIdx,
  modeColor,
  speed,
  isOffRoute,
  onStop,
  userLocation,
  destName,
}) {
  if (!route) return null;

  const steps    = route.legs?.[0]?.steps ?? [];
  const step     = steps[currentStepIdx] ?? steps[steps.length - 1];
  const nextStep = steps[currentStepIdx + 1];

  const type     = step?.maneuver?.type ?? 'straight';
  const modifier = step?.maneuver?.modifier;
  const name     = step?.name ?? '';

  const icon        = maneuverIcon(type, modifier);
  const instruction = maneuverToItalian(type, modifier, name, step?.maneuver?.exit);

  // Distance to next turn: haversine from user to next maneuver point
  const nextTurnLoc = nextStep?.maneuver?.location;
  const distToTurn  = (nextTurnLoc && userLocation)
    ? haversineMeters(userLocation, nextTurnLoc)
    : (step?.distance ?? 0);

  // Remaining totals
  const remainingMeters = steps.slice(currentStepIdx).reduce((s, x) => s + (x.distance ?? 0), 0);
  const remainingSecs   = steps.slice(currentStepIdx).reduce((s, x) => s + (x.duration ?? 0), 0);
  const totalMeters     = steps.reduce((s, x) => s + (x.distance ?? 0), 0);
  const progress        = totalMeters > 0 ? Math.min(1, Math.max(0, 1 - remainingMeters / totalMeters)) : 0;
  const stepsLeft       = steps.length - currentStepIdx - 1; // turns remaining

  const turnWarning  = distToTurn < 200 && nextStep;
  const turnUrgent   = distToTurn < 60  && nextStep;
  const turnColor    = turnUrgent ? '#f97316' : turnWarning ? '#f59e0b' : modeColor;
  const kmh          = formatSpeed(speed);

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-40"
      initial={{ y: 160, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 160, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
    >
      {/* Off-route banner */}
      {isOffRoute && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mb-2 px-4 py-2.5 rounded-2xl flex items-center gap-2"
          style={{ background: 'rgba(249,115,22,0.2)', border: '1.5px solid rgba(249,115,22,0.4)' }}
        >
          <AlertTriangle size={15} className="text-orange-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-orange-300">Fuori percorso — Ricalcolo…</span>
        </motion.div>
      )}

      <div
        className="mx-3 mb-3 rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(9,9,15,0.97)',
          backdropFilter: 'blur(32px) saturate(200%)',
          WebkitBackdropFilter: 'blur(32px) saturate(200%)',
          border: `1.5px solid ${turnColor}50`,
          boxShadow: `0 -4px 40px rgba(0,0,0,0.55), 0 0 30px ${turnColor}12`,
          transition: 'border-color 0.4s, box-shadow 0.4s',
        }}
      >
        {/* Turn instruction row */}
        <div className="flex items-center gap-4 px-5 pt-5 pb-4">
          <motion.div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0"
            animate={turnUrgent ? { scale: [1, 1.08, 1] } : {}}
            transition={{ repeat: Infinity, duration: 0.8 }}
            style={{
              background: `${turnColor}18`,
              border: `1.5px solid ${turnColor}55`,
            }}
          >
            {icon}
          </motion.div>

          <div className="flex-1 min-w-0">
            <p
              className="text-2xl font-bold tabular-nums"
              style={{ color: turnColor }}
            >
              {formatDistance(distToTurn)}
            </p>
            <p className="text-sm text-slate-300 leading-snug mt-0.5 line-clamp-2">
              {instruction}
            </p>
            {destName && (
              <p className="text-[10px] text-slate-600 mt-1 truncate">
                → {destName}
              </p>
            )}
          </div>

          <button
            onClick={onStop}
            className="flex-shrink-0 w-11 h-11 rounded-2xl flex items-center justify-center focus:outline-none"
            style={{ background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.3)' }}
          >
            <X size={20} className="text-red-400" />
          </button>
        </div>

        {/* Route progress bar */}
        <div className="mx-5">
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)', borderRadius: 2 }}>
            <div
              style={{
                height: '100%',
                width: `${progress * 100}%`,
                background: `linear-gradient(90deg, ${modeColor}88, ${modeColor})`,
                borderRadius: 2,
                transition: 'width 1.2s ease',
              }}
            />
          </div>
        </div>

        {/* Bottom stats row */}
        <div className="flex items-center px-5 py-3 gap-2">

          {/* Speed */}
          {kmh != null && (
            <div
              className="flex flex-col items-center justify-center rounded-2xl px-3 py-1.5 flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.05)', minWidth: 56 }}
            >
              <p className="text-xl font-bold text-white tabular-nums leading-tight">{kmh}</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">km/h</p>
            </div>
          )}

          {/* Steps remaining */}
          <div className="flex-1 text-center">
            {stepsLeft > 0 && (
              <p className="text-xs text-slate-600">
                {stepsLeft} {stepsLeft === 1 ? 'svolta' : 'svolte'}
              </p>
            )}
          </div>

          {/* Remaining distance */}
          <div className="text-center">
            <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">Rimane</p>
            <p className="text-sm font-bold text-white">{formatDistance(remainingMeters)}</p>
          </div>

          <div className="w-px h-8 bg-white/8 mx-1" />

          {/* Arrival time */}
          <div className="text-center">
            <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">Arrivo</p>
            <p className="text-sm font-bold" style={{ color: modeColor }}>
              {arrivalTime(remainingSecs)}
            </p>
          </div>

          <div className="w-px h-8 bg-white/8 mx-1" />

          {/* Next step */}
          <div className="text-right max-w-[100px]">
            {nextStep ? (
              <>
                <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">Poi</p>
                <p className="text-sm font-semibold text-slate-300 truncate">
                  {maneuverIcon(nextStep.maneuver?.type, nextStep.maneuver?.modifier)}{' '}
                  {nextStep.name || 'Continua'}
                </p>
              </>
            ) : (
              <>
                <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">Fine</p>
                <p className="text-sm font-bold" style={{ color: modeColor }}>Arrivo</p>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
