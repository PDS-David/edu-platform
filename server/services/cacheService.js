'use strict';

const { redis } = require('../config/redis');

class CacheService {

  static async get(key) {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  static async set(key, value, ttlSeconds = 300) {
    await redis.set(key, JSON.stringify(value), {
      EX: ttlSeconds
    });
  }

  static async del(key) {
    await redis.del(key);
  }

  static async exists(key) {
    return await redis.exists(key);
  }

  // atomic lock (AI generation control)
  static async lock(key, ttlSeconds = 60) {
    const result = await redis.set(key, '1', {
      NX: true,
      EX: ttlSeconds
    });
    return result === 'OK';
  }
}

module.exports = CacheService;
