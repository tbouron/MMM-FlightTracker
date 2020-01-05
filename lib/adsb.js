'use strict';

const net = require('net');
const Demodulator = require('mode-s-demodulator');
const rtlsdr = require('rtl-sdr');
const store = require('./store');

const DEFAULT_RATE = 2000000;
const DEFAULT_FREQ = 1090000000;
const ASYNC_BUF_NUMBER = 12;
const DATA_LEN = (16 * 16384); // 256k

const noop = function () {};
const demodulator = new Demodulator();

let client;
let mode;

exports.start = function (argv) {
    if (client) {
        throw new Error('Cannot start ADS-B client more than once');
    }

    mode = argv.mode;

    switch (mode) {
        case 'network':
            // Connect to network stream
            client = setupSocket(argv);
            break;
        case 'rtlsdr':
        default:
            // Connect to RTLSDR device
            client = setupDevice(argv);
            break;
    }
};

exports.stop = function () {
    switch (mode) {
        case 'network':
            client.destroy();
            break;
        case 'rtlsdr':
        default:
            rtlsdr.cancel_async(client);
            rtlsdr.close(client);
    }
};

function onData(data, len) {
    demodulator.process(data, len, store.addMessage);
}

function setupDevice(argv) {
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
    rtlsdr.read_async(device, onData, noop, ASYNC_BUF_NUMBER, DATA_LEN);

    return device;
}

function setupSocket(argv) {
    if (!argv.host) {
        throw new Error('The host (IP or hostname) is required in "network" mode. Please specify one.');
    }
    if (!argv.port) {
        throw new Error('The port is required in "network" mode. Please specify one.');
    }

    const s = new net.Socket();
    s.on('data', data => {
        const csv = data.toString().split(',');

        if (['ID', 'AIR', 'MSG'].includes(csv[0])) {
            store.addMessage(csv);
        }
    });
    s.on('close', () => {
        console.log(`Successfully closed stream to ${argv.host}:${argv.port}.`);
    });
    s.on('error', (err) => {
        console.error(err);
    });

    s.connect(argv.port, argv.host, () => {
        console.log(`Successfully opened stream to ${argv.host}:${argv.port}. Waiting for data...`);
    });
}
