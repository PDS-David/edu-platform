'use strict';

const { Queue } = require('bullmq');
const { getRedisClient } = require('../config/redisClient');

let _queue = null;

function getAiQueue() {
  if (_queue) return _queue;

  _queue = new Queue('ai-tasks', {
    connection: getRedisClient(),
    defaultJobOptions: {
      attempts:    3,
      backoff:     { type: 'exponential', delay: 2000 },
      removeOnComplete: { count: 200 },
      removeOnFail:     { count: 100 },
    },
  });

  _queue.on('error', (err) => {
    console.error('[AiQueue] Queue error:', err.message);
  });

  return _queue;
}

module.exports = { getAiQueue };
