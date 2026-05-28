import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MapView from './components/MapView';
import FloatingSearchBar from './components/FloatingSearchBar';
import POIDetailsPanel from './components/POIDetailsPanel';
import MapControls from './components/MapControls';
import TransportModeSelector from './components/TransportModeSelector';
import NavigationHUD from './components/NavigationHUD';
import ArrivedOverlay from './components/ArrivedOverlay';
import { useGeolocation } from './hooks/useGeolocation';
import { useCompassHeading } from './hooks/useCompassHeading';
import { useOSRM } from './hooks/useOSRM';
import { useSpeech } from './hooks/useSpeech';
import { useWakeLock } from './hooks/useWakeLock';
import { getModeById, haversineMeters, maneuverToItalian, formatDistance } from './data/mockData';

export default function App() {
  const [destination,    setDestination]    = useState(null);   // {name, address, coords, emoji}
  const [navDestCoords,  setNavDestCoords]  = useState(null);   // kept during navigation for OSRM
  const [navDestName,    setNavDestName]    = useState('');
  const [selectedModeId, setSelectedModeId] = useState('car');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [is3DMode,       setIs3DMode]       = useState(true);
  const [isNavigating,   setIsNavigating]   = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isOffRoute,     setIsOffRoute]     = useState(false);
  const [hasArrived,     setHasArrived]     = useState(false);
  const [mapCentered,    setMapCentered]    = useState(true);
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const mapApiRef    = useRef(null);
  const navDestRef   = useRef(null);   // keeps destination marker visible during navigation

  // ── Real GPS + compass ──────────────────────────────────────────────────
  const { location: userLocation, heading: gpsHeading, speed, accuracy, error: gpsError } = useGeolocation();
  const compassHeading = useCompassHeading();
  const userHeading = gpsHeading ?? compassHeading;

  // ── Voice ───────────────────────────────────────────────────────────────
  const { speak, cancel } = useSpeech();

  // ── Keep screen on during navigation ────────────────────────────────────
  useWakeLock(isNavigating);

  // ── Offline detection ────────────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Real routing ────────────────────────────────────────────────────────
  // navDestCoords persists through navigation so OSRM can reroute off-path.
  // During navigation only the active profile fetches — saves 2/3 of requests.
  const profileMap    = { car: 'driving', walk: 'foot', bike: 'bike', transit: 'driving', moto: 'driving' };
  const currentProfile = profileMap[selectedModeId];
  const routingCoords = navDestCoords ?? destination?.coords;
  const drivingDest   = (!isNavigating || currentProfile === 'driving') ? routingCoords : null;
  const footDest      = (!isNavigating || currentProfile === 'foot')    ? routingCoords : null;
  const bikeDest      = (!isNavigating || currentProfile === 'bike')    ? routingCoords : null;
  const { route: drivingRoute, loading: drivingLoading } = useOSRM(userLocation, drivingDest, 'driving');
  const { route: footRoute,    loading: footLoading    } = useOSRM(userLocation, footDest,    'foot');
  const { route: bikeRoute,    loading: bikeLoading    } = useOSRM(userLocation, bikeDest,    'bike');
  const routesByProfile = useMemo(
    () => ({ driving: drivingRoute, foot: footRoute, bike: bikeRoute }),
    [drivingRoute, footRoute, bikeRoute],
  );

  const currentRoute  = routesByProfile[currentProfile];
  const routeLoading  = drivingLoading || footLoading || bikeLoading;

  const handleMapLoaded = useCallback((mapApi) => { mapApiRef.current = mapApi; }, []);

  // ── Destination selected ────────────────────────────────────────────────
  const handleDestinationSelect = useCallback((dest) => {
    navigator.vibrate?.([30]);  // light tap feedback
    setDestination(dest);
    setIsSearchActive(false);
    setIsNavigating(false);
    setCurrentStepIdx(0);
    setIsOffRoute(false);
    setNavDestCoords(null);
    setHasArrived(false);

    if (userLocation) {
      const west  = Math.min(userLocation[0], dest.coords[0]);
      const east  = Math.max(userLocation[0], dest.coords[0]);
      const south = Math.min(userLocation[1], dest.coords[1]);
      const north = Math.max(userLocation[1], dest.coords[1]);
      mapApiRef.current?.fitBounds([[west, south], [east, north]], {
        padding: 80, pitch: is3DMode ? 48 : 0, bearing: 0, duration: 1600,
      });
    } else {
      mapApiRef.current?.flyTo({
        center: dest.coords, zoom: 14,
        pitch: is3DMode ? 48 : 0, duration: 1400, essential: true,
      });
    }
  }, [userLocation, is3DMode]);

  // ── Long press → reverse geocode → set destination ─────────────────────
  const handleLongPress = useCallback(async ([lng, lat]) => {
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'it' } },
      );
      const data = await res.json();
      handleDestinationSelect({
        name:    data.name || data.display_name?.split(',')[0] || 'Posizione',
        address: data.display_name || '',
        coords:  [lng, lat],
        emoji:   '📍',
      });
    } catch {
      handleDestinationSelect({
        name: 'Posizione selezionata', address: '', coords: [lng, lat], emoji: '📍',
      });
    }
  }, [handleDestinationSelect]);

  const handlePOITap = useCallback((poi) => {
    handleDestinationSelect({
      name: poi.name, address: poi.address ?? '',
      coords: poi.coords, emoji: poi.emoji, type: poi.type,
    });
  }, [handleDestinationSelect]);

  const handleClosePanel = useCallback(() => {
    setDestination(null);
    setIsNavigating(false);
    setCurrentStepIdx(0);
    setNavDestCoords(null);
  }, []);

  const handleModeChange = useCallback((modeId) => {
    setSelectedModeId(modeId);
  }, []);

  // ── Start navigation ────────────────────────────────────────────────────
  const handleStartNavigation = useCallback(() => {
    if (!currentRoute || !destination) return;
    navigator.vibrate?.([60, 40, 60]);  // double tap = navigation start
    const coords = destination.coords;
    const name   = destination.name;
    setNavDestCoords(coords);
    setNavDestName(name);
    prevStepRef.current = 0;  // prevent step voice effect from double-speaking the start instruction
    setIsNavigating(true);
    setCurrentStepIdx(0);
    setHasArrived(false);
    setDestination(null);  // collapses the panel; OSRM now uses navDestCoords

    // Speak the first maneuver
    const steps = currentRoute.legs?.[0]?.steps ?? [];
    if (steps[0]) {
      const instruction = maneuverToItalian(
        steps[0].maneuver?.type, steps[0].maneuver?.modifier, steps[0].name ?? '',
        steps[0].maneuver?.exit,
      );
      speak(`Navigazione avviata. ${instruction}`);
    }
  }, [currentRoute, destination, speak]);

  // ── Stop navigation ─────────────────────────────────────────────────────
  const handleStopNavigation = useCallback((arrived = false) => {
    setIsNavigating(false);
    setCurrentStepIdx(0);
    setIsOffRoute(false);
    setNavDestCoords(null);
    navDestRef.current = null;  // clear destination marker
    cancel();
    if (arrived) {
      setHasArrived(true);
      speak('Sei arrivato a destinazione');
      navigator.vibrate?.([100, 80, 100, 80, 200]);
    }
    if (userLocation) {
      mapApiRef.current?.flyTo({
        center: userLocation, zoom: 15,
        pitch: is3DMode ? 52 : 0, bearing: 0, duration: 1200,
      });
    }
  }, [userLocation, is3DMode, speak, cancel]);

  // ── Auto-advance steps ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isNavigating || !userLocation || !currentRoute) return;
    const steps = currentRoute.legs?.[0]?.steps ?? [];
    if (currentStepIdx >= steps.length - 1) return;
    const nextLoc = steps[currentStepIdx + 1]?.maneuver?.location;
    if (!nextLoc) return;
    if (haversineMeters(userLocation, nextLoc) < 50) {
      setCurrentStepIdx((i) => i + 1);
    }
  }, [userLocation, isNavigating, currentRoute, currentStepIdx]);

  // ── Voice on step change ────────────────────────────────────────────────
  const prevStepRef = useRef(-1);
  useEffect(() => {
    if (!isNavigating || !currentRoute || currentStepIdx === prevStepRef.current) return;
    const prev = prevStepRef.current;
    prevStepRef.current = currentStepIdx;
    // Step went backward = route reset; skip voice (reroute handler already spoke)
    if (currentStepIdx < prev && prev !== -1) return;
    const steps = currentRoute.legs?.[0]?.steps ?? [];
    const step  = steps[currentStepIdx];
    if (!step) return;
    speak(maneuverToItalian(step.maneuver?.type, step.maneuver?.modifier, step.name ?? '', step.maneuver?.exit));
  }, [currentStepIdx, isNavigating, currentRoute, speak]);

  // ── Voice + haptic turn warnings ────────────────────────────────────────
  const vibrate = useCallback((pattern) => { navigator.vibrate?.(pattern); }, []);
  const spokenAt200Ref    = useRef(false);
  const spokenAt60Ref     = useRef(false);
  const warnStepRef       = useRef(-1);  // reset refs when step changes
  useEffect(() => {
    if (!isNavigating || !userLocation || !currentRoute) return;
    // Reset warning flags when the step changes
    if (warnStepRef.current !== currentStepIdx) {
      warnStepRef.current    = currentStepIdx;
      spokenAt200Ref.current = false;
      spokenAt60Ref.current  = false;
    }
    const steps    = currentRoute.legs?.[0]?.steps ?? [];
    const nextStep = steps[currentStepIdx + 1];
    if (!nextStep) return;
    const nextLoc = nextStep.maneuver?.location;
    if (!nextLoc) return;
    const dist = haversineMeters(userLocation, nextLoc);
    const instr = maneuverToItalian(
      nextStep.maneuver?.type, nextStep.maneuver?.modifier, nextStep.name ?? '',
      nextStep.maneuver?.exit,
    );

    if (dist < 200 && dist >= 60 && !spokenAt200Ref.current) {
      spokenAt200Ref.current = true;
      spokenAt60Ref.current  = false;
      speak(`Tra ${formatDistance(dist)}, ${instr}`);
      vibrate([60]);
    } else if (dist < 60 && !spokenAt60Ref.current) {
      spokenAt60Ref.current  = true;
      speak(instr, { urgent: true });
      vibrate([80, 60, 80]);
    } else if (dist >= 200) {
      spokenAt200Ref.current = false;
      spokenAt60Ref.current  = false;
    }
  }, [userLocation, isNavigating, currentRoute, currentStepIdx, speak, vibrate]);

  // ── Off-route detection + announcement ──────────────────────────────────
  const prevOffRouteRef = useRef(false);
  useEffect(() => {
    if (!isNavigating || !userLocation || !currentRoute) { setIsOffRoute(false); return; }
    const coords = currentRoute.geometry?.coordinates ?? [];
    if (!coords.length) return;
    let min = Infinity;
    for (const c of coords) {
      const d = haversineMeters(userLocation, c);
      if (d < min) min = d;
    }
    const threshold = Math.max(75, (accuracy ?? 0) + 50);
    // Hysteresis: once off-route, require coming within 55% of threshold before clearing
    // This prevents rapid banner toggling when GPS jitter puts the user near the boundary
    const leaveThreshold = Math.max(35, threshold * 0.55);
    const offNow = prevOffRouteRef.current ? min > leaveThreshold : min > threshold;
    setIsOffRoute(offNow);
    if (offNow && !prevOffRouteRef.current) {
      speak('Fuori percorso. Ricalcolo in corso.');
      vibrate([200]);
    }
    prevOffRouteRef.current = offNow;
  }, [userLocation, isNavigating, currentRoute, speak, vibrate]);

  // ── Handle route changes during navigation ───────────────────────────────
  // Route changes every ~100m (OSRM re-fetches from new position) AND on genuine
  // reroutes. We distinguish by checking isOffRoute at the moment of change.
  const isOffRouteRef   = useRef(false);
  const prevRouteKeyRef = useRef(null);
  useEffect(() => { isOffRouteRef.current = isOffRoute; }, [isOffRoute]);
  useEffect(() => {
    if (!isNavigating || !currentRoute) return;
    const c = currentRoute.geometry?.coordinates;
    const key = c ? `${c[0]?.join(',')}-${c.at(-1)?.join(',')}` : '';
    if (prevRouteKeyRef.current && prevRouteKeyRef.current !== key) {
      // Always sync step index to new route (old index may be out of range)
      setCurrentStepIdx(0);
      // Only announce if we were genuinely off-route
      if (isOffRouteRef.current) {
        setIsOffRoute(false);
        speak('Percorso ricalcolato');
      }
    }
    prevRouteKeyRef.current = key;
  }, [currentRoute, isNavigating, speak]);

  // ── Arrival detection (uses navDestCoords — not destination which is null) ─
  useEffect(() => {
    if (!isNavigating || !currentRoute || !userLocation || !navDestCoords) return;
    const endCoord = navDestCoords;
    if (haversineMeters(userLocation, endCoord) < 40) {
      handleStopNavigation(true);
    }
  }, [userLocation, isNavigating, currentRoute, navDestCoords]);

  // ── Map controls ────────────────────────────────────────────────────────
  const handleToggle3D = useCallback(() => {
    setIs3DMode((prev) => {
      const next = !prev;
      mapApiRef.current?.easeTo({ pitch: next ? 52 : 0, duration: 900 });
      return next;
    });
  }, []);

  const handleMyLocation = useCallback(() => {
    if (!userLocation) return;
    mapApiRef.current?.flyTo({
      center: userLocation, zoom: 15.5,
      pitch: is3DMode ? 52 : 0, bearing: userHeading ?? 0, duration: 1200,
    });
  }, [userLocation, userHeading, is3DMode]);

  // ── Android back button ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (hasArrived)      { setHasArrived(false); return; }
      if (isNavigating)    { handleStopNavigation(false); return; }
      if (destination)     { handleClosePanel(); return; }
      if (isSearchActive)  { setIsSearchActive(false); }
    };
    document.addEventListener('backbutton', handler);
    return () => document.removeEventListener('backbutton', handler);
  }, [hasArrived, isNavigating, destination, isSearchActive, handleStopNavigation, handleClosePanel]);

  // ── Map pan detection: mark map as off-center ────────────────────────────
  const handleUserPan = useCallback(() => {
    if (isNavigating) setMapCentered(false);
  }, [isNavigating]);

  // Re-center during navigation also resets the flag
  const handleReCenter = useCallback(() => {
    setMapCentered(true);
    if (userLocation) {
      mapApiRef.current?.easeTo({
        center: userLocation, bearing: userHeading ?? 0,
        zoom: 17, pitch: 60, duration: 700,
      });
    }
  }, [userLocation, userHeading]);

  // Reset centered flag when navigation starts
  useEffect(() => {
    if (isNavigating) setMapCentered(true);
  }, [isNavigating]);

  // ── Keep destination marker visible during navigation ───────────────────
  useEffect(() => {
    if (destination) navDestRef.current = destination;
  }, [destination]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-surface-900">
      {/* Full-screen map */}
      <MapView
        onMapLoaded={handleMapLoaded}
        userLocation={userLocation}
        userHeading={userHeading}
        destination={navDestRef.current ?? destination}
        route={currentRoute}
        selectedModeId={selectedModeId}
        is3DMode={is3DMode}
        isNavigating={isNavigating}
        isFollowing={mapCentered}
        userAccuracy={accuracy}
        onPOITap={handlePOITap}
        onLongPress={handleLongPress}
        onUserPan={handleUserPan}
      />

      {/* UI overlay */}
      <div className="absolute inset-0 pointer-events-none">

        {/* Search bar */}
        <AnimatePresence>
          {!isNavigating && (
            <div className="pointer-events-auto">
              <FloatingSearchBar
                isActive={isSearchActive}
                onActiveChange={setIsSearchActive}
                onResultSelect={handleDestinationSelect}
                userLocation={userLocation}
                isOnline={isOnline}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Map controls */}
        <div className="pointer-events-auto">
          <MapControls
            mapApiRef={mapApiRef}
            is3DMode={is3DMode}
            onToggle3D={handleToggle3D}
            onMyLocation={handleMyLocation}
          />
        </div>

        {/* Offline banner */}
        <AnimatePresence>
          {!isOnline && (
            <motion.div
              className="absolute top-24 left-1/2 -translate-x-1/2 glass-bright px-4 py-2.5 rounded-2xl pointer-events-none z-50"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
            >
              <p className="text-xs text-amber-400 font-medium whitespace-nowrap">📡 Nessuna connessione — mappa in cache</p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* GPS error toast */}
        {gpsError && !userLocation && (
          <div className="absolute top-36 left-1/2 -translate-x-1/2 glass-bright px-4 py-2.5 rounded-2xl pointer-events-auto">
            <p className="text-xs text-red-400 font-medium">⚠ {gpsError}</p>
          </div>
        )}

        {/* Destination panel */}
        <AnimatePresence>
          {!isNavigating && (
            <div className="pointer-events-auto">
              <POIDetailsPanel
                destination={destination}
                onClose={handleClosePanel}
                selectedModeId={selectedModeId}
                onModeChange={handleModeChange}
                routesByProfile={routesByProfile}
                routeLoading={routeLoading}
                onStartNavigation={handleStartNavigation}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Transport mode bar */}
        <AnimatePresence>
          {!isNavigating && !isSearchActive && (
            <div className="pointer-events-auto">
              <TransportModeSelector
                selectedModeId={selectedModeId}
                onModeChange={handleModeChange}
                destination={destination}
                routesByProfile={routesByProfile}
                routeLoading={routeLoading}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Navigation HUD */}
        <AnimatePresence>
          {isNavigating && currentRoute && (
            <div className="pointer-events-auto">
              <NavigationHUD
                route={currentRoute}
                currentStepIdx={currentStepIdx}
                modeColor={getModeById(selectedModeId).color}
                speed={speed}
                isOffRoute={isOffRoute}
                userLocation={userLocation}
                userAccuracy={accuracy}
                destName={navDestName}
                onStop={() => handleStopNavigation(false)}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Re-center button — shown when user pans away during navigation */}
        <AnimatePresence>
          {isNavigating && !mapCentered && (
            <motion.button
              className="absolute pointer-events-auto"
              style={{ bottom: 220, right: 20, zIndex: 45 }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleReCenter}
            >
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-2xl"
                style={{
                  background: 'rgba(12,12,24,0.95)',
                  backdropFilter: 'blur(16px)',
                  border: '1.5px solid rgba(76,201,240,0.4)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}
              >
                <span style={{ fontSize: 16 }}>🎯</span>
                <span className="text-xs font-semibold" style={{ color: '#4cc9f0' }}>Ricentra</span>
              </div>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Arrived overlay */}
        <AnimatePresence>
          {hasArrived && (
            <ArrivedOverlay
              destName={navDestName}
              onDismiss={() => setHasArrived(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
