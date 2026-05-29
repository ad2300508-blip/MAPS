import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence, useDragControls } from 'framer-motion';
import { X, MapPin, Navigation, Star, Loader, Copy, Check } from 'lucide-react';
import {
  TRANSPORT_MODES,
  formatDuration,
  formatDistance,
  formatCO2,
  formatCost,
  maneuverToItalian,
  maneuverIcon,
  parseOpenNow,
  haversineMeters,
  localizeType,
} from '../data/mockData';

// ─── Favorites storage ────────────────────────────────────────────────────
function loadFavorites() {
  try { return JSON.parse(localStorage.getItem('via-favorites') ?? '[]'); } catch { return []; }
}
function saveFavorites(list) {
  try { localStorage.setItem('via-favorites', JSON.stringify(list)); } catch { }
}

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
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-sm text-slate-300 leading-snug">{text}</p>
          {step.ref && (
            <span
              className="text-[10px] font-bold px-1 py-0.5 rounded flex-shrink-0"
              style={{ background: 'rgba(255,255,255,0.06)', color: '#64748b' }}
            >
              {step.ref}
            </span>
          )}
        </div>
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

// ─── Address row with copy button ─────────────────────────────────────────
function AddressRow({ text }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  const handleCopy = () => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div className="flex items-start gap-2.5">
      <MapPin size={15} className="text-slate-600 mt-0.5 flex-shrink-0" />
      <p className="text-sm text-slate-400 flex-1 leading-snug">{text}</p>
      {navigator.clipboard && (
        <button
          onClick={handleCopy}
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center focus:outline-none"
          style={{ background: copied ? 'rgba(16,185,129,0.12)' : 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', transition: 'background 0.2s' }}
        >
          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} className="text-slate-500" />}
        </button>
      )}
    </div>
  );
}

