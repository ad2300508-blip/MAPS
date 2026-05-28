import { useState, useRef, useCallback } from 'react';
import MapView from './components/MapView';
import FloatingSearchBar from './components/FloatingSearchBar';
import POIDetailsPanel from './components/POIDetailsPanel';
import MapControls from './components/MapControls';
import TransportModeSelector from './components/TransportModeSelector';
import { getModeById } from './data/mockData';

export default function App() {
  const [selectedPOI, setSelectedPOI] = useState(null);
  const [selectedModeId, setSelectedModeId] = useState('car');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [is3DMode, setIs3DMode] = useState(true);
  const mapApiRef = useRef(null);

  const handleMapLoaded = useCallback((mapApi) => {
    mapApiRef.current = mapApi;
  }, []);

  const flyToCoords = useCallback((coords) => {
    mapApiRef.current?.flyTo({
      center: coords,
      zoom: 15.2,
      pitch: is3DMode ? 54 : 0,
      bearing: -8,
      duration: 1600,
      essential: true,
    });
  }, [is3DMode]);

  const handlePOISelect = useCallback((poi) => {
    setSelectedPOI(poi);
    setIsSearchActive(false);
    flyToCoords(poi.coords);
  }, [flyToCoords]);

  const handleClosePanel = useCallback(() => {
    setSelectedPOI(null);
  }, []);

  const handleModeChange = useCallback((modeId) => {
    setSelectedModeId(modeId);
    // If a POI is selected, re-center the map slightly to show the new route
    if (selectedPOI) {
      const mode = getModeById(modeId);
      // Brief flyTo to re-frame the new route geometry
      const routeCoords = mode.routeCoords;
      const midIdx = Math.floor(routeCoords.length / 2);
      mapApiRef.current?.easeTo({
        center: routeCoords[midIdx],
        zoom: 13.0,
        pitch: is3DMode ? 48 : 0,
        duration: 900,
      });
    }
  }, [selectedPOI, is3DMode]);

  const handleToggle3D = useCallback(() => {
    setIs3DMode((prev) => {
      const next = !prev;
      mapApiRef.current?.easeTo({ pitch: next ? 52 : 0, duration: 900 });
      return next;
    });
  }, []);

  const handleMyLocation = useCallback(() => {
    // In production: navigator.geolocation.getCurrentPosition(...)
    mapApiRef.current?.flyTo({
      center: [2.3499, 48.8530],
      zoom: 15,
      pitch: is3DMode ? 52 : 0,
      duration: 1400,
    });
  }, [is3DMode]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-surface-900">
      {/* Full-screen map */}
      <MapView
        onMapLoaded={handleMapLoaded}
        onPOISelect={handlePOISelect}
        selectedPOI={selectedPOI}
        selectedModeId={selectedModeId}
        is3DMode={is3DMode}
      />

      {/* UI overlay — pointer-events-none keeps map interactive */}
      <div className="absolute inset-0 pointer-events-none">
        {/* Search bar */}
        <div className="pointer-events-auto">
          <FloatingSearchBar
            isActive={isSearchActive}
            onActiveChange={setIsSearchActive}
            onResultSelect={handlePOISelect}
          />
        </div>

        {/* Right-side controls */}
        <div className="pointer-events-auto">
          <MapControls
            mapApiRef={mapApiRef}
            is3DMode={is3DMode}
            onToggle3D={handleToggle3D}
            onMyLocation={handleMyLocation}
          />
        </div>

        {/* POI details panel — offset from bottom to leave room for mode selector */}
        <div className="pointer-events-auto">
          <POIDetailsPanel
            poi={selectedPOI}
            onClose={handleClosePanel}
            selectedModeId={selectedModeId}
            onModeChange={handleModeChange}
          />
        </div>

        {/* Transport mode selector — always at bottom */}
        <div className="pointer-events-auto">
          <TransportModeSelector
            selectedModeId={selectedModeId}
            onModeChange={handleModeChange}
            destination={selectedPOI}
          />
        </div>
      </div>
    </div>
  );
}
