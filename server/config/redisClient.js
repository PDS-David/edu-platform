'use strict';

const Redis = require('ioredis');

let client = null;

function getRedisClient() {
  if (client) return client;

  client = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue:   false,
    lazyConnect:          true,
    connectTimeout:       3000,
  });

  client.on('connect', () => {
    console.log('[Redis] Connected');
  });

  client.on('error', (err) => {
    console.warn('[Redis] Connection error — caching disabled:', err.message);
  });

  return client;
}

module.exports = { getRedisClient };
