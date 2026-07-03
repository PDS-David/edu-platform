# Orphan question subtopic backfill (July 2026)

Source: `orphan_questions_classified_v3_REVIEWED.csv` (965 orphan questions, triaged in two passes).

## Files
- **backfill_orphan_question_subtopics.sql** (in `database/`, one level up) — transactional
  `UPDATE questions SET subtopic_id = ...` for the 582 rows we're confident about.
  Wrapped in `BEGIN`/`COMMIT`/`ROLLBACK` with a pre-flight existence check. Run it, check the
  printed count is 582, then `COMMIT;` (or `ROLLBACK;` if anything looks off).
- **orphan_questions_needs_review.csv** — 65 rows from review_tier 1–3 where no subtopic in
  `subtopics` actually matches the question content (gaps found: no Probability, Gas Laws,
  Radioactivity, Oxidation States, or human-anatomy/digestive-system subtopics anywhere in the
  taxonomy; a few "characteristics of living things" intro-Biology concepts too). Each row has a
  `flag` explaining the gap. These need either a new subtopic added to the curriculum, or a human
  decision to discard/repurpose the question.
- **orphan_questions_pending_other_tiers.csv** — 318 rows in review_tier
  4-WEAK_HINT_VERIFY / 5-FULL_REVIEW / 6-OFF_CURRICULUM_CHECK. Not touched by this pass —
  still belongs to whoever owns that batch.
- **orphan_questions_classified_v3_REVIEWED.csv** — full 965-row working file (all tiers, all
  columns) for reference/audit.

## What was NOT done
This SQL was generated and validated against the CSV + a read-only clone of the `Subtopic`/
`Question` Sequelize models, but it has **not been run against any database** — there was no
reachable DB connection from the environment that produced it. Run it yourself via
`psql $DATABASE_URL -f database/backfill_orphan_question_subtopics.sql` (or your usual migration
path) after reading it through once.

## Known caveat
Some of the 582 assignments are best-effort matches where the true subject didn't match the
CSV's `predicted_subject` (the automated classifier mislabeled subject for a meaningful chunk of
review_tier 3-PICK_FROM_SUBJECT — verify a sample before trusting predicted_subject elsewhere in
the pipeline). Rows with a lower-confidence match have a note in the `flag` column of the REVIEWED
csv explaining the reasoning — worth a spot-check before/after import.
