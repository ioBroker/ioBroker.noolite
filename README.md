![Logo](admin/noolite.png)
# ioBroker Noolite adapter

![Number of Installations](http://iobroker.live/badges/noolite-installed.svg)
![Number of Installations](http://iobroker.live/badges/noolite-stable.svg) 
[![NPM version](http://img.shields.io/npm/v/iobroker.noolite.svg)](https://www.npmjs.com/package/iobroker.noolite)
[![Downloads](https://img.shields.io/npm/dm/iobroker.noolite.svg)](https://www.npmjs.com/package/iobroker.noolite)

[![NPM](https://nodei.co/npm/iobroker.noolite.png?downloads=true)](https://nodei.co/npm/iobroker.noolite/)

Lets control the Noolite devices from ioBroker.

Actually only ethernet gateway PR1132 is supported.

## English
This driver allows you to control noolite devices through a USB adapter (PC1xxx) or through the PR1132 Ethernet gateway.

To control devices using the USB adapter for windows, you need to install the "nooLite control panel" program and
register the path to the exe file in the settings. For instance:
```Windows exe: C:\Program Files (x86)\nooLite\noolite.exe```.

Under windows, you do not need to specify TX USB Type because Communication occurs through noolite.exe.

When using the gateway, you can connect up to 4 different temperature or humidity sensors.

Reception of commands at the moment is not working, for lack of a receiving adapter.

## Русский        
Этот драйвер позволяет управлять noolite устройствами через USB адаптер (РС1ххх) или через Ethernet-шлюз PR1132.

Для управления устройствами с помощью USB адаптера под windows необходимо установить программу "nooLite control panel" и
прописать путь к exe файлу в настройках. Например:
```Windows exe: C:\Program Files (x86)\nooLite\noolite.exe```.

Под windows не нужно указывать TX USB Type т.к. коммуникация происходит через noolite.exe.

При использовании шлюза можно подключить до 4х различных датчиков температуры или влажности.

Приём команд на данный момент неработает, за неимением приёмного адаптера.

## Changelog
### 0.3.1 (2020-02-14)
* (bluefox) Refactoring

### 0.2.0 (2016-04-30)
* (bluefox) USB adapter under windows
* (bluefox) RGB channel finished

### 0.0.1 (2016-03-11)
* (bluefox) initial commit

## License
The MIT License (MIT)

Copyright (c) 2016-2020 Bluefox <dogafox@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
