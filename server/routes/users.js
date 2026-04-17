'use strict';

const express = require('express');
const router = express.Router();

const { QueryTypes } = require('sequelize');
const sequelize = require('../config/database');

const { protect, authorize } = require('../middleware/auth');
const { success, error, paginated } = require('../utils/response');

// ─────────────────────────────────────────────
// GET /api/users/stats
// ─────────────────────────────────────────────
router.get('/stats', protect, authorize('admin'), async (req
