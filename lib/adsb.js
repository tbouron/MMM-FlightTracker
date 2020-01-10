'use strict';

const net = require('net');
const EventEmitter = require('events');
const Demodulator = require('mode-s-demodulator');
const AircraftStore = require('mode-s-aircraft-store');
const rtlsdr = require('rtl-sdr');

const DEFAULT_RATE = 2000000;
const DEFAULT_FREQ = 1090000000;
const ASYNC_BUF_NUMBER = 12;
const DATA_LEN = (16 * 16384); // 256k

const noop = function () {};

class Adsb extends EventEmitter {

    constructor() {
        super();
        this.demodulator = new Demodulator();
        this.store = new AircraftStore({
            timeout: 30000
        });
    }

    start(argv) {
        if (this.instance) {
            throw new Error('Cannot start ADS-B client more than once');
        }

        this.mode = argv.mode || 'rtlsdr';

        switch (this.mode) {
            case 'network':
                // Connect to network stream
                this._initSocket(argv);
                break;
            case 'rtlsdr':
                // Connect to RTLSDR device
                this._initDevice(argv);
                break;
            default:
                throw new Error(`Mode "${this.mode}" not supported`);
        }
    }

    stop() {
        switch (this.mode) {
            case 'network':
                this.instance.destroy();
                break;
            case 'rtlsdr':
            default:
                rtlsdr.cancel_async(this.instance);
                rtlsdr.close(this.instance);
        }
    }

    getStore() {
        return this.store;
    }

    _initDevice(argv) {
        let gain = argv.gain || argv.g;
        const findMaxGain = !('gain' in argv || 'g' in argv);
        const autoGain = argv['auto-gain'] || false;
        const enableAgc = argv['enable-agc'] || false;
        const devIndex = argv.device || argv.d || 0;
        const freq = argv.frequency || argv.f || DEFAULT_FREQ;

        const ppmError = 0;
        const vendor = Buffer.alloc(256);
        const product = Buffer.alloc(256);
        const serial = Buffer.alloc(256);

        const deviceCount = rtlsdr.get_device_count();
        if (!deviceCount) {
            throw new Error('No supported RTLSDR devices found.');
        }

        console.log('Found %d device(s):', deviceCount);
        for (let j = 0; j < deviceCount; j++) {
            rtlsdr.get_device_usb_strings(j, vendor, product, serial);
            console.debug('%d: %s, %s, SN: %s %s', j, vendor, product, serial, j === devIndex ? '(currently selected)' : '')
        }

        const device = rtlsdr.open(devIndex);
        if (typeof device === 'number') {
            throw new Error(`Error opening the RTLSDR device: ${device}`);
        }

        // Set gain, frequency, sample rate, and reset the device
        rtlsdr.set_tuner_gain_mode(device, autoGain ? 0 : 1);
        if (!autoGain) {
            if (findMaxGain) {
                // Find the maximum gain available
                const gains = new Int32Array(100);
                const numgains = rtlsdr.get_tuner_gains(device, gains);
                gain = gains[numgains - 1];
                console.debug('Max available gain is: %d', gain / 10)
            }
            console.debug('Setting gain to: %d', gain / 10);
            rtlsdr.set_tuner_gain(device, gain)
        } else {
            console.debug('Using automatic gain control')
        }

        rtlsdr.set_freq_correction(device, ppmError);
        if (enableAgc) {
            rtlsdr.set_agc_mode(device, 1);
        }
        rtlsdr.set_center_freq(device, freq);
        rtlsdr.set_sample_rate(device, DEFAULT_RATE);
        rtlsdr.reset_buffer(device);
        console.debug('Gain reported by device: %d', rtlsdr.get_tuner_gain(device) / 10);

        // Start reading data from RTLSDR device
        rtlsdr.read_async(device, (data, len) => {
            this.demodulator.process(data, len, (msg) => {
                this.store.addMessage(msg);
            });
        }, noop, ASYNC_BUF_NUMBER, DATA_LEN);

        this.instance = device;
    }

    _initSocket(argv, attempts = 0) {
        if (!argv.host) {
            throw new Error('The host (IP or hostname) is required in "network" mode. Please specify one.');
        }
        if (!argv.port) {
            throw new Error('The port is required in "network" mode. Please specify one.');
        }

        this.instance = new net.Socket()
            .on('data', data => {
                data.toString().split("\n").forEach(line => {
                    const csv = line.trim().split(',');

                    if (['ID', 'AIR', 'MSG'].includes(csv[0])) {
                        this.store.addMessage(csv);
                    }
                });
            }).on('close', () => {
                this.emit('socket-closed');
                const timeout = Math.min(Math.pow(attempts, 2), 30);
                console.warn(`Stream to ${argv.host}:${argv.port} has been closed due to an error. Retrying to open it again in ${timeout} seconds ...`);
                attempts++;
                setTimeout(() => {
                    this._initSocket(argv, attempts);
                }, timeout * 1000);
            }).on('error', error => {
                console.error(`Failed to open stream to ${argv.host}:${argv.port}: ${error.message}`);
            }).connect(argv.port, argv.host, () => {
                console.log(`Successfully opened stream to ${argv.host}:${argv.port}. Waiting for data...`);
                this.emit('socket-opened');
            });
    }

}

module.exports = Adsb;
