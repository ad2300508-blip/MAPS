import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, MapPin, Navigation, ChevronRight, Loader } from 'lucide-react';
import {
  TRANSPORT_MODES,
  formatDuration,
  formatDistance,
  formatCO2,
  formatCost,
  maneuverToItalian,
  maneuverIcon,
} from '../data/mockData';

function useIsMobile() {
  const [v, setV] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setV(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

// ─── Step row from OSRM data ──────────────────────────────────────────────
function StepRow({ step, index, color }) {
  const type     = step.maneuver?.type;
  const modifier = step.maneuver?.modifier;
  const icon     = maneuverIcon(type, modifier);
  const text     = maneuverToItalian(type, modifier, step.name, step.maneuver?.exit);
  const dist     = formatDistance(step.distance);
  const dur      = Math.round(step.duration / 60);
  const isLast   = type === 'arrive';

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold"
        style={
          isLast
            ? { background: `${color}25`, border: `1px solid ${color}50`, fontSize: 14 }
            : { background: `${color}20`, color }
        }
      >
        {isLast ? '🏁' : icon}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-snug">{text}</p>
        {!isLast && step.distance > 10 && (
          <p className="text-xs text-slate-600 mt-0.5">
            {dist}{dur > 0 ? ` · ${dur} min` : ''}
          </p>
        )}
        {isLast && (
          <p className="text-xs font-semibold mt-0.5" style={{ color }}>Arrivo</p>
        )}
      </div>
    </div>
  );
}

// ─── Mode selector inside the panel ──────────────────────────────────────
function InlineModeSelector({ selectedModeId, onModeChange, routesByProfile }) {
  const profileMap = { car: 'driving', walk: 'foot', bike: 'bike', transit: 'driving', moto: 'driving' };
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
      {TRANSPORT_MODES.map((mode) => {
        const sel = mode.id === selectedModeId;
        const rd  = routesByProfile?.[profileMap[mode.id]];
        return (
          <motion.button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            whileTap={{ scale: 0.94 }}
            className="flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl focus:outline-none"
            style={
              sel
                ? { background: `${mode.color}1a`, border: `1.5px solid ${mode.color}55` }
                : { background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.07)' }
            }
          >
            <span className="text-lg leading-none">{mode.icon}</span>
            <span className="text-[11px] font-semibold leading-none mt-0.5" style={{ color: sel ? mode.color : '#64748b' }}>
              {mode.shortLabel}
            </span>
            {rd ? (
              <span className="text-[11px] font-bold leading-none" style={{ color: sel ? mode.color : '#94a3b8' }}>
                {formatDuration(rd.duration)}
              </span>
            ) : (
              <span className="text-[11px] text-slate-700">—</span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function POIDetailsPanel({
  destination,
  onClose,
  selectedModeId,
  onModeChange,
  routesByProfile,
  routeLoading,
  onStartNavigation,
}) {
  const isMobile    = useIsMobile();
  const dragControls = useDragControls();
  const [activeTab, setActiveTab] = useState('directions');

  const profileMap = { car: 'driving', walk: 'foot', bike: 'bike', transit: 'driving', moto: 'driving' };
  const currentMode  = TRANSPORT_MODES.find((m) => m.id === selectedModeId) ?? TRANSPORT_MODES[0];
  const currentRoute = routesByProfile?.[profileMap[selectedModeId]];

  useEffect(() => {
    if (destination) setActiveTab('directions');
  }, [destination?.name]);

  const variants = isMobile
    ? { hidden: { y: '100%', opacity: 0 }, visible: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } }
    : { hidden: { x: '-100%', opacity: 0 }, visible: { x: 0, opacity: 1 }, exit: { x: '-100%', opacity: 0 } };

  const steps = currentRoute?.legs?.[0]?.steps ?? [];

  return (
    <AnimatePresence>
      {destination && (
        <motion.div
          key={destination.name}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          drag={isMobile ? 'y' : false}
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.25 }}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            if (info.velocity.y > 200 || info.offset.y > 100) onClose();
          }}
          className="absolute glass-bright overflow-hidden"
          style={{
            zIndex: 30,
            ...(isMobile
              ? {
                  bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
                  left: 0, right: 0,
                  borderRadius: '24px 24px 0 0',
                  maxHeight: 'calc(100dvh - 160px)',
                }
              : { top: 0, bottom: 0, left: 0, width: 390, borderRadius: 0 }),
          }}
        >
          <div className="flex flex-col h-full max-h-full">
            {/* Drag handle — touch here to dismiss panel by swiping down */}
            {isMobile && (
              <div
                className="flex justify-center pt-3 pb-1 flex-shrink-0 cursor-grab active:cursor-grabbing"
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: 'none' }}
              >
                <div className="w-10 h-1 rounded-full bg-white/20" />
              </div>
            )}

            {/* Header */}
            <div className="flex-shrink-0 px-5 pt-4 pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-2xl leading-none">{destination.emoji ?? '📍'}</span>
                  </div>
                  <h2 className="text-xl font-bold text-white leading-tight">{destination.name}</h2>
                  {destination.type && (
                    <span
                      className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full capitalize"
                      style={{ background: 'rgba(255,255,255,0.07)', color: '#64748b' }}
                    >
                      {destination.type.replace(/_/g, ' ')}
                    </span>
                  )}
                  {destination.address && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <MapPin size={13} className="text-slate-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-slate-500 leading-relaxed">{destination.address}</p>
                    </div>
                  )}
                </div>

                <motion.button
                  onClick={onClose}
                  whileTap={{ scale: 0.9 }}
                  className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/6 border border-white/8 flex items-center justify-center focus:outline-none"
                >
                  <X size={16} className="text-slate-400" />
                </motion.button>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-4 p-1 rounded-xl bg-white/4 border border-white/6">
                {['directions', 'info'].map((tab) => (
                  <motion.button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="relative flex-1 py-2 text-xs font-semibold rounded-lg focus:outline-none"
                    style={{ color: activeTab === tab ? '#fff' : '#64748b' }}
                  >
                    {activeTab === tab && (
                      <motion.div
                        layoutId="panel-tab-bg"
                        className="absolute inset-0 rounded-lg"
                        style={{
                          background: `linear-gradient(135deg, ${currentMode.gradientStart}30, ${currentMode.gradientEnd}30)`,
                          border: `1px solid ${currentMode.color}30`,
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">
                      {tab === 'directions' ? '🗺 Percorso' : 'ℹ Info'}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {activeTab === 'directions' ? (
                <>
                  {/* Mode selector */}
                  <InlineModeSelector
                    selectedModeId={selectedModeId}
                    onModeChange={onModeChange}
                    routesByProfile={routesByProfile}
                  />

                  {/* Route summary */}
                  {routeLoading ? (
                    <div className="flex items-center justify-center gap-2 py-6">
                      <Loader size={18} className="animate-spin text-slate-500" />
                      <span className="text-sm text-slate-500">Calcolo percorso…</span>
                    </div>
                  ) : currentRoute ? (
                    <div
                      className="rounded-2xl p-4"
                      style={{ background: `${currentMode.color}0c`, border: `1px solid ${currentMode.color}25` }}
                    >
                      <div className="flex items-baseline gap-3 mb-1">
                        <span className="text-2xl font-bold tabular-nums" style={{ color: currentMode.color }}>
                          {formatDuration(currentRoute.duration)}
                        </span>
                        <span className="text-sm text-slate-400">{formatDistance(currentRoute.distance)}</span>
                        <span className="ml-auto text-sm font-semibold text-slate-400">
                          {formatCost(currentRoute.distance, currentMode)}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span>{formatCO2(currentRoute.distance, currentMode)} CO₂</span>
                        <span>·</span>
                        <span>Partenza: La tua posizione</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-600 text-center py-4">Percorso non disponibile</p>
                  )}

                  {/* Turn-by-turn steps */}
                  {steps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                        Indicazioni passo-passo
                      </p>
                      {steps.map((step, i) => (
                        <StepRow key={i} step={step} index={i} color={currentMode.color} />
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <div className="flex items-start gap-2.5">
                    <MapPin size={15} className="text-slate-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-400">{destination.address || destination.name}</p>
                  </div>

                  {/* Open in Google Maps */}
                  {destination.coords && (
                    <a
                      href={`https://www.google.com/maps/search/?api=1&query=${destination.coords[1]},${destination.coords[0]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    >
                      <span style={{ fontSize: 16 }}>🗺️</span>
                      Apri in Google Maps
                    </a>
                  )}

                  {/* Share — uses Web Share API (supported on Android Chrome) */}
                  {typeof navigator.share === 'function' && destination.coords && (
                    <button
                      onClick={() => navigator.share({
                        title: destination.name,
                        text: `${destination.name}${destination.address ? '\n' + destination.address : ''}`,
                        url: `https://maps.google.com/maps?q=${destination.coords[1]},${destination.coords[0]}`,
                      }).catch(() => {})}
                      className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium w-full"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    >
                      <span style={{ fontSize: 16 }}>📤</span>
                      Condividi destinazione
                    </button>
                  )}

                  <p className="text-xs text-slate-600">
                    Dati forniti da OpenStreetMap — gratuiti e aggiornati dalla community.
                  </p>
                </div>
              )}
            </div>

            {/* Start navigation button */}
            <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-white/5">
              <motion.button
                onClick={onStartNavigation}
                disabled={!currentRoute}
                whileHover={{ scale: currentRoute ? 1.02 : 1 }}
                whileTap={{ scale: currentRoute ? 0.97 : 1 }}
                className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-semibold text-white focus:outline-none disabled:opacity-40"
                style={{
                  background: currentRoute
                    ? `linear-gradient(135deg, ${currentMode.gradientStart}, ${currentMode.color})`
                    : 'rgba(255,255,255,0.08)',
                  boxShadow: currentRoute ? `0 4px 24px ${currentMode.color}40` : 'none',
                }}
              >
                <Navigation size={18} strokeWidth={2.5} />
                Avvia Navigazione
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
