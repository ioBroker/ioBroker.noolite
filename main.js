/**
 *      ioBroker Noolite Adapter
 *      03'2016 Bluefox
 *      Lets control the Noolite (http://www.noo.com.by/sistema-noolite.html)
 *
 */
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
'use strict';

var request   = require('request');
var utils = require('@iobroker/adapter-core'); // Get common adapter utils
var Noolite   = require('noolite');
var channels  = {};
var adapter   = utils.Adapter('noolite');
var interval;
var connected = false;
var rxUsb;
var txUsb;
var exec;

adapter.on('stateChange', function (id, state) {
    if (id && state && !state.ack) {
        if (!channels[id]) {
            adapter.log.error('Unknown port ID ' + id);
            return;
        }
        if (!channels[id].common.write || !channels[id].native.enabled) {
            adapter.log.error('Cannot write the read only port ' + id);
            return;
        }

        adapter.log.info('try to control ' + id + ' with ' + state.val);

        if (channels[id].native.type === 'rgb') {
            var parts = id.split('.');
            var color = parts.pop();
            var _id   = parts.join('.');

            if (color === 'RED' || color === 'BLUE' || color === 'GREEN') {
                channels[id].value = parseInt(state.val, 10);
                channels[_id + '.RGB'].value = getColor(channels[_id + '.RED'].value, channels[_id + '.GREEN'].value, channels[_id + '.BLUE'].value);
                channels[_id + '.STATE'].value = '#000000' != channels[_id + '.RGB'].value;

            } else if (color === 'RGB') {
                var rgb = splitColor(state.val);
                channels[_id + '.RED'].value   = rgb[0];
                channels[_id + '.GREEN'].value = rgb[1];
                channels[_id + '.BLUE'].value  = rgb[2];
                channels[_id + '.RGB'].value   = getColor(rgb[0], rgb[1], rgb[2]);
            } else if (color === 'STATE') {
                if (state.val === 'true' || state.val === true || state.val === 1 || state.val === '1') {
                    if (channels[_id + '.RGB'].oldValue && channels[_id + '.RGB'].oldValue !== '#000000') {
                        channels[_id + '.RGB'].value = channels[_id + '.RGB'].oldValue;
                    } else {
                        channels[_id + '.RGB'].value = '#FFFFFF';
                    }
                    channels[_id + '.RGB'].oldValue = null;
                    var rgb = splitColor(channels[_id + '.RGB'].value);
                    channels[_id + '.RED'].value   = rgb[0];
                    channels[_id + '.GREEN'].value = rgb[1];
                    channels[_id + '.BLUE'].value  = rgb[2];
                    channels[_id + '.STATE'].value = true;
                } else {
                    // off
                    if (channels[_id + '.RGB'].value !== '#000000') {
                        channels[_id + '.RGB'].oldValue = channels[_id + '.RGB'].value;
                    } else {
                        channels[_id + '.RGB'].oldValue = null;
                    }
                    channels[_id + '.RGB'].value   = '#000000';
                    channels[_id + '.RED'].value   = 0;
                    channels[_id + '.GREEN'].value = 0;
                    channels[_id + '.BLUE'].value  = 0;
                    channels[_id + '.STATE'].value = false;
                }
            }

            sendCommand(id, channels[id].native, channels[_id + '.RED'].value, channels[_id + '.GREEN'].value, channels[_id + '.BLUE'].value, function (err) {
                adapter.setForeignState(_id + '.RGB',   {val: channels[_id + '.RGB'].value,   ack: true, q: err ? 0x42 : 0});
                adapter.setForeignState(_id + '.RED',   {val: channels[_id + '.RED'].value,   ack: true, q: err ? 0x42 : 0});
                adapter.setForeignState(_id + '.GREEN', {val: channels[_id + '.GREEN'].value, ack: true, q: err ? 0x42 : 0});
                adapter.setForeignState(_id + '.BLUE',  {val: channels[_id + '.BLUE'].value,  ack: true, q: err ? 0x42 : 0});
                adapter.setForeignState(_id + '.STATE', {val: channels[_id + '.STATE'].value, ack: true, q: err ? 0x42 : 0});
            });
        } else {
            sendCommand(id, channels[id].native, state.val, function (err, _id) {
                if (err) {
                    adapter.setForeignState(_id, {val: channels[_id].value, ack: true, q: 0x42}); // device is not connected
                } else {
                    adapter.setForeignState(_id, {val: channels[_id].value, ack: true, q: 0});
                }
            });
        }
    }
});