// ─── Arrival time helper ──────────────────────────────────────────────────
function arrivalTimeStr(secs) {
  const d = new Date(Date.now() + secs * 1000);
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

// ─── Main component ───────────────────────────────────────────────────────
export default function POIDetailsPanel({
  destination,
  onClose,
  selectedModeId,
  onModeChange,
  routesByProfile,
  altRoutesByProfile,
  routeLoading,
  onStartNavigation,
  userLocation,
  onFitRoute,
}) {
  const isMobile    = useIsMobile();
  const dragControls = useDragControls();
  const [activeTab,  setActiveTab]  = useState('directions');
  const [showAllSteps, setShowAllSteps] = useState(false);
  const [favorites,  setFavorites]  = useState(loadFavorites);
  const isFav = favorites.some((f) => f.name === destination?.name && f.coords?.join() === destination?.coords?.join());

  const saveSpecialPlace = useCallback((type) => {
    if (!destination) return;
    navigator.vibrate?.([20]);
    const place = {
      name:    destination.name,
      address: destination.address,
      coords:  destination.coords,
      emoji:   destination.emoji,
      type:    destination.type,
    };
    try { localStorage.setItem(`via-${type}`, JSON.stringify(place)); } catch { }
    // Notify other components in the same tab (App shortcut chips, FloatingSearchBar)
    window.dispatchEvent(new CustomEvent('via-places-changed'));
  }, [destination]);

  const toggleFavorite = useCallback(() => {
    navigator.vibrate?.([20]);
    setFavorites((prev) => {
      const next = isFav
        ? prev.filter((f) => !(f.name === destination.name && f.coords?.join() === destination.coords?.join()))
        : [{
            name:    destination.name,
            address: destination.address,
            coords:  destination.coords,
            emoji:   destination.emoji,
            type:    destination.type,
            phone:   destination.phone ?? null,
            website: destination.website ?? null,
            hours:   destination.hours ?? null,
            cuisine: destination.cuisine ?? null,
          }, ...prev].slice(0, 20);
      saveFavorites(next);
      return next;
    });
  }, [isFav, destination]);

  const profileMap   = { car: 'driving', walk: 'foot', bike: 'bike', transit: 'driving', moto: 'driving' };
  const currentMode  = TRANSPORT_MODES.find((m) => m.id === selectedModeId) ?? TRANSPORT_MODES[0];
  const currentRoute = routesByProfile?.[profileMap[selectedModeId]];
  const altRoute     = altRoutesByProfile?.[profileMap[selectedModeId]] ?? null;

  useEffect(() => {
    if (destination) { setActiveTab('directions'); setShowAllSteps(false); }
  }, [destination?.name]);

  const variants = isMobile
    ? { hidden: { y: '100%', opacity: 0 }, visible: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } }
    : { hidden: { x: '-100%', opacity: 0 }, visible: { x: 0, opacity: 1 }, exit: { x: '-100%', opacity: 0 } };

  const rawSteps = currentRoute?.legs?.[0]?.steps ?? [];
  // Filter navigation noise from the directions list — keep only meaningful maneuvers
  const FILLER = new Set(['depart', 'continue', 'new name', 'notification']);
  const steps = rawSteps.filter((s) => !FILLER.has(s.maneuver?.type));

  // "Via X" label — first road with a known name or reference after departure
  const viaStep = rawSteps.find((s) => s.maneuver?.type !== 'depart' && (s.ref || s.name));
  const viaLabel = viaStep?.ref ?? (viaStep?.name?.length <= 30 ? viaStep.name : null);

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
                      className="inline-block mt-1 text-[11px] px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(255,255,255,0.07)', color: '#64748b' }}
                    >
                      {localizeType(destination.type)}
                    </span>
                  )}
                  {destination.address && (
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <MapPin size={13} className="text-slate-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-slate-500 leading-relaxed">{destination.address}</p>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Favorite toggle */}
                  <motion.button
                    onClick={toggleFavorite}
                    whileTap={{ scale: 0.85 }}
                    animate={isFav ? { scale: [1, 1.25, 1] } : {}}
                    transition={{ duration: 0.3 }}
                    className="w-9 h-9 rounded-xl flex items-center justify-center focus:outline-none"
                    style={{
                      background: isFav ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${isFav ? 'rgba(251,191,36,0.4)' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    <Star
                      size={16}
                      fill={isFav ? '#fbbf24' : 'none'}
                      style={{ color: isFav ? '#fbbf24' : '#64748b' }}
                    />
                  </motion.button>

                  {/* Close */}
                  <motion.button
                    onClick={onClose}
                    whileTap={{ scale: 0.9 }}
                    className="w-9 h-9 rounded-xl bg-white/6 border border-white/8 flex items-center justify-center focus:outline-none"
                  >
                    <X size={16} className="text-slate-400" />
                  </motion.button>
                </div>
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
                  ) : !userLocation ? (
                    <div className="flex items-center justify-center gap-2 py-6">
                      <span className="text-base">📡</span>
                      <span className="text-sm text-slate-500">In attesa del GPS…</span>
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
                      <p className="text-[11px] text-slate-500 mb-2">
                        Arrivo stimato alle{' '}
                        <span className="font-semibold" style={{ color: currentMode.color }}>
                          {arrivalTimeStr(currentRoute.duration)}
                        </span>
                      </p>
                      <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span>{formatCO2(currentRoute.distance, currentMode)} CO₂</span>
                        {viaLabel && (
                          <>
                            <span>·</span>
                            <span
                              className="px-1.5 py-0.5 rounded font-semibold"
                              style={{ background: 'rgba(255,255,255,0.06)', color: '#64748b' }}
                            >
                              Via {viaLabel}
                            </span>
                          </>
                        )}
                        {onFitRoute && (
                          <button
                            onClick={onFitRoute}
                            className="ml-auto text-[11px] font-semibold focus:outline-none"
                            style={{ color: currentMode.color }}
                          >
                            Vedi tutto
                          </button>
                        )}
                      </div>
                      {selectedModeId === 'transit' && (
                        <p className="text-[11px] text-slate-600 mt-2">
                          ⚠ Percorso approssimativo — verifica gli orari dei mezzi
                        </p>
                      )}
                    </div>
                  ) : null}

                  {/* Alternative route card — only shown when a second OSRM route is available */}
                  {currentRoute && altRoute && !routeLoading && (
                    <div
                      className="rounded-xl px-3 py-2.5"
                      style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-slate-600 uppercase tracking-wide font-semibold">🔀 Alternativa</span>
                        </div>
                        <span className="text-[11px] text-slate-600">
                          +{formatDuration(Math.max(0, altRoute.duration - currentRoute.duration))}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 mt-0.5">
                        <span className="text-sm font-bold text-slate-400 tabular-nums">
                          {formatDuration(altRoute.duration)}
                        </span>
                        <span className="text-xs text-slate-600">{formatDistance(altRoute.distance)}</span>
                      </div>
                    </div>
                  )}

                  {!currentRoute && !routeLoading && userLocation && (
                    <div className="text-center py-4 space-y-1">
                      <p className="text-sm text-slate-600">Percorso non disponibile</p>
                      {destination?.coords && (
                        <p className="text-xs text-slate-700">
                          ~{formatDistance(haversineMeters(userLocation, destination.coords))} in linea d'aria
                        </p>
                      )}
                    </div>
                  )}

                  {/* Turn-by-turn steps */}
                  {steps.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                        Indicazioni passo-passo
                      </p>
                      {(showAllSteps ? steps : steps.slice(0, 8)).map((step, i) => (
                        <StepRow key={i} step={step} index={i} color={currentMode.color} />
                      ))}
                      {steps.length > 8 && (
                        <button
                          onClick={() => setShowAllSteps((v) => !v)}
                          className="w-full text-xs text-center py-2 mt-1 rounded-xl focus:outline-none"
                          style={{ color: currentMode.color, background: `${currentMode.color}0c` }}
                        >
                          {showAllSteps ? 'Mostra meno' : `Mostra tutte le ${steps.length} indicazioni`}
                        </button>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {/* Save as home / work */}
                  <div className="flex gap-2">
                    {[
                      { type: 'home', icon: '🏠', label: 'Casa' },
                      { type: 'work', icon: '💼', label: 'Lavoro' },
                    ].map(({ type, icon, label }) => (
                      <motion.button
                        key={type}
                        whileTap={{ scale: 0.92 }}
                        onClick={() => saveSpecialPlace(type)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-semibold focus:outline-none"
                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#64748b' }}
                      >
                        <span>{icon}</span>
                        <span>Imposta come {label}</span>
                      </motion.button>
                    ))}
                  </div>

                  {/* Address */}
                  {(destination.address || destination.name) && (
                    <AddressRow text={destination.address || destination.name} />
                  )}

                  {/* Cuisine */}
                  {destination.cuisine && (
                    <div className="flex items-center gap-2.5">
                      <span className="text-slate-600 text-sm">🍴</span>
                      <p className="text-sm text-slate-400 capitalize">{destination.cuisine.replace(/;/g, ', ')}</p>
                    </div>
                  )}

                  {/* Opening hours */}
                  {destination.hours && (() => {
                    const openNow = parseOpenNow(destination.hours);
                    return (
                      <div className="flex items-start gap-2.5">
                        <span className="text-slate-600 text-sm">🕐</span>
                        <div className="flex-1 min-w-0">
                          {openNow !== null && (
                            <span
                              className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-1"
                              style={
                                openNow
                                  ? { background: 'rgba(16,185,129,0.15)', color: '#10b981', border: '1px solid rgba(16,185,129,0.3)' }
                                  : { background: 'rgba(239,68,68,0.12)',  color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }
                              }
                            >
                              {openNow ? 'Aperto ora' : 'Chiuso'}
                            </span>
                          )}
                          <p className="text-xs text-slate-400 leading-relaxed">{destination.hours}</p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Phone */}
                  {destination.phone && (
                    <a
                      href={`tel:${destination.phone}`}
                      className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    >
                      <span style={{ fontSize: 16 }}>📞</span>
                      {destination.phone}
                    </a>
                  )}

                  {/* Website */}
                  {destination.website && (
                    <a
                      href={destination.website.startsWith('http') ? destination.website : `https://${destination.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium truncate"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    >
                      <span style={{ fontSize: 16 }}>🌐</span>
                      <span className="truncate">{destination.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}</span>
                    </a>
                  )}

                  {/* Open in Google Maps / directions */}
                  {destination.coords && (
                    <a
                      href={
                        userLocation
                          ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation[1]},${userLocation[0]}&destination=${destination.coords[1]},${destination.coords[0]}`
                          : `https://www.google.com/maps/search/?api=1&query=${destination.coords[1]},${destination.coords[0]}`
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#94a3b8' }}
                    >
                      <span style={{ fontSize: 16 }}>🗺️</span>
                      {userLocation ? 'Indicazioni in Google Maps' : 'Apri in Google Maps'}
                    </a>
                  )}

                  {/* Share */}
                  {typeof navigator.share === 'function' && destination.coords && (
                    <button
                      onClick={() => navigator.share({
                        title: destination.name,
                        text: `${destination.name}${destination.address ? '\n' + destination.address : ''}`,
                        url: `https://www.google.com/maps/search/?api=1&query=${destination.coords[1]},${destination.coords[0]}`,
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
