'use strict';

module.exports = (db) => {
  const {
    User,
    Subject,
    Topic,
    Subtopic,
    SubtopicProgress,
  } = db.models;

  // ─────────────────────────────────────────────
  // SUBJECT → TOPICS
  // ─────────────────────────────────────────────
  Subject.hasMany(Topic, {
    foreignKey: 'subject_id',
    onDelete: 'CASCADE',
  });

  Topic.belongsTo(Subject, {
    foreignKey: 'subject_id',
  });

  // ─────────────────────────────────────────────
  // TOPIC → SUBTOPICS
  // ─────────────────────────────────────────────
  Topic.hasMany(Subtopic, {
    foreignKey: 'topic_id',
    onDelete: 'CASCADE',
  });

  Subtopic.belongsTo(Topic, {
    foreignKey: 'topic_id',
  });

  // ─────────────────────────────────────────────
  // SUBJECT → SUBTOPICS (DENORMALIZED SUPPORT)
  // ─────────────────────────────────────────────
  Subject.hasMany(Subtopic, {
    foreignKey: 'subject_id',
    onDelete: 'CASCADE',
  });

  Subtopic.belongsTo(Subject, {
    foreignKey: 'subject_id',
  });

  // ─────────────────────────────────────────────
  // USER → SUBTOPIC PROGRESS
  // ─────────────────────────────────────────────
  User.hasMany(SubtopicProgress, {
    foreignKey: 'student_id',
    onDelete: 'CASCADE',
  });

  SubtopicProgress.belongsTo(User, {
    foreignKey: 'student_id',
  });

  // ─────────────────────────────────────────────
  // SUBTOPIC → PROGRESS
  // ─────────────────────────────────────────────
  Subtopic.hasMany(SubtopicProgress, {
    foreignKey: 'subtopic_id',
    onDelete: 'CASCADE',
  });

  SubtopicProgress.belongsTo(Subtopic, {
    foreignKey: 'subtopic_id',
  });
};