adapter.on('ready', function (obj) {
    main();
});

adapter.on('message', function (obj) {
    var cmd;
    if (obj && obj.command) {
        switch (obj.command) {
            case 'pair':
                if (exec) {
                    cmd = adapter.config.exe + ' -api -bind_ch' + (channel + 1);

                    adapter.log.debug(cmd);
                    exec(cmd, function (error, stdout, stderr) {
                        if (error) adapter.log.error('Cannot execute ' + cmd + ':' + error);
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: error}, obj.callback);
                    });
                } else
                if (txUsb) {
                    txUsb.send(obj.message.channel, 'UNBIND', function (error) {
                        if (error) adapter.log.error('Cannot send "UNBIND": ' + error);

                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: error}, obj.callback);
                    })
                } else if (obj.message.ip || adapter.config.ip) {
                    cmd = 'http://' + (obj.message.ip || adapter.config.ip) + '/api.htm?ch=' + obj.message.channel + '&cmd=15';

                    request(cmd, function (error, response, body) {
                        if (error || response.statusCode != 200) {
                            adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
                        }
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: error}, obj.callback);
                    });
                } else {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'No device configured to transmit'}, obj.callback);
                }

                break;

            case 'unpair':
                if (exec) {
                    cmd = adapter.config.exe + ' -api -unbind_ch' + (channel + 1);

                    adapter.log.debug(cmd);
                    exec(cmd, function (error, stdout, stderr) {
                        if (error) adapter.log.error('Cannot execute ' + cmd + ':' + error);
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: error}, obj.callback);
                    });
                } else if (txUsb) {
                    txUsb.send(obj.message.channel, 'BIND', function (error) {
                        if (error) adapter.log.error('Cannot send "BIND": ' + error);

                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: error}, obj.callback);
                    });
                } else if (obj.message.ip || adapter.config.ip) {
                    cmd = 'http://' + (obj.message.ip || adapter.config.ip) + '/api.htm?ch=' + obj.message.channel + '&cmd=9';

                    request(cmd, function (error, response, body) {
                        if (error || response.statusCode != 200) {
                            adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
                        }
                        if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: error}, obj.callback);
                    });
                } else {
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: 'No device configured to transmit'}, obj.callback);
                }
                break;

            default:
                adapter.log.warn('Unknown message: ' + JSON.stringify(obj));
                break;
        }
    }
});

adapter.on('unload', function (obj) {
    if (interval) clearInterval(interval);
    if (adapter && adapter.setState) adapter.setState('info.connection', false, true);
    if (rxUsb) {
        rxUsb.close();
        rxUsb = null;
    }
    if (txUsb) {
        txUsb.close();
        rxUsb = null;
    }
});

function writeValues(result) {
    for (var r = 0; r < result.length; r++) {
        if (result[r] && result[r].status != 1/* not paired */) {
            var id = getSensorId(r, result);
            adapter.setForeignState(id + '.LOW_BAT', (result[r].status == 3));
            adapter.setForeignState(id + '.UNREACH', (result[r].status == 2));
            adapter.setForeignState(id + '.TEMPERATURE', result[r].TEMPERATURE);
            if (result[r].HUMIDITY !== undefined) {
                adapter.setForeignState(id + '.HUMIDITY', result[r].HUMIDITY);
            }
        }
    }
}

