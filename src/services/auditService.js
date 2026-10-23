const crypto = require('crypto');
const { getDb } = require('../database');

class AuditService {
  /**
   * Appends an immutable audit event
   */
  static log({
    organizationId,
    actorId = null,
    actorEmail = null,
    action,
    resourceType,
    resourceId = null,
    status = 'SUCCESS',
    ipAddress = null,
    userAgent = null,
    details = null
  }) {
    if (!organizationId) {
      console.warn('AuditService.log called without organizationId for action:', action);
      return null;
    }

    try {
      const db = getDb();
      const id = crypto.randomUUID();
      const detailsStr = details ? JSON.stringify(details) : null;

      const stmt = db.prepare(`
        INSERT INTO audit_events (
          id, organization_id, actor_id, actor_email, action,
          resource_type, resource_id, status, ip_address, user_agent, details
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        organizationId,
        actorId,
        actorEmail,
        action,
        resourceType,
        resourceId,
        status,
        ipAddress,
        userAgent,
        detailsStr
      );

      return id;
    } catch (err) {
      console.error('Failed to write audit event:', err.message);
      return null;
    }
  }

  /**
   * Retrieves audit logs scoped to a specific organization with filtering & pagination
   */
  static getLogs(organizationId, options = {}) {
    const db = getDb();
    const page = Math.max(1, parseInt(options.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = ['organization_id = ?'];
    const params = [organizationId];

    if (options.action) {
      conditions.push('action = ?');
      params.push(options.action);
    }

    if (options.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    if (options.actorEmail) {
      conditions.push('actor_email LIKE ?');
      params.push(`%${options.actorEmail}%`);
    }

    if (options.resourceType) {
      conditions.push('resource_type = ?');
      params.push(options.resourceType);
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const countRow = db.prepare(`SELECT COUNT(*) as total FROM audit_events WHERE ${whereClause}`).get(...params);
    const total = countRow ? countRow.total : 0;

    // Records
    const rows = db.prepare(`
      SELECT 
        id, organization_id, actor_id, actor_email, action,
        resource_type, resource_id, status, ip_address, user_agent,
        details, created_at
      FROM audit_events
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    // Parse JSON details safely
    const formatted = rows.map(r => {
      let parsedDetails = null;
      if (r.details) {
        try {
          parsedDetails = JSON.parse(r.details);
        } catch (_) {
          parsedDetails = r.details;
        }
      }
      return {
        ...r,
        details: parsedDetails
      };
    });

    return {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      events: formatted
    };
  }
}

module.exports = AuditService;
