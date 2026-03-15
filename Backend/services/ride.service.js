const rideModel = require('../models/ride.model');
const mapService = require('./maps.service');
const crypto = require('crypto');

async function getFare(pickup, destination) {

    if (!pickup || !destination) {
        throw new Error('Pickup and destination are required');
    }

    let origin = pickup;
    let dest = destination;

    if (typeof pickup === 'string') {
        origin = await mapService.getAddressCoordinate(pickup);
    }

    if (typeof destination === 'string') {
        dest = await mapService.getAddressCoordinate(destination);
    }

    let distanceTime;

    try {
        distanceTime = await mapService.getDistanceTime(origin, dest);
    } catch (err) {

        console.error('mapService.getDistanceTime failed, falling back to haversine:', err.message);

        const toRad = (deg) => (deg * Math.PI) / 180;

        const haversineKm = (lat1, lon1, lat2, lon2) => {
            const R = 6371;
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);

            const a =
                Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(lat1)) *
                Math.cos(toRad(lat2)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);

            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

            return R * c;
        };

        const lat1 = origin.lat || 0;
        const lon1 = origin.lng || origin.lon || 0;
        const lat2 = dest.lat || 0;
        const lon2 = dest.lng || dest.lon || 0;

        const distanceMeters = haversineKm(lat1, lon1, lat2, lon2) * 1000;

        const travelTimeSeconds = (distanceMeters / 1000) / 40 * 3600;

        distanceTime = {
            distanceMeters,
            travelTimeSeconds
        };
    }

    const baseFare = {
        auto: 30,
        car: 50,
        moto: 20
    };

    const perKmRate = {
        auto: 10,
        car: 15,
        moto: 8
    };

    const perMinuteRate = {
        auto: 2,
        car: 3,
        moto: 1.5
    };

    const distanceInKm = (distanceTime.distanceMeters || 0) / 1000;
    const durationInMinutes = (distanceTime.travelTimeSeconds || 0) / 60;

    const fare = {
        auto: Math.round(baseFare.auto + (distanceInKm * perKmRate.auto) + (durationInMinutes * perMinuteRate.auto)),
        car: Math.round(baseFare.car + (distanceInKm * perKmRate.car) + (durationInMinutes * perMinuteRate.car)),
        moto: Math.round(baseFare.moto + (distanceInKm * perKmRate.moto) + (durationInMinutes * perMinuteRate.moto))
    };

    return fare;
}

module.exports.getFare = getFare;

function getOtp(num) {
    const otp = crypto.randomInt(Math.pow(10, num - 1), Math.pow(10, num)).toString();
    return otp;
}

module.exports.createRide = async ({
    user,
    pickup,
    destination,
    vehicleType
}) => {

    if (!user || !pickup || !destination || !vehicleType) {
        throw new Error('All fields are required');
    }

    const fare = await getFare(pickup, destination);

    const ride = await rideModel.create({
        user,
        pickup,
        destination,
        otp: getOtp(4),
        fare: fare[vehicleType]
    });

    return ride;
};

module.exports.confirmRide = async ({
    rideId,
    captain
}) => {

    if (!rideId) {
        throw new Error('Ride id is required');
    }

    await rideModel.findOneAndUpdate(
        { _id: rideId },
        { status: 'accepted', captain: captain._id }
    );

    const ride = await rideModel
        .findOne({ _id: rideId })
        .populate('user')
        .populate('captain')
        .select('+otp');

    if (!ride) {
        throw new Error('Ride not found');
    }

    return ride;
};

module.exports.startRide = async ({
    rideId,
    otp,
    captain
}) => {

    if (!rideId || !otp) {
        throw new Error('Ride id and OTP are required');
    }

    const ride = await rideModel
        .findOne({ _id: rideId })
        .populate('user')
        .populate('captain')
        .select('+otp');

    if (!ride) {
        throw new Error('Ride not found');
    }

    if (ride.status !== 'accepted') {
        throw new Error('Ride not accepted');
    }

    if (ride.otp !== otp) {
        throw new Error('Invalid OTP');
    }

    await rideModel.findOneAndUpdate(
        { _id: rideId },
        { status: 'ongoing' }
    );

    return ride;
};

module.exports.endRide = async ({
    rideId,
    captain
}) => {

    if (!rideId) {
        throw new Error('Ride id is required');
    }

    const ride = await rideModel
        .findOne({
            _id: rideId,
            captain: captain._id
        })
        .populate('user')
        .populate('captain')
        .select('+otp');

    if (!ride) {
        throw new Error('Ride not found');
    }

    if (ride.status !== 'ongoing') {
        throw new Error('Ride not ongoing');
    }

    await rideModel.findOneAndUpdate(
        { _id: rideId },
        { status: 'completed' }
    );

    return ride;
};