function pollStatus() {
    request('http://' + adapter.config.ip + '/sens.xml', function (error, response, body) {
        if (error || response.statusCode != 200) {
            adapter.log.error('Cannot read sensors: ' + error || response.statusCode);
            if (connected) {
                connected = false;
                adapter.setState('info.connection', false, true);
            }
        } else {
            if (!connected) {
                connected = true;
                adapter.setState('info.connection', true, true);
            }

            body = body.replace(/[\r\n|\r|\n]/g,'');

            /*body = '<response><snst0>34.9</snst0><snsh0>56.9</snsh0><snt0>0</snt0>' +
            '<snst1></snst1><snsh1></snsh1><snt1>1</snt1>' +
            '<snst2>35.9</snst2><snsh2></snsh2><snt2>3</snt2>' +
            '<snst3></snst3><snsh3></snsh3><snt3>1</snt3>' +
            '</response>';*/

            var match = body.match(/<snt\d+>[+-.,0-9]+<\/snt\d+>/g);
            var result = [];

            // status
            // "0"- датчик привязан, ожидается обновление информации;
            // "1"- датчик не привязан;
            // "2"- нет сигнала с датчика;
            // "3" - необходимо заменить элемент питания в датчике.//


            if (match) {
                for (var m = 0; m < match.length; m++) {
                    var id  = match[m].match(/<snt(\d+)>/);
                    var num = match[m].match(/>([+-.,0-9]+)</);
                    if (id && num) result[id[1]] = {status: parseInt(num[1], 10)};
                }
            }
            // temperature
            match = body.match(/<snst\d+>[+-.,0-9]+<\/snst\d+>/g);
            if (match) {
                for (var m = 0; m < match.length; m++) {
                    var id  = match[m].match(/<snst(\d+)>/);
                    var num = match[m].match(/>([+-.,0-9]+)</);
                    if (id && num && result[id[1]]) result[id[1]].TEMPERATURE = parseFloat(num[1]) || 0;
                }
            }

            // humidity
            match = body.match(/<snsh\d+>[+-.,0-9]+<\/snsh\d+>/g);
            if (match) {
                for (var m = 0; m < match.length; m++) {
                    var id  = match[m].match(/<snsh(\d+)>/);
                    var num = match[m].match(/>([+-.,0-9]+)</);
                    if (id && num && result[id[1]]) result[id[1]].HUMIDITY = parseFloat(num[1]) || 0;
                }
            }

            adapter.log.debug('Received: ' + JSON.stringify(result));
            var toAdd = [];
            for (var r = 0; r < result.length; r++) {
                if (result[r] && result[r].status != 1/* not paired */) {
                    if (!channels[getSensorId(r, result) + '.LOW_BAT']) {
                        generateSensorState(r, result, toAdd);
                    }
                }
            }
            if (toAdd.length) {
                createStates(toAdd, function () {
                    writeValues(result);
                });
            } else {
                writeValues(result);
            }
        }
    });
}

function sendOnOff(id, channel, value, cb) {
    if (exec) {
        var cmd = adapter.config.exe + ' -api -' + ((!value || value === 'false' || value === '0') ? 'off' : 'on') + '_ch' + (channel + 1);

        adapter.log.debug(cmd);
        exec(cmd, function (error, stdout, stderr) {
            if (error) adapter.log.error('Cannot execute ' + cmd + ':' + error);
            if (typeof cb === 'function') cb(error, id);
        });
    } else
    if (txUsb) {
        try {
            txUsb.send(channel, (!value || value === 'false' || value === '0') ? 'OFF' : 'ON', function (error) {
                if (error) {
                    adapter.log.error('Cannot switch ' + (!value || value === 'false' || value === '0') ? 'OFF' : 'ON' + ': ' + error);
                    if (typeof cb === 'function') cb(error, id);
                } else {
                    if (typeof cb === 'function') cb(null, id);
                }
            });
        } catch (error) {
            if (typeof cb === 'function') cb(error, id);
        }
    } else
    if (adapter.config.ip) {
        var cmd = 'http://' + adapter.config.ip + '/api.htm?ch=' + channel + '&cmd=' + ((!value || value === 'false' || value === '0') ? 0 : 2);
        adapter.log.debug(cmd);
        request(cmd, function (error, response, body) {
            if (error || response.statusCode != 200) {
                adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
                if (typeof cb === 'function') cb(error, id);
            } else {
                if (typeof cb === 'function') cb(null, id);
            }
        });
    } else {
        adapter.log.error('No device configured for transmit');
    }
}

function getSensorId(index) {
    return adapter.namespace + '.sensors.' + index;
}

