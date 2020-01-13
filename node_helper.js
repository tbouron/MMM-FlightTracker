const NodeHelper = require('node_helper');
const Decoder = require('mode-s-decoder');
const Adsb = require('./lib/adsb');
const parse = require('csv-parse');
const fs = require('fs');
const path = require('path');

module.exports = NodeHelper.create({
    airlines: [],
    aircrafts: [],
    altitudes: {},
    clients: [],
    isConnected: null,
    adsb: null,

    init: function() {
        this.adsb = new Adsb();

        const airlineParser = parse({
            delimiter: ',',
            columns: ['id', 'name', 'alias', 'iata', 'icao', 'callsign', 'country', 'active']
        });
        const aircraftsParser = parse({
            delimiter: ',',
            columns: ['icao', 'regid', 'mdl', 'type', 'operator']
        });

        fs.createReadStream(path.join(__dirname, 'data', 'airlines.csv'))
            .pipe(airlineParser)
            .on('error', err => {
                console.error(err);
            })
            .on('data', row => {
                Object.keys(row).forEach(key => {
                    if (row[key] === '\\N') {
                        row[key] = null
                    }
                });
                row.id = Number.parseInt(row.id, 10);
                row.active = row.active === 'Y';

                this.airlines.push(row);
            })
            .on('end', () => {
                console.log('Airlines DB loaded');
            });

        fs.createReadStream(path.join(__dirname, 'data', 'aircrafts.csv'))
            .pipe(aircraftsParser)
            .on('error', err => {
                console.error(err);
            })
            .on('data', row => {
                Object.keys(row).forEach(key => {
                    if (row[key] === '') {
                        row[key] = null
                    }
                });
                this.aircrafts.push(row);
            })
            .on('end', () => {
                console.log('Aircrafts DB loaded');
            });
    },

    stop: function() {
        console.log('Closing down ADS-B client ...');
        this.adsb.stop();
    },

    socketNotificationReceived: function (id, payload) {
        if (id === 'START_TRACKING') {
            this.startTracking(payload);
        }
        if (id === 'GET_IS_CONNECTED') {
            this.sendSocketNotification('SET_IS_CONNECTED', this.isConnected);
        }
        if (id === 'GET_AIRCRAFTS') {
            this.trackAircrafts(payload);
        }
    },

    startTracking: function(config) {
        if (this.clients.includes(JSON.stringify(config))) {
            console.log('An instance of ADS-B client with the same configuration already exists. Skipping ...');
            this.isConnected = true;
            return;
        }

        console.log('Initialising ADS-B client ...');
        this.clients.push(JSON.stringify(config));

        try {
            this.adsb.on('socket-closed', () => {
                this.isConnected = null;
                this.sendSocketNotification('SET_IS_CONNECTED', this.isConnected);
            }).on('socket-opened', () => {
                this.isConnected = true;
                this.sendSocketNotification('SET_IS_CONNECTED', this.isConnected);
            }).start(config);
            this.isConnected = true;
        } catch (e) {
            console.error('Failed to initialised ADS-B client', e);
            this.clients.pop();
            this.isConnected = false;
        }
    },

    trackAircrafts: function(config) {
        const aircrafts = this.adsb.getStore().getAircrafts()
            .filter(aircraft => aircraft.callsign)
            .map(aircraft => {
                const icao = parseInt(aircraft.icao, 10).toString(16);
                const plane = this.aircrafts.find(plane => plane.icao === icao);
                const airline = this.airlines.find(airline => airline.icao === aircraft.callsign.substr(0, 3));

                // Find out airline name
                if (!aircraft.hasOwnProperty('airline')) {
                    let airlineName = [];
                    if (airline) {
                        airlineName.push(airline.alias || airline.name);
                        if (!airline.active) {
                            airlineName.push('*');
                        }
                    } else {
                        airlineName.push('Unknown');
                    }
                    if (plane && plane.operator) {
                        airlineName = [plane.operator];
                    }
                    aircraft.airline = airlineName.join('');
                }

                // Find out plane type
                if (!aircraft.hasOwnProperty('type') && plane && plane.type) {
                    aircraft.type = plane.type;
                }

                // Find out plane distance and direction from base coordinates
                if (aircraft.lat && aircraft.lng && config.latLng && config.latLng instanceof Array) {
                    const R = 6371e3; // metres
                    const radLat1 = this.toRadians(config.latLng[0]);
                    const radLat2 = this.toRadians(aircraft.lat);
                    const deltaLat = this.toRadians(aircraft.lat - config.latLng[0]);
                    const deltaLng = this.toRadians(aircraft.lng - config.latLng[1]);

                    const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
                        Math.cos(radLat1) * Math.cos(radLat2) *
                        Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
                    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

                    aircraft.distance = R * c;

                    const y = Math.sin(deltaLng) * Math.cos(radLat2);
                    const x = Math.cos(radLat1) * Math.sin(radLat2) -
                        Math.sin(radLat1) * Math.cos(radLat2) * Math.cos(deltaLng);
                    const bearing = this.toDegree(Math.atan2(y, x));
                    aircraft.direction = (bearing + 360) % 360;
                }

                return aircraft;
            }) || [];

        this.sendSocketNotification('SET_AIRCRAFTS', aircrafts);
    },

    toRadians: function(n) {
        return n * Math.PI / 180;
    },

    toDegree: function(n) {
        return n * 180 / Math.PI;
    }
});