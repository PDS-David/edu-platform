// server/services/aiService.js
// All Gemini API calls for the EAC platform.
// Requires: GEMINI_API_KEY in .env
// Install:  npm install @google/generative-ai

const { GoogleGenerativeAI } = require('@google/generative-ai');

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set in environment variables');
    _client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return _client;
}
function getModel() {
  return getClient().getGenerativeModel({ model: 'gemini-1.5-flash' });
}

async function generateHint({ questionText, options, topic, examBoard, hintLevel = 1 }) {
  const optionsList = options.map((o, i) => `${['A','B','C','D','E'][i]}. ${o.option_text}`).join('\n');
  const levelInstructions = {
    1: 'Give a very gentle nudge toward the right concept without mentioning any option. 1-2 sentences.',
    2: 'Explain the key principle needed but do not reveal which option is correct. 2-3 sentences.',
    3: 'Explain the reasoning step-by-step and help eliminate wrong options but do not state the answer. 3-4 sentences.',
  };
  const prompt = `You are an expert IGCSE and A-Level tutor for the EAC Learning Platform in Nigeria. Use the Socratic method. Never mention option letters or say which answer is correct. Tone: warm, encouraging, concise.\n\nQuestion (${examBoard || 'exam'}${topic ? ` — "${topic}"` : ''}):\n${questionText}\n\nOptions:\n${optionsList}\n\nHint level ${hintLevel}: ${levelInstructions[hintLevel]}\n\nProvide only the hint text. No preamble, no markdown.`;
  const result = await getModel().generateContent(prompt);
  return result.response.text().trim();
}

async function generateExplanation({ questionText, options, correctOptionText, selectedOptionText, wasCorrect, existingExplanation, topic, examBoard }) {
  const optionsList = options.map((o, i) => `${['A','B','C','D','E'][i]}. ${o.option_text}`).join('\n');
  const prompt = `You are an expert IGCSE and A-Level tutor for the EAC Learning Platform in Nigeria. Write clear educational explanations. 3-5 sentences. No markdown. Plain paragraphs only.\n\nA student just ${wasCorrect ? 'correctly answered' : 'got wrong'} this ${examBoard || 'exam'} question${topic ? ` on "${topic}"` : ''}.\n\nQuestion: ${questionText}\nOptions:\n${optionsList}\nCorrect Answer: ${correctOptionText}\nStudent Selected: ${selectedOptionText}\n${existingExplanation ? `\nExisting explanation (expand on this): ${existingExplanation}` : ''}\n\nWrite a clear explanation of WHY "${correctOptionText}" is correct. ${!wasCorrect ? `Also briefly explain why "${selectedOptionText}" is incorrect.` : ''} ${wasCorrect ? 'Start with brief affirmation then deepen understanding.' : 'Be encouraging.'} Plain text only.`;
  const result = await getModel().generateContent(prompt);
  return result.response.text().trim();
}

