import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MapView, { MAP_STYLE_URLS } from './components/MapView';

function getAutoStyleName() {
  const h = new Date().getHours();
  return (h < 7 || h >= 21) ? 'dark' : 'voyager';
}
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
import { getModeById, haversineMeters, maneuverToItalian, maneuverToItalianShort, formatDistance, formatDistanceVoice, formatDuration } from './data/mockData';

export default function App() {
  const [destination,    setDestination]    = useState(null);   // {name, address, coords, emoji}
  const [navDestCoords,  setNavDestCoords]  = useState(null);   // kept during navigation for OSRM
  const [navDestName,    setNavDestName]    = useState('');
  const [selectedModeId, setSelectedModeId] = useState(() => {
    try {
      const saved = localStorage.getItem('maps-mode');
      if (['car', 'walk', 'bike', 'transit', 'moto'].includes(saved)) return saved;
    } catch { }
    return 'car';
  });
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [is3DMode,       setIs3DMode]       = useState(() => {
    try { return localStorage.getItem('maps-3d') !== 'false'; } catch { return true; }
  });
  const [isNavigating,   setIsNavigating]   = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isOffRoute,     setIsOffRoute]     = useState(false);
  const [hasArrived,     setHasArrived]     = useState(false);
  const [mapCentered,    setMapCentered]    = useState(true);
  const [isHudMinimized, setIsHudMinimized] = useState(false);
  const [isOnline,       setIsOnline]       = useState(navigator.onLine);
  const [isMuted,        setIsMuted]        = useState(false);
  const [arrivedStats,   setArrivedStats]   = useState(null);
  const [avoidMotorway,  setAvoidMotorway]  = useState(() => {
    try { return localStorage.getItem('via-avoid-motorway') === 'true'; } catch { return false; }
  });
  const [avoidFerry,     setAvoidFerry]     = useState(() => {
    try { return localStorage.getItem('via-avoid-ferry') === 'true'; } catch { return false; }
  });
  const [mapStyle,       setMapStyle]       = useState(() => {
    try {
      const s = localStorage.getItem('via-map-style');
      return ['dark', 'light', 'voyager', 'auto'].includes(s) ? s : 'dark';
    } catch { return 'dark'; }
  });
  // Reactive effective style — 'auto' evaluates to dark/voyager based on time
  const [autoEffective, setAutoEffective] = useState(getAutoStyleName);
  useEffect(() => {
    if (mapStyle !== 'auto') return;
    const tick = () => setAutoEffective(getAutoStyleName());
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [mapStyle]);
  const [isUsingAltRoute, setIsUsingAltRoute] = useState(false);
  const [undoNavState,   setUndoNavState]   = useState(null);
  const [resumeDest,     setResumeDest]     = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('via-nav-state') ?? 'null');
      if (!saved?.dest?.coords || !saved?.timestamp) return null;
      if (Date.now() - saved.timestamp > 4 * 3600 * 1000) {
        localStorage.removeItem('via-nav-state');
        return null;
      }
      return saved;
    } catch { return null; }
  });
  const [homePlace, setHomePlace] = useState(() => {
    try { return JSON.parse(localStorage.getItem('via-home') ?? 'null'); } catch { return null; }
  });
  const [workPlace, setWorkPlace] = useState(() => {
    try { return JSON.parse(localStorage.getItem('via-work') ?? 'null'); } catch { return null; }
  });
  const mapApiRef      = useRef(null);
  const navDestRef     = useRef(null);   // keeps destination marker visible during navigation
  const navStartRef    = useRef(null);   // navigation start timestamp (ms)
  const navRouteRef    = useRef(null);   // route snapshot at navigation start (for arrival stats)
  const navModeRef     = useRef(null);   // transport mode at navigation start
  const arrivedDestRef = useRef(null);   // full dest object captured at arrival for save-to-fav

  // ── Real GPS + compass ──────────────────────────────────────────────────
  const { location: userLocation, heading: gpsHeading, speed, accuracy, error: gpsError } = useGeolocation();
  const compassHeading = useCompassHeading();
  const userHeading = gpsHeading ?? compassHeading;

  // ── Voice ───────────────────────────────────────────────────────────────
  const { speak: _speak, cancel } = useSpeech();
  const speak = useCallback((text, opts) => {
    if (!isMuted) _speak(text, opts);
  }, [isMuted, _speak]);
  // Stable ref so non-voice effects can call speak without stale closure issues
  const speakRef = useRef(speak);
  useEffect(() => { speakRef.current = speak; }, [speak]);

  // ── Keep screen on during navigation ────────────────────────────────────
  useWakeLock(isNavigating);

  // ── Stable refs for GPS values used in callbacks ─────────────────────────
  // Callbacks that only READ location (not react to it) use refs so they
  // don't recreate on every 1-Hz GPS update, preventing MapView effect re-runs.
  const userLocationRef = useRef(null);
  const userHeadingRef  = useRef(null);
  const is3DModeRef     = useRef(is3DMode);
  const lastGPSRef      = useRef(Date.now());
  useEffect(() => { userLocationRef.current = userLocation; }, [userLocation]);
  useEffect(() => { userHeadingRef.current  = userHeading;  }, [userHeading]);
  useEffect(() => { is3DModeRef.current     = is3DMode;     }, [is3DMode]);
  useEffect(() => { if (userLocation) lastGPSRef.current = Date.now(); }, [userLocation]);

  // Screen orientation lock — keep portrait during navigation to prevent accidental rotation
  useEffect(() => {
    if (!isNavigating) { try { screen.orientation?.unlock(); } catch { } return; }
    try { screen.orientation?.lock('portrait').catch(() => {}); } catch { }
    return () => { try { screen.orientation?.unlock(); } catch { } };
  }, [isNavigating]);

  // GPS staleness — tunnel detection: no update for >8 s during navigation
  const [isGpsStale, setIsGpsStale] = useState(false);
  useEffect(() => {
    if (!isNavigating) { setIsGpsStale(false); return; }
    const id = setInterval(() => {
      setIsGpsStale(Date.now() - lastGPSRef.current > 8000);
    }, 2000);
    return () => clearInterval(id);
  }, [isNavigating]);

  // ── Offline detection ────────────────────────────────────────────────────
  useEffect(() => {
    const on  = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  // ── Re-engage follow mode when app comes back to foreground ─────────────
  // On mobile, the user may lock the screen mid-navigation. When they unlock,
  // the map may be panned off-center. Re-center immediately on visibility.
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && isNavigating) {
        setMapCentered(true);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [isNavigating]);

  // ── Auto-dismiss undo-stop pill after 6 seconds ──────────────────────────
  useEffect(() => {
    if (!undoNavState) return;
    const t = setTimeout(() => setUndoNavState(null), 6000);
    return () => clearTimeout(t);
  }, [undoNavState]);

  // ── Sync home/work places when POIDetailsPanel or search bar saves them ─
  useEffect(() => {
    const handler = () => {
      try { setHomePlace(JSON.parse(localStorage.getItem('via-home') ?? 'null')); } catch { }
      try { setWorkPlace(JSON.parse(localStorage.getItem('via-work') ?? 'null')); } catch { }
    };
    window.addEventListener('via-places-changed', handler);
    return () => window.removeEventListener('via-places-changed', handler);
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
  // Use fine snap (~100m) when off-route for fast rerouting; coarse (~300m) otherwise
  // to reduce OSRM API calls 3x during normal navigation.
  // Only request alternative routes during the planning phase (not during active navigation).
  const snapFine    = !isNavigating || isOffRoute;
  const needAlts    = !isNavigating;
  const drivingExclude = [
    avoidMotorway ? 'motorway' : null,
    avoidFerry    ? 'ferry'    : null,
  ].filter(Boolean).join(',') || null;
  const { route: drivingRoute, altRoute: drivingAlt, loading: drivingLoading } = useOSRM(userLocation, drivingDest, 'driving', { fine: snapFine, alternatives: needAlts, exclude: drivingExclude });
  const { route: footRoute,    altRoute: footAlt,    loading: footLoading    } = useOSRM(userLocation, footDest,    'foot',    { fine: snapFine, alternatives: needAlts });
  const { route: bikeRoute,    altRoute: bikeAlt,    loading: bikeLoading    } = useOSRM(userLocation, bikeDest,    'bike',    { fine: snapFine, alternatives: needAlts });
  const routesByProfile = useMemo(
    () => ({ driving: drivingRoute, foot: footRoute, bike: bikeRoute }),
    [drivingRoute, footRoute, bikeRoute],
  );
  const altRoutesByProfile = useMemo(
    () => ({ driving: drivingAlt, foot: footAlt, bike: bikeAlt }),
    [drivingAlt, footAlt, bikeAlt],
  );

  const primaryRoute      = routesByProfile[currentProfile];
  const altRouteForProfile = altRoutesByProfile[currentProfile] ?? null;
  // When user selects the alt route in planning mode, swap which is "active"
  const currentRoute = (isUsingAltRoute && altRouteForProfile) ? altRouteForProfile : primaryRoute;
  const routeLoading  = drivingLoading || footLoading || bikeLoading;

  // Reset alt selection when destination or mode changes
  useEffect(() => { setIsUsingAltRoute(false); }, [destination?.coords?.join(), selectedModeId, avoidMotorway, avoidFerry]);

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

    const loc = userLocationRef.current;
    if (loc) {
      const west  = Math.min(loc[0], dest.coords[0]);
      const east  = Math.max(loc[0], dest.coords[0]);
      const south = Math.min(loc[1], dest.coords[1]);
      const north = Math.max(loc[1], dest.coords[1]);
      mapApiRef.current?.fitBounds([[west, south], [east, north]], {
        padding: 80, pitch: is3DMode ? 48 : 0, bearing: 0, duration: 1600,
      });
    } else {
      mapApiRef.current?.flyTo({
        center: dest.coords, zoom: 14,
        pitch: is3DMode ? 48 : 0, duration: 1400, essential: true,
      });
    }
  }, [is3DMode]);

  // ── Long press → reverse geocode → set destination ─────────────────────
  const handleLongPress = useCallback(async ([lng, lat]) => {
    // Show a placeholder immediately so the panel opens right away
    handleDestinationSelect({
      name: 'Caricamento…', address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
      coords: [lng, lat], emoji: '📍',
    });
    try {
      const res  = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
        { headers: { 'Accept-Language': 'it' } },
      );
      const data = await res.json();
      // Resolve placeholder with real name (only if user hasn't already changed destination)
      setDestination((prev) => {
        if (!prev || prev.name !== 'Caricamento…') return prev;
        return {
          ...prev,
          name:    data.name || data.display_name?.split(',')[0] || 'Posizione',
          address: data.display_name || '',
        };
      });
    } catch {
      setDestination((prev) => {
        if (!prev || prev.name !== 'Caricamento…') return prev;
        return { ...prev, name: 'Posizione selezionata' };
      });
    }
  }, [handleDestinationSelect]);

  const handlePOITap = useCallback((poi) => {
    handleDestinationSelect({
      name:    poi.name,
      address: poi.address ?? '',
      coords:  poi.coords,
      emoji:   poi.emoji,
      type:    poi.type,
      phone:   poi.phone ?? null,
      website: poi.website ?? null,
      hours:   poi.hours ?? null,
      cuisine: poi.cuisine ?? null,
    });
  }, [handleDestinationSelect]);

  const handleClosePanel = useCallback(() => {
    setDestination(null);
    setIsNavigating(false);
    setCurrentStepIdx(0);
    setNavDestCoords(null);
  }, []);

  const handleDismissArrived = useCallback(() => setHasArrived(false), []);

  const handleModeChange = useCallback((modeId) => {
    navigator.vibrate?.([12]);
    setSelectedModeId(modeId);
    try { localStorage.setItem('maps-mode', modeId); } catch { }
  }, []);

  const handleFitRoute = useCallback(() => {
    const loc  = userLocationRef.current;
    const dest = destination;
    if (!loc || !dest) return;
    const west  = Math.min(loc[0], dest.coords[0]);
    const east  = Math.max(loc[0], dest.coords[0]);
    const south = Math.min(loc[1], dest.coords[1]);
    const north = Math.max(loc[1], dest.coords[1]);
    mapApiRef.current?.fitBounds([[west, south], [east, north]], {
      padding: 80, pitch: is3DMode ? 48 : 0, bearing: 0, duration: 1200,
    });
  }, [destination, is3DMode]);

  // ── Start navigation ────────────────────────────────────────────────────
  const handleStartNavigation = useCallback(() => {
    if (!currentRoute || !destination) return;
    navigator.vibrate?.([60, 40, 60]);  // double tap = navigation start
    const coords = destination.coords;
    const name   = destination.name;
    setNavDestCoords(coords);
    setNavDestName(name);
    setIsNavigating(true);
    setIsHudMinimized(false);
    setCurrentStepIdx(0);
    setHasArrived(false);
    setArrivedStats(null);
    prevOffRouteRef.current  = false;  // reset off-route hysteresis for new navigation session
    prevRouteKeyRef.current  = null;   // reset so first route load isn't treated as a reroute
    lastPeriodicRef.current  = Date.now();  // suppress first-10-min announcement immediately after start
    navStartRef.current   = Date.now();
    navRouteRef.current   = currentRoute;   // snapshot for arrival stats
    navModeRef.current    = selectedModeId; // snapshot mode for CO₂ calculation
    setResumeDest(null);   // clear resume banner once navigation is actually running
    // Persist nav state so the app can offer to resume if killed and relaunched
    try {
      localStorage.setItem('via-nav-state', JSON.stringify({
        dest: { name, address: destination.address ?? '', coords, emoji: destination.emoji ?? '📍', type: destination.type ?? '' },
        modeId: selectedModeId,
        timestamp: Date.now(),
      }));
    } catch { }
    setDestination(null);  // collapses the panel; OSRM now uses navDestCoords

    // Announce destination + first turn
    const steps = currentRoute.legs?.[0]?.steps ?? [];
    // Skip arrive step — happens on very short routes where dest is within 1–2 steps
    const firstTurn = steps[1]?.maneuver?.type !== 'arrive' ? steps[1] : null;
    let announcement = name ? `Navigazione avviata verso ${name}.` : 'Navigazione avviata.';
    // Announce total distance for routes over 500m so the driver knows how far they're going
    const totalDist = currentRoute.distance ?? 0;
    if (totalDist > 500) {
      announcement += ` Percorso di ${formatDistanceVoice(totalDist)}.`;
    }
    if (firstTurn) {
      const instr = maneuverToItalian(
        firstTurn.maneuver?.type, firstTurn.maneuver?.modifier,
        firstTurn.name ?? '', firstTurn.maneuver?.exit,
      );
      const dist = steps[0]?.distance ?? 0;
      announcement += ` Tra ${formatDistanceVoice(dist)}, ${instr}`;
    }
    speak(announcement);
  }, [currentRoute, destination, speak]);

  // ── Stop navigation ─────────────────────────────────────────────────────
  const handleStopNavigation = useCallback((arrived = false) => {
    setIsNavigating(false);
    setCurrentStepIdx(0);
    setIsOffRoute(false);
    setNavDestCoords(null);
    const arrivingDest = navDestRef.current;  // capture before clearing
    navDestRef.current = null;
    try { localStorage.removeItem('via-nav-state'); } catch { }
    cancel();
    if (!arrived && arrivingDest?.coords) {
      setUndoNavState({ dest: arrivingDest, modeId: navModeRef.current ?? 'car' });
    }
    if (arrived) {
      arrivedDestRef.current = arrivingDest;  // make available to ArrivedOverlay
      const elapsedSecs = navStartRef.current
        ? Math.round((Date.now() - navStartRef.current) / 1000)
        : null;
      const routeMeters = navRouteRef.current?.distance ?? null;
      const navMode     = getModeById(navModeRef.current ?? 'car');
      // CO₂ saved vs driving (120 g/km) — only meaningful for zero-emission modes
      const co2Saved = (navMode.co2PerKm === 0 && routeMeters)
        ? Math.round((routeMeters / 1000) * 120)
        : null;
      // Average speed — actual distance / elapsed time (includes any stops)
      const avgSpeed = (elapsedSecs > 30 && routeMeters > 50)
        ? Math.round((routeMeters / elapsedSecs) * 3.6)
        : null;
      setArrivedStats({ secs: elapsedSecs, meters: routeMeters, co2Saved, avgSpeed });
      setHasArrived(true);
      // Persist trip to history (last 30 trips, newest first)
      if (arrivingDest?.name && routeMeters) {
        try {
          const history = JSON.parse(localStorage.getItem('via-history') ?? '[]');
          const entry = {
            name:     arrivingDest.name,
            address:  arrivingDest.address ?? '',
            coords:   arrivingDest.coords,
            emoji:    arrivingDest.emoji ?? '📍',
            modeId:   navModeRef.current ?? 'car',
            meters:   routeMeters,
            secs:     elapsedSecs,
            ts:       Date.now(),
          };
          localStorage.setItem('via-history', JSON.stringify([entry, ...history].slice(0, 30)));
        } catch { }
      }
      const destNameVoice = arrivingDest?.name ? ` a ${arrivingDest.name}` : '';
      const distVoice  = routeMeters ? ` Percorso di ${formatDistanceVoice(routeMeters)}.` : '';
      const timeVoice  = elapsedSecs > 60 ? ` Tempo impiegato: ${formatDuration(elapsedSecs)}.` : '';
      speak(`Sei arrivato${destNameVoice}.${distVoice}${timeVoice}`);
      navigator.vibrate?.([100, 80, 100, 80, 200]);
    }
    if (userLocationRef.current) {
      mapApiRef.current?.flyTo({
        center: userLocationRef.current, zoom: 15,
        pitch: is3DMode ? 52 : 0, bearing: 0, duration: 1200,
      });
    }
  }, [is3DMode, speak, cancel]);

  // ── Auto-advance steps ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isNavigating || !userLocation || !currentRoute) return;
    const steps = currentRoute.legs?.[0]?.steps ?? [];
    if (currentStepIdx >= steps.length - 1) return;
    const nextLoc = steps[currentStepIdx + 1]?.maneuver?.location;
    if (!nextLoc) return;
    // Speed-adaptive threshold. Walking/cycling turns are close together so need a
    // tight 15m floor; driving/moto need 50m to advance early enough at speed.
    const isWalkBike = selectedModeId === 'walk' || selectedModeId === 'bike';
    const advanceDist = Math.max(isWalkBike ? 15 : 50, (speed ?? 0) * 3);
    if (haversineMeters(userLocation, nextLoc) < advanceDist) {
      navigator.vibrate?.([25]);  // soft tap: step completed
      // After completing a step, immediately announce the next meaningful turn
      // if the upcoming segment is long enough that the warning system won't fire quickly.
      const FILLER = new Set(['depart', 'continue', 'new name', 'notification']);
      const newStep   = steps[currentStepIdx + 1]; // step just reached
      let   afterStep = null;
      for (let j = currentStepIdx + 2; j < steps.length; j++) {
        if (!FILLER.has(steps[j].maneuver?.type)) { afterStep = steps[j]; break; }
      }
      const segDist = newStep?.distance ?? 0;
      if (afterStep && segDist > 200 && afterStep.maneuver?.type !== 'arrive') {
        const nextInstr = maneuverToItalianShort(
          afterStep.maneuver?.type, afterStep.maneuver?.modifier, afterStep.maneuver?.exit,
        );
        speakRef.current(`Tra ${formatDistanceVoice(segDist)}, ${nextInstr}`);
      }
      setCurrentStepIdx((i) => i + 1);
    }
  }, [userLocation, isNavigating, currentRoute, currentStepIdx, speed, selectedModeId]);


  // ── Voice + haptic turn warnings ────────────────────────────────────────
  const vibrate = useCallback((pattern) => { navigator.vibrate?.(pattern); }, []);

  // Directional haptic: asymmetric patterns encode turn direction
  // left:  short→long  right: long→short  uturn: triple  straight: single
  function turnVibrate(modifier, urgency = 'standard') {
    const b = urgency === 'urgent' ? 80 : urgency === 'early' ? 32 : 56;
    const mod = modifier ?? '';
    if (mod.includes('uturn'))       return [b, 40, b, 40, b];
    if (mod === 'sharp left')        return [Math.round(b * 1.4), 35, b];
    if (mod === 'sharp right')       return [b, 35, Math.round(b * 1.4)];
    if (mod.includes('left'))        return [25, 48, b];
    if (mod.includes('right'))       return [b, 48, 25];
    return [b];
  }
  const lastPeriodicRef   = useRef(0);
  const spokenAt500Ref    = useRef(false);
  const spokenAt200Ref    = useRef(false);
  const spokenAt60Ref     = useRef(false);
  const warnStepRef       = useRef(-1);  // reset refs when step changes
  useEffect(() => {
    if (!isNavigating || !userLocation || !currentRoute) return;
    // Reset warning flags when the step changes
    if (warnStepRef.current !== currentStepIdx) {
      warnStepRef.current    = currentStepIdx;
      spokenAt500Ref.current = false;
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

    // Scale warning distance to speed: aim for ~10 s advance notice (min 200m / 60m)
    const speedMs    = speed ?? 0;
    const kmh        = speedMs * 3.6;
    const earlyDist  = Math.max(500, speedMs * 18); // ~18 s advance — highway only
    const warnDist   = Math.max(200, speedMs * 10); // ~10 s advance
    const urgentDist = Math.max(60,  speedMs * 4);  // ~4 s advance

    const nextModifier = nextStep.maneuver?.modifier ?? '';
    // Three-tier system: early (highway only, >80 km/h), standard, urgent
    if (kmh > 80 && dist < earlyDist && dist >= warnDist && !spokenAt500Ref.current) {
      spokenAt500Ref.current = true;
      speak(`Attenzione. Tra ${formatDistanceVoice(dist)}, ${instr}`);
      vibrate(turnVibrate(nextModifier, 'early'));
    } else if (dist < warnDist && dist >= urgentDist && !spokenAt200Ref.current) {
      spokenAt200Ref.current = true;
      spokenAt60Ref.current  = false;
      speak(`Tra ${formatDistanceVoice(dist)}, ${instr}`);
      vibrate(turnVibrate(nextModifier, 'standard'));
    } else if (dist < urgentDist && !spokenAt60Ref.current) {
      spokenAt60Ref.current  = true;
      // Short form at last moment — no street name, just the action
      const shortInstr = maneuverToItalianShort(
        nextStep.maneuver?.type, nextStep.maneuver?.modifier, nextStep.maneuver?.exit,
      );
      speak(shortInstr, { urgent: true });
      vibrate(turnVibrate(nextModifier, 'urgent'));
    } else if (dist >= earlyDist) {
      spokenAt500Ref.current = false;
      spokenAt200Ref.current = false;
      spokenAt60Ref.current  = false;
    }

    // Periodic "still X km away" reminder every 10 min — fires only when no turn is imminent
    if (dist > Math.max(warnDist, 300)) {
      const remainingMeters = steps.slice(currentStepIdx).reduce((s, x) => s + (x.distance ?? 0), 0);
      const now = Date.now();
      if (remainingMeters > 5000 && now - lastPeriodicRef.current >= 10 * 60 * 1000) {
        lastPeriodicRef.current = now;
        speak(`Ancora ${formatDistanceVoice(remainingMeters)}`);
      }
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
    // Walk/bike have tighter off-route threshold since turns are at shorter distances
    const isWalkBike2 = selectedModeId === 'walk' || selectedModeId === 'bike';
    const threshold = isWalkBike2
      ? Math.max(30, (accuracy ?? 0) + 15)
      : Math.max(75, (accuracy ?? 0) + 50);
    // Hysteresis: once off-route, require coming within 55% of threshold before clearing
    // This prevents rapid banner toggling when GPS jitter puts the user near the boundary
    const leaveThreshold = Math.max(isWalkBike2 ? 15 : 35, threshold * 0.55);
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
        approachAnnouncedRef.current = false; // allow re-announcement after reroute
        const newSteps  = currentRoute.legs?.[0]?.steps ?? [];
        const firstTurn = newSteps[1]?.maneuver?.type !== 'arrive' ? newSteps[1] : null;
        let msg = 'Percorso ricalcolato.';
        if (firstTurn) {
          const instr = maneuverToItalian(
            firstTurn.maneuver?.type, firstTurn.maneuver?.modifier,
            firstTurn.name ?? '', firstTurn.maneuver?.exit,
          );
          const dist = newSteps[0]?.distance ?? 0;
          if (dist > 30) msg += ` Tra ${formatDistanceVoice(dist)}, ${instr}`;
        }
        speak(msg);
      }
    }
    prevRouteKeyRef.current = key;
  }, [currentRoute, isNavigating, speak]);

  // ── Arrival detection (uses navDestCoords — not destination which is null) ─
  const approachAnnouncedRef = useRef(false);
  useEffect(() => {
    if (!isNavigating) { approachAnnouncedRef.current = false; return; }
    if (!currentRoute || !userLocation || !navDestCoords) return;
    const dist = haversineMeters(userLocation, navDestCoords);
    if (dist < 40) {
      handleStopNavigation(true);
    } else if (dist < 200 && !approachAnnouncedRef.current) {
      approachAnnouncedRef.current = true;
      const approachDist = `${Math.round(dist / 10) * 10} metri`;
      const approachDest = navDestName ? ` a ${navDestName}` : '';
      speak(`Tra ${approachDist} arriverai${approachDest}`);
      navigator.vibrate?.([60]);
    }
  }, [userLocation, isNavigating, currentRoute, navDestCoords, navDestName, handleStopNavigation, speak]);

  // ── Map controls ────────────────────────────────────────────────────────
  const handleToggle3D = useCallback(() => {
    setIs3DMode((prev) => {
      const next = !prev;
      try { localStorage.setItem('maps-3d', next); } catch { }
      mapApiRef.current?.easeTo({ pitch: next ? 52 : 0, duration: 900 });
      return next;
    });
  }, []);

  const handleMapStyleChange = useCallback((style) => {
    setMapStyle(style);
    if (style === 'auto') setAutoEffective(getAutoStyleName());
    try { localStorage.setItem('via-map-style', style); } catch {}
  }, []);

  const handleMyLocation = useCallback(() => {
    const loc = userLocationRef.current;
    if (!loc) return;
    // During navigation, re-engage follow mode (same as "Ricentra" button)
    if (isNavigating) { handleReCenter(); return; }
    // Pre-navigation with destination set: show full route extent
    if (destination?.coords) {
      const west  = Math.min(loc[0], destination.coords[0]);
      const east  = Math.max(loc[0], destination.coords[0]);
      const south = Math.min(loc[1], destination.coords[1]);
      const north = Math.max(loc[1], destination.coords[1]);
      mapApiRef.current?.fitBounds([[west, south], [east, north]], {
        padding: 80, pitch: is3DMode ? 48 : 0, bearing: 0, duration: 1200,
      });
      return;
    }
    mapApiRef.current?.flyTo({
      center: loc, zoom: 15.5,
      pitch: is3DMode ? 52 : 0, bearing: userHeadingRef.current ?? 0, duration: 1200,
    });
  }, [is3DMode, destination, isNavigating, handleReCenter]);

  // ── Android back button ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = () => {
      if (hasArrived)      { handleDismissArrived(); return; }
      if (isNavigating)    { handleStopNavigation(false); return; }
      if (destination)     { handleClosePanel(); return; }
      if (isSearchActive)  { setIsSearchActive(false); }
    };
    document.addEventListener('backbutton', handler);
    return () => document.removeEventListener('backbutton', handler);
  }, [hasArrived, isNavigating, destination, isSearchActive, handleStopNavigation, handleClosePanel, handleDismissArrived]);

  // ── Desktop keyboard shortcuts for navigation ──────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'm' || e.key === 'M') {
        if (isNavigating) setIsMuted((m) => !m);
      } else if (e.key === 'r' || e.key === 'R') {
        // Repeat last spoken instruction
        if (isNavigating && currentRoute) {
          const steps = currentRoute.legs?.[0]?.steps ?? [];
          const nextStep = steps[currentStepIdx + 1];
          if (nextStep) {
            const instr = maneuverToItalian(
              nextStep.maneuver?.type, nextStep.maneuver?.modifier,
              nextStep.name ?? '', nextStep.maneuver?.exit,
            );
            speakRef.current(instr);
          }
        }
      } else if (e.key === 'Escape') {
        if (isNavigating) handleStopNavigation(false);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isNavigating, currentRoute, currentStepIdx, handleStopNavigation]);

  // ── Map pan detection: mark map as off-center ────────────────────────────
  const handleUserPan = useCallback(() => {
    if (isNavigating) setMapCentered(false);
    if (isSearchActive) setIsSearchActive(false); // dismiss search on map interaction
  }, [isNavigating, isSearchActive]);

  // Re-center during navigation also resets the flag
  const handleReCenter = useCallback(() => {
    setMapCentered(true);
    if (userLocationRef.current) {
      mapApiRef.current?.easeTo({
        center: userLocationRef.current, bearing: userHeadingRef.current ?? 0,
        zoom: 17, pitch: is3DModeRef.current ? 60 : 0, duration: 700,
      });
    }
  }, []);

  // Reset centered flag when navigation starts
  useEffect(() => {
    if (isNavigating) setMapCentered(true);
  }, [isNavigating]);

  // Auto-recenter after 15s of user-initiated pan during navigation
  useEffect(() => {
    if (!isNavigating || mapCentered) return;
    const t = setTimeout(handleReCenter, 15000);
    return () => clearTimeout(t);
  }, [isNavigating, mapCentered, handleReCenter]);

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
        altRoute={!isNavigating ? (isUsingAltRoute ? primaryRoute : altRouteForProfile) : null}
        selectedModeId={selectedModeId}
        is3DMode={is3DMode}
        isNavigating={isNavigating}
        isFollowing={mapCentered}
        currentStepIdx={currentStepIdx}
        userAccuracy={accuracy}
        userSpeed={speed}
        mapStyleUrl={MAP_STYLE_URLS[mapStyle === 'auto' ? autoEffective : mapStyle] ?? MAP_STYLE_URLS.dark}
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

        {/* Resume navigation banner — shown on relaunch when a recent session was interrupted */}
        <AnimatePresence>
          {resumeDest && !isNavigating && !destination && !isSearchActive && (
            <motion.div
              className="pointer-events-auto absolute left-1/2 -translate-x-1/2 z-30"
              style={{ top: 84, width: 'calc(100% - 32px)', maxWidth: 480 }}
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            >
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  background: 'rgba(12,12,22,0.96)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(76,201,240,0.25)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
                }}
              >
                <span style={{ fontSize: 20, flexShrink: 0 }}>
                  {resumeDest.dest.emoji ?? '📍'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-slate-500 font-medium">Navigazione interrotta</p>
                  <p className="text-sm font-semibold text-white truncate">{resumeDest.dest.name}</p>
                  {userLocation && resumeDest.dest.coords && (
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      ~{formatDistance(haversineMeters(userLocation, resumeDest.dest.coords))} in linea d'aria
                    </p>
                  )}
                </div>
                <motion.button
                  whileTap={{ scale: 0.94 }}
                  onClick={() => {
                    handleModeChange(resumeDest.modeId ?? selectedModeId);
                    handleDestinationSelect(resumeDest.dest);
                    setResumeDest(null);
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold focus:outline-none"
                  style={{ background: 'rgba(76,201,240,0.15)', border: '1px solid rgba(76,201,240,0.35)', color: '#4cc9f0' }}
                >
                  Riprendi
                </motion.button>
                <button
                  onClick={() => {
                    localStorage.removeItem('via-nav-state');
                    setResumeDest(null);
                  }}
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <span style={{ fontSize: 12, color: '#475569' }}>✕</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Home / Work quick-access chips — visible on idle map when not navigating */}
        <AnimatePresence>
          {!isNavigating && !isSearchActive && !destination && (homePlace || workPlace) && (
            <motion.div
              className="pointer-events-auto absolute left-1/2 -translate-x-1/2 flex gap-2 z-25"
              style={{ top: resumeDest ? 148 : 84 }}
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -12, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 380, damping: 30, delay: 0.1 }}
            >
              {[
                { place: homePlace, icon: '🏠', label: 'Casa' },
                { place: workPlace, icon: '💼', label: 'Lavoro' },
              ].filter(({ place }) => place).map(({ place, icon, label }) => {
                const dist = place && userLocation
                  ? formatDistance(haversineMeters(userLocation, place.coords))
                  : null;
                return (
                  <motion.button
                    key={label}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleDestinationSelect(place)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl text-xs font-semibold focus:outline-none"
                    style={{
                      background: 'rgba(12,12,22,0.88)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                      color: '#94a3b8',
                    }}
                  >
                    <span>{icon}</span>
                    <span>{label}</span>
                    {dist && <span style={{ color: '#64748b', fontWeight: 400 }}>{dist}</span>}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Map controls */}
        <div className="pointer-events-auto">
          <MapControls
            mapApiRef={mapApiRef}
            is3DMode={is3DMode}
            onToggle3D={handleToggle3D}
            onMyLocation={handleMyLocation}
            isNavigating={isNavigating}
            userLocation={userLocation}
            mapStyle={mapStyle}
            onChangeMapStyle={handleMapStyleChange}
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
                altRoutesByProfile={altRoutesByProfile}
                routeLoading={routeLoading}
                onStartNavigation={handleStartNavigation}
                userLocation={userLocation}
                onFitRoute={handleFitRoute}
                isUsingAltRoute={isUsingAltRoute}
                onSelectAltRoute={() => setIsUsingAltRoute(true)}
                onSelectMainRoute={() => setIsUsingAltRoute(false)}
                avoidMotorway={avoidMotorway}
                onToggleAvoidMotorway={() => {
                  setAvoidMotorway((v) => {
                    const next = !v;
                    try { localStorage.setItem('via-avoid-motorway', next); } catch { }
                    return next;
                  });
                }}
                avoidFerry={avoidFerry}
                onToggleAvoidFerry={() => {
                  setAvoidFerry((v) => {
                    const next = !v;
                    try { localStorage.setItem('via-avoid-ferry', next); } catch { }
                    return next;
                  });
                }}
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

        {/* Passive speed badge — shows when moving without navigation active */}
        <AnimatePresence>
          {!isNavigating && !destination && !isSearchActive && speed != null && speed * 3.6 > 5 && (
            <motion.div
              className="absolute pointer-events-none"
              style={{ bottom: 108, left: 16, zIndex: 25 }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            >
              <div
                className="flex flex-col items-center justify-center rounded-2xl px-2.5 py-1.5"
                style={{
                  background: 'rgba(12,12,22,0.88)',
                  backdropFilter: 'blur(16px)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
                  minWidth: 48,
                }}
              >
                <p className="text-xl font-bold tabular-nums text-white leading-tight">
                  {Math.round(speed * 3.6)}
                </p>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest leading-tight">km/h</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Undo stop navigation pill — disappears after 6s */}
        <AnimatePresence>
          {undoNavState && !isNavigating && (
            <motion.div
              className="pointer-events-auto absolute left-1/2 -translate-x-1/2 z-30"
              style={{ bottom: 100, width: 'calc(100% - 32px)', maxWidth: 400 }}
              initial={{ y: 24, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 24, opacity: 0, scale: 0.96 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            >
              <div
                className="flex items-center gap-3 px-4 py-3 rounded-2xl"
                style={{
                  background: 'rgba(12,12,22,0.97)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(249,115,22,0.3)',
                  boxShadow: '0 4px 24px rgba(0,0,0,0.55)',
                }}
              >
                <span style={{ fontSize: 18, flexShrink: 0 }}>{undoNavState.dest.emoji ?? '📍'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-orange-400 font-semibold">Navigazione fermata</p>
                  <p className="text-sm font-bold text-white truncate">{undoNavState.dest.name}</p>
                </div>
                <motion.button
                  whileTap={{ scale: 0.93 }}
                  onClick={() => {
                    const state = undoNavState;
                    setUndoNavState(null);
                    handleModeChange(state.modeId);
                    handleDestinationSelect(state.dest);
                  }}
                  className="flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold focus:outline-none"
                  style={{ background: 'rgba(249,115,22,0.18)', border: '1px solid rgba(249,115,22,0.4)', color: '#f97316' }}
                >
                  Riprendi
                </motion.button>
                <button
                  onClick={() => setUndoNavState(null)}
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                >
                  <span style={{ fontSize: 12, color: '#475569' }}>✕</span>
                </button>
              </div>
            </motion.div>
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
                isGpsStale={isGpsStale}
                userLocation={userLocation}
                userAccuracy={accuracy}
                destName={navDestName}
                onRepeat={speak}
                isMuted={isMuted}
                onToggleMute={() => setIsMuted((m) => !m)}
                onMinimizeChange={setIsHudMinimized}
                onStop={() => { setIsHudMinimized(false); handleStopNavigation(false); }}
              />
            </div>
          )}
        </AnimatePresence>

        {/* Re-center button — shown when user pans away during navigation */}
        <AnimatePresence>
          {isNavigating && !mapCentered && (
            <motion.button
              className="absolute pointer-events-auto"
              style={{ bottom: isHudMinimized ? 100 : 220, right: 20, zIndex: 45, transition: 'bottom 0.3s ease' }}
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
              dest={arrivedDestRef.current}
              stats={arrivedStats}
              onDismiss={handleDismissArrived}
              onSearchNearby={() => { handleDismissArrived(); setIsSearchActive(true); }}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
