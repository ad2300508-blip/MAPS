import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, AlertTriangle, Volume2, VolumeX, List, ChevronDown } from 'lucide-react';
import {
  formatDistance,
  formatDuration,
  maneuverIcon,
  maneuverToItalian,
  haversineMeters,
} from '../data/mockData';

// Lane indication → unicode arrow (use well-supported chars)
function laneArrow(ind) {
  switch (ind) {
    case 'left':         return '←';
    case 'sharp left':   return '↺';
    case 'slight left':  return '↖';
    case 'right':        return '→';
    case 'sharp right':  return '↻';
    case 'slight right': return '↗';
    case 'uturn':        return '↩';
    default:             return '↑';
  }
}

// Visual lane strip — shows which lanes are valid for the upcoming turn
function LaneGuide({ lanes, modeColor }) {
  if (!lanes?.length) return null;
  return (
    <div className="flex items-center justify-center gap-1 my-1">
      {lanes.map((lane, i) => {
        const ind = lane.indications?.[0] ?? 'straight';
        return (
          <div
            key={i}
            className="flex items-center justify-center rounded-lg text-sm font-bold flex-shrink-0"
            style={{
              width: 26, height: 26,
              background: lane.valid ? `${modeColor}20` : 'rgba(255,255,255,0.04)',
              border: `1.5px solid ${lane.valid ? modeColor : 'rgba(255,255,255,0.09)'}`,
              color: lane.valid ? modeColor : '#334155',
              transition: 'background 0.3s, border-color 0.3s',
            }}
          >
            {laneArrow(ind)}
          </div>
        );
      })}
    </div>
  );
}

function formatSpeed(mps) {
  if (mps == null || mps < 0) return null;
  return `${Math.round(mps * 3.6)}`;
}

