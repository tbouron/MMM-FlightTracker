const NodeHelper = require('node_helper');
const Decoder = require('mode-s-decoder');
const store = require('./lib/store');
const rtlsdr = require('./lib/rtlsdr');
const parse = require('csv-parse');
const fs = require('fs');
const path = require('path');

module.exports = NodeHelper.create({
    airlines: [],
    aircrafts: [],
    isStarted: null,

    start: function() {
        console.log('Initialising ADS-B device ...');

        try {
            rtlsdr.start([]);

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

            this.isStarted = true;
        } catch (e) {
            console.error('Failed to initialised ADS-B hardware', e);
            this.isStarted = false;
        }
    },

    stop: function() {
        console.log('Closing down ADS-B device...');
        rtlsdr.stop();
    },

    socketNotificationReceived: function (id, payload) {
        if (id === 'GET_IS_STARTED') {
            this.sendSocketNotification('SET_IS_STARTED', this.isStarted);
        }
        if (id === 'GET_AIRCRAFTS') {
            this.trackAircrafts(payload);
        }
    },

    trackAircrafts: function(config) {
        const aircrafts = store.getAircrafts()
            .filter(aircraft => aircraft.lat > 0 && aircraft.callsign)
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

                // Find out context
                if (!aircraft.hasOwnProperty('context')) {
                    aircraft.context = 'PASSING_BY';
                    if (config.passingByThreshold > 0 && aircraft.altitude < config.passingByThreshold && config.latLng.length > 0) {
                        if (config.latLng[0] > aircraft.lat) {
                            aircraft.context = 'LANDING';
                        } else {
                            aircraft.context = 'TAKING_OFF';
                        }
                    }
                }

                // Convert altitude to meters
                const altitude = aircraft.altitude / (aircraft.unit === Decoder.UNIT_FEET ? 3.2808 : 1);
                return {
                    ...aircraft,
                    altitude
                };
            }) || [];

        this.sendSocketNotification('SET_AIRCRAFTS', aircrafts);
    }
});