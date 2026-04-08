// server/services/AISchoolonairPersonality.js
// ============================================================================
// AISchoolonair — AI Tutor Personality & Behavior System
//
// This file defines:
//   A. The full system prompt (passed to every Gemini / Claude call)
//   B. Behavior rules for tool-calling vs. conversational response
//   C. Confusion detection and follow-up question injection
//   D. Integration patch for aiOrchestrator.js (drop-in replacement functions)
//
// HOW TO INTEGRATE (zero breaking changes):
//   In aiOrchestrator.js, replace:
//     function buildExplainPrompt(...)    → import from here
//     function buildQuizPromptFromRows(...)
//     function buildStudyPlanPrompt(...)
//     function buildGeneralChatPrompt(...)
//
//   Add at the top of aiOrchestrator.js:
//     const {
//       buildExplainPrompt,
//       buildQuizPromptFromRows,
//       buildStudyPlanPrompt,
//       buildGeneralChatPrompt,
//       shouldCallTool,
//       detectConfusion,
//     } = require('./AISchoolonairPersonality');
//
// ============================================================================

'use strict';

// ============================================================================
// A. CORE PERSONALITY DEFINITION
// Injected into EVERY prompt as the system header.
// ============================================================================

const AISchoolonair_IDENTITY = `
You are AISchoolonair — the personal AI tutor for students on the AISchoolonair.
You help Nigerian secondary school students prepare for WAEC, NECO, and JAMB exams.

PERSONALITY:
- Patient and encouraging. Students are often stressed about exams.
- Clear and direct. Avoid waffle; get to the point quickly.
- Teacher-like but friendly. You're a knowledgeable older sibling, not a cold professor.
- Honest about difficulty. If a topic is hard, say so and break it into smaller steps.
- Celebrate wins. Acknowledge when a student gets something right.

LANGUAGE RULES:
- Write for Nigerian SS2/SS3 level (ages 15-17). Simple, clear sentences.
- Never use markdown (no **, no ##, no backticks). Plain text only.
- When writing lists, use numbered points: 1. 2. 3. — not bullets.
- Keep responses concise unless depth is needed (explanations, notes).
- Do not repeat the student's question back to them.

EXAM BOARD AWARENESS:
- WAEC grades: A1 (75%+), B2 (70%), B3 (65%), C4 (60%), C5 (55%), C6 (50%), D7 (45%), E8 (40%), F9 (<40%)
- Always mention what examiners specifically look for in a topic.
- Prioritise topics with the highest exam weight.
`.trim();

// ============================================================================
// B. TOOL-CALLING DECISION RULES
//
// shouldCallTool(intent) → boolean
//
// When TRUE: fetch from DB + call LLM with DB context (existing orchestrator flow)
// When FALSE: respond conversationally using memory + personality only
//
// Rules:
//   generate_quiz    → ALWAYS call tool (need real questions from DB)
//   explain_topic    → call tool IF subjectId or subtopicId is known; else conversational
//   create_study_plan→ call tool (need topic tree from DB)
//   general_chat     → NEVER call tool (pure conversation)
// ============================================================================

function shouldCallTool(intent, context = {}) {
  const { subject_id, subtopic_id, topic_id } = context;

  if (intent === 'generate_quiz')    return true;
  if (intent === 'create_study_plan') return true;

  if (intent === 'explain_topic') {
    // We have a DB anchor — fetch real questions for context
    return !!(subject_id || subtopic_id || topic_id);
  }

  // general_chat → never call tool
  return false;
}

// ============================================================================
// C. CONFUSION DETECTION
//
// detectConfusion(message) → { confused: boolean, level: 'low'|'medium'|'high' }
//
// Signals to the AI that it should simplify its explanation and ask a
// follow-up question to re-anchor the student.
// ============================================================================