function sendDimmer(id, channel, value, cb) {
    if (value === true  || value === 'true')  value = 255;
    if (value === false || value === 'false') value = 0;

    value = parseInt(value, 10);

    if (value < 0)   value = 0;
    if (value > 255) value = 255;

    if (exec) {
        var cmd = adapter.config.exe + ' -api -set_ch' + (channel + 1) + ' -' + value;

        adapter.log.debug(cmd);
        exec(cmd, function (error, stdout, stderr) {
            if (error) adapter.log.error('Cannot execute ' + cmd + ':' + error);
            if (typeof cb === 'function') cb(error, id);
        });
    } else
    if (txUsb) {
        try {
            txUsb.send(channel, 'SET', value, function (error) {
                if (error) {
                    adapter.log.error('Cannot switch ' + (!value || value === 'false' || value === '0') ? 'OFF' : 'ON' + ': ' + error);
                    if (typeof cb === 'function') cb(error, id);
                } else {
                    if (typeof cb === 'function') cb(null, id);
                }
            });
        } catch (error) {
            if (typeof cb === 'function') cb(error, id);
        }
    } else if (adapter.config.ip) {
        var cmd = 'http://' + adapter.config.ip + '/api.htm?ch=' + channel + '&cmd=6&br=' + value;
        adapter.log.debug(cmd);
        request(cmd, function (error, response, body) {
            if (error || response.statusCode != 200) {
                adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
                if (typeof cb === 'function') cb(error, id);
            } else {
                if (typeof cb === 'function') cb(null, id);
            }
        });
    } else {
        adapter.log.error('No device configured for transmit');
    }
}

function sendRgb(id, channel, r, g, b, cb) {
    r = parseInt(r, 10);
    g = parseInt(g, 10);
    b = parseInt(b, 10);

    if (r < 0)   r = 0;
    if (r > 255) r = 255;

    if (g < 0)   g = 0;
    if (g > 255) g = 255;

    if (b < 0)   b = 0;
    if (b > 255) b = 255;

    if (exec) {
        var cmd = adapter.config.exe + ' -api -set_color_ch' + (channel + 1) + ' -' + r + ' -' + g + ' -' + b;

        adapter.log.debug(cmd);
        exec(cmd, function (error, stdout, stderr) {
            if (error) adapter.log.error('Cannot execute ' + cmd + ':' + error);
            if (typeof cb === 'function') cb(error, id);
        });
    } else if (txUsb) {
        try {
            txUsb.send(channel, 'SET', [r, g, b], function (error) {
                if (error) {
                    adapter.log.error('Cannot switch ' + (!value || value === 'false' || value === '0') ? 'OFF' : 'ON' + ': ' + error);
                    if (typeof cb === 'function') cb(error, id);
                } else {
                    if (typeof cb === 'function') cb(null, id);
                }
            });
        } catch (error) {
            if (typeof cb === 'function') cb(error, id);
        }
    } else if (adapter.config.ip) {
        var cmd = 'http://' + adapter.config.ip + '/api.htm?ch=' + channel + '&cmd=6&br=0&fmt=3&d0=' + r + '&d1=' + g + '&d2=' + b + '&d3=0';
        adapter.log.debug(cmd);

        request(cmd, function (error, response, body) {
            if (error || response.statusCode != 200) {
                adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
                if (typeof cb === 'function') cb(error, id);
            } else {
                if (typeof cb === 'function') cb(null, id);
            }
        });
    } else {
        adapter.log.error('No device configured for transmit');
    }
}

function sendCommand(id, native, value, g, b, cb) {
    if (typeof g === 'function') cb = g;

    if (native.type === 'dimmer') {
        sendDimmer(id, native.channel, value, cb);
    } else if (native.type === 'rgb') {
        sendRgb(id, native.channel, value, g, b, cb);
    } else {
        sendOnOff(id, native.channel, value, cb);
    }
}

