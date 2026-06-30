'use strict';

const express = require('express');
const router = express.Router();
const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

router.get('/', async (req, res) => {
  try {
    //  FIXED: removed "full_name"
    const examBoards = await sequelize.query(
      `SELECT id, code, name, icon_emoji
       FROM exam_boards
       WHERE is_active = true
       ORDER BY display_order ASC, name ASC`,
      { type: QueryTypes.SELECT }
    );

    if (examBoards.length === 0) {
      return res.status(200).json({ success: true, count: 0, data: [] });
    }

    const boardIds = examBoards.map(b => b.id);

    // PERF-1 FIX: the previous version issued one query per board for subjects,
    // then one query per subject for topics, then one query per topic for
    // subtopics — O(boards × subjects × topics) sequential round-trips, which
    // scales to thousands of queries on a real catalog. Replaced with exactly
    // 4 queries total (1 + 3 batched-by-parent-id), each scoped with
    // WHERE x = ANY(:ids), then grouped in memory. Response shape, field
    // names, and ordering (name ASC within each parent) are unchanged so no
    // consumer of this endpoint's JSON needs to change.
    let allSubjects = [];
    try {
      allSubjects = await sequelize.query(
        `SELECT id, name, code, subject_code, exam_board_id
         FROM subjects
         WHERE exam_board_id = ANY(:board_ids)
           AND is_active = true
         ORDER BY name ASC`,
        { replacements: { board_ids: boardIds }, type: QueryTypes.SELECT }
      );
    } catch (err) {
      console.error(' Subjects query failed:', err.message);
    }

    const subjectIds = allSubjects.map(s => s.id);

    let allTopics = [];
    if (subjectIds.length > 0) {
      try {
        allTopics = await sequelize.query(
          `SELECT id, name, subject_id
           FROM topics
           WHERE subject_id = ANY(:subject_ids)
           ORDER BY name ASC`,
          { replacements: { subject_ids: subjectIds }, type: QueryTypes.SELECT }
        );
      } catch (err) {
        console.error(' Topics query failed:', err.message);
      }
    }

    const topicIds = allTopics.map(t => t.id);

    let allSubtopics = [];
    if (topicIds.length > 0) {
      try {
        allSubtopics = await sequelize.query(
          `SELECT id, name, topic_id
           FROM subtopics
           WHERE topic_id = ANY(:topic_ids)
           ORDER BY name ASC`,
          { replacements: { topic_ids: topicIds }, type: QueryTypes.SELECT }
        );
      } catch (err) {
        console.error(' Subtopics query failed:', err.message);
      }
    }

    // Group in memory — preserves the exact nested shape the old code built,
    // including per-parent ORDER BY name ASC carried through from each query.
    const subtopicsByTopic = new Map();
    for (const st of allSubtopics) {
      const key = st.topic_id;
      if (!subtopicsByTopic.has(key)) subtopicsByTopic.set(key, []);
      subtopicsByTopic.get(key).push({ id: st.id, name: st.name });
    }

    const topicsBySubject = new Map();
    for (const t of allTopics) {
      const key = t.subject_id;
      if (!topicsBySubject.has(key)) topicsBySubject.set(key, []);
      topicsBySubject.get(key).push({
        id: t.id,
        name: t.name,
        subtopics: subtopicsByTopic.get(t.id) || [],
      });
    }

    const subjectsByBoard = new Map();
    for (const s of allSubjects) {
      const key = s.exam_board_id;
      if (!subjectsByBoard.has(key)) subjectsByBoard.set(key, []);
      subjectsByBoard.get(key).push({
        id: s.id,
        name: s.name,
        code: s.code,
        subject_code: s.subject_code,
        topics: topicsBySubject.get(s.id) || [],
      });
    }

    const curriculum = examBoards.map(board => ({
      ...board,
      subjects: subjectsByBoard.get(board.id) || [],
    }));

    return res.status(200).json({
      success: true,
      count: curriculum.length,
      data: curriculum,
    });

  } catch (error) {
    console.error(' FULL ERROR in /api/curriculum:', error);

    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to load curriculum',
    });
  }
});

module.exports = router;