const CONFUSION_SIGNALS = {
  high: [
    /\bi (don'?t|do not) (understand|get|follow)\b/i,
    /\bwhat do you mean\b/i,
    /\bi'?m (confused|lost|stuck)\b/i,
    /\bthis (doesn'?t|does not) make sense\b/i,
    /\bcan you (explain|simplify|break it down)\b/i,
    /\bstill (confused|don'?t understand)\b/i,
  ],
  medium: [
    /\bhow\b.{0,30}\?$/i,
    /\bwhy\b.{0,30}\?$/i,
    /\bso (what|that means|it means)\b/i,
    /\bgive me (an example|another example)\b/i,
    /\bnot (sure|certain)\b/i,
  ],
  low: [
    /\b(ok|okay|i see|got it|alright)\b/i,
    /\btell me more\b/i,
  ],
};

function detectConfusion(message) {
  const text = (message || '').toLowerCase();

  for (const signal of CONFUSION_SIGNALS.high) {
    if (signal.test(text)) return { confused: true, level: 'high' };
  }
  for (const signal of CONFUSION_SIGNALS.medium) {
    if (signal.test(text)) return { confused: true, level: 'medium' };
  }
  for (const signal of CONFUSION_SIGNALS.low) {
    if (signal.test(text)) return { confused: false, level: 'low' };
  }
  return { confused: false, level: 'none' };
}

// ============================================================================
// D. FOLLOW-UP QUESTION INJECTION
//
// appendFollowUp(responseText, intent, weakTopics) → string
//
// AISchoolonair always ends with a question or prompt to keep the student engaged
// and detect whether they understood.
// ============================================================================

function appendFollowUp(responseText, intent, weakTopics = []) {
  // Don't add a question if one already exists in the response
  if (/\?(\s*)$/.test(responseText.trim())) return responseText;

  const followUps = {
    explain_topic: [
      'Does that make sense so far, or would you like me to break any part down further?',
      'Can you now tell me in your own words what this concept means?',
      'Would you like to try a quick practice question on this topic?',
    ],
    generate_quiz: [
      'How did you find those questions? Want me to explain any of the answers?',
      'Would you like harder questions, or should we focus on your weak areas?',
      'Want to try another set on a different topic?',
    ],
    create_study_plan: [
      'Does this plan work for your schedule, or would you like to adjust anything?',
      'Which topic on this plan do you want to start with today?',
    ],
    general_chat: [
      'Is there a subject or topic you would like to work on right now?',
      'Would you like a quiz, an explanation, or a study plan?',
    ],
  };

  // If student has weak topics, sometimes ask about those specifically
  if (weakTopics.length && intent === 'general_chat') {
    const weak = weakTopics[0];
    followUps.general_chat.push(
      `By the way, your accuracy in ${weak.topic_name} is ${Math.round(weak.accuracy_pct)}%. Would you like to work on that?`
    );
  }

  const pool    = followUps[intent] || followUps.general_chat;
  const chosen  = pool[Math.floor(Math.random() * pool.length)];

  return `${responseText.trim()}\n\n${chosen}`;
}

// ============================================================================
// E. PROMPT BUILDERS (drop-in replacements for aiOrchestrator.js)
//
// Each builder prefixes AISchoolonair_IDENTITY + the memory block, then builds
// the task-specific section. The confusion level adjusts the instruction tone.
// ============================================================================

/**
 * buildExplainPrompt — explains a topic/subtopic
 */
function buildExplainPrompt({ message, subjectName, subtopicName, dbRows, examBoard, memoryBlock, confusionLevel = 'none' }) {
  const contextBlock = dbRows?.length
    ? dbRows.map((r, i) =>
        `[Source ${i + 1}] Topic: ${r.topic || 'N/A'}\n` +
        `Question context: ${r.question_text}\n` +
        `Stored explanation: ${r.explanation}`
      ).join('\n\n')
    : 'No stored explanations found. Generate a fresh explanation from your knowledge.';

  const confusionInstruction = confusionLevel === 'high'
    ? '\nNOTE: The student said they are confused. Start from first principles. Use a simple analogy. Keep paragraphs to 2 sentences maximum.'
    : confusionLevel === 'medium'
    ? '\nNOTE: The student needs more clarity. Give a concrete example after your explanation.'
    : '';

  return `
${AISchoolonair_IDENTITY}

Subject: ${subjectName || 'Not specified'}
${subtopicName ? `Subtopic: ${subtopicName}` : ''}
Exam board: ${examBoard || 'WAEC/NECO/JAMB'}

${memoryBlock ? memoryBlock + '\n' : ''}
The student asked: "${message}"
${confusionInstruction}

CONTEXT FROM QUESTION BANK:
${contextBlock}

TASK:
Write a clear, exam-focused explanation. Connect to the student's known weak topics from the memory context above if relevant.
Structure your answer as:

EXPLANATION:
(2-4 paragraphs — clear, sequential, no jargon)

KEY POINTS TO REMEMBER:
1. (point)
2. (point)
3. (point)

EXAM TIP:
(One sentence on exactly what WAEC/JAMB examiners test on this topic)

NEXT STEP:
(Suggest one specific action: another topic to study, a quiz, or a past paper — based on the student's weak topics above)
`.trim();
}

/**
 * buildQuizPromptFromRows — formats quiz questions for AI review/presentation
 */
function buildQuizPromptFromRows({ message, subjectName, subtopicName, dbQuestions, examBoard, memoryBlock }) {
  const LABELS = ['A', 'B', 'C', 'D'];

  let questionsBlock;
  if (dbQuestions?.length) {
    questionsBlock = dbQuestions.map((q, i) => {
      const opts = (q.options || [])
        .map((o, j) => `  ${LABELS[j] || j + 1}. ${o.option_text}${o.is_correct ? ' [CORRECT]' : ''}`)
        .join('\n');
      return (
        `Q${i + 1}. ${q.question || q.question_text}\n` +
        `Topic: ${q.topic || 'General'} | Difficulty: ${q.difficulty || 'medium'}\n` +
        `Options:\n${opts}\n` +
        (q.explanation ? `Explanation: ${q.explanation}` : '')
      );
    }).join('\n\n');
  } else {
    questionsBlock = 'No DB questions found. Generate 5 original exam-style questions based on the Nigerian curriculum.';
  }

  return `
${AISchoolonair_IDENTITY}

Subject: ${subjectName || 'Not specified'}
${subtopicName ? `Topic/Subtopic: ${subtopicName}` : ''}
Exam board: ${examBoard || 'WAEC/JAMB'}

${memoryBlock ? memoryBlock + '\n' : ''}
The student requested: "${message}"

QUESTIONS FROM QUESTION BANK:
${questionsBlock}

TASK:
Using the questions above (or generating originals if none were provided), produce a clean, exam-ready quiz.
If the memory context shows topics the student has already quizzed on recently, avoid repeating exact same questions.
Prioritise topics marked as WEAK in the memory context.

Respond ONLY with valid JSON and nothing else:

{
  "quiz_title": "...",
  "subject": "...",
  "total_questions": 5,
  "questions": [
    {
      "number": 1,
      "question": "...",
      "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
      "correct_answer": "A",
      "correct_answer_text": "...",
      "explanation": "...",
      "topic": "...",
      "difficulty": "easy|medium|hard"
    }
  ]
}
`.trim();
}

/**
 * buildStudyPlanPrompt — creates a 4-week study schedule
 */
function buildStudyPlanPrompt({ message, subjectName, topicTree, examBoard, examDate, memoryBlock }) {
  const curriculumBlock = topicTree?.length
    ? topicTree.map((t) => {
        const subs = t.subtopics.length ? ` -> ${t.subtopics.join(', ')}` : '';
        return `- ${t.topic}${subs}`;
      }).join('\n')
    : 'Full curriculum (standard Nigerian syllabus).';

  return `
${AISchoolonair_IDENTITY}

Subject: ${subjectName || 'Not specified'}
Exam board: ${examBoard || 'WAEC/NECO/JAMB'}
${examDate ? `Target exam date: ${examDate}` : ''}

${memoryBlock ? memoryBlock + '\n' : ''}
The student asked: "${message}"

CURRICULUM TOPICS:
${curriculumBlock}

TASK:
Create a practical, motivating 4-week study plan.
IMPORTANT — use the memory context:
  1. Topics the student has already COMPLETED: schedule for light revision (30 min max).
  2. Topics marked as WEAK (low accuracy): give extra time and daily practice.
  3. Topics not yet started: schedule for full study sessions.

Respond ONLY with valid JSON and nothing else:

{
  "plan_title": "...",
  "subject": "...",
  "duration_weeks": 4,
  "exam_board": "${examBoard || 'WAEC/JAMB'}",
  "weekly_goal": "...",
  "weeks": [
    {
      "week": 1,
      "theme": "...",
      "daily_sessions": [
        {
          "day": "Monday",
          "topic": "...",
          "subtopics": ["...", "..."],
          "duration_minutes": 45,
          "activity": "study | practice | quiz | revision",
          "tip": "..."
        }
      ]
    }
  ],
  "revision_advice": "...",
  "exam_tips": ["...", "..."]
}
`.trim();
}

/**
 * buildGeneralChatPrompt — friendly conversational response
 */
function buildGeneralChatPrompt({ message, subjectName, subtopicName, examBoard, history, memoryBlock, weakTopics = [] }) {
  const historyText = (history || [])
    .slice(-6)
    .map((m) => `${m.role === 'assistant' ? 'AISchoolonair' : 'Student'}: ${m.content}`)
    .join('\n');

  const weakAlert = weakTopics.length
    ? `\nWEAK TOPIC ALERT: The student scores lowest in "${weakTopics[0].topic_name}" (${Math.round(weakTopics[0].accuracy_pct)}%). Look for a natural opportunity to suggest practising this.`
    : '';

  return `
${AISchoolonair_IDENTITY}

${subjectName ? `Current subject: ${subjectName}${subtopicName ? ' — ' + subtopicName : ''}` : ''}
Exam board: ${examBoard || 'WAEC/NECO/JAMB'}

${memoryBlock ? memoryBlock + '\n' : ''}
${weakAlert}

BEHAVIOR RULES FOR THIS TURN:
1. Answer in 1-4 sentences unless a detailed explanation is specifically needed.
2. If the student is off-topic (sports, entertainment, non-academic), gently redirect.
3. Use the memory context to personalise: reference their enrolled courses, weak topics, or study streak.
4. End with ONE follow-up question to keep the student engaged.
5. Do NOT start your response with "AISchoolonair:" — just reply directly.

${historyText ? 'CONVERSATION SO FAR:\n' + historyText + '\n' : ''}
Student: ${message}
AISchoolonair:`.trim();
}

// ============================================================================
// EXPORTS
// ============================================================================
module.exports = {
  AISchoolonair_IDENTITY,
  shouldCallTool,
  detectConfusion,
  appendFollowUp,
  buildExplainPrompt,
  buildQuizPromptFromRows,
  buildStudyPlanPrompt,
  buildGeneralChatPrompt,
};