function syncObjects(index, cb) {
    if (typeof index === 'function') {
        cb = index;
        index = 0;
    }
    index = index || 0;
    if (!adapter.config.devices || index >= adapter.config.devices.length) {
        cb && cb();
        return;
    }
    var id = adapter.config.devices[index].name.replace(/[.\s]+/g, '_');
    adapter.getObject(id, function (err, obj) {
        if (err) adapter.log.error(err);
        // if new or changed
        if (!obj || JSON.stringify(obj.native) !== JSON.stringify(adapter.config.devices[index])) {
            adapter.setObject(id, {
                common: {
                    name:   adapter.config.devices[index].name,
                    def:    false,
                    type:   'boolean', // нужный тип надо подставить
                    read:   true,
                    write:  true,   // нужный режим надо подставить
                    role:   'state',
                    desc: obj ? obj.common.desc : 'Variable from mySensors'
                },
                type: 'state',
                native: adapter.config.devices[index]
            }, function (err) {
                // Sync Rooms
                adapter.deleteStateFromEnum('rooms', '', '', id, function () {
                    if (adapter.config.devices[index].room) {
                        adapter.addStateToEnum('rooms', adapter.config.devices[index].room, '', '', id);
                    }
                });
                if (err) adapter.log.error(err);
                if (!obj) {
                    adapter.log.info('Create state ' + id);
                    // if new object => create state
                    adapter.setState(id, null, true, function () {
                        setTimeout(function () {
                            syncObjects(index + 1, cb);
                        }, 0);
                    });
                } else {
                    adapter.log.info('Update state ' + id);
                    setTimeout(function () {
                        syncObjects(index + 1, cb);
                    }, 0);
                }
            });
        } else {
            setTimeout(function () {
                syncObjects(index + 1, cb);
            }, 0);
        }
    });
}

function readValue(id, cb) {
    adapter.getForeignState(id, function (err, state) {
        if (!err && state) {
            channels[id].value = parseInt(state.val, 10) || 0;
        } else {
            channels[id].value = 0;
        }
        cb();
    });
}
// read states of RGB channels
function readRGBStates(cb) {
    var read = 0;
    for (var id in channels) {
        if (channels[id].native.type === 'rgb' && channels[id].value === undefined) {
            read++;
            readValue(id, function () {
                if (!--read && cb) cb();
            });
        }
    }
    if (!read && cb) cb();
}

function getColor(r, g, b) {
    r = r.toString(16).toUpperCase();
    if (r.length < 2) r = '0' + r;

    g = g.toString(16).toUpperCase();
    if (g.length < 2) g = '0' + g;

    b = b.toString(16).toUpperCase();
    if (b.length < 2) b = '0' + b;

    return '#' + r + g + b;
}

function splitColor(rgb) {
    if (!rgb) rgb = '#000000';
    rgb = rgb.toString().toUpperCase();
    if (rgb[0] === '#') rgb = rgb.substring(1);
    if (rgb.length < 6) rgb = rgb[0] + rgb[0] + rgb[1] + rgb[1] + rgb[2] + rgb[2];
    var r = parseInt(rgb[0] + rgb[1], 16);
    var g = parseInt(rgb[2] + rgb[3], 16);
    var b = parseInt(rgb[4] + rgb[5], 16);

    return [r, g, b];
}

function syncRGBStates(cb) {
    for (var id in channels) {
        if (channels[id].native.type === 'rgb' && id.match(/.RGB$/)) {
            var parts = id.split('.');
            parts.pop();
            id = parts.join('.');

            var rgb = getColor(channels[id + '.RED'].value, channels[id + '.GREEN'].value, channels[id + '.BLUE'].value);
            channels[id + '.RGB'].value = rgb;
            channels[id + '.STATE'].value = (rgb !== '#000000');
            adapter.setForeignState(id + '.STATE', channels[id + '.STATE'].value, true);
            adapter.setForeignState(id + '.RGB',   channels[id + '.RGB'].value,   true);
        }
    }
    cb && cb();
}

// delete all messages from messagebox
function processMessages() {
    adapter.getMessage(function (err, obj) {
        if (obj) {
            setTimeout(processMessages, 0);
        }
    });
}

function deleteStates(states, cb) {
    if (!states || !states.length) {
        cb && cb();
        return;
    }
    var id = states.pop();
    adapter.log.info('Delete state ' + id);
    adapter.delForeignObject(id, function (err) {
        adapter.deleteStateFromEnum('rooms', '', '', id);
        if (err) adapter.log.error(err);
        adapter.delForeignState(id, function (err) {
            if (err) adapter.log.error(err);
            setTimeout(function () {
                deleteStates(states, cb);
            }, 0);
        })
    });
}

