Module.register('MMM-FlightTracker', {
    // Default module config.
    defaults: {
        interval: 1,
        animationSpeed: 1000,
        passingByThreshold: -1,
        latLng: [],
        altitudeUnits: config.units,
        speedUnits: config.units,
        showAirline: true,
        showType: true,
        showSpeed: true,
        showAltitude: true,
        showHeading: true
    },

    aircrafts: [],
    isConnected: null,

    start: function() {
        this.sendSocketNotification('START_TRACKING', this.config.client);
        this.trackPlanes();
        setInterval(() => {
            this.trackPlanes();
        }, this.config.interval * 1000);
    },

    getStyles: function () {
        return [
            'font-awesome.css',
            'MMM-FlightTracker.css'
        ];
    },

    socketNotificationReceived: function (id, payload) {
        if (id === 'SET_IS_CONNECTED') {
            this.isConnected = payload;
            this.updateDom(this.config.animationSpeed);
        }
        if (id === 'SET_AIRCRAFTS') {
            const animate = this.aircrafts.length !== payload.length;
            const isUpdated = JSON.stringify(this.aircrafts) !== JSON.stringify(payload);
            if (isUpdated) {
                this.aircrafts = payload;
                this.updateDom(animate ? this.config.animationSpeed : undefined);
            }
        }
    },

    trackPlanes: function() {
        if (this.isConnected === null) {
            Log.log('Node helper not connected yet to the ADS-B client. Waiting...');
            this.sendSocketNotification('GET_IS_CONNECTED');
        } else {
            this.sendSocketNotification('GET_AIRCRAFTS', this.config);
        }
    },

    getDom: function() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flight-tracker';

        if (this.isConnected === null) {
            wrapper.className = 'light small dimmed';
            wrapper.innerHTML = this.translate('Connecting tracker');
            return wrapper;
        }
        if (this.isConnected === false) {
            wrapper.className = 'light small dimmed';
            wrapper.innerHTML = this.translate('Failed to start. Please check the logs');
            return wrapper;
        }
        if (this.aircrafts.length === 0) {
            wrapper.className = 'light small dimmed';
            wrapper.innerHTML = this.translate('No planes nearby');
            return wrapper;
        }

        if (this.config.passingByThreshold > 0) {
            const windowPlanes = this.aircrafts.filter(aircraft => aircraft.altitude * (aircraft.unit === 0 && this.config.altitudeUnits === 'metric' ? 0.3040 : 1) <= this.config.passingByThreshold);
            if (windowPlanes.length > 0) {
                wrapper.appendChild(this.getSection(windowPlanes, this.translate('At the window')));
            }
            const passingByPlanes = this.aircrafts.filter(aircraft => aircraft.altitude * (aircraft.unit === 0 && this.config.altitudeUnits === 'metric' ? 0.3040 : 1) > this.config.passingByThreshold);
            if (passingByPlanes.length > 0) {
                wrapper.appendChild(this.getSection(passingByPlanes, this.translate('Passing by')));
            }
        } else {
            wrapper.appendChild(this.getSection(this.aircrafts));
        }

        return wrapper;
    },

    getSection(aircrafts, label) {
        const section = document.createElement('div');
        if (label) {
            section.innerHTML = `<p class="light small dimmed label">${label}</p>`;
        }

        section.append(...aircrafts.map(aircraft => {
            const row = document.createElement('div');
            row.className = 'aircraft';

            const aircraftHeading = document.createElement('div');
            aircraftHeading.className = 'aircraft-heading medium';
            aircraftHeading.innerHTML = `<span class="bright">${aircraft.callsign}</span>`;
            if (this.config.showAirline && aircraft.airline) {
                aircraftHeading.innerHTML += `&nbsp;<span class="small dimmed airline">/${aircraft.airline}</span>`
            }
            row.appendChild(aircraftHeading);

            const altitude = aircraft.altitude
                ? Math.floor(aircraft.altitude * (aircraft.unit === 0 && this.config.altitudeUnits === 'metric' ? 0.3040 : 1))
                : null;

            const subHeading = [];
            if (this.config.showType && aircraft.type) {
                subHeading.push(`<span>${aircraft.type}</span>`);
            }
            if (this.config.latLng && altitude < this.config.passingByThreshold && aircraft.distance) {
                const distance = aircraft.distance * (this.config.altitudeUnits === 'metric' ? 1 : 3.28084);
                subHeading.push(`<span><i class="fas fa-location-arrow dimmed"></i>${Math.floor(distance)}<sup>${this.config.altitudeUnits === 'metric' ? 'm' : 'ft'}</sup></span>`);
                if (aircraft.direction) {
                    subHeading.push(`<span>${this.cardinalDirection(aircraft.direction)}</span>`);
                }
            }
            if (subHeading.length > 0) {
                const aircraftSubHeading = document.createElement('div');
                aircraftSubHeading.className = 'aircraft-subheading xsmall dimmed';
                aircraftSubHeading.innerHTML = subHeading.join('');
                row.appendChild(aircraftSubHeading);
            }

            let altitudeIconId;
            if (aircraft.verticalRate < 0) {
                altitudeIconId = 'fa-angle-double-down';
            } else if (aircraft.verticalRate > 0) {
                altitudeIconId = 'fa-angle-double-up';
            } else {
                altitudeIconId = 'fa-arrows-alt-h';
            }

            const metadata = [];
            if (this.config.showSpeed && aircraft.speed) {
                metadata.push(`<small><i class="fas fa-wind dimmed"></i>${Math.floor(this.config.speedUnits === 'metric' ? aircraft.speed*1.852 : aircraft.speed)}<sup>${this.config.speedUnits === 'metric' ? 'km/h' : 'knots'}</sup></small>`);
            }
            if (this.config.showAltitude && aircraft.altitude) {
                metadata.push(`<small><i class="fas ${altitudeIconId} dimmed"></i>${altitude}<sup>${this.config.altitudeUnits === 'metric' ? 'm' : 'ft'}</sup></small>`);
            }
            if (this.config.showHeading && aircraft.heading) {
                metadata.push(`<small><i class="far fa-compass dimmed"></i>${Math.floor(aircraft.heading)}<sup>○</sup></small>`);
            }
            if (metadata.length > 0) {
                const aircraftMetadata = document.createElement('div');
                aircraftMetadata.className = 'aircraft-metadata medium normal';
                aircraftMetadata.innerHTML = metadata.join('');
                row.appendChild(aircraftMetadata);
            }

            return row;
        }));

        return section;
    },

    cardinalDirection(direction) {
        if (direction> 11.25 && direction<= 33.75){
            return "NNE";
        } else if (direction> 33.75 && direction<= 56.25) {
            return "NE";
        } else if (direction> 56.25 && direction<= 78.75) {
            return "ENE";
        } else if (direction> 78.75 && direction<= 101.25) {
            return "E";
        } else if (direction> 101.25 && direction<= 123.75) {
            return "ESE";
        } else if (direction> 123.75 && direction<= 146.25) {
            return "SE";
        } else if (direction> 146.25 && direction<= 168.75) {
            return "SSE";
        } else if (direction> 168.75 && direction<= 191.25) {
            return "S";
        } else if (direction> 191.25 && direction<= 213.75) {
            return "SSW";
        } else if (direction> 213.75 && direction<= 236.25) {
            return "SW";
        } else if (direction> 236.25 && direction<= 258.75) {
            return "WSW";
        } else if (direction> 258.75 && direction<= 281.25) {
            return "W";
        } else if (direction> 281.25 && direction<= 303.75) {
            return "WNW";
        } else if (direction> 303.75 && direction<= 326.25) {
            return "NW";
        } else if (direction> 326.25 && direction<= 348.75) {
            return "NNW";
        } else {
            return "N";
        }
    }

});

