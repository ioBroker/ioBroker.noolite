/**
 *      ioBroker Noolite Adapter
 *      03'2016 Bluefox
 *      Lets control the Noolite (http://www.noo.com.by/sistema-noolite.html)
 *
 */
/* jshint -W097 */// jshint strict:false
/*jslint node: true */
"use strict";

var request  = require('request');
var utils    = require(__dirname + '/lib/utils'); // Get common adapter utils
var channels = {};
var adapter  = utils.adapter('noolite');
var interval;

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

        sendCommand(channels[id].native, state.val);
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
                cmd = 'http://' + (obj.message.ip || adapter.config.ip) + '/api.htm?ch=' + obj.message.channel + '&cmd=15';

                request(cmd, function (error, response, body) {
                    if (error || response.statusCode != 200) {
                        adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
                    }
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: error}, obj.callback);
                });

                processMessage(obj.message);
                break;

            case 'unpair':
                cmd = 'http://' + (obj.message.ip || adapter.config.ip) + '/api.htm?ch=' + obj.message.channel + '&cmd=9';

                request(cmd, function (error, response, body) {
                    if (error || response.statusCode != 200) {
                        adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
                    }
                    if (obj.callback) adapter.sendTo(obj.from, obj.command, {error: error}, obj.callback);
                });
                break;

            default:
                adapter.log.warn('Unknown message: ' + JSON.stringify(obj));
                break;
        }
    }
});

adapter.on('unload', function (obj) {
    if (interval) clearInterval(interval);
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
        } else {
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

function sendOnOff(channel, value) {
    var cmd = 'http://' + adapter.config.ip + '/api.htm?ch=' + channel + '&cmd=' + ((!value || value === 'false' || value === '0') ? 0 : 2);
    adapter.log.debug(cmd);
    request(cmd, function (error, response, body) {
        if (error || response.statusCode != 200) {
            adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
        }
    });
}

function getSensorId(index) {
    return adapter.namespace + '.sensors.' + index;
}

function sendDimmer(channel, value) {
    if (value === true || value === 'true')   value = 255;
    if (value === false || value === 'false') value = 0;

    value = parseInt(value, 10);

    if (value < 0)   value = 0;
    if (value > 255) value = 255;

    var cmd = 'http://' + adapter.config.ip + '/api.htm?ch=' + channel + '&cmd=6&br=' + value;
    adapter.log.debug(cmd);
    request(cmd, function (error, response, body) {
        if (error || response.statusCode != 200) {
            adapter.log.error('Cannot send "' + cmd + '": ' + error || response.statusCode);
        }
    });
}

function sendCommand(native, value) {
    if (native.type === 'dimmer') {
        sendDimmer(native.channel, value);
    } else {
        sendOnOff(native.channel, value);
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
                    name: adapter.config.devices[index].name,
                    def: false,
                    type: 'boolean', // нужный тип надо подставить
                    read: 'true',
                    write: 'true',   // нужный режим надо подставить
                    role: 'state',
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
    return adapter.namespace + '.channels.' + (channel + 1) + (name ? '_' + name.replace(/[\s.]/g, '_') : '');
}

function generateState(channel, config) {
    config = config || {name: '', type: 'on/off'};
    config.channel = channel;
    if (config === 'dimmer') {
        return {
            _id: getId(channel, config.name),
            common: {
                name:  config.name,
                type:  'number',
                read:  true,
                write: true,
                def:   0,
                role:  'dimmer.light'
            },
            native: config,
            type: 'state'
        }
    } else {
        return {
            _id: getId(channel, config.name),
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
        }
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
    adapter.config.pollInterval = parseInt(adapter.config.pollInterval, 0);
    if (adapter.config.pollInterval && adapter.config.pollInterval < 5) adapter.config.pollInterval = 5;

    adapter.getForeignObjects(adapter.namespace + '.*', 'state', function (err, states) {
        var toAdd    = [];
        var toDelete = [];
        var id;

        for (var c = 0; c < adapter.config.channels.length; c++) {
            if (!adapter.config.channels[c] || !adapter.config.channels[c].enabled) continue;
            id = getId(c, adapter.config.channels[c].name);
            // if name changed or never exists
            if (!states[id] || states[id].native.type !== adapter.config.channels[c].type) {
                states[id] = generateState(c, adapter.config.channels[c]);
                toAdd.push(states[id]);
            }
        }

        for (id in states) {
            var found = false;
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
            if (adapter.config.pollInterval && adapter.config.ip) {
                pollStatus();
                interval = setInterval(pollStatus, adapter.config.pollInterval * 1000);
            }
        });
    });

    // delete all messages from messagebox
    processMessages();
}