function arrivalTime(remainSecs) {
  const d = new Date(Date.now() + remainSecs * 1000);
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// Compact row for each upcoming step in the turns list
function TurnRow({ step, distAccum, modeColor, isFirst }) {
  const type     = step.maneuver?.type ?? 'straight';
  const modifier = step.maneuver?.modifier;
  const icon     = maneuverIcon(type, modifier);
  const label    = step.name || (type === 'arrive' ? 'Destinazione' : 'Continua');
  return (
    <div
      className="flex items-center gap-3 py-2.5"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        opacity: isFirst ? 1 : 0.65,
      }}
    >
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0"
        style={{
          background: isFirst ? `${modeColor}22` : 'rgba(255,255,255,0.05)',
          border: isFirst ? `1.5px solid ${modeColor}55` : '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-200 truncate">{label}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">
          {maneuverToItalian(type, modifier, step.name ?? '', step.maneuver?.exit)}
        </p>
      </div>
      <p
        className="text-xs font-bold tabular-nums flex-shrink-0"
        style={{ color: isFirst ? modeColor : 'rgba(148,163,184,0.7)' }}
      >
        {formatDistance(distAccum)}
      </p>
    </div>
  );
}

export default function NavigationHUD({
  route,
  currentStepIdx,
  modeColor,
  speed,
  isOffRoute,
  onStop,
  onRepeat,
  isMuted,
  onToggleMute,
  userLocation,
  userAccuracy,
  destName,
}) {
  const [showTurns, setShowTurns] = useState(false);

  if (!route) return null;

  // Steps that are navigation noise — no real action for the driver
  const FILLER_TYPES = new Set(['depart', 'continue', 'new name', 'notification']);

  const steps    = route.legs?.[0]?.steps ?? [];
  const step     = steps[currentStepIdx] ?? steps[steps.length - 1] ?? {};
  const nextStep = steps[currentStepIdx + 1];
  // Skip filler steps to find the next *meaningful* maneuver
  let next2Step = null;
  for (let i = currentStepIdx + 2; i < steps.length; i++) {
    if (!FILLER_TYPES.has(steps[i].maneuver?.type)) { next2Step = steps[i]; break; }
  }

  // Show the UPCOMING maneuver so the user knows what to do next.
  // Fall back to the current step only on the final arrive step (no nextStep).
  const upcomingStep = nextStep ?? step;
  const type     = upcomingStep?.maneuver?.type ?? 'straight';
  const modifier = upcomingStep?.maneuver?.modifier;
  const name     = upcomingStep?.name ?? '';

  const icon        = maneuverIcon(type, modifier);
  // When showing the arrive step as upcoming, use "in arrivo" phrasing
  // rather than the past-tense "Sei arrivato" which would be premature
  const rawInstruction = maneuverToItalian(type, modifier, name, upcomingStep?.maneuver?.exit);
  const instruction = type === 'arrive' && nextStep
    ? 'Arriverai a destinazione'
    : rawInstruction;

  // Lane guidance data — from the first intersection of the upcoming maneuver step
  const lanes = upcomingStep?.intersections?.[0]?.lanes ?? null;

  // Road reference (e.g. "A1", "SS7") and motorway destinations ("Roma/Napoli")
  // shown on the current step so the driver knows which road they're on
  const roadRef   = step?.ref ?? null;
  const roadDests = step?.destinations ?? null;
  const roadSign  = [roadRef, roadDests].filter(Boolean).join(' › ') || null;

  // Distance to the upcoming maneuver point
  const nextTurnLoc = (nextStep ?? step)?.maneuver?.location;
  const distToTurn  = (nextTurnLoc && userLocation)
    ? haversineMeters(userLocation, nextTurnLoc)
    : (step?.distance ?? 0);

  // Distance from current position to next2Step's maneuver point
  // Accumulate through all intermediate steps (including fillers)
  let distToNext2 = null;
  if (next2Step) {
    let acc = distToTurn;
    for (let i = currentStepIdx + 1; i < steps.length; i++) {
      if (steps[i] === next2Step) break;
      acc += steps[i].distance ?? 0;
    }
    distToNext2 = acc;
  }

  // Remaining totals
  const remainingMeters = steps.slice(currentStepIdx).reduce((s, x) => s + (x.distance ?? 0), 0);
  const remainingSecs   = steps.slice(currentStepIdx).reduce((s, x) => s + (x.duration ?? 0), 0);
  const totalMeters     = steps.reduce((s, x) => s + (x.distance ?? 0), 0);
  const progress        = totalMeters > 0 ? Math.min(1, Math.max(0, 1 - remainingMeters / totalMeters)) : 0;
  // Turns remaining — exclude the final "arrive" step since it's not a turn action
  const stepsLeft = steps.slice(currentStepIdx + 1)
    .filter(s => s.maneuver?.type !== 'arrive').length;

  // Match adaptive distances used by the voice warning system
  const speedMs     = (speed ?? 0);
  const warnDist    = Math.max(200, speedMs * 10);
  const urgentDist  = Math.max(60,  speedMs * 4);
  const turnWarning = distToTurn < warnDist   && nextStep;
  const turnUrgent  = distToTurn < urgentDist && nextStep;
  const turnColor   = turnUrgent ? '#f97316' : turnWarning ? '#f59e0b' : modeColor;

  const kmh         = formatSpeed(speed);
  const kmhNum      = kmh != null ? parseInt(kmh, 10) : 0;
  const speedColor  = kmhNum > 130 ? '#ef4444' : kmhNum > 100 ? '#f59e0b' : '#ffffff';

  // Build upcoming turns list — skip filler steps, accumulate all distances correctly
  const upcomingTurns = [];
  let accumDist = distToTurn;
  for (let i = currentStepIdx + 1; i < steps.length && upcomingTurns.length < 6; i++) {
    const s = steps[i];
    if (!FILLER_TYPES.has(s.maneuver?.type)) {
      upcomingTurns.push({ step: s, dist: accumDist });
    }
    accumDist += s.distance ?? 0;
  }

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-40"
      initial={{ y: 160, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 160, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 16px)' }}
    >
      {/* Poor GPS banner */}
      {!isOffRoute && userAccuracy != null && userAccuracy > 50 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-3 mb-2 px-4 py-2 rounded-2xl flex items-center gap-2"
          style={{ background: 'rgba(251,191,36,0.12)', border: '1.5px solid rgba(251,191,36,0.3)' }}
        >
          <span className="text-amber-400 text-xs">📡</span>
          <span className="text-xs font-semibold text-amber-400">GPS debole — precisione {Math.round(userAccuracy)} m</span>
        </motion.div>
      )}

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

      {/* Upcoming turns panel */}
      <AnimatePresence>
        {showTurns && upcomingTurns.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 360, damping: 30 }}
            className="mx-3 mb-2 px-4 pt-3 pb-1 rounded-3xl"
            style={{
              background: 'rgba(9,9,15,0.97)',
              backdropFilter: 'blur(32px) saturate(200%)',
              WebkitBackdropFilter: 'blur(32px) saturate(200%)',
              border: `1.5px solid ${modeColor}30`,
              boxShadow: '0 -4px 30px rgba(0,0,0,0.45)',
            }}
          >
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Prossime svolte</p>
              <button
                onClick={() => setShowTurns(false)}
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                <ChevronDown size={13} className="text-slate-500" />
              </button>
            </div>
            {upcomingTurns.map(({ step: s, dist }, i) => (
              <TurnRow
                key={i}
                step={s}
                distAccum={dist}
                modeColor={modeColor}
                isFirst={i === 0}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

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
          <div className="flex flex-col items-center gap-1.5">
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
            {onRepeat && (
              <button
                onClick={() => onRepeat(instruction)}
                className="w-8 h-6 rounded-lg flex items-center justify-center focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <Volume2 size={11} className="text-slate-500" />
              </button>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <p
              className="text-2xl font-bold tabular-nums"
              style={{ color: turnColor }}
            >
              {formatDistance(distToTurn)}
            </p>
            {/* Progress through current road segment */}
            {step.distance > 50 && (
              <div className="my-1" style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                <div
                  style={{
                    height: '100%',
                    width: `${Math.min(100, Math.max(0, (1 - distToTurn / step.distance) * 100))}%`,
                    background: turnColor,
                    borderRadius: 2,
                    transition: 'width 1s ease',
                  }}
                />
              </div>
            )}
            {lanes && <LaneGuide lanes={lanes} modeColor={turnColor} />}
            <p className="text-sm text-slate-300 leading-snug mt-0.5 line-clamp-2">
              {instruction}
            </p>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              {step.name && (
                <p className="text-[10px] text-slate-600 truncate flex-1">
                  📍 {step.name}
                </p>
              )}
              {roadSign && (
                <p
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                  style={{ background: 'rgba(255,255,255,0.07)', color: '#64748b', letterSpacing: '0.02em' }}
                >
                  {roadSign}
                </p>
              )}
              {destName && (
                <p className="text-[10px] text-slate-600 flex-shrink-0 truncate max-w-[80px]">
                  → {destName}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 flex-shrink-0">
            {/* Mute toggle */}
            {onToggleMute && (
              <button
                onClick={onToggleMute}
                className="w-11 h-11 rounded-2xl flex items-center justify-center focus:outline-none"
                style={
                  isMuted
                    ? { background: 'rgba(239,68,68,0.12)', border: '1.5px solid rgba(239,68,68,0.25)' }
                    : { background: 'rgba(255,255,255,0.06)', border: '1.5px solid rgba(255,255,255,0.1)' }
                }
              >
                {isMuted
                  ? <VolumeX size={17} className="text-red-400" />
                  : <Volume2 size={17} className="text-slate-400" />
                }
              </button>
            )}
            {/* Stop navigation */}
            <button
              onClick={onStop}
              className="w-11 h-11 rounded-2xl flex items-center justify-center focus:outline-none"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1.5px solid rgba(239,68,68,0.3)' }}
            >
              <X size={20} className="text-red-400" />
            </button>
          </div>
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
              style={{
                background: kmhNum > 130 ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.05)',
                border: kmhNum > 100 ? `1px solid ${speedColor}30` : 'none',
                minWidth: 56,
                transition: 'background 0.6s, border-color 0.6s',
              }}
            >
              <p className="text-xl font-bold tabular-nums leading-tight"
                style={{ color: speedColor, transition: 'color 0.6s' }}>{kmh}</p>
              <p className="text-[9px] text-slate-500 uppercase tracking-widest">km/h</p>
            </div>
          )}

          {/* Turns list toggle */}
          {stepsLeft > 0 && (
            <button
              onClick={() => setShowTurns((v) => !v)}
              className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 focus:outline-none"
              style={{
                background: showTurns ? `${modeColor}18` : 'rgba(255,255,255,0.05)',
                border: showTurns ? `1px solid ${modeColor}40` : '1px solid rgba(255,255,255,0.07)',
                transition: 'background 0.3s, border-color 0.3s',
              }}
            >
              <List size={12} style={{ color: showTurns ? modeColor : 'rgba(148,163,184,0.6)' }} />
              <span className="text-[10px] font-semibold tabular-nums" style={{ color: showTurns ? modeColor : 'rgba(148,163,184,0.6)' }}>
                {stepsLeft}
              </span>
            </button>
          )}

          <div className="flex-1" />

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
            <p className="text-[9px] text-slate-600">
              {formatDuration(remainingSecs)}
            </p>
          </div>

          <div className="w-px h-8 bg-white/8 mx-1" />

          {/* Step after next */}
          <div className="text-right max-w-[110px]">
            {next2Step && next2Step.maneuver?.type !== 'arrive' ? (
              <>
                <p className="text-[10px] text-slate-500 mb-0.5 uppercase tracking-wide">Poi</p>
                {distToNext2 != null && (
                  <p className="text-[10px] text-slate-600 tabular-nums">{formatDistance(distToNext2)}</p>
                )}
                <p className="text-xs font-semibold text-slate-400 truncate leading-tight">
                  {maneuverIcon(next2Step.maneuver?.type, next2Step.maneuver?.modifier)}{' '}
                  {maneuverToItalian(next2Step.maneuver?.type, next2Step.maneuver?.modifier, next2Step.name ?? '', next2Step.maneuver?.exit)}
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
