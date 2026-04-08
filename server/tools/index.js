// server/tools/index.js
// ---------------------------------------------------------------------------
// Tools Layer - EAC Learning Platform
// Single entry point that:
//   1. Boots the shared toolSuccess / toolError helpers (global)
//   2. Imports every tool module
//   3. Re-exports a flat, named map of all callable tools
// Usage from anywhere in the server:
//   const tools = require('./tools');
//   const result = await tools.getCourses(userId);
//   const result = await tools.startQuiz(userId, { topic_id, limit: 10 });
// Usage from aiOrchestrator.js:
//   const { getCourses, getPerformance } = require('./tools');
// Adding a new tool:
//   1. Create  server/tools/myNewTools.js  (export toolSuccess / toolError wrapped functions)
//   2. require it below and spread its exports into the TOOLS map
//   3. Done. The orchestrator sees it immediately.
// ---------------------------------------------------------------------------
'use strict';

// 1. Boot shared helpers (attaches toolSuccess / toolError to global)
require('./_toolHelpers');

// 2. Import tool modules
const courseTools      = require('./courseTools');
const quizTools        = require('./quizTools');
const analyticsTools   = require('./analyticsTools');
const testTools        = require('./testTools');
const explanationTools = require('./explanationTools');
const weaknessTools    = require('./weaknessTools');

// 3. Flat export map
// Tool name             Module            Description
// getCourses            courseTools       Active enrollments + available subjects
// getEnrollmentProgress courseTools       Per-subject topic/subtopic progress
// startQuiz             quizTools         Generate a quiz (cached, DB-authoritative)
// getQuizHistory        quizTools         Past quiz attempts for a subtopic
// getPerformance        analyticsTools    Full performance snapshot (summary + trends)
// predictGrade          analyticsTools    AI-powered grade prediction for a subject
// getLeaderboard        analyticsTools    Top-10 weekly leaderboard
// generateTest          testTools         Create a new custom test (teacher tool)
// getStudentTests       testTools         List assigned tests for a student
// getTestDetails        testTools         Full test with questions + options
// explainConcept        explanationTools  Explain a topic, subtopic, or question
// getHint               explanationTools  Socratic hint for a specific question
const TOOLS = {
  ...courseTools,
  ...quizTools,
  ...analyticsTools,
  ...testTools,
  ...explanationTools,
  ...weaknessTools,
};

module.exports = TOOLS;
