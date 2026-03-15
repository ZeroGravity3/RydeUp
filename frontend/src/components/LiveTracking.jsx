import React, { useEffect, useRef, useState } from 'react';
import tt from '@tomtom-international/web-sdk-maps';
import '@tomtom-international/web-sdk-maps/dist/maps.css';

const LiveTracking = () => {
  const mapElement = useRef(null);
  const [map, setMap] = useState(null);
  const [marker, setMarker] = useState(null);
  const [currentPosition, setCurrentPosition] = useState({
    lat: 12.9716, // Default starting position
    lng: 77.5946,
  });

  // Initialize map
  useEffect(() => {
    const newMap = tt.map({
      key: import.meta.env.VITE_TOMTOM_API,
      container: mapElement.current,
      center: [currentPosition.lng, currentPosition.lat],
      zoom: 15,
    });

    const newMarker = new tt.Marker().setLngLat([currentPosition.lng, currentPosition.lat]).addTo(newMap);

    setMap(newMap);
    setMarker(newMarker);

    return () => newMap.remove();
  }, []);

  // Track user location and move marker smoothly
  useEffect(() => {
    if (!map || !marker) return;

    const updatePosition = (position) => {
      const { latitude, longitude } = position.coords;

      const start = { lat: currentPosition.lat, lng: currentPosition.lng };
      const end = { lat: latitude, lng: longitude };
      const duration = 1000; // 1 second animation
      const startTime = performance.now();

      const animate = (time) => {
        const progress = Math.min((time - startTime) / duration, 1);
        const lat = start.lat + (end.lat - start.lat) * progress;
        const lng = start.lng + (end.lng - start.lng) * progress;

        marker.setLngLat([lng, lat]);
        map.setCenter([lng, lat]);

        if (progress < 1) requestAnimationFrame(animate);
        else setCurrentPosition(end); // update current position after animation
      };

      requestAnimationFrame(animate);
    };

    // Initial position
    navigator.geolocation.getCurrentPosition(updatePosition);

    // Watch movement
    const watchId = navigator.geolocation.watchPosition(updatePosition);

    return () => navigator.geolocation.clearWatch(watchId);
  }, [map, marker, currentPosition]);

  return <div ref={mapElement} style={{ width: '100%', height: '100vh' }} />;
};

export default LiveTracking;
