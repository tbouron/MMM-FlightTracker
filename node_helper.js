const NodeHelper = require('node_helper');
const Decoder = require('mode-s-decoder');
const store = require('./lib/store');
const adsb = require('./lib/adsb');
const parse = require('csv-parse');
const fs = require('fs');
const path = require('path');

module.exports = NodeHelper.create({
    airlines: [],
    aircrafts: [],
    altitudes: {},
    clients: [],
    isStarted: null,

    init: function() {
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
        adsb.stop();
    },

    socketNotificationReceived: function (id, payload) {
        if (id === 'START_TRACKING') {
            this.startTracking(payload);
        }
        if (id === 'GET_IS_STARTED') {
            this.sendSocketNotification('SET_IS_STARTED', this.isStarted);
        }
        if (id === 'GET_AIRCRAFTS') {
            this.trackAircrafts(payload);
        }
    },

    startTracking: function(config) {
        if (this.clients.includes(JSON.stringify(config))) {
            console.log('An instance of ADS-B client with the same configuration already exists. Skipping ...');
            this.isStarted = true;
            return;
        }

        console.log('Initialising ADS-B client ...');
        this.clients.push(JSON.stringify(config));

        try {
            adsb.start(config);
            this.isStarted = true;
        } catch (e) {
            console.error('Failed to initialised ADS-B client', e);
            this.clients.pop();
            this.isStarted = false;
        }
    },

    trackAircrafts: function(config) {
        const aircrafts = store.getAircrafts()
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

                // Convert altitude
                const altitude = aircraft.altitude * (aircraft.unit === Decoder.UNIT_METERS ? 3.2808399 : 1);

                // Find out context
                if (!aircraft.hasOwnProperty('context')) {
                    if (!config.passingByThreshold || config.passingByThreshold <= 0) {
                        aircraft.context = 'PASSING_BY';
                    } else if (config.passingByThreshold > 0 && altitude > config.passingByThreshold) {
                        aircraft.context = 'PASSING_BY';
                    } else if (config.passingByThreshold > 0 && altitude < config.passingByThreshold) {
                        if (!this.altitudes.hasOwnProperty(aircraft.icao)) {
                            this.altitudes[aircraft.icao] = altitude;
                        } else if (this.altitudes[aircraft.icao] > altitude) {
                            aircraft.context = 'LANDING';
                            this.altitudes[aircraft.icao] = undefined;
                        } else if (this.altitudes[aircraft.icao] < altitude) {
                            aircraft.context = 'TAKING_OFF';
                            this.altitudes[aircraft.icao] = undefined;
                        }
                    }
                }

                return {
                    ...aircraft,
                    altitude
                };
            }) || [];

        this.sendSocketNotification('SET_AIRCRAFTS', aircrafts);
    }
});