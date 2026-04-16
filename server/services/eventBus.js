'use strict';

const EventEmitter = require('events');

/**
 * Global event bus (singleton)
 * Used by ALL engines
 */

class EventBus extends EventEmitter {
  registerListener(event, handler) {
    this.on(event, handler);
  }

  emitEvent(event, payload) {
    this.emit(event, payload);
  }
}

module.exports = new EventBus();
