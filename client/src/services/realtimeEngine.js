'use strict';

const WebSocket = require('ws');
const eventBus = require('./eventBus');

/**
 * RealtimeEngine
 * Bridges backend event system → frontend live updates
 */

class RealtimeEngine {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });

    this.clients = new Set();

    this.init();
  }

  init() {
    this.wss.on('connection', (ws) => {
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });
    });

    // Subscribe to backend events
    eventBus.registerListener('progress.updated', (payload) => {
      this.broadcast('progress.updated', payload);
    });

    eventBus.registerListener('quiz.completed', (payload) => {
      this.broadcast('quiz.completed', payload);
    });

    eventBus.registerListener('resource.viewed', (payload) => {
      this.broadcast('resource.viewed', payload);
    });
  }

  broadcast(event, data) {
    const message = JSON.stringify({ event, data });

    for (const client of this.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }
}

module.exports = RealtimeEngine;
