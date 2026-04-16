'use strict';

const { Server } = require('socket.io');
const eventBus = require('./eventBus');
const logger = require('../config/logger');

class RealtimeEngine {
  constructor() {
    this.io = null;
  }

  init(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: '*',
        credentials: true,
      },
    });

    this.io.on('connection', (socket) => {
      logger.info(`Realtime client connected: ${socket.id}`);

      socket.on('disconnect', () => {
        logger.info(`Realtime client disconnected: ${socket.id}`);
      });
    });

    this.bindEvents();

    return this.io;
  }

  bindEvents() {
    const forward = (eventName) => {
      eventBus.registerListener(eventName, (payload) => {
        if (!this.io) return;

        this.io.emit(eventName, payload);
      });
    };

    forward('progress.updated');
    forward('quiz.completed');
    forward('resource.viewed');
  }
}

module.exports = new RealtimeEngine();
