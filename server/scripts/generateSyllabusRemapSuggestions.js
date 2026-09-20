'use strict';
// server/scripts/generateSyllabusRemapSuggestions.js
//
// Syllabus-driven topic mapping — Prompt 4 Part 1: AI-suggestion generation,
// DRY RUN ONLY.
//
// WHAT THIS DOES: for every subject that has a confirmed syllabus-derived
// topic tree (syllabus_documents.status = 'confirmed'), finds TWO
// populations of existing content that need a home in the new tree:
//   1. Content pointing at that subject's OLD (pre-syllabus or superseded)
//      topics/subtopics -- the original population this script covered.
//   2. Resources that were never tagged at all (topic_id IS NULL AND
//      subtopic_id IS NULL) -- added after a real production audit found
//      55 such resources; ~34 sit in subjects that already have a
//      confirmed tree to assign into (see getOrphanedResources() below for
//      why this is resources-only, not all 5 source tables). The other ~21
//      either have no subject_id at all or belong to an inactive subject
//      -- confirm via the two SQL checks referenced in the commit for this
//      change before assuming this script's coverage is complete; those
//      21 need their own, separate handling if real, not a silent gap.
// For both populations: asks the AI hub for the single best-matching node
// in the NEW tree (or "no confident match"), and writes the suggestion to
// syllabus_remap_suggestions, tagged with origin = 'old_tree' or
// 'orphaned' respectively so the review UI can label them accurately --
// "outdated" and "never categorized" mean very different things to an
// admin reviewing these.
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
  { table: 'concepts',        textCol: 'title',          hasSubjectId: false, hasTopicId: false, hasSubtopicId: true  },
];

// Step 2.1: confidence is a 0.0-1.0 float (matches the NUMERIC(3,2) column
// in migration_034) rather than a coarse high/medium/low label -- Part 2's
// planned bulk-accept-high-confidence step needs a real numeric threshold
// (e.g. >= 0.85) to filter on. HIGH_CONFIDENCE_THRESHOLD is only used for
// this script's own summary counts below; Part 2 owns the real threshold.
const HIGH_CONFIDENCE_THRESHOLD = 0.85;

// Step 1 (orphaned-resources extension): resources-only, not all 5 source
// tables, because resources is the ONLY table with its own subject_id
// column. questions/videos/revision_notes/concepts all derive subject via
// a topic_id/subtopic_id join -- but that's exactly the column that's
// NULL for an orphaned item, so there is no way to even determine which
// subject an orphaned question/video/etc. belongs to. Those would need a
// content-based (title/text) subject classifier, a different and harder
// problem than "map this item onto its own subject's tree" -- explicitly
// out of scope here, not silently ignored.
async function findSubjectsWithOrphanedResourcesAndTopics(excludeSubjectIds) {
  const excluded = excludeSubjectIds.length ? excludeSubjectIds : [-1];
  return sequelize.query(
    `SELECT DISTINCT s.id AS subject_id, s.name AS subject_name, eb.name AS exam_board_name
       FROM subjects s
       JOIN exam_boards eb ON eb.id = s.exam_board_id
      WHERE s.is_active = true
        AND s.id NOT IN (:excluded)
        AND EXISTS (SELECT 1 FROM resources r WHERE r.subject_id = s.id AND r.topic_id IS NULL AND r.subtopic_id IS NULL)
        AND EXISTS (SELECT 1 FROM topics t WHERE t.subject_id = s.id AND t.is_active = true)`,
    { replacements: { excluded }, type: QueryTypes.SELECT }
  );
}

// Generic version of getNewTree() for a subject with NO confirmed syllabus
// document -- pulls every currently-active topic/subtopic for the subject
// directly, rather than filtering by source_syllabus_id (there is no
// syllabus document to filter by for this population). For a subject that
// DOES have a confirmed doc, getNewTree(syllabusDocumentId) above remains
// the correct, narrower call -- this function is only used for the 31
// (confirmed count from this session's production audit) subjects with no
// confirmed syllabus at all, via the loop in main() below.
async function getTreeForSubject(subjectId) {
  const topics = await sequelize.query(
    `SELECT id, name AS title FROM topics WHERE subject_id = :sid AND is_active = true ORDER BY order_index`,
    { replacements: { sid: subjectId }, type: QueryTypes.SELECT }
  );
  const subtopics = await sequelize.query(
    `SELECT id, topic_id, parent_subtopic_id, name AS title
       FROM subtopics WHERE subject_id = :sid AND is_active = true ORDER BY order_index`,
    { replacements: { sid: subjectId }, type: QueryTypes.SELECT }
  );
  return { topics, subtopics };
}

