'use strict';

// server/tools/weaknessTools.js
// ---------------------------------------------------------------------------
// AI-callable tool: student weakness profiling.
//
// Wraps:
//   server/services/weaknessService.js  (analyzeWeakness)
//
// Registered in server/tools/index.js via:
//   const weaknessTools = require('./weaknessTools');
//   ...weaknessTools,
//
// Does NOT modify any of those files.
// ---------------------------------------------------------------------------

const { analyzeWeakness } = require('../services/weaknessService');

// ---------------------------------------------------------------------------
// getWeaknessProfile(userId)
//
// Returns a ranked list of the student's weak topics, each tagged with a
// severity level derived from their historical answer accuracy.
//
// Severity bands (set by weaknessService.analyzeWeakness):
//   accuracy < 0.40  =>  'critical'
//   accuracy < 0.60  =>  'high'
//   accuracy < 0.80  =>  'medium'
//   accuracy >= 0.80 =>  'low'
//
// Output shape:
// {
//   ok:   true,
//   tool: 'getWeaknessProfile',
//   data: [
//     { topicName: string, severity: 'critical' | 'high' | 'medium' | 'low' },
//     ...
//   ]
// }
// ---------------------------------------------------------------------------
async function getWeaknessProfile(userId) {
  if (!userId) {
    return toolError('getWeaknessProfile', 'userId is required');
  }

  try {
    const rows = await analyzeWeakness(userId);

    // Map the full service payload down to the shape this tool guarantees.
    // analyzeWeakness returns: { subjectId, topicName, subtopicId, accuracy,
    //                            total, failed, severity }
    // We expose only topicName + severity so callers get a stable contract.
    const data = rows.map((r) => ({
      topicName: r.topicName,
      severity:  r.severity,
    }));

    return toolSuccess('getWeaknessProfile', data);

  } catch (err) {
    return toolError('getWeaknessProfile', err.message, err);
  }
}

module.exports = { getWeaknessProfile };
