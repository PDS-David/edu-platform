'use strict';

const logger = require('./logger');

/**
 * Safely loads routes.
 * - Prevents deployment crash on missing files
 * - Logs exact failure source
 */

function loadRoutes(app, registry, middlewareStack = []) {
  for (const route of registry) {
    try {
      const router = require(route.file);

      if (!router) {
        throw new Error(`Route file exported nothing: ${route.file}`);
      }

      app.use(route.path, ...middlewareStack, router);
      logger.info(`Route loaded: ${route.path}`);
    } catch (err) {
      logger.error(`Route failed: ${route.path}`, {
        file: route.file,
        error: err.message,
      });

      // IMPORTANT: DO NOT crash server
      // We allow server boot but log failure clearly
    }
  }
}

module.exports = loadRoutes;
