const express = require('express');
const { getDb } = require('../database');
const { STORAGE_DIR } = require('../utils/config');
const fs = require('fs');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const db = getDb();
    const result = db.prepare('SELECT 1 as alive').get();
    const storageWritable = fs.existsSync(STORAGE_DIR);

    if (result && result.alive === 1 && storageWritable) {
      return res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptimeSeconds: Math.floor(process.uptime()),
        service: 'TrustVault',
        environment: process.env.NODE_ENV || 'development'
      });
    }

    return res.status(503).json({
      status: 'unhealthy',
      reason: 'Database or storage check failed'
    });
  } catch (err) {
    return res.status(503).json({
      status: 'unhealthy',
      error: err.message
    });
  }
});

module.exports = router;
