'use strict';

const express = require('express');
const router = express.Router();

const { protect } = require('../middleware/auth');

const learningEventService = require('../services/learningEventService');
const eventProcessorService = require('../services/eventProcessorService');

/**
 * -----------------------------------------------------
 * CREATE LEARNING EVENT
 * POST /api/events
 * -----------------------------------------------------
 */
router.post('/', protect, async (req, res) => {
  try {
    const studentId = req.user.id;

    const {
      subtopicId,
      eventType,
      payload,
    } = req.body;

    if (!subtopicId || !eventType) {
      return res.status(400).json({
        success: false,
        error: 'subtopicId and eventType required',
      });
    }

    // 1. Store raw event
    const event = await learningEventService.createEvent({
      studentId,
      subtopicId,
      eventType,
      payload,
    });

    // 2. Process event into progress engine
    const processed = await eventProcessorService.processEvent(
      event[0][0]
    );

    return res.json({
      success: true,
      event: event[0][0],
      processed,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Event processing failed',
    });
  }
});

/**
 * GET EVENTS (debug / analytics)
 */
router.get('/:subtopicId', protect, async (req, res) => {
  try {
    const studentId = req.user.id;
    const subtopicId = Number(req.params.subtopicId);

    const events = await learningEventService.getEvents(
      studentId,
      subtopicId
    );

    return res.json({
      success: true,
      data: events,
    });

  } catch (err) {
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch events',
    });
  }
});

module.exports = router;
