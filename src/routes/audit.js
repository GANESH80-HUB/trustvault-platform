const express = require('express');
const AuditService = require('../services/auditService');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get organization audit trail (Admin only)
router.get('/', requireAuth, requireRole(['admin']), (req, res, next) => {
  try {
    const { page, limit, action, actorEmail, status, resourceType } = req.query;

    const result = AuditService.getLogs(req.membership.organizationId, {
      page,
      limit,
      action,
      actorEmail,
      status,
      resourceType
    });

    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