async function getOrphanedResources(subjectId) {
  return sequelize.query(
    `SELECT id, title AS text_content, NULL::int AS topic_id, NULL::int AS subtopic_id
       FROM resources
      WHERE subject_id = :sid AND topic_id IS NULL AND subtopic_id IS NULL AND is_active = true`,
    { replacements: { sid: subjectId }, type: QueryTypes.SELECT }
  );
}


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
    // BUG FIX: ANY(:namedParam) with a Sequelize named replacement holding
    // a plain JS array renders as a bare comma list (ANY(1, 2, 3)), which
    // is invalid SQL -- ANY() needs a real array expression. Confirmed
    // live in production: "syntax error at or near ','" on exactly this
    // query. IN (:param) is the correct, already-idiomatic replacement
    // used throughout the rest of this codebase (see
    // server/tests/no-any-named-replacement.test.js, the repo-wide
    // regression guard for this exact anti-pattern -- which did not catch
    // this file because its scan list didn't include server/scripts/;
    // fixed alongside this).
    if (cfg.hasTopicId)    parts.push('topic_id IN (:topicIds)');
    if (cfg.hasSubtopicId) parts.push('subtopic_id IN (:subtopicIds)');
    whereClause = `subject_id = :sid AND (${parts.join(' OR ')})`;
    replacements = { sid: subjectId, topicIds: safeTopicIds, subtopicIds: safeSubtopicIds };
  } else if (cfg.hasTopicId) {
    whereClause = `topic_id IN (:topicIds)`;
    replacements = { topicIds: safeTopicIds };
  } else {
    whereClause = `subtopic_id IN (:subtopicIds)`;
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

async function processBatch(items, newTree, subjectId, syllabusDocumentId, origin = 'old_tree') {
  const treeDescription = buildTreeDescription(newTree);
  const topicIds     = new Set(newTree.topics.map(t => t.id));
  const subtopicById = new Map(newTree.subtopics.map(s => [s.id, s]));

  const prompt = buildPrompt(items, treeDescription);

  let raw;
  try {
    raw = await generate(prompt, 'syllabus-remap-suggest');
  } catch (err) {
    console.error(`    [AI call FAILED] ${err.message} -- marking all ${items.length} item(s) in this batch as no_confident_match`);
    return items.map(item => noMatchRow(item, subjectId, syllabusDocumentId, `AI call failed: ${err.message}`, origin));
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
    return items.map(item => noMatchRow(item, subjectId, syllabusDocumentId, `AI response could not be parsed: ${err.message}`, origin));
  }

  const resultsByIndex = new Map(
    Array.isArray(parsed?.results) ? parsed.results.map(r => [r.index, r]) : []
  );

  return items.map((item, i) => {
    const r = resultsByIndex.get(i);
    if (!r || r.no_confident_match || r.node_id == null) {
      return noMatchRow(item, subjectId, syllabusDocumentId, r?.rationale || null, origin);
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
      return noMatchRow(item, subjectId, syllabusDocumentId, 'AI returned a node_id not present in the supplied tree', origin);
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
      origin,
    };
  });
}

function noMatchRow(item, subjectId, syllabusDocumentId, rationale, origin = 'old_tree') {
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
    origin,
  };
}

