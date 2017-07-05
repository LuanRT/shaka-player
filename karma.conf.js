/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Karma configuration
// Install required modules by running "npm install"

module.exports = function(config) {
  config.set({
    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '.',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: [
      'jasmine-ajax', 'jasmine',
      'sprintf-js',
    ],

    plugins: [
      'karma-*',  // default
      frameworkPluginForModule('sprintf-js'),
    ],

    // list of files / patterns to load in the browser
    files: [
      // closure base first
      'third_party/closure/goog/base.js',

      // deps next
      'dist/deps.js',
      'shaka-player.uncompiled.js',

      // requirejs next
      'node_modules/requirejs/require.js',

      // bootstrapping for the test suite
      'test/test/boot.js',

      // test utils next
      'test/test/util/*.js',

      // list of test assets next
      'demo/common/assets.js',

      // unit tests last
      'test/**/*_unit.js',

      // if --quick is not present, we will add integration tests.

      // source files - these are only watched and served
      {pattern: 'lib/**/*.js', included: false},
      {pattern: 'third_party/closure/goog/**/*.js', included: false},
      {pattern: 'test/test/assets/*', included: false},
      {pattern: 'dist/shaka-player.compiled.js', included: false},
    ],

    // NOTE: Do not use proxies at all!  They cannot be used with the --hostname
    // option, which is necessary for some of our lab testing.
    proxies: {},

    preprocessors: {
      // Don't compute coverage over lib/debug/ or lib/polyfill/
      'lib/!(debug|polyfill)/*.js': 'coverage',
      // Player is not matched by the above, so add it explicitly
      'lib/player.js': 'coverage',
    },

    // to avoid DISCONNECTED messages on Safari:
    browserDisconnectTimeout: 10 * 1000,  // 10s to reconnect
    browserDisconnectTolerance: 1,  // max of 1 disconnect is OK
    browserNoActivityTimeout: 5 * 60 * 1000,  // disconnect after 5m silence
    captureTimeout: 1 * 60 * 1000,  // give up if startup takes 1m
    // https://support.saucelabs.com/customer/en/portal/articles/2440724

    client: {
      // don't capture the client's console logs
      captureConsole: false,
      // |args| must be an array; pass a key-value map as the sole client
      // argument.
      args: [{}],
    },

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR ||
    //                  config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_WARN,

    // do not execute tests whenever any file changes
    autoWatch: false,

    // do a single run of the tests on captured browsers and then quit
    singleRun: true,

    coverageReporter: {
      includeAllSources: true,
      reporters: [
        { type: 'text' },
      ],
    },

    specReporter: {
      suppressSkipped: true,
    },
  });

  // Find the settings JSON object in the command arguments
  var args = process.argv;
  var settingsIndex = args.indexOf('--settings')
  var settings = settingsIndex >= 0 ? JSON.parse(args[settingsIndex + 1]) : {};

  if (!settings.quick) {
    // If --quick is present, we don't serve integration tests.
    var files = config.files;
    files.push('test/**/*_integration.js');
    // We just modified the config in-place.  No need for config.set().
  }

  if (settings.logging) {
    var logMap = {
      none: 0,
      error: 1,
      warning: 2,
      info: 3,
      debug: 4,
      v1: 5,
      v2: 6
    };

    // Setting |config.client| using config.set will remove the
    // |config.client.settings| member.
    config.client.captureConsole = true;
    setClientArg(config,
                'logLevel',
                logMap[settings.logging] || logMap.warning);
  }

  var reporters = [];

  if (settings.reporters) {
    // Explicit reporters, use these.
    reporters.push.apply(reporters, settings.reporters);
  } else if (settings.logging && settings.logging != 'none') {
    // With logging, default to 'spec', which makes logs easier to associate
    // with individual tests.
    reporters.push('spec');
  } else {
    // Without logging, default to 'progress'.
    reporters.push('progress');
  }

  if (settings.html_coverage_report) {
    // Wipe out any old coverage reports to avoid confusion.
    var rimraf = require('rimraf');
    rimraf.sync('coverage', {});  // Like rm -rf

    config.set({
      coverageReporter: {
        reporters: [
          { type: 'html', dir: 'coverage' },
          { type: 'cobertura', dir: 'coverage', file: 'coverage.xml' },
        ],
      },
    });

    // The report requires the 'coverage' reporter to be added to the list.
    reporters.push('coverage');
  }

  config.set({reporters: reporters});

  // Run Player integration tests against external assets.
  // Skipped by default.
  setClientArg(config, 'external', !!settings.external);

  // Run Player integration tests against DRM license servers.
  // Skipped by default.
  setClientArg(config, 'drm', !!settings.drm);

  // Run quarantined tests which do not consistently pass.
  // Skipped by default.
  setClientArg(config, 'quarantined', !!settings.quarantined);

  // Run Player integration tests with uncompiled code for debugging.
  setClientArg(config, 'uncompiled', !!settings.uncompiled);

  if (settings.random) {
    // If --seed was specified use that value, else generate a seed so that the
    // exact order can be reproduced if it catches an issue.
    var seed = settings.seed == null ? new Date().getTime() : settings.seed;

    // Run tests in a random order.
    setClientArg(config, 'random', true);
    setClientArg(config, 'seed', seed);

    console.log("Using a random test order (--random) with --seed=" + seed);
  }

  if (settings.filter) {
    setClientArg(config, 'specFilter', settings.filter);
  }
};

// Sets the value of an argument passed to the client.
function setClientArg(config, name, value) {
  config.client.args[0][name] = value;
}

// Construct framework plugins on-the-fly for arbitrary node modules.
// A call to this must be placed in the config in the 'plugins' array,
// and the module name must be added to the config in the 'frameworks' array.
function frameworkPluginForModule(name) {
  // The framework injects files into the client which runs the tests.
  var framework = function(files) {
    // Locate the main file for the node module.
    var path = require('path');
    var mainFile = path.resolve(require.resolve(name));

    // Add a file entry to the list of files to be served.
    // This follows the same syntax as above in config.set({files: ...}).
    files.unshift({
      pattern: mainFile, included: true, served: true, watched: false
    });
  };

  // The framework factory function takes one argument, which is the list of
  // files from the karma config.
  framework.$inject = ['config.files'];

  // This is the plugin interface to register a new framework.  Adding this to
  // the list of plugins makes the named module available as a framework.  That
  // framework then injects the module into the client.
  var obj = {};
  obj['framework:' + name] = ['factory', framework];
  return obj;
}
