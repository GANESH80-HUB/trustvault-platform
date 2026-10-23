const { getDb } = require('../database');
const AuditService = require('../services/auditService');

function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      error: 'Authentication required. Please log in to proceed.'
    });
  }

  const db = getDb();
  const user = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(req.session.userId);

  if (!user) {
    req.session.destroy(() => {});
    return res.status(401).json({
      error: 'User account no longer exists'
    });
  }

  // Load active organization membership
  const membership = db.prepare(`
    SELECT m.role, o.id as organization_id, o.name as organization_name
    FROM organization_members m
    JOIN organizations o ON m.organization_id = o.id
    WHERE m.user_id = ? AND m.organization_id = ?
  `).get(user.id, req.session.organizationId);

  if (!membership) {
    return res.status(403).json({
      error: 'You do not have active membership in this organization'
    });
  }

  req.user = {
    id: user.id,
    email: user.email,
    fullName: user.full_name
  };

  req.membership = {
    organizationId: membership.organization_id,
    organizationName: membership.organization_name,
    role: membership.role
  };

  next();
}

function requireRole(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.membership || !allowedRoles.includes(req.membership.role)) {
      // Audit the unauthorized role attempt
      if (req.membership) {
        AuditService.log({
          organizationId: req.membership.organizationId,
          actorId: req.user ? req.user.id : null,
          actorEmail: req.user ? req.user.email : null,
          action: 'SECURITY_UNAUTHORIZED_ACCESS',
          resourceType: 'ROUTE',
          resourceId: req.originalUrl,
          status: 'FAILURE',
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
          details: {
            requiredRoles: allowedRoles,
            userRole: req.membership.role,
            method: req.method,
            path: req.path
          }
        });
      }

      return res.status(403).json({
        error: `Insufficient permissions. This operation requires one of the following roles: ${allowedRoles.join(', ')}`
      });
    }

    next();
  };
}

module.exports = {
  requireAuth,
  requireRole
};
