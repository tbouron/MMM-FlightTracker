Module.register('MMM-FlightTracker', {
    // Default module config.
    defaults: {
        interval: 1,
        animationSpeed: 1000,
        passingByThreshold: -1,
        runwayHeadings: [],
        // TODO: Make unit configurable for altitude
    },

    planes: [],
    averageHeading: -1,
    isStarted: null,

    start: function() {
        if (this.config.runwayHeadings.length > 0) {
            this.averageHeading = Math.min(...this.config.runwayHeadings)+((Math.max(...this.config.runwayHeadings)-Math.min(...this.config.runwayHeadings))/2);
        }

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
        return ['font-awesome.css', 'MMM-FlightTracker.css'];
    },

    socketNotificationReceived: function (id, payload) {
        Log.log(`Received notification for: "${id}": `, payload);
        if (id === 'SET_IS_STARTED') {
            this.isStarted = payload;
            this.updateDom(this.config.animationSpeed);
        }
        if (id === 'SET_PLANES') {
            const animate = this.planes.length !== payload.length;
            this.planes = payload;
            this.updateDom(animate ? this.config.animationSpeed : undefined);
        }
    },

    trackPlanes: function() {
        if (this.isStarted === null) {
            Log.log('Node helper not started yet. Waiting...');
            this.sendSocketNotification('GET_IS_STARTED');
        } else {
            this.sendSocketNotification('GET_PLANES');
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
            wrapper.className = 'thin small dimmed';
            wrapper.innerHTML = this.translate('Failed to start. Please check the logs');
            return wrapper;
        }
        if (this.planes.length === 0) {
            wrapper.className = 'light small dimmed';
            wrapper.innerHTML = this.translate('No planes nearby');
            return wrapper;
        }

        if (this.config.passingByThreshold > 0) {
            const windowPlanes = this.planes.filter(plane => plane.altitude < this.config.passingByThreshold);
            if (windowPlanes.length > 0) {
                wrapper.appendChild(this.getSection(windowPlanes, this.translate('At the window')));
            }
            const passingByPlanes = this.planes.filter(plane => plane.altitude >= this.config.passingByThreshold);
            if (passingByPlanes.length > 0) {
                wrapper.appendChild(this.getSection(passingByPlanes, this.translate('Passing by')));
            }
        } else {
            wrapper.appendChild(this.getSection(this.planes));
        }

        return wrapper;
    },

    getSection(planes, label) {
        let iconClass = 'fas fa-plane';
        if (this.averageHeading > 0) {
            if (this.averageHeading > this.averageHeading - 90 && this.averageHeading < this.averageHeading + 90) {
                iconClass = 'fas fa-plan-arrival';
            } else {
                iconClass = 'fas fa-plane-departure'
            }
        }

        const section = document.createElement('div');
        // section.className = 'thin';
        if (label) {
            section.innerHTML = `<p class="label xsmall">${label}</p>`;
        }

        section.append(...planes.map(plane => {
            const row = document.createElement('div');
            row.className = 'plane';

            const icon = document.createElement('i');
            icon.className = iconClass;
            row.appendChild(icon);

            const content = document.createElement('div');
            content.className = 'plane-content';
            row.appendChild(content);

            const flightHeading = document.createElement('div');
            flightHeading.className = 'plane-content-heading small';
            flightHeading.innerHTML = [
                `<span class="bright">${plane.callsign}</span>`,
                `<span class="dimmed">${plane.airline}</span>`
            ].join('');
            content.appendChild(flightHeading);

            const flightMetadata = document.createElement('div');
            flightMetadata.className = 'plane-content-metadata small dimmed thin';
            let metadata = [
                `<span><span class="bright">${Math.floor(plane.speed)}</span> kts</span>`,
                `<span><span class="bright">${Math.floor(plane.altitude)}</span> m</span>`,
                `<span><span class="bright">${Math.floor(plane.heading)}</span>°</span>`,
                // `${plane.heading > 180 ? 'Toward airport' : 'Leaving airport'} (${Math.floor(plane.heading)}°)`,
            ];
            if (plane.type) {
                metadata.unshift(`<span class="bright">${plane.type}</span>`);
            }
            flightMetadata.innerHTML = metadata.join('');
            content.appendChild(flightMetadata);

            return row;
        }));

        return section;
    }
});

