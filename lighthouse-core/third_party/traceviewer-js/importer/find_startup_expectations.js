/**
Copyright (c) 2015 The Chromium Authors. All rights reserved.
Use of this source code is governed by a BSD-style license that can be
found in the LICENSE file.
**/

require("../model/user_model/startup_expectation.js");

'use strict';

global.tr.exportTo('tr.importer', function() {
  function getAllFrameEvents(modelHelper) {
    var frameEvents = [];
    frameEvents.push.apply(frameEvents,
        modelHelper.browserHelper.getFrameEventsInRange(
            tr.model.helpers.IMPL_FRAMETIME_TYPE, modelHelper.model.bounds));

    tr.b.iterItems(modelHelper.rendererHelpers, function(pid, renderer) {
      frameEvents.push.apply(frameEvents, renderer.getFrameEventsInRange(
          tr.model.helpers.IMPL_FRAMETIME_TYPE, modelHelper.model.bounds));
    });
    return frameEvents.sort(tr.importer.compareEvents);
  }

  // If a thread contains a typical initialization slice, then the first event
  // on that thread is a startup event.
  function getStartupEvents(modelHelper) {
    function isStartupSlice(slice) {
      return slice.title === 'BrowserMainLoop::CreateThreads';
    }
    var events = modelHelper.browserHelper.getAllAsyncSlicesMatching(
        isStartupSlice);
    var deduper = new tr.model.EventSet();
    events.forEach(function(event) {
      var sliceGroup = event.parentContainer.sliceGroup;
      var slice = sliceGroup && sliceGroup.findFirstSlice();
      if (slice)
        deduper.push(slice);
    });
    return deduper.toArray();
  }

  // Match every event in |openingEvents| to the first following event from
  // |closingEvents| and return an array containing a load interaction record
  // for each pair.
  function findStartupExpectations(modelHelper) {
    var openingEvents = getStartupEvents(modelHelper);
    var closingEvents = getAllFrameEvents(modelHelper);
    var startups = [];
    openingEvents.forEach(function(openingEvent) {
      closingEvents.forEach(function(closingEvent) {
        // Ignore opening event that already have a closing event.
        if (openingEvent.closingEvent)
          return;

        // Ignore closing events that already belong to an opening event.
        if (closingEvent.openingEvent)
          return;

        // Ignore closing events before |openingEvent|.
        if (closingEvent.start <= openingEvent.start)
          return;

        // Ignore events from different threads.
        if (openingEvent.parentContainer.parent.pid !==
              closingEvent.parentContainer.parent.pid)
          return;

        // This is the first closing event for this opening event, record it.
        openingEvent.closingEvent = closingEvent;
        closingEvent.openingEvent = openingEvent;
        var se = new tr.model.um.StartupExpectation(
            modelHelper.model, openingEvent.start,
            closingEvent.end - openingEvent.start);
        se.associatedEvents.push(openingEvent);
        se.associatedEvents.push(closingEvent);
        startups.push(se);
      });
    });
    return startups;
  }

  return {
    findStartupExpectations: findStartupExpectations
  };
});
