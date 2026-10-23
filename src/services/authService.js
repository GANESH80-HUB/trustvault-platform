const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../database');
const Validator = require('../utils/validator');

class AuthService {
  /**
   * Registers a new user and either creates a new organization or joins an existing one
   */
  static async register({ email, password, fullName, organizationName }) {
    const cleanEmail = email ? email.trim().toLowerCase() : '';
    const cleanFullName = Validator.sanitizeString(fullName, 100);
    const cleanOrgName = Validator.sanitizeString(organizationName, 100);

    if (!Validator.isValidEmail(cleanEmail)) {
      throw { status: 400, message: 'Invalid email address format' };
    }

    if (!Validator.isValidPassword(password)) {
      throw { 
        status: 400, 
        message: 'Password must be at least 8 characters long and contain both letters and numbers' 
      };
    }

    if (!cleanFullName || cleanFullName.length < 2) {
      throw { status: 400, message: 'Full name must be at least 2 characters' };
    }

    if (!cleanOrgName || cleanOrgName.length < 2) {
      throw { status: 400, message: 'Organization name must be at least 2 characters' };
    }

    const db = getDb();

    // Check if email already in use
    const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existingUser) {
      throw { status: 409, message: 'An account with this email address already exists' };
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const userId = crypto.randomUUID();
    const memberId = crypto.randomUUID();

    // Run transaction
    const registerTx = db.transaction(() => {
      // Find or create organization
      let org = db.prepare('SELECT id, name FROM organizations WHERE name = ? COLLATE NOCASE').get(cleanOrgName);
      let userRole = 'admin'; // Default to admin if creating a new org

      if (!org) {
        const orgId = crypto.randomUUID();
        db.prepare('INSERT INTO organizations (id, name) VALUES (?, ?)').run(orgId, cleanOrgName);
        org = { id: orgId, name: cleanOrgName };
      } else {
        // Joining existing organization: set role to 'viewer' by default (or editor)
        userRole = 'viewer';
      }

      // Create user
      db.prepare(`
        INSERT INTO users (id, email, password_hash, full_name)
        VALUES (?, ?, ?, ?)
      `).run(userId, cleanEmail, passwordHash, cleanFullName);

      // Create membership
      db.prepare(`
        INSERT INTO organization_members (id, organization_id, user_id, role)
        VALUES (?, ?, ?, ?)
      `).run(memberId, org.id, userId, userRole);

      return {
        user: {
          id: userId,
          email: cleanEmail,
          fullName: cleanFullName
        },
        organization: {
          id: org.id,
          name: org.name,
          role: userRole
        }
      };
    });

    return registerTx();
  }

  /**
   * Authenticates user credentials and retrieves active membership
   */
  static async login({ email, password }) {
    const cleanEmail = email ? email.trim().toLowerCase() : '';

    if (!cleanEmail || !password) {
      throw { status: 400, message: 'Email and password are required' };
    }

    const db = getDb();
    const user = db.prepare(`
      SELECT id, email, password_hash, full_name
      FROM users
      WHERE email = ?
    `).get(cleanEmail);

    if (!user) {
      throw { status: 401, message: 'Invalid email or password' };
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      throw { status: 401, message: 'Invalid email or password' };
    }

    // Retrieve user's primary organization membership
    const membership = db.prepare(`
      SELECT m.id as member_id, m.role, o.id as organization_id, o.name as organization_name
      FROM organization_members m
      JOIN organizations o ON m.organization_id = o.id
      WHERE m.user_id = ?
      LIMIT 1
    `).get(user.id);

    if (!membership) {
      throw { status: 403, message: 'Account is not associated with any organization' };
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name
      },
      organization: {
        id: membership.organization_id,
        name: membership.organization_name,
        role: membership.role
      }
    };
  }

  /**
   * Fetches user profile and active organization by user ID
   */
  static getUserProfile(userId) {
    const db = getDb();
    const user = db.prepare('SELECT id, email, full_name, created_at FROM users WHERE id = ?').get(userId);
    if (!user) return null;

    const membership = db.prepare(`
      SELECT m.role, o.id as organization_id, o.name as organization_name
      FROM organization_members m
      JOIN organizations o ON m.organization_id = o.id
      WHERE m.user_id = ?
      LIMIT 1
    `).get(userId);

    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      createdAt: user.created_at,
      organization: membership ? {
        id: membership.organization_id,
        name: membership.organization_name,
        role: membership.role
      } : null
    };
  }
}

module.exports = AuthService;
