'use strict';
// server/scripts/generateSyllabusRemapSuggestions.js
//
// Syllabus-driven topic mapping — Prompt 4 Part 1: AI-suggestion generation,
// DRY RUN ONLY.
//
// WHAT THIS DOES: for every subject that has a confirmed syllabus-derived
// topic tree (syllabus_documents.status = 'confirmed'), finds every existing
// content item still pointing at that subject's OLD (pre-syllabus or
// superseded) topics/subtopics, asks the AI hub for the single best-matching
// node in the NEW tree (or "no confident match"), and writes the suggestion
// to syllabus_remap_suggestions.
//
// WHAT THIS NEVER DOES: write to resources.topic_id/subtopic_id,
// questions.subtopic_id, videos.topic_id, revision_notes.subtopic_id, or
// concepts.subtopic_id — not once, anywhere in this file. Grep this file for
// "UPDATE " to confirm; the only UPDATE-shaped statement is the
// ON CONFLICT ... DO UPDATE against syllabus_remap_suggestions itself.
//
// GENERIC ACROSS EVERY EXAM TYPE, BY DESIGN: this loops over every subject
// with a confirmed doc, not one hardcoded board/subject — findConfirmedSubjects()
// below has no exam-board filter. Since this part writes nothing to real
// content, there is no per-subject gate here (unlike Part 2, which per
// Prompt 4's own instruction must run one subject at a time behind human
// confirmation, because that part performs actual writes).
//
// SCOPE CORRECTION (confirmed by reading the real schema, not assumed from
// Prompt 4's own brief, which guessed "resources, questions, past_papers"):
//   - past_papers has NO subtopic_id/topic_id column at all (only
//     subject_id) -- excluded, there's no subtopic granularity to remap.
//   - videos, revision_notes, concepts also reference topic_id/subtopic_id
//     and are genuine content -- included, though the original brief missed
//     them.
//   - subtopic_progress, subtopic_quiz_attempts, user_weak_topics,
//     learning_gaps, ai_explanation_cache, ai_chat_sessions all also
//     reference subtopic_id/topic_id but are historical/analytics/cache
//     records tied to a point in time -- deliberately excluded, since
//     remapping a student's past quiz attempt onto a different subtopic
//     than the one they actually attempted corrupts the historical record
//     rather than fixing anything.
//
// HOW TO RUN (on the server, via SSH -- this script needs the same
// DATABASE_URL and AI provider keys the app itself runs on; there is no
// live DB or AI-key access from wherever this was written):
//   cd /opt/aischoolonair && node server/scripts/generateSyllabusRemapSuggestions.js
//
// Prerequisite: database/migration_034_syllabus_remap_suggestions.sql must
// have been run first (manual run, same as migrations 007+).
//
// VERIFICATION: this script only ever INSERTs/UPDATEs
// syllabus_remap_suggestions. To confirm zero writes happened anywhere
// else, diff row counts on resources/questions/videos/revision_notes/
// concepts before and after running -- they should be byte-for-byte
// identical (this script performs zero writes to them, so this is really
// just belt-and-braces confirmation, not a real risk).

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env'), override: false });
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { generate } = require('../services/ai');
const { sanitizeAiJson } = require('../services/syllabusExtractor');

// Step 2.2 (batching): 15 items per AI call, well within the 10-20 range
// the prompt calls for. The new tree's full node list is sent ONCE per
// batch (not once per item), which is what actually matters for
// cost/latency on a subject with hundreds of old-tree items.
const BATCH_SIZE = 15;

// Step 1: the real, verified list of content tables with subtopic_id/
// topic_id -- see the SCOPE CORRECTION note above for what was excluded
// and why. hasSubjectId/hasTopicId/hasSubtopicId describe each table's
// ACTUAL columns (confirmed by reading migration_003.sql and each
// server/models/*.js file directly, not assumed):
//   - resources: has its own subject_id, topic_id, AND subtopic_id.
//   - questions: no subject_id column (derived via subtopics.subject_id),
//     subtopic_id only, no topic_id column.
//   - videos: no subject_id column (derived via topics.subject_id),
//     topic_id only, no subtopic_id column -- a video can only ever be
//     remapped to a topic-level node, never a subtopic.
//   - revision_notes / concepts: no subject_id column (derived via
//     subtopics.subject_id), subtopic_id only (NOT NULL on both tables).
const SOURCE_TABLES = [
  { table: 'resources',       textCol: 'title',         hasSubjectId: true,  hasTopicId: true,  hasSubtopicId: true  },
  { table: 'questions',       textCol: 'question_text',  hasSubjectId: false, hasTopicId: false, hasSubtopicId: true  },
  { table: 'videos',          textCol: 'title',          hasSubjectId: false, hasTopicId: true,  hasSubtopicId: false },
  { table: 'revision_notes',  textCol: 'title',          hasSubjectId: false, hasTopicId: false, hasSubtopicId: true  },
  { table: 'concepts',        textCol: 'name',           hasSubjectId: false, hasTopicId: false, hasSubtopicId: true  },
];