async function generateMarkingScheme({ questionText, correctOptionText, selectedOptionText, wasCorrect, marksAwarded, maxMarks, topic, examBoard }) {
  const prompt = `You are an expert ${examBoard || 'IGCSE'} examiner writing a detailed marking scheme. Respond ONLY with valid JSON, no prose, no markdown fences.\n\nQuestion: ${questionText}\nCorrect Answer: ${correctOptionText}\nStudent Answer: ${selectedOptionText}\nResult: ${wasCorrect ? 'Correct' : 'Incorrect'}\nMarks: ${marksAwarded}/${maxMarks}\nTopic: ${topic || 'General'}\n\nRespond with ONLY this JSON:\n{"status":"Correct or Incorrect or Partially Correct","whyExplanation":"2-3 sentences with **bold** key terms","stepByStep":["step 1","step 2","step 3"],"examinersRequirement":"What the examiner expects","modelAnswer":"The ideal answer"}`;
  const result = await getModel().generateContent(prompt);
  const raw = result.response.text().trim().replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

async function generateExaminerRecommendation({ subjectName, subtopicName, totalScore, maxScore, accuracyPct, timeTakenSeconds, avgAccuracyPct, avgTimeSeconds }) {
  const prompt = `You are an experienced ${subjectName} examiner writing personalised feedback for a student. Be warm, specific, actionable. Maximum 3 sentences. No markdown.\n\nStudent performance on ${subtopicName}:\n- Score: ${totalScore}/${maxScore}\n- Accuracy: ${Math.round(accuracyPct)}%\n- Time taken: ${Math.round(timeTakenSeconds / 60)} minutes\n- Class average accuracy: ${Math.round(avgAccuracyPct)}%\n- Class average time: ${Math.round(avgTimeSeconds / 60)} minutes\n\nWrite one personalised examiner recommendation paragraph.`;
  const result = await getModel().generateContent(prompt);
  return result.response.text().trim();
}

async function predictGrade({ subjectName, examBoard, topics = [], overallCorrectPct, totalAttempts, avgTimePerQuestionMs }) {
  if (totalAttempts < 10) return { predictedGrade: 'Insufficient data', confidence: 0, weakestTopics: [], studyAdvice: 'Complete at least 10 practice questions to receive a grade prediction.' };
  const topicSummary = topics.sort((a, b) => a.correctPct - b.correctPct).map(t => `${t.name}: ${Math.round(t.correctPct)}% correct (${t.attemptsCount} attempts)`).join('\n');
  const prompt = `You are an expert IGCSE and A-Level examiner. Predict exam grade based on practice data. Respond ONLY with valid JSON, no prose, no markdown fences.\n\nSubject: ${subjectName} (${examBoard})\nOverall correct: ${Math.round(overallCorrectPct)}%\nTotal questions: ${totalAttempts}\nAvg time/question: ${Math.round((avgTimePerQuestionMs || 0) / 1000)}s\n\nTopic breakdown (weakest first):\n${topicSummary || 'No topic data'}\n\nIGCSE Grade Scale: A* (>=90%), A (>=80%), B (>=70%), C (>=60%), D (>=50%), E (>=40%), F/G (below 40%)\n\nRespond ONLY with this JSON:\n{"predictedGrade":"B","confidence":72,"weakestTopics":["Topic 1","Topic 2","Topic 3"],"studyAdvice":"2-3 sentence personalised advice"}`;
  const result = await getModel().generateContent(prompt);
  const raw = result.response.text().trim().replace(/```json|```/g, '').trim();
  return JSON.parse(raw);
}

async function generateRevisionNotes({ subjectName, topicName, examBoard, syllabusPoints = [] }) {
  const syllabusText = syllabusPoints.length ? `\nSyllabus points:\n${syllabusPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}` : '';
  const prompt = `You are an expert ${examBoard || 'IGCSE'} tutor creating concise revision notes for Nigerian students aged 14-18. Structure: Key Concepts, Worked Example, Exam Tips, Common Mistakes. No markdown. Under 400 words.\n\nSubject: ${subjectName}\nTopic: ${topicName}\nExam Board: ${examBoard || 'IGCSE'}${syllabusText}`;
  const result = await getModel().generateContent(prompt);
  return result.response.text().trim();
}

async function analyzeCohortGaps({ subjectName, examBoard, cohortTopics, studentCount }) {
  const topicList = cohortTopics.sort((a, b) => a.avgCorrectPct - b.avgCorrectPct).slice(0, 10).map(t => `${t.name}: ${Math.round(t.avgCorrectPct)}% avg (${t.studentsBelow60Pct} students below 60%)`).join('\n');
  const prompt = `You are a head of department reviewing student analytics for ${subjectName} (${examBoard || 'IGCSE'}). Class of ${studentCount} students. Write 3 specific actionable intervention recommendations a teacher can implement this week. Plain text, numbered 1-3. Maximum 150 words.\n\nWeakest topics:\n${topicList}`;
  const result = await getModel().generateContent(prompt);
  return result.response.text().trim();
}

module.exports = { generateHint, generateExplanation, generateMarkingScheme, generateExaminerRecommendation, generateRevisionNotes, predictGrade, analyzeCohortGaps };
