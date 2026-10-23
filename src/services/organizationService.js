const crypto = require('crypto');
const { getDb } = require('../database');
const Validator = require('../utils/validator');

class OrganizationService {
  /**
   * Retrieves all members of an organization
   */
  static getMembers(organizationId) {
    const db = getDb();
    return db.prepare(`
      SELECT 
        m.id as member_id,
        m.role,
        m.created_at as joined_at,
        u.id as user_id,
        u.email,
        u.full_name
      FROM organization_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.organization_id = ?
      ORDER BY 
        CASE m.role 
          WHEN 'admin' THEN 1 
          WHEN 'editor' THEN 2 
          WHEN 'viewer' THEN 3 
        END,
        u.full_name ASC
    `).all(organizationId);
  }

  /**
   * Adds an existing user by email to the organization
   */
  static addMember(organizationId, { email, role = 'viewer' }) {
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const validRoles = ['admin', 'editor', 'viewer'];

    if (!Validator.isValidEmail(cleanEmail)) {
      throw { status: 400, message: 'Invalid email address format' };
    }

    if (!validRoles.includes(role)) {
      throw { status: 400, message: `Invalid role. Allowed roles: ${validRoles.join(', ')}` };
    }

    const db = getDb();
    const user = db.prepare('SELECT id, email, full_name FROM users WHERE email = ?').get(cleanEmail);
    if (!user) {
      throw { status: 404, message: 'No registered user found with that email address. The user must register first.' };
    }

    const existingMember = db.prepare(`
      SELECT id, role FROM organization_members 
      WHERE organization_id = ? AND user_id = ?
    `).get(organizationId, user.id);

    if (existingMember) {
      throw { status: 409, message: 'User is already a member of this organization' };
    }

    const memberId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO organization_members (id, organization_id, user_id, role)
      VALUES (?, ?, ?, ?)
    `).run(memberId, organizationId, user.id, role);

    return {
      memberId,
      userId: user.id,
      email: user.email,
      fullName: user.full_name,
      role
    };
  }

  /**
   * Updates an organization member's role
   */
  static updateMemberRole(organizationId, memberId, newRole) {
    const validRoles = ['admin', 'editor', 'viewer'];
    if (!validRoles.includes(newRole)) {
      throw { status: 400, message: `Invalid role. Allowed roles: ${validRoles.join(', ')}` };
    }

    const db = getDb();
    const member = db.prepare(`
      SELECT m.id, m.role, m.user_id, u.email 
      FROM organization_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.id = ? AND m.organization_id = ?
    `).get(memberId, organizationId);

    if (!member) {
      throw { status: 404, message: 'Member not found in this organization' };
    }

    // Guard: Prevent demoting the last admin
    if (member.role === 'admin' && newRole !== 'admin') {
      const adminCount = db.prepare(`
        SELECT COUNT(*) as count FROM organization_members
        WHERE organization_id = ? AND role = 'admin'
      `).get(organizationId).count;

      if (adminCount <= 1) {
        throw { status: 400, message: 'Cannot demote the only remaining administrator in the organization' };
      }
    }

    db.prepare('UPDATE organization_members SET role = ? WHERE id = ?').run(newRole, memberId);

    return {
      memberId: member.id,
      userId: member.user_id,
      email: member.email,
      oldRole: member.role,
      newRole
    };
  }

  /**
   * Removes a member from the organization
   */
  static removeMember(organizationId, memberId) {
    const db = getDb();
    const member = db.prepare(`
      SELECT m.id, m.role, m.user_id, u.email
      FROM organization_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.id = ? AND m.organization_id = ?
    `).get(memberId, organizationId);

    if (!member) {
      throw { status: 404, message: 'Member not found in this organization' };
    }

    if (member.role === 'admin') {
      const adminCount = db.prepare(`
        SELECT COUNT(*) as count FROM organization_members
        WHERE organization_id = ? AND role = 'admin'
      `).get(organizationId).count;

      if (adminCount <= 1) {
        throw { status: 400, message: 'Cannot remove the only remaining administrator in the organization' };
      }
    }

    db.prepare('DELETE FROM organization_members WHERE id = ?').run(memberId);

    return {
      removed: true,
      userId: member.user_id,
      email: member.email
    };
  }
}

module.exports = OrganizationService;
