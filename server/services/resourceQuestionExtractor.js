'use strict';
// server/services/resourceQuestionExtractor.js
// ─────────────────────────────────────────────────────────────────────────────
// Extracts multiple-choice questions from an uploaded resource (PDF / DOCX /
// image / etc.) and persists them to the `questions` + `answer_options`
// tables so that students see them as actual quiz/practice questions rather
// than as a downloadable file.
//
// Triggered by PUT /api/resources/:id/assign-meta when the admin tags the
// resource with content_kind='question_bank'.
//
// Strategy:
//   1. Try to read the file content (PDF / DOCX) as text. Falls back to
//      the resource title + curriculum context when no parser is available
//      or the file format isn't text-extractable. The Gemini hub
//      (services/ai.js) takes care of the LLM call.
//   2. Ask Gemini to return strict JSON: an array of MCQs with exactly four
//      options and one correct answer.
//   3. Insert each question with status='pending' and is_ai_generated=true
//      so it appears in the existing teacher/admin review queue before
//      reaching students.
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const fs = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { generate } = require('./ai');

const MAX_QUESTIONS_PER_FILE = 15;
const MAX_TEXT_CHARS = 12000;

// ── Optional text extraction (works even if libs aren't installed) ──────────
async function readFileAsText(resource) {
  const url = resource.file_url || '';
  const ext = path.extname(url.split('?')[0]).toLowerCase();

  // ── Case 1: Local disk path (dev / Hetzner persistent volume) ────────────
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    const localPath = path.join(__dirname, '..', url.replace(/^\//, ''));
    if (!fs.existsSync(localPath)) return '';
    return extractFromBuffer(await fs.promises.readFile(localPath), ext);
  }

  // ── Case 2: R2 proxy URL served through our API ───────────────────────────
  //   /api/resources/r2/<encoded-key>
  if (url.startsWith('/api/resources/r2/')) {
    try {
      const r2 = require('../utils/r2Storage');
      if (!r2.isR2Enabled()) return '';
      const key = decodeURIComponent(url.slice('/api/resources/r2/'.length));
      const obj = await r2.getObjectByKey(key);
      const chunks = [];
      for await (const chunk of obj.body) chunks.push(chunk);
      return extractFromBuffer(Buffer.concat(chunks), ext);
    } catch (err) {
      console.warn('[resourceQuestionExtractor] R2 proxy fetch failed:', err.message);
      return '';
    }
  }

  // ── Case 3: Public R2 / CDN absolute URL ─────────────────────────────────
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const fetcher = url.startsWith('https') ? require('https') : require('http');
      const buf = await new Promise((resolve, reject) => {
        fetcher.get(url, (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
          res.on('error', reject);
        }).on('error', reject);
      });
      return extractFromBuffer(buf, ext);
    } catch (err) {
      console.warn('[resourceQuestionExtractor] HTTP fetch failed:', err.message);
      return '';
    }
  }

  return '';
}

async function extractFromBuffer(buf, ext) {
  try {
    if (ext === '.pdf') {
      const pdfParse = safeReq('pdf-parse');
      if (!pdfParse) return '';
      const data = await pdfParse(buf);
      return (data?.text || '').slice(0, MAX_TEXT_CHARS);
    }
    if (ext === '.docx') {
      const mammoth = safeReq('mammoth');
      if (!mammoth) return '';
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return (value || '').slice(0, MAX_TEXT_CHARS);
    }
    if (['.txt', '.md'].includes(ext)) {
      return buf.toString('utf8').slice(0, MAX_TEXT_CHARS);
    }
  } catch (err) {
    console.warn('[resourceQuestionExtractor] text extraction failed:', err.message);
  }
  return '';
}

function safeReq(name) {
  try { return require(name); } catch { return null; }
}

// ── Curriculum context lookup ──────────────────────────────────────────────
async function loadContext(resource) {
  const ctx = { subject: null, topic: null, subtopic: null, exam: null };

  if (resource.subject_id) {
    const [s] = await sequelize.query(
      `SELECT s.id, s.name, s.level, eb.name AS exam_name, eb.code AS exam_code
         FROM subjects s
         LEFT JOIN exam_boards eb ON eb.id = s.exam_board_id
        WHERE s.id = :id`,
      { replacements: { id: resource.subject_id }, type: QueryTypes.SELECT }
    );
    if (s) { ctx.subject = s.name; ctx.exam = s.exam_name || s.exam_code; }
  }
  if (resource.topic_id) {
    const [t] = await sequelize.query(
      `SELECT name FROM topics WHERE id = :id`,
      { replacements: { id: resource.topic_id }, type: QueryTypes.SELECT }
    );
    if (t) ctx.topic = t.name;
  }
  if (resource.subtopic_id) {
    const [st] = await sequelize.query(
      `SELECT name FROM subtopics WHERE id = :id`,
      { replacements: { id: resource.subtopic_id }, type: QueryTypes.SELECT }
    );
    if (st) ctx.subtopic = st.name;
  }
  return ctx;
}

