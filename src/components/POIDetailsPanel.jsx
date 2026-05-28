import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Star, MapPin, Navigation, Bookmark, Share2, ChevronRight,
} from 'lucide-react';
import { TRANSPORT_MODES } from '../data/mockData';

// ─── Responsive hook ──────────────────────────────────────────────────────
function useIsMobile() {
  const [v, setV] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const h = () => setV(window.innerWidth < 768);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return v;
}

// ─── Helpers ─────────────────────────────────────────────────────────────
function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={12}
          className={n <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-slate-700'}
          strokeWidth={1.5}
        />
      ))}
    </div>
  );
}

function Tag({ label, color }) {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium"
      style={{ background: `${color}18`, color, border: `1px solid ${color}30` }}
    >
      {label}
    </span>
  );
}

function ActionButton({ icon: Icon, label, primary, color, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04, y: -1 }}
      whileTap={{ scale: 0.96 }}
      className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl focus:outline-none"
      style={
        primary
          ? {
              background: `linear-gradient(135deg, ${color ?? '#4361ee'}, ${color ? color + 'cc' : '#4cc9f0'})`,
              boxShadow: `0 4px 20px ${color ?? '#4cc9f0'}40`,
            }
          : {
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
            }
      }
    >
      <Icon size={18} className={primary ? 'text-white' : 'text-slate-300'} strokeWidth={2} />
      <span className={`text-xs font-medium ${primary ? 'text-white' : 'text-slate-400'}`}>
        {label}
      </span>
    </motion.button>
  );
}