// Step 2.1: confidence is a 0.0-1.0 float (matches the NUMERIC(3,2) column
// in migration_034) rather than a coarse high/medium/low label -- Part 2's
// planned bulk-accept-high-confidence step needs a real numeric threshold
// (e.g. >= 0.85) to filter on. HIGH_CONFIDENCE_THRESHOLD is only used for
// this script's own summary counts below; Part 2 owns the real threshold.
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

async function findConfirmedSubjects() {
  // Every subject with a confirmed syllabus doc, across every exam board --
  // no board/subject filter, per this session's explicit instruction that
  // Part 1 must generalize to every exam type, not one picked subject.
  // A subject could have more than one confirmed doc over time (a
  // re-upload) -- DISTINCT ON takes the most recently confirmed one as
  // authoritative; an earlier confirmed doc's own topics/subtopics for the
  // same subject are then correctly treated as "old tree" below.
  return sequelize.query(
    `SELECT DISTINCT ON (sd.subject_id)
       sd.id AS syllabus_document_id, sd.subject_id, sd.exam_board_id,
       s.name AS subject_name, eb.name AS exam_board_name
     FROM syllabus_documents sd
     JOIN subjects s      ON s.id = sd.subject_id
     JOIN exam_boards eb  ON eb.id = sd.exam_board_id
     WHERE sd.status = 'confirmed'
     ORDER BY sd.subject_id, sd.confirmed_at DESC`,
    { type: QueryTypes.SELECT }
  );
}

async function getNewTree(syllabusDocumentId) {
  const topics = await sequelize.query(
    `SELECT id, name AS title FROM topics WHERE source_syllabus_id = :id ORDER BY order_index`,
    { replacements: { id: syllabusDocumentId }, type: QueryTypes.SELECT }
  );
  const subtopics = await sequelize.query(
    `SELECT id, topic_id, parent_subtopic_id, name AS title
       FROM subtopics WHERE source_syllabus_id = :id ORDER BY order_index`,
    { replacements: { id: syllabusDocumentId }, type: QueryTypes.SELECT }
  );
  return { topics, subtopics };
}

async function getOldTreeItems(subjectId, currentSyllabusDocId, cfg) {
  // "Old tree" = every topic/subtopic for this subject that is NOT part of
  // the current confirmed doc's tree -- covers both pre-syllabus nodes
  // (source_syllabus_id IS NULL) and nodes from an earlier, now-superseded
  // confirmed doc for the same subject (source_syllabus_id set, but to a
  // different, older doc).
  const oldTopicIds = (await sequelize.query(
    `SELECT id FROM topics WHERE subject_id = :sid AND (source_syllabus_id IS NULL OR source_syllabus_id != :docId)`,
    { replacements: { sid: subjectId, docId: currentSyllabusDocId }, type: QueryTypes.SELECT }
  )).map(r => r.id);
  const oldSubtopicIds = (await sequelize.query(
    `SELECT id FROM subtopics WHERE subject_id = :sid AND (source_syllabus_id IS NULL OR source_syllabus_id != :docId)`,
    { replacements: { sid: subjectId, docId: currentSyllabusDocId }, type: QueryTypes.SELECT }
  )).map(r => r.id);

  if (oldTopicIds.length === 0 && oldSubtopicIds.length === 0) return [];

  const safeTopicIds    = oldTopicIds.length    ? oldTopicIds    : [-1];
  const safeSubtopicIds = oldSubtopicIds.length ? oldSubtopicIds : [-1];

  let whereClause, replacements;
  if (cfg.hasSubjectId) {
    const parts = [];
    if (cfg.hasTopicId)    parts.push('topic_id = ANY(:topicIds)');
    if (cfg.hasSubtopicId) parts.push('subtopic_id = ANY(:subtopicIds)');
    whereClause = `subject_id = :sid AND (${parts.join(' OR ')})`;
    replacements = { sid: subjectId, topicIds: safeTopicIds, subtopicIds: safeSubtopicIds };
  } else if (cfg.hasTopicId) {
    whereClause = `topic_id = ANY(:topicIds)`;
    replacements = { topicIds: safeTopicIds };
  } else {
    whereClause = `subtopic_id = ANY(:subtopicIds)`;
    replacements = { subtopicIds: safeSubtopicIds };
  }

  const selectCols = [
    'id', `${cfg.textCol} AS text_content`,
    cfg.hasTopicId    ? 'topic_id'    : 'NULL AS topic_id',
    cfg.hasSubtopicId ? 'subtopic_id' : 'NULL AS subtopic_id',
  ].join(', ');

  return sequelize.query(
    `SELECT ${selectCols} FROM ${cfg.table} WHERE ${whereClause}`,
    { replacements, type: QueryTypes.SELECT }
  );
}

