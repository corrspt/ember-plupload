/* global plupload */
import EmberObject, { get } from '@ember/object';

import Uploader from 'ember-plupload/services/uploader';
import MockUploader from '../../helpers/mock-uploader';
import {
  module,
  test,
  skip
} from 'qunit';

var originalPlupload;

const MockComponent = EmberObject.extend({
});

module('service:uploader', function(hooks) {
  hooks.beforeEach(function () {
    originalPlupload = plupload.Uploader;
    plupload.Uploader = MockUploader;
  });

  hooks.afterEach(function () {
    plupload.Uploader = originalPlupload;
  });

  skip('the size of the uploader is the aggregate of all queues', function (assert) {
    var uploader = Uploader.create();
    var queue1 = uploader.findOrCreate('queue1', MockComponent.create(), {});
    var queue2 = uploader.findOrCreate('queue2', MockComponent.create(), {});
    uploader.findOrCreate('queue3', MockComponent.create(), {});

    assert.equal(get(uploader, 'files.length'), 0);
    assert.equal(get(uploader, 'size'), 0);
    assert.equal(get(uploader, 'loaded'), 0);
    assert.equal(get(uploader, 'progress'), 0);

    get(queue1, 'queues.firstObject').addFile({
      id: 'test',
      name: 'test-filename.jpg',
      size: 2000,
      percent: 0
    });

    assert.equal(get(uploader, 'files.length'), 1);
    assert.equal(get(uploader, 'size'), 2000);
    assert.equal(get(uploader, 'loaded'), 0);
    assert.equal(get(uploader, 'progress'), 0);

    get(queue2, 'queues.firstObject').addFile({
      id: 'test1',
      name: 'test-filename.jpg',
      size: 3500,
      percent: 0
    });

    assert.equal(get(uploader, 'files.length'), 2);
    assert.equal(get(uploader, 'size'), 5500);
    assert.equal(get(uploader, 'loaded'), 0);
    assert.equal(get(uploader, 'progress'), 0);

    get(queue2, 'queues.firstObject').addFile({
      id: 'test2',
      name: 'test-filename.jpg',
      size: 1400,
      percent: 0
    });

    assert.equal(get(uploader, 'files.length'), 3);
    assert.equal(get(uploader, 'size'), 6900);
    assert.equal(get(uploader, 'loaded'), 0);
    assert.equal(get(uploader, 'progress'), 0);
  });

  skip('the uploaded size of the uploader is the aggregate of all queues', function (assert) {
    var uploader = Uploader.create();
    var queue1 = uploader.findOrCreate('queue1', MockComponent.create(), {});

    assert.equal(get(uploader, 'files.length'), 0);
    assert.equal(get(uploader, 'size'), 0);
    assert.equal(get(uploader, 'loaded'), 0);
    assert.equal(get(uploader, 'progress'), 0);

    get(queue1, 'queues.firstObject').addFile({
      id: 'test',
      name: 'test-filename.jpg',
      size: 2000,
      loaded: 500
    });

    assert.equal(get(uploader, 'files.length'), 1);
    assert.equal(get(uploader, 'size'), 2000);
    assert.equal(get(uploader, 'loaded'), 500);
    assert.equal(get(uploader, 'progress'), 25);

    var queue2 = uploader.findOrCreate('queue2', MockComponent.create(), {});

    get(queue2, 'queues.firstObject').addFile({
      id: 'test1',
      name: 'test-filename.jpg',
      size: 3500,
      loaded: 500
    });

    assert.equal(get(uploader, 'files.length'), 2);
    assert.equal(get(uploader, 'size'), 5500);
    assert.equal(get(uploader, 'loaded'), 1000);
    assert.equal(get(uploader, 'progress'), 18);

    uploader.findOrCreate('queue3', MockComponent.create(), {});

    get(queue2, 'queues.firstObject').addFile({
      id: 'test2',
      name: 'test-filename.jpg',
      size: 1400,
      loaded: 1000
    });

    assert.equal(get(uploader, 'files.length'), 3);
    assert.equal(get(uploader, 'size'), 6900);
    assert.equal(get(uploader, 'loaded'), 2000);
    assert.equal(get(uploader, 'progress'), 28);
  });
});
