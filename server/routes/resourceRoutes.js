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
UPLOAD DIRECTORY
================================ */

const UPLOADS_DIR =
path.join(__dirname, '..', 'uploads', 'resources');

if (!fs.existsSync(UPLOADS_DIR)) {
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/* ================================
MULTER CONFIG
================================ */

const storage = multer.diskStorage({
destination: (_req, _file, cb) =>
cb(null, UPLOADS_DIR),

filename: (_req, file, cb) => {
const unique =
`${Date.now()}-${Math.round(Math.random() * 1e6)}`;

```
cb(null,
  unique + path.extname(file.originalname));
```

}
});

const upload =
multer({
storage,
limits: {
fileSize: 500 * 1024 * 1024
}
});

/* ================================
ENSURE EXTRA COLUMNS
================================ */

let columnsEnsured = false;

async function ensureExtraColumns() {

if (columnsEnsured) return;

const alters = [

```
`ALTER TABLE resources
 ADD COLUMN IF NOT EXISTS is_staged BOOLEAN DEFAULT false`,

`ALTER TABLE resources
 ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`,

`ALTER TABLE resources
 ADD COLUMN IF NOT EXISTS original_filename VARCHAR(255)`,

`ALTER TABLE resources
 ADD COLUMN IF NOT EXISTS mime_type VARCHAR(120)`,

`ALTER TABLE resources
 ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW()`
```

];

for (const sql of alters) {

```
try {
  await sequelize.query(sql);
}
catch (err) {
  console.warn('[ensureExtraColumns]', err.message);
}
```

}

columnsEnsured = true;
}

/* ================================
RESOURCE TYPE DETECTOR
================================ */

function guessResourceType(originalname) {

const ext =
path.extname(originalname).toLowerCase();

if (['.mp4','.mov','.webm','.avi'].includes(ext))
return 'video';

if (['.mp3','.wav','.ogg','.m4a','.aac'].includes(ext))
return 'audio';

if (ext === '.pdf')
return 'pdf';

if (['.jpg','.jpeg','.png','.gif','.webp'].includes(ext))
return 'image';

if (['.ppt','.pptx'].includes(ext))
return 'presentation';

return 'document';
}

/* ================================
RESOURCE ASSIGNMENT TABLE
================================ */

let raEnsured = false;

async function ensureResourceAssignments() {

if (raEnsured) return;

try {

```
await sequelize.query(`

  CREATE TABLE IF NOT EXISTS resource_assignments (

    id UUID PRIMARY KEY
       DEFAULT gen_random_uuid(),

    resource_id INTEGER NOT NULL
      REFERENCES resources(id)
      ON DELETE CASCADE,

    assigned_by UUID NOT NULL
      REFERENCES users(id),

    student_id UUID
      REFERENCES users(id)
      ON DELETE CASCADE,

    class_id UUID
      REFERENCES classes(id)
      ON DELETE CASCADE,

    push_type VARCHAR(50)
      DEFAULT 'learning_material',

    assigned_at TIMESTAMPTZ
      DEFAULT NOW(),

    CONSTRAINT ra_target_check
      CHECK (
        student_id IS NOT NULL
        OR class_id IS NOT NULL
      )
  );

`);

await sequelize.query(`

  ALTER TABLE resource_assignments
  ADD CONSTRAINT IF NOT EXISTS
  uq_resource_student

  UNIQUE (
    resource_id,
    student_id,
    push_type
  );

`);

await sequelize.query(`

  ALTER TABLE resource_assignments
  ADD CONSTRAINT IF NOT EXISTS
  uq_resource_class

  UNIQUE (
    resource_id,
    class_id,
    push_type
  );

`);
```

}
catch (err) {

```
console.error(
  '[ensureResourceAssignments]',
  err.message
);
```

}

raEnsured = true;
}

/* ================================
BASIC HEALTH CHECK
================================ */

router.get(
'/health',
(_req, res) => {

```
res.json({
  success: true
});
```

}
);

/* ================================
ASSIGN USERS
================================ */

router.put(
'/:id/assign-users',

protect,
authorize('admin','teacher'),

async (req,res) => {

```
await ensureResourceAssignments();

const resourceId =
  parseInt(req.params.id);

if (!resourceId)
  return res.status(400)
    .json({
      success:false,
      error:'Invalid resource id'
    });

const {

  user_ids = [],
  class_ids = [],
  assign_all = false,
  push_type = 'learning_material'

} = req.body;

try {

  let studentIds = [...user_ids];

  /* EXPAND assign_all */

  if (assign_all) {

    const students =
      await sequelize.query(

        `SELECT id
         FROM users
         WHERE role='student'
         AND is_active=true`,

        { type: QueryTypes.SELECT }
      );

    studentIds =
      students.map(s => s.id);
  }

  /* EXPAND class_ids */

  if (class_ids.length > 0) {

    const members =
      await sequelize.query(

        `SELECT student_id
         FROM class_memberships
         WHERE class_id = ANY(:classIds)`,

        {
          replacements: {
            classIds: class_ids
          },

          type: QueryTypes.SELECT
        }
      );

    const ids =
      members.map(m => m.student_id);

    studentIds =
      [...new Set([
        ...studentIds,
        ...ids
      ])];
  }

  /* INSERT STUDENTS */

  let insertedStudents = 0;

  for (const sid of studentIds) {

    try {

      await sequelize.query(

        `INSERT INTO resource_assignments
         (resource_id,assigned_by,student_id,push_type)

         VALUES
         (:rid,:by,:sid,:pt)

         ON CONFLICT DO NOTHING`,

        {
          replacements: {

            rid: resourceId,
            by: req.user.id,
            sid,
            pt: push_type

          },

          type: QueryTypes.INSERT
        }
      );

      insertedStudents++;

    }
    catch (err) {

      console.warn(
        '[assign student]',
        err.message
      );
    }
  }

  /* INSERT CLASSES */

  let insertedClasses = 0;

  for (const cid of class_ids) {

    try {

      await sequelize.query(

        `INSERT INTO resource_assignments
         (resource_id,assigned_by,class_id,push_type)

         VALUES
         (:rid,:by,:cid,:pt)

         ON CONFLICT DO NOTHING`,

        {
          replacements: {

            rid: resourceId,
            by: req.user.id,
            cid,
            pt: push_type

          },

          type: QueryTypes.INSERT
        }
      );

      insertedClasses++;

    }
    catch (err) {

      console.warn(
        '[assign class]',
        err.message
      );
    }
  }

  return res.json({

    success: true,

    student_count:
      insertedStudents,

    class_count:
      insertedClasses
  });

}
catch (err) {

  console.error(
    '[assign-users]',
    err.message
  );

  return res.status(500)
    .json({
      success:false,
      error:err.message
    });
}
```

}
);

module.exports = router;
