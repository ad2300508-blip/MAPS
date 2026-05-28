import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import MapView from './components/MapView';
import FloatingSearchBar from './components/FloatingSearchBar';
import POIDetailsPanel from './components/POIDetailsPanel';
import MapControls from './components/MapControls';
import TransportModeSelector from './components/TransportModeSelector';
import NavigationHUD from './components/NavigationHUD';
import { useGeolocation } from './hooks/useGeolocation';
import { useCompassHeading } from './hooks/useCompassHeading';
import { useOSRM } from './hooks/useOSRM';
import { getModeById, haversineMeters } from './data/mockData';

export default function App() {
  const [destination,    setDestination]    = useState(null);   // {name, address, coords, emoji}
  const [selectedModeId, setSelectedModeId] = useState('car');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [is3DMode,       setIs3DMode]       = useState(true);
  const [isNavigating,   setIsNavigating]   = useState(false);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [isOffRoute,     setIsOffRoute]     = useState(false);
  const mapApiRef = useRef(null);

  // ── Real GPS + compass ──────────────────────────────────────────────────
  const { location: userLocation, heading: gpsHeading, speed, error: gpsError } = useGeolocation();
  const compassHeading = useCompassHeading();
  // GPS heading is valid only when moving; compass works stationary
  const userHeading = gpsHeading ?? compassHeading;

  // ── Real routing — 3 OSRM profiles fetched in parallel ─────────────────
  const { route: drivingRoute, loading: drivingLoading } = useOSRM(userLocation, destination?.coords, 'driving');
  const { route: footRoute,    loading: footLoading    } = useOSRM(userLocation, destination?.coords, 'foot');
  const { route: bikeRoute,    loading: bikeLoading    } = useOSRM(userLocation, destination?.coords, 'bike');

  const routesByProfile = { driving: drivingRoute, foot: footRoute, bike: bikeRoute };

  const profileMap      = { car: 'driving', walk: 'foot', bike: 'bike', transit: 'driving', moto: 'driving' };
  const currentProfile  = profileMap[selectedModeId];
  const currentRoute    = routesByProfile[currentProfile];
  const routeLoading    = drivingLoading || footLoading || bikeLoading;

  const handleMapLoaded = useCallback((mapApi) => { mapApiRef.current = mapApi; }, []);

  // ── Destination selected from search or POI tap ─────────────────────────
  const handleDestinationSelect = useCallback((dest) => {
    setDestination(dest);
    setIsSearchActive(false);
    setIsNavigating(false);
    setCurrentStepIdx(0);
    setIsOffRoute(false);

    if (userLocation) {
      // Fit both user + destination in view
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

  // ── Long press → reverse geocode → set destination ───────────────────────
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
      name: poi.name,
      address: poi.address ?? '',
      coords: poi.coords,
      emoji: poi.emoji,
    });
  }, [handleDestinationSelect]);

  const handleClosePanel = useCallback(() => {
    setDestination(null);
    setIsNavigating(false);
    setCurrentStepIdx(0);
  }, []);

  const handleModeChange = useCallback((modeId) => {
    setSelectedModeId(modeId);
  }, []);

  // ── Start navigation ─────────────────────────────────────────────────────
  const handleStartNavigation = useCallback(() => {
    if (!currentRoute) return;
    setIsNavigating(true);
    setCurrentStepIdx(0);
    // Destination panel collapses — NavigationHUD takes over
    setDestination(null);
  }, [currentRoute]);

  const handleStopNavigation = useCallback(() => {
    setIsNavigating(false);
    setCurrentStepIdx(0);
    setIsOffRoute(false);
    // Re-center on user
    if (userLocation) {
      mapApiRef.current?.flyTo({
        center: userLocation,
        zoom: 15,
        pitch: is3DMode ? 52 : 0,
        bearing: 0,
        duration: 1200,
      });
    }
  }, [userLocation, is3DMode]);

  // ── Auto-advance steps during navigation ─────────────────────────────────
  useEffect(() => {
    if (!isNavigating || !userLocation || !currentRoute) return;
    const steps = currentRoute.legs?.[0]?.steps ?? [];
    if (currentStepIdx >= steps.length - 1) return;

    const nextStep = steps[currentStepIdx + 1];
    const nextLoc  = nextStep?.maneuver?.location;
    if (!nextLoc) return;

    const dist = haversineMeters(userLocation, nextLoc);
    if (dist < 30) {
      setCurrentStepIdx((i) => i + 1);
    }
  }, [userLocation, isNavigating, currentRoute, currentStepIdx]);

  // ── Off-route detection ──────────────────────────────────────────────────
  useEffect(() => {
    if (!isNavigating || !userLocation || !currentRoute) { setIsOffRoute(false); return; }
    const coords = currentRoute.geometry?.coordinates ?? [];
    if (!coords.length) return;
    let minDist = Infinity;
    for (const c of coords) {
      const d = haversineMeters(userLocation, c);
      if (d < minDist) minDist = d;
    }
    setIsOffRoute(minDist > 75);
  }, [userLocation, isNavigating, currentRoute]);

  // ── Arrived at destination ───────────────────────────────────────────────
  useEffect(() => {
    if (!isNavigating || !currentRoute || !userLocation || !destination) return;
    const dist = haversineMeters(userLocation, destination.coords ?? currentRoute.geometry.coordinates.at(-1));
    if (dist < 20) {
      handleStopNavigation();
    }
  }, [userLocation, isNavigating]);

  // ── Map controls ─────────────────────────────────────────────────────────
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
      center: userLocation,
      zoom: 15.5,
      pitch: is3DMode ? 52 : 0,
      bearing: userHeading ?? 0,
      duration: 1200,
    });
  }, [userLocation, userHeading, is3DMode]);

  // ── Stored destination for NavigationHUD (doesn't clear when navigating) ─
  const navDestRef = useRef(null);
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
        onPOITap={handlePOITap}
        onLongPress={handleLongPress}
      />

      {/* UI overlay */}
      <div className="absolute inset-0 pointer-events-none">

        {/* Search bar — hidden during navigation */}
        <AnimatePresence>
          {!isNavigating && (
            <div className="pointer-events-auto">
              <FloatingSearchBar
                isActive={isSearchActive}
                onActiveChange={setIsSearchActive}
                onResultSelect={handleDestinationSelect}
                userLocation={userLocation}
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

        {/* GPS error toast */}
        {gpsError && !userLocation && (
          <div className="absolute top-24 left-1/2 -translate-x-1/2 glass-bright px-4 py-2.5 rounded-2xl pointer-events-auto">
            <p className="text-xs text-red-400 font-medium">⚠ {gpsError}</p>
          </div>
        )}

        {/* Destination panel (not shown during navigation) */}
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

        {/* Transport mode bar — hidden during navigation and search */}
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
                onStop={handleStopNavigation}
              />
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