function createStates(states, cb) {
    if (!states || !states.length) {
        cb && cb();
        return;
    }
    var obj = states.pop();
    adapter.log.info('Create/Update state ' + obj._id);

    adapter.setForeignObject(obj._id, obj, function (err) {
        if (err) adapter.log.error(err);
        adapter.setForeignState(obj._id, obj.common.def, true, function (err) {
            if (err) adapter.log.error(err);
            setTimeout(function () {
                createStates(states, cb);
            }, 0);
        })
    });
}

function getId(channel, name) {
    return adapter.namespace + '.' + (channel + 1) + '_' + (name ? name.replace(/[\s.]/g, '_') : 'channel');
}

function generateState(channel, config) {
    config = config || {name: '', type: 'on/off'};
    config.channel = channel;
    var id = getId(channel, config.name);
    var parts = id.split('.');
    parts.pop();
    if (config.type === 'dimmer') {
        return [{
            _id: parts.join('.'),
            common: {
                name:  config.name,
                role: 'light.dimmer'
            },
            native: {},
            type: 'channel'
        },
        {
            _id: getId(channel, config.name) + '.LEVEL',
            common: {
                name:  config.name,
                type:  'number',
                read:  true,
                write: true,
                def:   0,
                role:  'level.dimmer'
            },
            native: config,
            type: 'state'
        }];
    } else if (config.type === 'rgb') {
        return [{
            _id: parts.join('.'),
            common: {
                name:  config.name,
                role: 'light.color.rgb'
            },
            native: {},
            type: 'channel'
        },
        {
            _id: getId(channel, config.name) + '.RED',
            common: {
                name:  config.name + ' - red',
                type:  'number',
                read:  true,
                write: true,
                def:   0,
                role:  'level.color.red'
            },
            native: config,
            type: 'state'
        },
        {
            _id: getId(channel, config.name) + '.GREEN',
            common: {
                name:  config.name + ' - green',
                type:  'number',
                read:  true,
                write: true,
                def:   0,
                role:  'level.color.green'
            },
            native: config,
            type: 'state'
        },
        {
            _id: getId(channel, config.name) + '.BLUE',
            common: {
                name:  config.name + ' - blue',
                type:  'number',
                read:  true,
                write: true,
                def:   0,
                role:  'level.color.blue'
            },
            native: config,
            type: 'state'
        },
        {
            _id: getId(channel, config.name) + '.RGB',
            common: {
                name:  config.name + ' - blue',
                type:  'string',
                read:  true,
                write: true,
                def:   '#000000',
                role:  'level.color.rgb'
            },
            native: config,
            type: 'state'
        },
        {
            _id: getId(channel, config.name) + '.STATE',
            common: {
                name:  config.name + ' - on/off',
                type:  'boolean',
                read:  true,
                write: true,
                def:   false,
                role:  'switch.light'
            },
            native: config,
            type: 'state'
        }];
    } else {
        return [{
            _id: parts.join('.'),
            common: {
                name:  config.name,
                role: 'light.switch'
            },
            native: {},
            type: 'channel'
        },
        {
            _id: getId(channel, config.name) + '.STATE',
            common: {
                name:  config.name,
                type:  'boolean',
                read:  true,
                write: true,
                def:   false,
                role:  'switch.light'
            },
            native: config,
            type: 'state'
        }];
    }
}

function generateSensorState(index, values, result) {
    var id = getSensorId(index);
    result.push({
        _id: id,
        type: 'channel',
        common: {
            name: 'sensor ' + (index + 1)
        },
        native: {
            type: (values.HUMIDITY !== undefined) ? 'PT111' : 'PT112'
        }
    });
    result.push({
        _id: id + '.TEMPERATURE',
        type: 'state',
        common: {
            name:  'sensor ' + (index + 1) + ' temperature',
            role:  'level.temperature',
            read:  true,
            write: false,
            unit: '°C',
            def:  0
        },
        native: {
            channel: index
        }
    });
    if (values.HUMIDITY !== undefined) {
        result.push({
            _id: id + '.HUMIDITY',
            type: 'state',
            common: {
                name:  'sensor ' + (index + 1) + ' humidity',
                role:  'level.humidity',
                read:  true,
                write: false,
                unit:  '°C',
                def:   0
            },
            native: {
                channel: index
            }
        });
    }
    result.push({
        _id: id + '.LOW_BAT',
        type: 'state',
        common: {
            name: 'sensor ' + (index + 1) + ' battery alarm',
            role: 'indicator.battery',
            read: true,
            write: false,
            def: false
        },
        native: {
            channel: index
        }
    });
    result.push({
        _id: id + '.UNREACH',
        type: 'state',
        common: {
            name:  'sensor ' + (index + 1) + ' unreach alarm',
            role:  'indicator.unreach',
            read:  true,
            write: false,
            def:   false
        },
        native: {
            channel: index
        }
    });
}

