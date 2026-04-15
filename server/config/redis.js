'use strict';

const { createClient } = require('redis');
const logger = require('./logger');

const redis = createClient({
  url: process.env.REDIS_URL
});

redis.on('error', (err) => {
  logger.error('Redis error', { error: err.message });
});

redis.on('connect', () => {
  logger.info('Redis connected');
});

async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
  }
}

module.exports = {
  redis,
  connectRedis
};
