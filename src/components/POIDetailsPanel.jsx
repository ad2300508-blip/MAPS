import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Star,
  Clock,
  MapPin,
  Navigation,
  Bookmark,
  Share2,
  ChevronRight,
  Route,
} from 'lucide-react';

// Detect mobile breakpoint
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}

function StarRating({ rating }) {
  return (
    <div className="flex items-center gap-1">
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
      style={{
        background: `${color}18`,
        color: color,
        border: `1px solid ${color}30`,
      }}
    >
      {label}
    </span>
  );
}

function ActionButton({ icon: Icon, label, primary, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.04, y: -1 }}
      whileTap={{ scale: 0.96 }}
      className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl focus:outline-none transition-colors"
      style={
        primary
          ? {
              background: 'linear-gradient(135deg, #4361ee, #4cc9f0)',
              boxShadow: '0 4px 20px rgba(76,201,240,0.3)',
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

function RouteInfoRow({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`text-sm font-semibold ${accent ? 'text-[#4cc9f0]' : 'text-white'}`}>
        {value}
      </span>
    </div>
  );
}

export default function POIDetailsPanel({ poi, onClose }) {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState('overview');

  // Reset tab when POI changes
  useEffect(() => {
    if (poi) setActiveTab('overview');
  }, [poi?.id]);

  // Panel animation variants
  const variants = isMobile
    ? {
        hidden: { y: '100%', opacity: 0 },
        visible: { y: 0, opacity: 1 },
        exit: { y: '100%', opacity: 0 },
      }
    : {
        hidden: { x: '-100%', opacity: 0 },
        visible: { x: 0, opacity: 1 },
        exit: { x: '-100%', opacity: 0 },
      };

  const transition = {
    type: 'spring',
    stiffness: 420,
    damping: 38,
  };

  return (
    <AnimatePresence>
      {poi && (
        <motion.div
          key={poi.id}
          variants={variants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={transition}
          className={`
            absolute glass-bright overflow-hidden
            ${isMobile
              ? 'bottom-0 left-0 right-0 rounded-t-3xl max-h-[70vh]'
              : 'left-0 top-0 bottom-0 w-[380px] rounded-none'
            }
          `}
          style={{ zIndex: 30 }}
        >
          <div className="flex flex-col h-full max-h-full">
            {/* ── Drag handle (mobile only) ── */}
            {isMobile && (
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-white/15" />
              </div>
            )}

            {/* ── Header ── */}
            <div className="flex-shrink-0 px-5 pt-4 pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-2xl leading-none">{poi.emoji}</span>
                    <span
                      className="text-xs font-semibold uppercase tracking-widest px-2 py-0.5 rounded-md"
                      style={{
                        color: poi.color,
                        background: `${poi.color}15`,
                        border: `1px solid ${poi.color}30`,
                      }}
                    >
                      {poi.category}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white leading-tight mt-1">
                    {poi.name}
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5">
                    <StarRating rating={poi.rating} />
                    <span className="text-sm font-semibold text-amber-400">
                      {poi.rating}
                    </span>
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

              {/* Open/Closed badge */}
              <div className="flex items-center gap-2 mt-3">
                <span
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg ${
                    poi.isOpen
                      ? 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20'
                      : 'text-red-400 bg-red-400/10 border border-red-400/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${poi.isOpen ? 'bg-emerald-400' : 'bg-red-400'}`}
                  />
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
                    className="relative flex-1 py-2 text-xs font-semibold rounded-lg focus:outline-none transition-colors capitalize"
                    style={{
                      color: activeTab === tab ? '#fff' : '#64748b',
                    }}
                  >
                    {activeTab === tab && (
                      <motion.div
                        layoutId="tab-indicator"
                        className="absolute inset-0 rounded-lg"
                        style={{
                          background: 'linear-gradient(135deg, #4361ee40, #4cc9f040)',
                          border: '1px solid rgba(76,201,240,0.2)',
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

            {/* ── Scrollable content ── */}
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
                      style={{
                        background:
                          'linear-gradient(to bottom, transparent 40%, rgba(16,16,28,0.8))',
                      }}
                    />
                    <div className="absolute bottom-3 left-3 flex items-center gap-1 text-xs text-white/60">
                      <span>{poi.photos} foto disponibili</span>
                    </div>
                  </div>

                  {/* Address */}
                  <div className="flex items-start gap-2.5">
                    <MapPin size={15} className="text-slate-600 mt-0.5 flex-shrink-0" />
                    <span className="text-sm text-slate-400 leading-relaxed">{poi.address}</span>
                  </div>

                  {/* Description */}
                  <p className="text-sm text-slate-400 leading-relaxed">{poi.description}</p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    {poi.tags.map((tag) => (
                      <Tag key={tag} label={tag} color={poi.color} />
                    ))}
                  </div>
                </>
              ) : (
                <>
                  {/* Route summary card */}
                  <div className="gradient-border rounded-2xl p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Route size={16} className="text-[#4cc9f0]" />
                      <span className="text-sm font-semibold text-white">
                        Percorso Consigliato
                      </span>
                    </div>
                    <RouteInfoRow label="Durata stimata" value={poi.duration} accent />
                    <RouteInfoRow label="Distanza" value={poi.distance} />
                    <RouteInfoRow label="Partenza" value="La tua posizione" />
                    <RouteInfoRow label="Arrivo" value={poi.name} />
                    <RouteInfoRow label="Traffico" value="Moderato" />
                  </div>

                  {/* Step-by-step placeholder */}
                  <div className="space-y-2">
                    {[
                      { step: 1, text: 'Dirigiti verso ouest su Île de la Cité', dist: '0.3 km' },
                      { step: 2, text: 'Svolta a sinistra su Quai des Grands Augustins', dist: '0.8 km' },
                      { step: 3, text: 'Prosegui su Pont de l\'Alma', dist: '1.2 km' },
                      { step: 4, text: 'Arriverai a Tour Eiffel sulla sinistra', dist: '0.8 km' },
                    ].map((s) => (
                      <div
                        key={s.step}
                        className="flex items-start gap-3 py-2.5 border-b border-white/5 last:border-0"
                      >
                        <div
                          className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                          style={{
                            background: 'linear-gradient(135deg, #4361ee, #4cc9f0)',
                            color: '#fff',
                          }}
                        >
                          {s.step}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm text-slate-300 leading-snug">{s.text}</p>
                          <p className="text-xs text-slate-600 mt-0.5">{s.dist}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-700 mt-0.5 flex-shrink-0" />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* ── Action buttons ── */}
            <div className="flex-shrink-0 px-5 pb-6 pt-3 flex gap-3 border-t border-white/5">
              <ActionButton icon={Navigation} label="Naviga" primary onClick={() => {}} />
              <ActionButton icon={Bookmark} label="Salva" onClick={() => {}} />
              <ActionButton icon={Share2} label="Condividi" onClick={() => {}} />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
