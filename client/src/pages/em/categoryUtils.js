// client/src/pages/em/categoryUtils.js
//
// dedupeCategories() — defensive frontend merge for the em_categories
// duplicate-row bug.
//
// ROOT CAUSE (fixed server-side in run_complete_migration.js +
// server/scripts/dedupe_em_categories.js): em_categories had no unique
// constraint on (name, difficulty), so every deploy re-inserted the 6
// seed categories, producing dozens of identical "Everyday British" rows
// in production. This helper makes the UI resilient to that regardless
// of whether the production cleanup script has been run yet — once it
// has, every group below will simply contain one category and this
// becomes a no-op pass-through.
//
// Used by LevelSection (dashboard grid + practice page) and EMDashboard
// (continue-learning / recommended derivations) so both stay in sync.

/**
 * Groups categories by (name, difficulty) and returns one merged entry
 * per group: the first category's display fields, plus aggregated
 * progress across every duplicate id in the group (max best_accuracy,
 * summed session_count) so a student's progress shows correctly no
 * matter which underlying duplicate row they historically practiced.
 *
 * @param {Array} categories       — raw list from GET /english-masterclass/categories
 * @param {Object} categoryProgress — map of category_id -> { best_accuracy, session_count }
 * @returns {Array} merged categories, each with _best, _sessionCount, _duplicateIds
 */
export function dedupeCategories(categories, categoryProgress = {}) {
  const order = [];
  const groups = new Map();

  for (const cat of categories || []) {
    const key = `${cat.name}__${cat.difficulty}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key).push(cat);
  }

  return order.map(key => {
    const group = groups.get(key);
    // Prefer the duplicate with the most words attached (most likely to be
    // the "real" fully-seeded copy); fall back to the first in API order.
    const rep = group.reduce((a, b) => (b.word_count > a.word_count ? b : a), group[0]);

    let best = null;
    let sessionCount = 0;
    for (const c of group) {
      const prog = categoryProgress?.[c.id];
      if (prog?.best_accuracy != null) {
        best = best === null ? prog.best_accuracy : Math.max(best, prog.best_accuracy);
      }
      if (prog?.session_count) sessionCount += prog.session_count;
    }

    return {
      ...rep,
      _best: best,
      _sessionCount: sessionCount,
      _duplicateIds: group.map(c => c.id),
    };
  });
}