function buildTreeDescription(newTree) {
  const lines = [];
  for (const t of newTree.topics) {
    lines.push(`TOPIC id=${t.id} level=1: ${t.title}`);
  }
  for (const st of newTree.subtopics) {
    const level = st.parent_subtopic_id ? 3 : 2;
    const parentLabel = st.parent_subtopic_id
      ? `parent_subtopic_id=${st.parent_subtopic_id}`
      : `topic_id=${st.topic_id}`;
    lines.push(`SUBTOPIC id=${st.id} level=${level} ${parentLabel}: ${st.title}`);
  }
  return lines.join('\n');
}

function buildPrompt(items, treeDescription) {
  const itemLines = items
    .map((it, i) => `[${i}] (${it._table}) ${String(it.text_content || '').slice(0, 300).replace(/\s+/g, ' ')}`)
    .join('\n');

  return `You are mapping existing educational content items onto a new, syllabus-derived topic tree for the same subject.

NEW TOPIC TREE (choose the single best-matching node per item, by its id):
${treeDescription}

ITEMS TO MAP (indexed [0], [1], ...):
${itemLines}

For EACH item, return the single best-matching tree node id, or state there is no confident match. Respond with ONLY a JSON object -- no markdown code fences, no commentary before or after -- in exactly this shape:
{
  "results": [
    { "index": 0, "node_id": <an id from the tree above, or null>, "confidence": <a number 0.0 to 1.0>, "no_confident_match": <true or false>, "rationale": "<one short sentence>" }
  ]
}
Include exactly one entry per item, in the same order as the items above. If you are not reasonably confident, set no_confident_match to true and node_id to null rather than guessing.`;
}

async function processBatch(items, newTree, subjectId, syllabusDocumentId) {
  const treeDescription = buildTreeDescription(newTree);
  const topicIds     = new Set(newTree.topics.map(t => t.id));
  const subtopicById = new Map(newTree.subtopics.map(s => [s.id, s]));

  const prompt = buildPrompt(items, treeDescription);

  let raw;
  try {
    raw = await generate(prompt, 'syllabus-remap-suggest');
  } catch (err) {
    console.error(`    [AI call FAILED] ${err.message} -- marking all ${items.length} item(s) in this batch as no_confident_match`);
    return items.map(item => noMatchRow(item, subjectId, syllabusDocumentId, `AI call failed: ${err.message}`));
  }

  // Same JSON-parsing shape as syllabusExtractor.js's own AI response
  // handling (Step 3's own instruction to reuse it, not invent a new one):
  // code-fence strip -> sanitizeAiJson -> JSON.parse.
  const cleaned = (raw || '').replace(/```json|```/g, '').trim();
  const sanitized = sanitizeAiJson(cleaned);

  let parsed;
  try {
    parsed = JSON.parse(sanitized);
  } catch (err) {
    console.error(`    [JSON parse FAILED] ${err.message} -- marking all ${items.length} item(s) in this batch as no_confident_match`);
    return items.map(item => noMatchRow(item, subjectId, syllabusDocumentId, `AI response could not be parsed: ${err.message}`));
  }

  const resultsByIndex = new Map(
    Array.isArray(parsed?.results) ? parsed.results.map(r => [r.index, r]) : []
  );

  return items.map((item, i) => {
    const r = resultsByIndex.get(i);
    if (!r || r.no_confident_match || r.node_id == null) {
      return noMatchRow(item, subjectId, syllabusDocumentId, r?.rationale || null);
    }

    // Untrusted AI output -- validate the returned node_id actually exists
    // in the tree we sent, rather than trusting it blindly.
    let suggestedTopicId = null, suggestedSubtopicId = null;
    if (topicIds.has(r.node_id)) {
      suggestedTopicId = r.node_id;
    } else if (subtopicById.has(r.node_id)) {
      suggestedSubtopicId = r.node_id;
      suggestedTopicId = subtopicById.get(r.node_id).topic_id;
    } else {
      return noMatchRow(item, subjectId, syllabusDocumentId, 'AI returned a node_id not present in the supplied tree');
    }

    return {
      subject_id: subjectId,
      syllabus_document_id: syllabusDocumentId,
      source_table: item._table,
      source_id: String(item.id),
      source_old_topic_id: item.topic_id || null,
      source_old_subtopic_id: item.subtopic_id || null,
      suggested_topic_id: suggestedTopicId,
      suggested_subtopic_id: suggestedSubtopicId,
      no_confident_match: false,
      confidence: Math.min(Math.max(Number(r.confidence) || 0, 0), 1),
      ai_rationale: String(r.rationale || '').slice(0, 500) || null,
    };
  });
}

