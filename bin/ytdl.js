#!/usr/bin/env node

var path  = require('path');
var fs    = require('fs');
var ytdl  = require('..');
var cliff = require('cliff');
require('colors');


var info = require('../package');

var opts = require('nomnom')
  .option('version', {
    abbr: 'v',
    flag: true,
    callback: function() {
      console.log(info.version);
      process.exit();
    },
    help: 'Print program version.'
  })
  .option('url', {
    position: 0,
    required: true,
    help: 'URL to the video.'
  })
  .option('quality', {
    abbr: 'q',
    metavar: 'ITAG',
    help: 'Video quality to download. Default: highest'
  })
  .option('range', {
    abbr: 'r',
    metavar: 'INT-INT',
    help: 'Byte range to download. ie 10355705-12452856'
  })
  .option('output', {
    abbr: 'o',
    metavar: 'FILE',
    help: 'Where to save the file. Default: stdout'
  })
  .option('filterContainer', {
    full: 'filter-container',
    metavar: 'REGEXP',
    help: 'Filter in format container. Default: -o ext'
  })
  .option('unfilterContainer', {
    full: 'unfilter-container',
    metavar: 'REGEXP',
    help: 'Filter out format container.'
  })
  .option('filterResolution', {
    full: 'filter-resolution',
    metavar: 'REGEXP',
    help: 'Filter in format resolution.'
  })
  .option('unfilterResolution', {
    full: 'unfilter-resolution',
    metavar: 'REGEXP',
    help: 'Filter out format resolution.'
  })
  .option('filterEncoding', {
    full: 'filter-encoding',
    metavar: 'REGEXP',
    help: 'Filter in format encoding.'
  })
  .option('unfilterEncoding', {
    full: 'unfilter-encoding',
    metavar: 'REGEXP',
    help: 'Filter out format encoding.'
  })
  .option('info', {
    abbr: 'i',
    flag: true,
    help: 'Print video info without downloading'
  })
  .script('ytdl')
  .colors()
  .parse()
  ;


/**
 * Converts seconds into human readable time hh:mm:ss
 *
 * @param {Number} seconds
 * @return {String}
 */
function toHumanTime(seconds) {
  var h = Math.floor(seconds / 3600);
  var m = Math.floor(seconds / 60) % 60;

  var time;
  if (h > 0) {
    time = h + ':';
    if (m < 10) { m = '0' + m; }
  } else {
    time = '';
  }

  var s = seconds % 60;
  if (s < 10) { s = '0' + s; }

  return time + m + ':' + s;
}


/**
 * Prints basic video information.
 *
 * @param {Object} info
 */
function printVideoInfo(info) {
  console.log();
  console.log('title: '.grey.bold + info.title);
  console.log('author: '.grey.bold + info.author);
  var rating = typeof info.avg_rating === 'number' ?
    info.avg_rating.toFixed(1) : info.avg_rating;
  console.log('average rating: '.grey.bold + rating);
  console.log('view count: '.grey.bold + info.view_count);
  console.log('length: '.grey.bold + toHumanTime(info.length_seconds));
}


if (opts.info) {
  ytdl.getInfo(opts.url, function(err, info) {
    if (err) {
      console.error(err.message);
      process.exit(1);
      return;
    }

    printVideoInfo(info);

    var cols = [
      'itag',
      'container',
      'resolution',
      'video enc',
      'audio bitrate',
      'audio enc'
    ];
    info.formats.forEach(function(format) {
      format['video enc']     = format.encoding;
      format['audio bitrate'] = format.audioBitrate;
      format['audio enc']     = format.audioEncoding;
      cols.forEach(function(col) {
        format[col] = format[col] || '';
      });
    });
    console.log('formats:'.grey.bold);
    var colors = ['green', 'blue', 'green', 'blue', 'green', 'blue'];
    console.log(cliff.stringifyObjectRows(info.formats, cols, colors));
    ytdl.cache.die();
  });
  return;
}

var output = opts.output;
var writeStream;
if (output) {
  writeStream = fs.createWriteStream(output);
  var ext = path.extname(output);
  if (ext && !opts.quality && !opts.filterContainer) {
    opts.filterContainer = '^' + ext.slice(1) + '$';
  }
} else {
  writeStream = process.stdout;
}

var ytdlOptions = {};
ytdlOptions.quality = opts.quality;
ytdlOptions.range = opts.range;

// Create filters.
var filters = [];

/**
 * @param {String} field
 * @param {String} regexpStr
 * @param {Boolean|null} negated
 */
function createFilter(field, regexpStr, negated) {
  try {
    var regexp = new RegExp(regexpStr, 'i');
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  filters.push(function(format) {
    return negated !== regexp.test(format[field]);
  });
}

['container', 'resolution', 'encoding'].forEach(function(field) {
  var key = 'filter' + field[0].toUpperCase() + field.slice(1);
  if (opts[key]) {
    createFilter(field, opts[key], false);
  }

  key = 'un' + key;
  if (opts[key]) {
    createFilter(field, opts[key], true);
  }
});

ytdlOptions.filter = function(format) {
  return filters.every(function(filter) {
    return filter(format);
  });
};

var readStream = ytdl(opts.url, ytdlOptions);
readStream.pipe(writeStream);

readStream.on('error', function(err) {
  console.error(err.message);
  process.exit(1);
});

// Converst bytes to human readable unit.
// Thank you Amir from StackOverflow.
var units = ' KMGTPEZYXWVU';
function toHumanSize(bytes) {
  if (bytes <= 0) { return 0; }
  var t2 = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), 12);
  return (Math.round(bytes * 100 / Math.pow(1024, t2)) / 100) +
          units.charAt(t2).replace(' ', '') + 'B';
}

// Print progress bar and some video info if not streaming to stdout.
if (output) {
  readStream.on('info', function(info, format) {
    printVideoInfo(info);
    console.log('container: '.grey.bold + format.container);
    console.log('resolution: '.grey.bold + format.resolution);
    console.log('encoding: '.grey.bold + format.encoding);
    console.log('size: '.grey.bold + toHumanSize(format.size));
    console.log('output: '.grey.bold + output);
    console.log();

    // Create progress bar.
    var bar = require('progress-bar').create(process.stdout, 50);
    bar.format = '$bar; $percentage;%';

    // Keep track of progress.
    var dataRead = 0;
    readStream.on('data', function(data) {
      dataRead += data.length;
      var percent = dataRead / format.size;
      bar.update(percent);
    });

    ytdl.cache.die();

  });
}

readStream.on('end', function onend() {
  console.log();
});

process.on('SIGINT', function onsigint() {
  console.log();
  process.exit();
});