// ─── Inline transport mode selector (in Directions tab) ──────────────────
function InlineModeSelector({ selectedModeId, onModeChange }) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
      {TRANSPORT_MODES.map((mode) => {
        const sel = mode.id === selectedModeId;
        return (
          <motion.button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            whileTap={{ scale: 0.94 }}
            className="flex-shrink-0 flex flex-col items-center gap-0.5 px-3 py-2.5 rounded-2xl focus:outline-none"
            style={
              sel
                ? {
                    background: `${mode.color}1a`,
                    border: `1.5px solid ${mode.color}55`,
                    boxShadow: `0 0 12px ${mode.color}20`,
                  }
                : {
                    background: 'rgba(255,255,255,0.04)',
                    border: '1.5px solid rgba(255,255,255,0.07)',
                  }
            }
          >
            <span className="text-lg leading-none">{mode.icon}</span>
            <span
              className="text-[11px] font-semibold leading-none mt-0.5"
              style={{ color: sel ? mode.color : '#64748b' }}
            >
              {mode.shortLabel}
            </span>
            <span
              className="text-[11px] font-bold leading-none"
              style={{ color: sel ? mode.color : '#94a3b8' }}
            >
              {mode.duration}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Mode comparison table ────────────────────────────────────────────────
function ModeCompareTable({ selectedModeId, onModeChange }) {
  const CO2_COLOR = (g) => (g === 0 ? '#10b981' : g < 120 ? '#f59e0b' : '#ef4444');

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.07)' }}
    >
      <div className="px-3 py-2 bg-white/[0.03] border-b border-white/[0.05]">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
          Confronto mezzi
        </span>
      </div>
      {TRANSPORT_MODES.map((mode, i) => {
        const sel = mode.id === selectedModeId;
        return (
          <motion.button
            key={mode.id}
            onClick={() => onModeChange(mode.id)}
            whileTap={{ scale: 0.99 }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left focus:outline-none
              ${i < TRANSPORT_MODES.length - 1 ? 'border-b border-white/[0.04]' : ''}
            `}
            style={sel ? { background: `${mode.color}0e` } : {}}
          >
            <span className="text-base w-5 text-center flex-shrink-0">{mode.icon}</span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="text-sm font-semibold"
                  style={{ color: sel ? mode.color : '#e2e8f0' }}
                >
                  {mode.duration}
                </span>
                <span className="text-xs text-slate-500">{mode.distance}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-600">{mode.cost}</span>
                <span
                  className="text-xs font-medium"
                  style={{ color: CO2_COLOR(mode.co2Grams) }}
                >
                  {mode.co2} CO₂
                </span>
              </div>
            </div>

            {sel && (
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: mode.color, boxShadow: `0 0 6px ${mode.color}` }}
              />
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ─── Turn-by-turn step ────────────────────────────────────────────────────
function StepRow({ step, index, color }) {
  const isTransitLine = step.text.startsWith('🚆') || step.text.startsWith('   ');
  return (
    <div
      className="flex items-start gap-3 py-2.5 border-b border-white/[0.05] last:border-0"
    >
      {isTransitLine ? (
        <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
          <div className="w-0.5 h-5 rounded-full" style={{ background: color }} />
        </div>
      ) : (
        <div
          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${color}99, ${color})` }}
        >
          {index + 1}
        </div>
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-300 leading-snug">{step.text}</p>
        {(step.dist || step.dur) && step.dur !== 'Arrivo' && (
          <p className="text-xs text-slate-600 mt-0.5">
            {[step.dist, step.dur].filter(Boolean).join(' · ')}
          </p>
        )}
        {step.dur === 'Arrivo' && (
          <p className="text-xs font-semibold mt-0.5" style={{ color }}>Arrivo</p>
        )}
      </div>

      {!isTransitLine && step.dur !== 'Arrivo' && (
        <ChevronRight size={14} className="text-slate-700 mt-0.5 flex-shrink-0" />
      )}
    </div>
  );
}

// ─── Directions tab content ───────────────────────────────────────────────
function DirectionsContent({ poi, selectedModeId, onModeChange }) {
  const mode = TRANSPORT_MODES.find((m) => m.id === selectedModeId) ?? TRANSPORT_MODES[0];
  const TRAFFIC_DOT = { light: '#10b981', moderate: '#f59e0b', heavy: '#ef4444' };
  const [showAlt, setShowAlt] = useState(false);

  return (
    <div className="space-y-4">
      {/* Inline mode selector */}
      <InlineModeSelector selectedModeId={selectedModeId} onModeChange={onModeChange} />

      {/* Route summary card */}
      <div
        className="rounded-2xl p-4"
        style={{
          background: `${mode.color}0c`,
          border: `1px solid ${mode.color}25`,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <motion.span
              className="w-2 h-2 rounded-full"
              style={{ background: TRAFFIC_DOT[mode.traffic] ?? '#10b981' }}
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 2 }}
            />
            <span className="text-xs text-slate-400">{mode.trafficLabel}</span>
          </div>
          <span className="text-xs text-slate-500">{poi.name}</span>
        </div>

        <div className="flex items-baseline gap-3">
          <span className="text-2xl font-bold" style={{ color: mode.color }}>
            {mode.duration}
          </span>
          <span className="text-sm text-slate-400">{mode.distance}</span>
          <span className="text-xs text-slate-500 ml-auto">{mode.cost}</span>
        </div>

        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-xs text-slate-500">Partenza: La tua posizione</span>
          <span className="text-xs text-slate-600">→</span>
          <span className="text-xs text-slate-500">{poi.name}</span>
        </div>
      </div>

      {/* Alternative routes */}
      {mode.alternatives.length > 0 && (
        <div>
          <button
            onClick={() => setShowAlt((v) => !v)}
            className="flex items-center gap-1 text-xs font-semibold mb-2 focus:outline-none"
            style={{ color: mode.color }}
          >
            {showAlt ? '▼' : '▶'} Percorsi alternativi ({mode.alternatives.length})
          </button>
          <AnimatePresence>
            {showAlt && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden space-y-1.5"
              >
                {mode.alternatives.map((alt, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between px-3 py-2.5 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div>
                      <p className="text-xs font-medium text-slate-300">{alt.label}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{alt.distance}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{alt.duration}</p>
                      <p
                        className="text-xs"
                        style={{
                          color: alt.traffic === 'heavy' ? '#ef4444' : alt.traffic === 'moderate' ? '#f59e0b' : '#10b981',
                        }}
                      >
                        {alt.traffic === 'heavy' ? 'Congestionato' : alt.traffic === 'moderate' ? 'Moderato' : 'Scorrevole'}
                      </p>
                    </div>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Step-by-step */}
      <div>
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
          Indicazioni
        </p>
        <div className="space-y-0">
          {mode.steps.map((step, i) => (
            <StepRow key={i} step={step} index={i} color={mode.color} />
          ))}
        </div>
      </div>

      {/* Mode comparison */}
      <ModeCompareTable selectedModeId={selectedModeId} onModeChange={onModeChange} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────
export default function POIDetailsPanel({ poi, onClose, selectedModeId, onModeChange }) {
  const isMobile  = useIsMobile();
  const [activeTab, setActiveTab] = useState('overview');
  const currentMode = TRANSPORT_MODES.find((m) => m.id === selectedModeId) ?? TRANSPORT_MODES[0];

  useEffect(() => {
    if (poi) setActiveTab('overview');
  }, [poi?.id]);

  // Mobile: panel sits ABOVE the TransportModeSelector (~84px) + safe area
  // Desktop: left sidebar, full height
  const variants = isMobile
    ? { hidden: { y: '100%', opacity: 0 }, visible: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } }
    : { hidden: { x: '-100%', opacity: 0 }, visible: { x: 0, opacity: 1 }, exit: { x: '-100%', opacity: 0 } };

  return (
    <AnimatePresence>
      {poi && (
        <motion.div
          key={poi.id}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          className="absolute glass-bright overflow-hidden"
          style={{
            zIndex: 30,
            // Mobile: float above the mode selector bar (≈84px + safe area)
            ...(isMobile
              ? {
                  bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))',
                  left: 0,
                  right: 0,
                  borderRadius: '24px 24px 0 0',
                  maxHeight: 'calc(100dvh - 160px)',
                }
              : {
                  top: 0,
                  bottom: 0,
                  left: 0,
                  width: 390,
                  borderRadius: 0,
                }),
          }}
        >
          <div className="flex flex-col h-full max-h-full">
            {/* Drag handle (mobile) */}
            {isMobile && (
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>
            )}

            {/* Header */}
            <div className="flex-shrink-0 px-5 pt-4 pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl leading-none">{poi.emoji}</span>
                    <span
                      className="text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
                      style={{ color: poi.color, background: `${poi.color}15`, border: `1px solid ${poi.color}30` }}
                    >
                      {poi.category}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white leading-tight mt-1">{poi.name}</h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StarRating rating={poi.rating} />
                    <span className="text-sm font-semibold text-amber-400">{poi.rating}</span>
                    <span className="text-xs text-slate-600">
                      ({(poi.reviews / 1000).toFixed(0)}k recensioni)
                    </span>
                  </div>
                </div>

                <motion.button
                  onClick={onClose}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="flex-shrink-0 w-9 h-9 rounded-xl bg-white/6 border border-white/8 flex items-center justify-center hover:bg-white/12 transition-colors focus:outline-none"
                >
                  <X size={16} className="text-slate-400" />
                </motion.button>
              </div>

              {/* Open/Closed */}
              <div className="flex items-center gap-2 mt-3">
                <span
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${
                    poi.isOpen
                      ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20'
                      : 'text-red-400 bg-red-400/10 border border-red-400/20'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${poi.isOpen ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  {poi.isOpen ? 'Aperto' : 'Chiuso'}
                </span>
                <span className="text-xs text-slate-500">{poi.openHours}</span>
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mt-4 p-1 rounded-xl bg-white/4 border border-white/6">
                {['overview', 'directions'].map((tab) => (
                  <motion.button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className="relative flex-1 py-2 text-xs font-semibold rounded-lg focus:outline-none"
                    style={{ color: activeTab === tab ? '#fff' : '#64748b' }}
                  >
                    {activeTab === tab && (
                      <motion.div
                        layoutId="tab-bg"
                        className="absolute inset-0 rounded-lg"
                        style={{
                          background: `linear-gradient(135deg, ${currentMode.gradientStart}30, ${currentMode.gradientEnd}30)`,
                          border: `1px solid ${currentMode.color}30`,
                        }}
                        transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                      />
                    )}
                    <span className="relative z-10">
                      {tab === 'overview' ? 'Panoramica' : 'Percorso'}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {activeTab === 'overview' ? (
                <>
                  {/* Photo placeholder */}
                  <div
                    className="w-full h-36 rounded-2xl flex items-center justify-center overflow-hidden relative"
                    style={{
                      background: `linear-gradient(135deg, ${poi.color}20, ${poi.color}08)`,
                      border: `1px solid ${poi.color}20`,
                    }}
                  >
                    <span className="text-6xl opacity-40 select-none">{poi.emoji}</span>
                    <div
                      className="absolute inset-0 rounded-2xl"
                      style={{ background: 'linear-gradient(to bottom, transparent 40%, rgba(16,16,28,0.85))' }}
                    />
                    <div className="absolute bottom-3 left-3 text-xs text-white/60">
                      {poi.photos} foto disponibili
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <MapPin size={15} className="text-slate-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-slate-400 leading-relaxed">{poi.address}</span>
                  </div>

                  <p className="text-sm text-slate-400 leading-relaxed">{poi.description}</p>

                  <div className="flex flex-wrap gap-2">
                    {poi.tags.map((tag) => <Tag key={tag} label={tag} color={poi.color} />)}
                  </div>
                </>
              ) : (
                <DirectionsContent
                  poi={poi}
                  selectedModeId={selectedModeId}
                  onModeChange={onModeChange}
                />
              )}
            </div>

            {/* Action buttons */}
            <div className="flex-shrink-0 px-5 pb-5 pt-3 flex gap-3 border-t border-white/5">
              <ActionButton
                icon={Navigation}
                label="Naviga"
                primary
                color={currentMode.color}
                onClick={() => {}}
              />
              <ActionButton icon={Bookmark} label="Salva"      onClick={() => {}} />
              <ActionButton icon={Share2}   label="Condividi"  onClick={() => {}} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
