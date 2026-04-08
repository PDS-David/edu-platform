// server/tools/_toolHelpers.js
// ---------------------------------------------------------------------------
// Shared response builders used by every tool file.
//
// Attach to global so all tool files can call toolSuccess() / toolError()
// without an extra require(). Call this file ONCE at startup (before any tool
// is required) by adding:
//
//   require('./tools/_toolHelpers');
//
// at the top of server.js (or wherever tools are first loaded).
// ---------------------------------------------------------------------------

'use strict';

/**
 * toolSuccess(toolName, data)
 *
 * Standard success envelope for all AI-callable tools.
 *
 * @param {string} toolName  e.g. 'getCourses'
 * @param {*}      data      Any serialisable value
 * @returns {{ ok: true, tool: string, data: * }}
 */
global.toolSuccess = function toolSuccess(toolName, data) {
  return {
    ok:   true,
    tool: toolName,
    data: data ?? null,
  };
};

/**
 * toolError(toolName, message, originalError, statusCode)
 *
 * Standard error envelope. Never throws — always returns a value so the
 * orchestrator can decide how to handle it rather than crashing.
 *
 * @param {string}  toolName       e.g. 'startQuiz'
 * @param {string}  message        Human-readable error description
 * @param {Error}   [originalError] Original error (logged server-side only)
 * @param {number}  [statusCode]   HTTP-style code for context (400, 404, 500)
 * @returns {{ ok: false, tool: string, error: string, statusCode: number }}
 */
global.toolError = function toolError(toolName, message, originalError = null, statusCode = 500) {
  if (originalError) {
    console.error(`[tool:${toolName}] ${message}`, originalError.stack || originalError.message || '');
  } else {
    console.warn(`[tool:${toolName}] ${message}`);
  }

  return {
    ok:         false,
    tool:       toolName,
    error:      message,
    statusCode: statusCode || 500,
  };
};
