/* globals plupload, moxie */
import { reject } from 'rsvp';

import jQuery from 'jquery';
import { assert } from '@ember/debug';
import ArrayProxy from '@ember/array/proxy';
import { A } from '@ember/array';
import { bind, later, debounce } from '@ember/runloop';
import { bool } from '@ember/object/computed';
import { copy } from 'ember-copy';
import { assign } from '@ember/polyfills';
import { set, get, computed } from '@ember/object';
import File from './file';
import trim from './trim';
import sumBy from '../system/sum-by';

const keys = Object.keys;

var getHeader = function (headers, header) {
  let headerKeys = A(keys(headers));
  let headerIdx = headerKeys.map((s) => s.toLowerCase()).indexOf(header.toLowerCase());
  if (headerIdx !== -1) {
    return headers[headerKeys[headerIdx]];
  }
  return null;
};

/**

  @namespace ember-plupload
  @class UploadQueue
  @extend Ember.ArrayProxy
 */
export default ArrayProxy.extend({
  name: null,
  uploading: bool('length'),
  queues: null,

  init() {
    set(this, 'queues', A([]));
    set(this, 'orphanedQueues', A([]));

    set(this, 'content', A([]));
    this._super();
  },

  configure(config = {}) {
    if (config.browse_button) {
      assert(`An element with the id "${config.browse_button}" is needed to match the uploader\'s for attribute.`, document.getElementById(config.browse_button));
    }

    var uploader = new plupload.Uploader(config);

    uploader.bind('Init',           bind(this, 'runtimeDidChange'));
    uploader.bind('FilesAdded',     bind(this, 'filesAdded'));
    uploader.bind('FilesRemoved',   bind(this, 'filesRemoved'));
    uploader.bind('BeforeUpload',   bind(this, 'configureUpload'));
    uploader.bind('UploadProgress', bind(this, 'progressDidChange'));
    uploader.bind('FileUploaded',   bind(this, 'fileUploaded'));
    uploader.bind('UploadComplete', bind(this, 'uploadComplete'));
    uploader.bind('Error',          bind(this, 'onError'));

    get(this, 'queues').pushObject(uploader);

    // Set browse_button and drop_element as
    // references to the buttons so moxie doesn't
    // get confused when the dom might be detached
    uploader.settings.browse_button = [config.browse_button];
    if (config.drop_element) {
      uploader.settings.drop_element = [config.drop_element];
    }

    let settings = copy(uploader.settings);
    delete settings.url;
    set(this, 'settings', settings);

    uploader.init();
    return uploader;
  },

  runtimeDidChange() {
    let $input = get(this, 'target').$('.moxie-shim input');
    let ruid = $input.attr('id');
    let I = moxie.runtime.Runtime.getInfo(ruid);

    // Polyfill mobile support
    if (I && !I.can('summon_file_dialog')) {
      $input.attr('capture', 'camera');
    }
  },

  /**
    Orphan the active plupload object so
    we garbage collect the queues.
   */
  orphan() {
    var orphans = get(this, 'orphanedQueues');
    var activeQueues = get(this, 'queues').filter(function (queue) {
      return orphans.indexOf(queue) === -1;
    });
    var freshestQueue = get(A(activeQueues), 'lastObject');
    if (get(freshestQueue, 'total.queued') > 0) {
      orphans.pushObject(freshestQueue);
    } else {
      this.garbageCollectUploader(freshestQueue);
    }
  },

  destroy() {
    this._super();
    get(this, 'queues').invoke('unbindAll');
    set(this, 'content', A([]));
    set(this, 'queues', null);
  },

  refresh() {
    get(this, 'queues').invoke('refresh');
  },

  size: computed({
    get: function _get() {
      return sumBy(get(this, 'queues'), 'total.size') || 0;
    }
  }),

  loaded: computed({
    get: function _get() {
      return sumBy(get(this, 'queues'), 'total.loaded') || 0;
    }
  }),

  progress: computed('size', 'loaded', {
    get: function _get() {
      let percent = get(this, 'loaded') / get(this, 'size') || 0;
      return Math.floor(percent * 100);
    }
  }),

  filesAdded(uploader, files) {
    for (let i = 0, len = files.length; i < len; i++) {
      var file = File.create({
        uploader: uploader,
        file: files[i],
        queue: this
      });

      this.pushObject(file);
      get(this, 'target').onfileadd(file, {
        name: get(this, 'name'),
        uploader: uploader,
        queue: this
      });

      this.notifyPropertyChange('size');
      this.notifyPropertyChange('loaded');
    }
  },

  filesRemoved(uploader, files) {
    for (var i = 0, len = files.length; i < len; i++) {
      var file = this.findBy('id', files[i].id);
      if (file) {
        this.removeObject(file);
      }
    }

    this.notifyPropertyChange('size');
    this.notifyPropertyChange('loaded');
  },

  configureUpload(uploader, file) {
    file = this.findBy('id', file.id);
    // Reset settings for merging
    uploader.settings = copy(get(this, 'settings'));
    assign(uploader.settings, file.settings);

    this.progressDidChange(uploader, file);
  },

  progressDidChange(uploader, file) {
    file = this.findBy('id', file.id);
    if (file) {
      file.notifyPropertyChange('progress');
    }

    this.notifyPropertyChange('size');
    this.notifyPropertyChange('loaded');
  },

  parseResponse(response) {
    var body = trim(response.response);
    var rawHeaders = A(response.responseHeaders.split(/\n|\r/)).without('');
    var headers = rawHeaders.reduce(function (E, header) {
      var parts = header.split(/^([0-9A-Za-z_-]*:)/);
      if (parts.length > 0){
        E[parts[1].slice(0, -1)] = trim(parts[2]);
      }
      return E;
    }, {});

    let contentType = (getHeader(headers, 'Content-Type') || '').split(';');
    // Parse body according to the Content-Type received by the server
    if (contentType.indexOf('text/html') !== -1) {
      body = jQuery.parseHTML(body);
    } else if (contentType.indexOf('text/xml') !== -1) {
      body = jQuery.parseXML(body);
    } else if (contentType.indexOf('application/json') !== -1 ||
               contentType.indexOf('text/javascript') !== -1 ||
               contentType.indexOf('application/javascript') !== -1) {
      body = jQuery.parseJSON(body);
    }

    return {
      status: response.status,
      body: body,
      headers: headers
    };
  },

  fileUploaded(uploader, file, response) {
    var results = this.parseResponse(response);
    file = this.findBy('id', file.id);
    if (file) {
      this.removeObject(file);
    }

    // NOTE: Plupload calls UploadProgress upon triggering FileUploaded,
    //       so we don't need to trigger a progress event
    if (Math.floor(results.status / 200) === 1) {
      file._deferred.resolve(results);
    } else {
      file._deferred.reject(results);
    }

    // Notify plupload that our browse_button may have
    // changed locations
    later(uploader, 'refresh', 750);
  },

  garbageCollectUploader(uploader) {
    get(this, 'queues').removeObject(uploader);
    get(this, 'orphanedQueues').removeObject(uploader);
    this.filterBy('uploader', uploader).invoke('destroy');
    uploader.unbindAll();
  },

  uploadComplete(uploader) {
    // Notify plupload that our browse_button may have
    // changed locations
    later(uploader, 'refresh', 750);
    this.notifyPropertyChange('loaded');
    this.notifyPropertyChange('size');

    // Clean up the orphaned uploader and its files
    if (get(this, 'orphanedQueues').indexOf(uploader) !== -1) {
      this.garbageCollectUploader(uploader);
    }
  },

  onError(uploader, error) {
    if (error.file) {
      var file = this.findBy('id', error.file.id);
      if (file == null) {
        file = File.create({
          uploader: uploader,
          file: error.file
        });
      }

      set(file, 'error', error);

      if (file._deferred) {
        file._deferred.reject(error);

      // This happended before the file got queued,
      // So we need to stub out `upload` and trigger
      // the queued event
      } else {
        file.upload = file.read = function () {
          debounce(uploader, 'refresh', 750);
          return reject(error, `File: '${error.file.id}' ${error.message}`);
        };
        if (file) {
          file.destroy();
        }

        get(this, 'target').onfileadd(file, {
          name: get(this, 'name'),
          uploader: uploader,
          queue: this
        });
      }
      this.notifyPropertyChange('length');
      debounce(uploader, 'refresh', 750);
    } else {
      set(this, 'error', error);
      get(this, 'target').onerror(error);
    }
  }
});