// ── Prompt builder ─────────────────────────────────────────────────────────
function buildPrompt({ resource, ctx, fileText }) {
  const header = [
    `You are an exam-prep question writer.`,
    ctx.exam     ? `Exam:     ${ctx.exam}`     : null,
    ctx.subject  ? `Subject:  ${ctx.subject}`  : null,
    ctx.topic    ? `Topic:    ${ctx.topic}`    : null,
    ctx.subtopic ? `Subtopic: ${ctx.subtopic}` : null,
    `Resource title: ${resource.title}`,
  ].filter(Boolean).join('\n');

  const source = fileText
    ? `Source content extracted from the uploaded file:\n"""\n${fileText}\n"""`
    : `(No text could be extracted from the file. Generate questions appropriate for the topic/subtopic above.)`;

  return [
    header,
    '',
    source,
    '',
    `Produce up to ${MAX_QUESTIONS_PER_FILE} multiple-choice questions.`,
    `Return STRICT JSON only — no prose, no markdown — matching this schema:`,
    `{ "questions": [ { "question": "...", "options": ["A","B","C","D"], "correct_index": 0, "explanation": "...", "difficulty": "easy|medium|hard" } ] }`,
    `Rules: exactly 4 options per question, exactly one correct, correct_index in 0..3, no duplicates, concise explanations.`,
  ].join('\n');
}

function parseJsonLoose(text) {
  if (!text) return null;
  // Strip code fences if Gemini added them
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  // Try to find the first {...} block
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch {} }
  return null;
}

// ── Persistence ────────────────────────────────────────────────────────────
async function insertQuestion(q, resource, submittedBy) {
  const opts = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
  if (opts.length !== 4) return null;
  const idx = Number.isInteger(q.correct_index) ? q.correct_index : 0;
  if (idx < 0 || idx > 3) return null;
  const text = String(q.question || '').trim();
  if (!text) return null;

  const difficulty = ['easy', 'medium', 'hard'].includes(q.difficulty) ? q.difficulty : 'medium';
  const explanation = String(q.explanation || '').slice(0, 4000);
  const correctText = opts[idx];

  const [row] = await sequelize.query(
    `INSERT INTO questions
       (subtopic_id, submitted_by, question_text, type, options, correct_answer,
        explanation, marks, order_index, is_active, created_at, updated_at,
        status, difficulty, question_type, question_sub_type,
        topic, subject_id_uuid, is_ai_generated, ai_generation_source)
     VALUES
       (:subtopic_id, :submitted_by, :question_text, 'mcq', :options::jsonb, :correct_answer,
        :explanation, 1, 0, true, NOW(), NOW(),
        'pending', :difficulty, 'mcq', 'mcq',
        :topic, :subject_id, true, :source)
     RETURNING id`,
    {
      replacements: {
        subtopic_id: resource.subtopic_id || null,
        submitted_by: submittedBy || null,
        question_text: text,
        options: JSON.stringify(opts),
        correct_answer: correctText,
        explanation,
        difficulty,
        topic: null,
        subject_id: resource.subject_id || null,
        source: `resource:${resource.id}`,
      },
    }
  );

  const qid = row?.[0]?.id;
  if (!qid) return null;

  for (let i = 0; i < opts.length; i++) {
    await sequelize.query(
      `INSERT INTO answer_options (question_id, option_text, is_correct, order_index)
       VALUES (:qid, :text, :ok, :ord)`,
      { replacements: { qid, text: String(opts[i]), ok: i === idx, ord: i } }
    );
  }
  return qid;
}

// ── Public entry point ─────────────────────────────────────────────────────
async function extractFromResource(resource, submittedBy) {
  if (!resource || !resource.id) throw new Error('extractFromResource: missing resource');

  const [ctx, fileText] = await Promise.all([
    loadContext(resource),
    readFileAsText(resource),
  ]);

  const prompt = buildPrompt({ resource, ctx, fileText });
  const raw = await generate(prompt, 'generate-questions', { maxOutputTokens: 4000 });

  const parsed = parseJsonLoose(raw);
  const list = parsed && Array.isArray(parsed.questions) ? parsed.questions : [];

  const created = [];
  for (const q of list.slice(0, MAX_QUESTIONS_PER_FILE)) {
    try {
      const id = await insertQuestion(q, resource, submittedBy);
      if (id) created.push(id);
    } catch (err) {
      console.warn('[resourceQuestionExtractor] insert failed:', err.message);
    }
  }

  await sequelize.query(
    `UPDATE resources SET questions_extracted_at = NOW(), updated_at = NOW() WHERE id = :id`,
    { replacements: { id: resource.id } }
  );

  return {
    resource_id: resource.id,
    used_file_text: !!fileText,
    requested: list.length,
    inserted: created.length,
    question_ids: created,
  };
}

module.exports = { extractFromResource };
