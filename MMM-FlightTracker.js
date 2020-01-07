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
            const windowPlanes = this.aircrafts.filter(plane => plane.context !== 'PASSING_BY');
            if (windowPlanes.length > 0) {
                wrapper.appendChild(this.getSection(windowPlanes, this.translate('At the window')));
            }
            const passingByPlanes = this.aircrafts.filter(plane => plane.context === 'PASSING_BY');
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

            if (this.config.showType && aircraft.type) {
                const aircraftType = document.createElement('div');
                aircraftType.className = 'aircraft-subheading xsmall dimmed';
                aircraftType.innerHTML = aircraft.type;
                row.appendChild(aircraftType);
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
                metadata.push(`<small><i class="fas ${altitudeIconId} dimmed"></i>${Math.floor(this.config.speedUnits === 'metric' ? aircraft.altitude/3.2808399 : aircraft.altitude)}<sup>${this.config.speedUnits === 'metric' ? 'm' : 'ft'}</sup></small>`);
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
    }
});