async function upsertSuggestions(rows) {
  for (const row of rows) {
    // Two different ON CONFLICT targets, matching migration_037's two real
    // unique constraints — Postgres requires the target to match a real
    // index, and there is no single index covering both the
    // syllabus_document_id-set population (the original, named
    // constraint) and the syllabus_document_id-NULL population (the new
    // partial index) at once. NULLs are never equal to each other for
    // uniqueness purposes in Postgres, so the original constraint alone
    // provides zero duplicate protection once syllabus_document_id can be
    // NULL — this branch, not just the nullable column change, is what
    // actually closes that gap.
    if (row.syllabus_document_id == null) {
      await sequelize.query(
        `INSERT INTO syllabus_remap_suggestions
           (subject_id, syllabus_document_id, source_table, source_id,
            source_old_topic_id, source_old_subtopic_id,
            suggested_topic_id, suggested_subtopic_id,
            no_confident_match, confidence, ai_rationale, origin, generated_at)
         VALUES
           (:subject_id, NULL, :source_table, :source_id,
            :source_old_topic_id, :source_old_subtopic_id,
            :suggested_topic_id, :suggested_subtopic_id,
            :no_confident_match, :confidence, :ai_rationale, :origin, NOW())
         ON CONFLICT (subject_id, source_table, source_id) WHERE syllabus_document_id IS NULL
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
    } else {
      await sequelize.query(
        `INSERT INTO syllabus_remap_suggestions
           (subject_id, syllabus_document_id, source_table, source_id,
            source_old_topic_id, source_old_subtopic_id,
            suggested_topic_id, suggested_subtopic_id,
            no_confident_match, confidence, ai_rationale, origin, generated_at)
         VALUES
           (:subject_id, :syllabus_document_id, :source_table, :source_id,
            :source_old_topic_id, :source_old_subtopic_id,
            :suggested_topic_id, :suggested_subtopic_id,
            :no_confident_match, :confidence, :ai_rationale, :origin, NOW())
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
}

async function main() {
  console.log('Syllabus remap suggestion generation -- DRY RUN (writes only to syllabus_remap_suggestions)\n');

  const confirmedSubjects = await findConfirmedSubjects();
  // Orphaned-resources extension: process every OTHER active subject that
  // has orphaned resources and a real active topic tree — NOT restricted
  // to confirmed-syllabus subjects. Confirmed subjects are excluded here
  // and handled inside the loop below instead (their orphaned resources
  // get syllabus_document_id set to that subject's own confirmed doc,
  // reusing the same row shape as old-tree suggestions, rather than the
  // NULL-syllabus_document_id path this second population uses) — this is
  // the "fold into the existing loop for those 2, new path for the rest"
  // choice, made explicitly rather than left as an open question.
  const orphanOnlySubjects = await findSubjectsWithOrphanedResourcesAndTopics(
    confirmedSubjects.map(s => s.subject_id)
  );

  // Confirmed via production query (18 / 0 respectively, this session):
  // resources with NO subject_id at all cannot go through ANY version of
  // this pipeline, which fundamentally needs a known subject to pick a
  // tree from — the query above already excludes them by construction
  // (it joins through subjects, so a NULL subject_id can never match),
  // but that exclusion needs to be visible, not just an implicit side
  // effect nobody would notice. Reported explicitly, not silently
  // dropped, per this feature's own explicit instruction on this point.
  const noSubjectRows = await sequelize.query(
    `SELECT COUNT(*)::int AS c FROM resources WHERE topic_id IS NULL AND subtopic_id IS NULL AND subject_id IS NULL`,
    { type: QueryTypes.SELECT }
  );
  const noSubjectCount = noSubjectRows[0].c;

  if (confirmedSubjects.length === 0 && orphanOnlySubjects.length === 0) {
    console.log('No subject has a confirmed syllabus, and no other subject has both orphaned resources and an active topic tree. Nothing to do.');
    if (noSubjectCount > 0) {
      console.log(`\nNOTE: ${noSubjectCount} resource(s) have no subject_id at all and are OUT OF SCOPE for this script entirely — they need separate, content-based (title/text) subject classification before anything here can apply to them. Not touched, not silently dropped.`);
    }
    await sequelize.close();
    return;
  }

  console.log(`Found ${confirmedSubjects.length} subject(s) with a confirmed syllabus, and ${orphanOnlySubjects.length} further subject(s) with orphaned resources against an existing (non-syllabus-derived) tree.`);
  if (noSubjectCount > 0) {
    console.log(`NOTE: ${noSubjectCount} further resource(s) have no subject_id at all and are OUT OF SCOPE for this script entirely — they need separate, content-based subject classification before anything here can apply to them. Not touched, not silently dropped.`);
  }
  console.log('');

  const summary = [];

  // ── Population 1: confirmed-syllabus subjects — old-tree items AND, in
  // the same pass, that subject's own orphaned resources against the same
  // real new tree. ──────────────────────────────────────────────────────
  for (const subj of confirmedSubjects) {
    console.log(`=== ${subj.subject_name} (${subj.exam_board_name}) [confirmed syllabus] ===`);
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
        const rows = await processBatch(batch, newTree, subj.subject_id, subj.syllabus_document_id, 'old_tree');
        await upsertSuggestions(rows);
        subjectTotal    += rows.length;
        subjectNoMatch  += rows.filter(r => r.no_confident_match).length;
        subjectHighConf += rows.filter(r => !r.no_confident_match && r.confidence >= HIGH_CONFIDENCE_THRESHOLD).length;
      }
    }

    // This subject's own orphaned resources (topic_id/subtopic_id both
    // NULL) — same confirmed tree, same syllabus_document_id, tagged
    // origin='orphaned' so the review UI can tell "outdated" from "never
    // categorized" apart, per migration_036's whole reason for existing.
    const orphanedResources = (await getOrphanedResources(subj.subject_id)).map(it => ({ ...it, _table: 'resources' }));
    if (orphanedResources.length > 0) {
      console.log(`  resources (orphaned, never tagged): ${orphanedResources.length} item(s)`);
      for (let i = 0; i < orphanedResources.length; i += BATCH_SIZE) {
        const batch = orphanedResources.slice(i, i + BATCH_SIZE);
        const rows = await processBatch(batch, newTree, subj.subject_id, subj.syllabus_document_id, 'orphaned');
        await upsertSuggestions(rows);
        subjectTotal    += rows.length;
        subjectNoMatch  += rows.filter(r => r.no_confident_match).length;
        subjectHighConf += rows.filter(r => !r.no_confident_match && r.confidence >= HIGH_CONFIDENCE_THRESHOLD).length;
      }
    }

    console.log(`  -> ${subjectTotal} suggestion(s), ${subjectHighConf} high-confidence (>= ${HIGH_CONFIDENCE_THRESHOLD}), ${subjectNoMatch} no-confident-match\n`);
    summary.push({ subject: subj.subject_name, examBoard: subj.exam_board_name, total: subjectTotal, highConf: subjectHighConf, noMatch: subjectNoMatch });
  }

  // ── Population 2: subjects with NO confirmed syllabus at all, but a
  // real active topic tree and orphaned resources sitting against it. ──
  for (const subj of orphanOnlySubjects) {
    console.log(`=== ${subj.subject_name} (${subj.exam_board_name}) [no confirmed syllabus — existing tree] ===`);
    const newTree = await getTreeForSubject(subj.subject_id);
    if (newTree.topics.length === 0) {
      console.log('  Active topic tree is empty -- skipping (should not happen given the EXISTS check; flag for investigation).\n');
      continue;
    }

    let subjectTotal = 0, subjectNoMatch = 0, subjectHighConf = 0;
    const orphanedResources = (await getOrphanedResources(subj.subject_id)).map(it => ({ ...it, _table: 'resources' }));

    console.log(`  resources (orphaned, never tagged): ${orphanedResources.length} item(s)`);
    for (let i = 0; i < orphanedResources.length; i += BATCH_SIZE) {
      const batch = orphanedResources.slice(i, i + BATCH_SIZE);
      // syllabus_document_id explicitly null — no document to attach to;
      // upsertSuggestions() branches on this to use the correct (partial-
      // index) ON CONFLICT target for this population.
      const rows = await processBatch(batch, newTree, subj.subject_id, null, 'orphaned');
      await upsertSuggestions(rows);
      subjectTotal    += rows.length;
      subjectNoMatch  += rows.filter(r => r.no_confident_match).length;
      subjectHighConf += rows.filter(r => !r.no_confident_match && r.confidence >= HIGH_CONFIDENCE_THRESHOLD).length;
    }

    console.log(`  -> ${subjectTotal} suggestion(s), ${subjectHighConf} high-confidence (>= ${HIGH_CONFIDENCE_THRESHOLD}), ${subjectNoMatch} no-confident-match\n`);
    summary.push({ subject: subj.subject_name, examBoard: subj.exam_board_name, total: subjectTotal, highConf: subjectHighConf, noMatch: subjectNoMatch });
  }

  console.log('=== SUMMARY ===');
  if (summary.length === 0) {
    console.log('Nothing generated -- every candidate subject had zero items to remap.');
  }
  for (const s of summary) {
    console.log(`${s.subject} (${s.examBoard}): ${s.total} total, ${s.highConf} high-confidence, ${s.noMatch} no-match`);
  }
  if (noSubjectCount > 0) {
    console.log(`\n${noSubjectCount} resource(s) with no subject_id at all were NOT processed -- out of scope for this script, needs separate content-based classification.`);
  }
  console.log('\nZero writes were made to resources/questions/videos/revision_notes/concepts.');
  console.log('All suggestions are in syllabus_remap_suggestions with status=\'pending\', awaiting review via the syllabus remap UI.');

  await sequelize.close();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
