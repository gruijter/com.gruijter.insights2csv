# win32filetime

[![npm Version](https://badge.fury.io/js/win32filetime.png)](https://npmjs.org/package/win32filetime)

Convert from Win32 FILETIME struct to UNIX/JS time, and vice-versa

## Installation:

```
npm install --save win32filetime
```
  
## Usage example:

```javascript

var FileTime = require('win32filetime');

console.log( FileTime.toUnix(513851392, 30269198) ); // --> 1356048000000

console.log( FileTime.toDate(513851392, 30269198).toISOString() ); // --> 2012-12-21T00:00:00.000Z

console.log( FileTime.toDate({ low: 0, high: 0 }).toISOString() ); // --> 1601-01-01T00:00:00.000Z

console.log( FileTime.fromDate(new Date(2017, 7, 23, 5, 4, 29)) ); // --> { low: 658060416, high: 30612404 }

console.log( FileTime.fromUnix(Date.now()) ); // --> { low: -214280784, high: 30517728 }

```

`fromDate` and `fromUnix` are synonyms. Both will accepts either a `Date` or a `Number`.  
`toDate` is a just wrapper around `new Date( FileTime.toUnix(...) )`.  
Core functions are simply `fromUnix` and `toUnix`

The namings from the first release still work (`fromFileTime`, `toFileTime`).

## Contributing

If you have anything to contribute, or functionality that you lack - you are more than welcome to participate in this!
If anyone wishes to contribute unit tests - that also would be great :-)

## Me
* Hi! I am Daniel Cohen Gindi. Or in short- Daniel.
* danielgindi@gmail.com is my email address.
* That's all you need to know.

## Help

If you want to buy me a beer, you are very welcome to
[![Donate](https://www.paypalobjects.com/en_US/i/btn/btn_donate_LG.gif)](https://www.paypal.com/cgi-bin/webscr?cmd=_s-xclick&hosted_button_id=G6CELS3E997ZE)
 Thanks :-)

## License

All the code here is under MIT license. Which means you could do virtually anything with the code.
I will appreciate it very much if you keep an attribution where appropriate.

    The MIT License (MIT)

    Copyright (c) 2013 Daniel Cohen Gindi (danielgindi@gmail.com)

    Permission is hereby granted, free of charge, to any person obtaining a copy
    of this software and associated documentation files (the "Software"), to deal
    in the Software without restriction, including without limitation the rights
    to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
    copies of the Software, and to permit persons to whom the Software is
    furnished to do so, subject to the following conditions:

    The above copyright notice and this permission notice shall be included in all
    copies or substantial portions of the Software.
