require('dotenv').config();
const axios = require('axios');
const captainModel = require('../models/captain.model');

// Check for TomTom API key at startup
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY;
if (!TOMTOM_API_KEY) {
    throw new Error('TomTom API key is missing. Please add TOMTOM_API_KEY in your .env file.');
}

module.exports.getAddressCoordinate = async (address) => {
    if (!address) throw new Error('Address is required');

    const url = `https://api.tomtom.com/search/2/geocode/${encodeURIComponent(address)}.json?key=${TOMTOM_API_KEY}`;

    try {
        const response = await axios.get(url);
        if (response.data.results && response.data.results.length > 0) {
            const location = response.data.results[0].position;
            return { lat: location.lat, lng: location.lon };
        } else {
            throw new Error('Unable to fetch coordinates');
        }
    } catch (error) {
        console.error('Error in getAddressCoordinate:', error.message);
        throw error;
    }
};

module.exports.getDistanceTime = async (origin, destination) => {
    if (!origin || !destination) throw new Error('Origin and destination are required');

    const url = `https://api.tomtom.com/routing/1/calculateRoute/${origin.lat},${origin.lng}:${destination.lat},${destination.lng}/json?key=${TOMTOM_API_KEY}`;

    try {
        const response = await axios.get(url);
        if (response.data.routes && response.data.routes.length > 0) {
            const summary = response.data.routes[0].summary;
            return { distanceMeters: summary.lengthInMeters, travelTimeSeconds: summary.travelTimeInSeconds };
        } else {
            throw new Error('No routes found');
        }
    } catch (err) {
        console.error('Error in getDistanceTime:', err.message);
        throw err;
    }
};

module.exports.getAutoCompleteSuggestions = async (input) => {
    if (!input) throw new Error('Query is required');

    const url = `https://api.tomtom.com/search/2/search/${encodeURIComponent(input)}.json?key=${TOMTOM_API_KEY}&typeahead=true&limit=5`;

    try {
        const response = await axios.get(url);
        if (response.data.results && response.data.results.length > 0) {
            return response.data.results
                .map(r => r.address && r.address.freeformAddress)
                .filter(Boolean);
        } else {
            return [];
        }
    } catch (err) {
        console.error('Error in getAutoCompleteSuggestions:', err.message);
        throw err;
    }
};

module.exports.getCaptainsInTheRadius = async (lat, lng, radius) => {
    if (!lat || !lng || !radius) throw new Error('Latitude, longitude, and radius are required');

    try {
        // The captain model stores location as { lat, lng } (not GeoJSON). The previous
        // $geoWithin query assumes a geospatial index/GeoJSON and therefore returns no
        // results. Instead, fetch captains with a location and filter them by distance
        // using the Haversine formula (radius is expected in kilometers).
        const captains = await captainModel.find({ 'location.lat': { $exists: true }, 'location.lng': { $exists: true } });

        // Haversine distance
        const toRad = (deg) => (deg * Math.PI) / 180;
        const haversineDistanceKm = (lat1, lon1, lat2, lon2) => {
            const R = 6371; // Earth radius in km
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        const nearby = captains.filter(c => {
            const clat = c.location.lat;
            const clng = c.location.lng;
            if (typeof clat !== 'number' || typeof clng !== 'number') return false;
            const dist = haversineDistanceKm(lat, lng, clat, clng);
            return dist <= radius;
        });

        return nearby;
    } catch (err) {
        console.error('Error in getCaptainsInTheRadius:', err.message);
        throw err;
    }
};
