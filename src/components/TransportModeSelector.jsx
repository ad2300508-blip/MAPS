import { motion, AnimatePresence } from 'framer-motion';
import { Loader } from 'lucide-react';
import { TRANSPORT_MODES, formatDuration, formatDistance, formatCO2, formatCost } from '../data/mockData';

function ModeChip({ mode, isSelected, routeData, loading, onClick }) {
  const dur = routeData ? formatDuration(routeData.duration) : null;

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.92 }}
      className="flex-1 min-w-0 flex flex-col items-center gap-0.5 py-2.5 px-1 rounded-2xl focus:outline-none"
      style={
        isSelected
          ? { background: `${mode.color}1a`, border: `1.5px solid ${mode.color}55`, boxShadow: `0 0 14px ${mode.color}20` }
          : { background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.07)' }
      }
      animate={{ y: isSelected ? -1 : 0 }}
      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
    >
      <span className="text-xl leading-none">{mode.icon}</span>
      <span className="text-[11px] font-semibold leading-none mt-0.5" style={{ color: isSelected ? mode.color : '#64748b' }}>
        {mode.shortLabel}
      </span>
      {loading && isSelected ? (
        <Loader size={10} className="animate-spin text-slate-500" />
      ) : dur ? (
        <span className="text-[11px] font-bold leading-none" style={{ color: isSelected ? mode.color : '#94a3b8' }}>
          {dur}
        </span>
      ) : null}
    </motion.button>
  );
}

export default function TransportModeSelector({
  selectedModeId,
  onModeChange,
  destination,
  routesByProfile,  // { driving, foot, bike } — OSRM route objects
  routeLoading,
}) {
  const selectedMode = TRANSPORT_MODES.find((m) => m.id === selectedModeId) ?? TRANSPORT_MODES[0];

  // Route for the currently selected mode
  const profileMap = { car: 'driving', walk: 'foot', bike: 'bike', transit: 'driving', moto: 'driving' };
  const currentRoute = routesByProfile?.[profileMap[selectedModeId]];
  const hasDestination = !!destination && !!currentRoute;

  const distStr = currentRoute ? formatDistance(currentRoute.distance) : null;
  const co2Str  = currentRoute ? formatCO2(currentRoute.distance, selectedMode) : null;
  const costStr = currentRoute ? formatCost(currentRoute.distance, selectedMode) : null;

  return (
    <motion.div
      className="absolute bottom-0 left-0 right-0 z-20"
      initial={{ y: 120, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 36, delay: 0.15 }}
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      <div
        className="mx-3 mb-3 rounded-3xl overflow-hidden"
        style={{
          background: 'rgba(12,12,20,0.92)',
          backdropFilter: 'blur(28px) saturate(200%)',
          WebkitBackdropFilter: 'blur(28px) saturate(200%)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: '0 -4px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Route summary */}
        <AnimatePresence>
          {hasDestination && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              className="overflow-hidden"
            >
              <div className="px-4 pt-3 pb-2 border-b border-white/[0.06]">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <motion.span
                      className="w-2 h-2 rounded-full"
                      style={{ background: selectedMode.color }}
                      animate={{ opacity: [1, 0.3, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    />
                    <span className="text-xs text-slate-400">
                      {selectedMode.co2PerKm === 0 ? 'Emissioni zero' : `${selectedMode.co2PerKm} g CO₂/km`}
                    </span>
                  </div>
                  <span className="text-xs text-slate-500 truncate max-w-[140px]">→ {destination.name}</span>
                </div>

                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-2xl font-bold text-white tabular-nums">
                    {formatDuration(currentRoute.duration)}
                  </span>
                  <span className="text-sm text-slate-400">{distStr}</span>
                  {co2Str && (
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded-md"
                      style={{ color: selectedMode.co2PerKm === 0 ? '#10b981' : '#f59e0b', background: 'rgba(255,255,255,0.06)' }}>
                      {co2Str} CO₂
                    </span>
                  )}
                  <span className="ml-auto text-sm font-semibold" style={{ color: selectedMode.color }}>
                    {costStr}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Mode chips */}
        <div className="flex gap-1.5 px-2.5 py-2.5">
          {TRANSPORT_MODES.map((mode) => {
            const profile = profileMap[mode.id];
            const rd = routesByProfile?.[profile];
            return (
              <ModeChip
                key={mode.id}
                mode={mode}
                isSelected={selectedModeId === mode.id}
                routeData={rd}
                loading={routeLoading && selectedModeId === mode.id}
                onClick={() => onModeChange(mode.id)}
              />
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