function noMatchRow(item, subjectId, syllabusDocumentId, rationale) {
  return {
    subject_id: subjectId,
    syllabus_document_id: syllabusDocumentId,
    source_table: item._table,
    source_id: String(item.id),
    source_old_topic_id: item.topic_id || null,
    source_old_subtopic_id: item.subtopic_id || null,
    suggested_topic_id: null,
    suggested_subtopic_id: null,
    no_confident_match: true,
    confidence: null,
    ai_rationale: rationale ? String(rationale).slice(0, 500) : null,
  };
}

async function upsertSuggestions(rows) {
  for (const row of rows) {
    await sequelize.query(
      `INSERT INTO syllabus_remap_suggestions
         (subject_id, syllabus_document_id, source_table, source_id,
          source_old_topic_id, source_old_subtopic_id,
          suggested_topic_id, suggested_subtopic_id,
          no_confident_match, confidence, ai_rationale, generated_at)
       VALUES
         (:subject_id, :syllabus_document_id, :source_table, :source_id,
          :source_old_topic_id, :source_old_subtopic_id,
          :suggested_topic_id, :suggested_subtopic_id,
          :no_confident_match, :confidence, :ai_rationale, NOW())
       ON CONFLICT (syllabus_document_id, source_table, source_id)
       DO UPDATE SET
         suggested_topic_id    = EXCLUDED.suggested_topic_id,
         suggested_subtopic_id = EXCLUDED.suggested_subtopic_id,
         no_confident_match    = EXCLUDED.no_confident_match,
         confidence             = EXCLUDED.confidence,
         ai_rationale            = EXCLUDED.ai_rationale,
         generated_at             = NOW(),
         status                  = 'pending'`,
      { replacements: row, type: QueryTypes.INSERT }
    );
  }
}

async function main() {
  console.log('Syllabus remap suggestion generation -- DRY RUN (writes only to syllabus_remap_suggestions)\n');

  const subjects = await findConfirmedSubjects();
  if (subjects.length === 0) {
    console.log('No subject has a confirmed syllabus yet (syllabus_documents.status = \'confirmed\'). Nothing to do.');
    await sequelize.close();
    return;
  }

  console.log(`Found ${subjects.length} subject(s) with a confirmed syllabus:`);
  for (const s of subjects) console.log(`  - ${s.subject_name} (${s.exam_board_name})`);
  console.log('');

  const summary = [];

  for (const subj of subjects) {
    console.log(`=== ${subj.subject_name} (${subj.exam_board_name}) ===`);
    const newTree = await getNewTree(subj.syllabus_document_id);
    if (newTree.topics.length === 0) {
      console.log('  New tree is empty for this confirmed doc -- skipping (should not happen; flag for investigation).\n');
      continue;
    }

    let subjectTotal = 0, subjectNoMatch = 0, subjectHighConf = 0;

    for (const cfg of SOURCE_TABLES) {
      const rawItems = await getOldTreeItems(subj.subject_id, subj.syllabus_document_id, cfg);
      if (rawItems.length === 0) continue;
      const items = rawItems.map(it => ({ ...it, _table: cfg.table }));

      console.log(`  ${cfg.table}: ${items.length} old-tree item(s)`);

      for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const rows = await processBatch(batch, newTree, subj.subject_id, subj.syllabus_document_id);
        await upsertSuggestions(rows);
        subjectTotal    += rows.length;
        subjectNoMatch  += rows.filter(r => r.no_confident_match).length;
        subjectHighConf += rows.filter(r => !r.no_confident_match && r.confidence >= HIGH_CONFIDENCE_THRESHOLD).length;
      }
    }

    console.log(`  -> ${subjectTotal} suggestion(s), ${subjectHighConf} high-confidence (>= ${HIGH_CONFIDENCE_THRESHOLD}), ${subjectNoMatch} no-confident-match\n`);
    summary.push({ subject: subj.subject_name, examBoard: subj.exam_board_name, total: subjectTotal, highConf: subjectHighConf, noMatch: subjectNoMatch });
  }

  console.log('=== SUMMARY ===');
  if (summary.length === 0) {
    console.log('Every confirmed subject had zero old-tree items to remap -- nothing generated.');
  }
  for (const s of summary) {
    console.log(`${s.subject} (${s.examBoard}): ${s.total} total, ${s.highConf} high-confidence, ${s.noMatch} no-match`);
  }
  console.log('\nZero writes were made to resources/questions/videos/revision_notes/concepts.');
  console.log('All suggestions are in syllabus_remap_suggestions with status=\'pending\', awaiting Part 2 review.');

  await sequelize.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
