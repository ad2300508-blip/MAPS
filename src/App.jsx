import { useState, useRef, useCallback } from 'react';
import MapView from './components/MapView';
import FloatingSearchBar from './components/FloatingSearchBar';
import POIDetailsPanel from './components/POIDetailsPanel';
import MapControls from './components/MapControls';

export default function App() {
  const [selectedPOI, setSelectedPOI] = useState(null);
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [is3DMode, setIs3DMode] = useState(true);
  // mapApi holds the react-map-gl MapRef, set via onMapLoaded callback
  const mapApiRef = useRef(null);

  const handleMapLoaded = useCallback((mapApi) => {
    mapApiRef.current = mapApi;
  }, []);

  const handlePOISelect = useCallback((poi) => {
    setSelectedPOI(poi);
    setIsSearchActive(false);
    mapApiRef.current?.flyTo({
      center: poi.coords,
      zoom: 15.5,
      pitch: is3DMode ? 55 : 0,
      bearing: -8,
      duration: 1600,
      essential: true,
    });
  }, [is3DMode]);

  const handleClosePanel = useCallback(() => {
    setSelectedPOI(null);
  }, []);

  const handleToggle3D = useCallback(() => {
    setIs3DMode((prev) => {
      const next = !prev;
      mapApiRef.current?.easeTo({
        pitch: next ? 52 : 0,
        duration: 900,
      });
      return next;
    });
  }, []);

  const handleMyLocation = useCallback(() => {
    // In production, use navigator.geolocation here
    mapApiRef.current?.flyTo({
      center: [2.3499, 48.8530],
      zoom: 15,
      pitch: is3DMode ? 52 : 0,
      duration: 1400,
    });
  }, [is3DMode]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-surface-900">
      {/* Full-screen map layer */}
      <MapView
        onMapLoaded={handleMapLoaded}
        onPOISelect={handlePOISelect}
        selectedPOI={selectedPOI}
        is3DMode={is3DMode}
      />

      {/* UI overlay — pointer-events-none on the container so the map stays interactive */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="pointer-events-auto">
          <FloatingSearchBar
            isActive={isSearchActive}
            onActiveChange={setIsSearchActive}
            onResultSelect={handlePOISelect}
          />
        </div>

        <div className="pointer-events-auto">
          <MapControls
            mapApiRef={mapApiRef}
            is3DMode={is3DMode}
            onToggle3D={handleToggle3D}
            onMyLocation={handleMyLocation}
          />
        </div>

        <div className="pointer-events-auto">
          <POIDetailsPanel poi={selectedPOI} onClose={handleClosePanel} />
        </div>
      </div>
    </div>
  );
}
