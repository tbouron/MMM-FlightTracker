Module.register('MMM-FlightTracker', {
    // Default module config.
    defaults: {
        interval: 1,
        animationSpeed: 1000,
        passingByThreshold: -1,
        latLng: [],
        altitudeUnits: config.units,
        speedUnits: config.units
    },

    aircrafts: [],
    isStarted: null,

    start: function() {
        var self = this;
        self.trackPlanes();
        setInterval(function () {
            self.trackPlanes();
        }, this.config.interval * 1000);
    },

    getScripts: function () {
        return ['moment.js'];
    },

    getStyles: function () {
        return ['https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.11.2/css/all.css', 'MMM-FlightTracker.css'];
    },

    socketNotificationReceived: function (id, payload) {
        if (id === 'SET_IS_STARTED') {
            this.isStarted = payload;
            this.updateDom(this.config.animationSpeed);
        }
        if (id === 'SET_AIRCRAFTS') {
            const animate = this.aircrafts.length !== payload.length;
            this.aircrafts = payload;
            this.updateDom(animate ? this.config.animationSpeed : undefined);
        }
    },

    trackPlanes: function() {
        if (this.isStarted === null) {
            Log.log('Node helper not started yet. Waiting...');
            this.sendSocketNotification('GET_IS_STARTED');
        } else {
            this.sendSocketNotification('GET_AIRCRAFTS', this.config);
        }
    },

    getDom: function() {
        const wrapper = document.createElement('div');
        wrapper.className = 'flight-tracker';

        if (this.isStarted === null) {
            wrapper.className = 'light small dimmed';
            wrapper.innerHTML = this.translate('Starting tracker');
            return wrapper;
        }
        if (this.isStarted === false) {
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
            row.className = 'plane';

            let iconClasses = ['fas'];
            switch (aircraft.context) {
                case 'PASSING_BY':
                    iconClasses.push('fa-plane');
                    break;
                case 'LANDING':
                    iconClasses.push('fa-plane-arrival');
                    break;
                case 'TAKING_OFF':
                    iconClasses.push('fa-plane-departure');
                    break;
            }
            const icon = document.createElement('i');
            icon.className = iconClasses.join(' ');
            row.appendChild(icon);

            const content = document.createElement('div');
            content.className = 'plane-content';
            row.appendChild(content);

            const flightHeading = document.createElement('div');
            flightHeading.className = 'plane-content-heading small';
            flightHeading.innerHTML = [
                `<span class="bright">${aircraft.callsign}</span>`,
                `<span class="dimmed">${aircraft.airline}</span>`
            ].join('');
            content.appendChild(flightHeading);

            const flightMetadata = document.createElement('div');
            flightMetadata.className = 'plane-content-metadata xsmall dimmed';
            let metadata = [
                `<span><span class="bright">${Math.floor(this.config.speedUnits === 'metric' ? aircraft.speed*1.852 : aircraft.speed)}</span> ${this.config.speedUnits === 'metric' ? 'km/s' : 'kn'}</span>`,
                `<span><span class="bright">${Math.floor(this.config.altitudeUnits === 'metric' ? aircraft.altitude/3.2808399 : aircraft.altitude)}</span> ${this.config.altitudeUnits === 'metric' ? 'm' : 'ft'}</span>`,
                `<span><span class="bright">${Math.floor(aircraft.heading)}</span>°</span>`
            ];
            if (aircraft.type) {
                metadata.unshift(`<span class="bright">${aircraft.type}</span>&nbsp–`);
            }
            flightMetadata.innerHTML = metadata.join('');
            content.appendChild(flightMetadata);

            return row;
        }));

        return section;
    }
});

