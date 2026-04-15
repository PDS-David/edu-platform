'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');
const { protect, authorize } = require('../middleware/auth');

/* ================================
   ENSURE EXTRA COLUMNS
================================ */

async function ensureExtraColumns() {
  const alters = [
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_staged BOOLEAN DEFAULT false`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)`,
    `ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
  ];

  for (const sql of alters) {
    await sequelize.query(sql).catch(() => {});
  }
}

/* ================================
   GET /api/resources
================================ */

router.get('/', protect, async (req, res) => {

  await ensureExtraColumns();

  const filters = ['r.is_active = true'];
  const replacements = {};

  if (req.user.role === 'student') {

    filters.push(`
      (
        EXISTS (
          SELECT 1 FROM resource_user_assignments rua
          WHERE rua.resource_id = r.id
          AND rua.user_id = :uid
        )
        OR (
          r.topic_id IS NOT NULL
          AND COALESCE(r.is_staged, false) = false
          AND COALESCE(r.is_free, true) = true
        )
      )
    `);

    replacements.uid = req.user.id;
  }

  try {

    const rows = await sequelize.query(
`
SELECT
  r.id,
  r.title,
  r.file_url,
  r.resource_type,
  r.topic_id,
  r.subtopic_id,
  r.is_staged,
  s.name AS subject_name
FROM resources r
LEFT JOIN topics t ON r.topic_id = t.id
LEFT JOIN subjects s ON s.id = t.subject_id
WHERE ${filters.join(' AND ')}
ORDER BY r.created_at DESC
`,
      {
        replacements,
        type: QueryTypes.SELECT
      }
    );

    return res.json({
      success: true,
      count: rows.length,
      data: rows
    });

  } catch (err) {

    console.error(err);

    return res.json({
      success: true,
      count: 0,
      data: []
    });

  }

});

module.exports = router;
