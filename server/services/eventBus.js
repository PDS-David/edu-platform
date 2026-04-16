'use strict';

const EventEmitter = require('events');

/**
 * Global application event bus
 * Used for decoupling engines (progress, analytics, AI, etc.)
 */
class EventBus extends EventEmitter {
  emitEvent(eventName, payload) {
    this.emit(eventName, payload);
  }

  registerListener(eventName, handler) {
    this.on(eventName, handler);
  }
}

module.exports = new EventBus();