function main() {
    var platform = require('os').platform();

    adapter.config.pollInterval = parseInt(adapter.config.pollInterval, 0);
    if (adapter.config.pollInterval && adapter.config.pollInterval < 5) adapter.config.pollInterval = 5;

    if (platform.match(/^win/)) {
        var fs = require('fs');

        if (adapter.config.exe && !fs.existsSync(adapter.config.exe)) {
            var exe = adapter.config.exe.replace('Program Files', 'Program Files (x86)');
            if (!fs.existsSync(exe)) {
                exe = adapter.config.exe.replace('Program Files (x86)', 'Program Files');
                if (!fs.existsSync(exe)) {
                    if (!adapter.config.ip) adapter.error('Cannot find noolite.exe');
                    adapter.config.exe = null;
                } else {
                    adapter.config.exe = exe;
                }
            } else {
                adapter.config.exe = exe;
            }
        }

        if (adapter.config.exe) {
            exec = require('child_process').exec;
            adapter.config.exe = '"' + adapter.config.exe + '"';
        }
    } else {
        adapter.config.exe = null;
        if (adapter.config.rxUsbName) {
            // create driver instance
            rxUsb = new Noolite({
                device: adapter.config.rxUsbName
            });
            rxUsb.open(function (err) {
                if (err) adapter.log.error('Cannot open receive USB: ' + err);
            });
        }
        if (adapter.config.txUsbName) {
            // create driver instance
            txUsb = new Noolite({
                device: adapter.config.txUsbName
            });
            txUsb.open(function (err) {
                if (err) adapter.log.error('Cannot open receive USB: ' + err);
            });
        }
    }

    adapter.getForeignObjects(adapter.namespace + '.*', 'state', function (err, states) {
        var toAdd    = [];
        var toDelete = [];
        var id;

        for (var c = 0; c < adapter.config.channels.length; c++) {
            if (!adapter.config.channels[c] || !adapter.config.channels[c].enabled) continue;
            id = getId(c, adapter.config.channels[c].name);

            // if name changed or never exists
            if (!states[id + '.STATE'] || states[id + '.STATE'].native.type !== adapter.config.channels[c].type) {
                var _states = generateState(c, adapter.config.channels[c]);
                for (var s = 0; s < _states.length; s++) {
                    states[_states[s]._id] = _states[s];
                    toAdd.push(states[_states[s]._id]);
                }
            }
        }

        for (id in states) {
            var found = false;
            var parts = id.split('.');
            parts.pop();
            id = parts.join('.');
            for (c = 0; c < adapter.config.channels.length; c++) {
                if (!adapter.config.channels[c] || !adapter.config.channels[c].enabled) continue;
                if (id === getId(c, adapter.config.channels[c].name)) {
                    found = true;
                    break;
                }
            }

            if (!found) {
                delete states[id];
                toDelete.push(id);
            }
        }

        if (toDelete.length) deleteStates(toDelete);

        if (toAdd.length) {
            createStates(toAdd, function () {
                adapter.subscribeStates('*');
            });
        } else {
            // subscribe on changes
            adapter.subscribeStates('*');
        }

        channels = states;
        syncObjects(function () {
            readRGBStates(function () {
                syncRGBStates(function () {
                    if (adapter.config.pollInterval && adapter.config.ip) {
                        pollStatus();
                        interval = setInterval(pollStatus, adapter.config.pollInterval * 1000);
                    } else {
                        adapter.setState('info.connection', true, true);
                    }
                });
            });
        });
    });

    // delete all messages from messagebox
    processMessages();
}



