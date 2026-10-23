const express = require('express');
const OrganizationService = require('../services/organizationService');
const AuditService = require('../services/auditService');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// List members in current organization
router.get('/members', requireAuth, (req, res, next) => {
  try {
    const members = OrganizationService.getMembers(req.membership.organizationId);
    res.json({ members });
  } catch (err) {
    next(err);
  }
});

// Add member to organization (Admin only)
router.post('/members', requireAuth, requireRole(['admin']), (req, res, next) => {
  try {
    const { email, role } = req.body;
    const result = OrganizationService.addMember(req.membership.organizationId, { email, role });

    AuditService.log({
      organizationId: req.membership.organizationId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'MEMBER_ADD',
      resourceType: 'MEMBERSHIP',
      resourceId: result.memberId,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        addedEmail: result.email,
        assignedRole: result.role
      }
    });

    res.status(201).json({
      success: true,
      message: 'Member added to organization successfully',
      member: result
    });
  } catch (err) {
    next(err);
  }
});

// Update member role (Admin only)
router.patch('/members/:memberId', requireAuth, requireRole(['admin']), (req, res, next) => {
  try {
    const { memberId } = req.params;
    const { role } = req.body;

    const result = OrganizationService.updateMemberRole(req.membership.organizationId, memberId, role);

    AuditService.log({
      organizationId: req.membership.organizationId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'MEMBER_ROLE_CHANGE',
      resourceType: 'MEMBERSHIP',
      resourceId: memberId,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        targetUserEmail: result.email,
        oldRole: result.oldRole,
        newRole: result.newRole
      }
    });

    res.json({
      success: true,
      message: 'Member role updated successfully',
      member: result
    });
  } catch (err) {
    next(err);
  }
});

// Remove member from organization (Admin only)
router.delete('/members/:memberId', requireAuth, requireRole(['admin']), (req, res, next) => {
  try {
    const { memberId } = req.params;
    const result = OrganizationService.removeMember(req.membership.organizationId, memberId);

    AuditService.log({
      organizationId: req.membership.organizationId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'MEMBER_REMOVE',
      resourceType: 'MEMBERSHIP',
      resourceId: memberId,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        removedUserEmail: result.email
      }
    });

    res.json({
      success: true,
      message: 'Member removed from organization'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
