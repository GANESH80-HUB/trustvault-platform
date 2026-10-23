const express = require('express');
const AuthService = require('../services/authService');
const AuditService = require('../services/auditService');
const { requireAuth } = require('../middleware/auth');
const { getDb } = require('../database');

const router = express.Router();

// Register new user & organization
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, fullName, organizationName } = req.body;
    const result = await AuthService.register({ email, password, fullName, organizationName });

    // Save session
    req.session.userId = result.user.id;
    req.session.organizationId = result.organization.id;

    // Log registration audit event
    AuditService.log({
      organizationId: result.organization.id,
      actorId: result.user.id,
      actorEmail: result.user.email,
      action: 'AUTH_REGISTER',
      resourceType: 'USER',
      resourceId: result.user.id,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        organizationName: result.organization.name,
        role: result.organization.role
      }
    });

    res.status(201).json({
      success: true,
      message: 'Account successfully registered',
      user: result.user,
      organization: result.organization
    });
  } catch (err) {
    next(err);
  }
});

// Login
router.post('/login', async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const result = await AuthService.login({ email, password });

    // Store session identifiers
    req.session.userId = result.user.id;
    req.session.organizationId = result.organization.id;

    // Log successful login
    AuditService.log({
      organizationId: result.organization.id,
      actorId: result.user.id,
      actorEmail: result.user.email,
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'AUTH',
      resourceId: result.user.id,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });

    res.json({
      success: true,
      message: 'Login successful',
      user: result.user,
      organization: result.organization
    });
  } catch (err) {
    // Attempt to log failed login attempt if org can be determined
    try {
      const db = getDb();
      const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email ? email.trim().toLowerCase() : '');
      if (existingUser) {
        const mem = db.prepare('SELECT organization_id FROM organization_members WHERE user_id = ? LIMIT 1').get(existingUser.id);
        if (mem) {
          AuditService.log({
            organizationId: mem.organization_id,
            actorId: existingUser.id,
            actorEmail: email,
            action: 'AUTH_LOGIN_FAILED',
            resourceType: 'AUTH',
            resourceId: existingUser.id,
            status: 'FAILURE',
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
            details: { reason: err.message }
          });
        }
      }
    } catch (_) {}

    next(err);
  }
});

// Logout
router.post('/logout', (req, res) => {
  if (req.session && req.session.userId) {
    const userId = req.session.userId;
    const orgId = req.session.organizationId;

    if (orgId) {
      AuditService.log({
        organizationId: orgId,
        actorId: userId,
        action: 'AUTH_LOGOUT',
        resourceType: 'AUTH',
        resourceId: userId,
        status: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });
    }

    req.session.destroy(err => {
      res.clearCookie('trustvault.sid');
      if (err) {
        return res.status(500).json({ error: 'Failed to terminate session' });
      }
      return res.json({ success: true, message: 'Logged out successfully' });
    });
  } else {
    return res.json({ success: true, message: 'Already logged out' });
  }
});

// Current session profile
router.get('/me', (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.json({ authenticated: false });
  }

  const profile = AuthService.getUserProfile(req.session.userId);
  if (!profile) {
    return res.json({ authenticated: false });
  }

  res.json({
    authenticated: true,
    user: {
      id: profile.id,
      email: profile.email,
      fullName: profile.fullName
    },
    organization: profile.organization
  });
});

module.exports = router;
