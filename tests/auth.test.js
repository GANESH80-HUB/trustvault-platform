const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, cleanDatabase } = require('./test-helper');

describe('Authentication & Session Management', () => {
  beforeEach(() => {
    cleanDatabase();
  });

  test('should successfully register a new user and organization as admin', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'alice@vaultcorp.com',
        password: 'Password123!',
        fullName: 'Alice Smith',
        organizationName: 'VaultCorp'
      });

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.user.email, 'alice@vaultcorp.com');
    assert.equal(res.body.organization.name, 'VaultCorp');
    assert.equal(res.body.organization.role, 'admin');
    assert.ok(res.headers['set-cookie']);
  });

  test('should reject registration with invalid email or short password', async () => {
    const invalidEmail = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'invalid-email',
        password: 'Password123!',
        fullName: 'Alice Smith',
        organizationName: 'VaultCorp'
      });

    assert.equal(invalidEmail.status, 400);

    const shortPass = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'alice@vaultcorp.com',
        password: 'short',
        fullName: 'Alice Smith',
        organizationName: 'VaultCorp'
      });

    assert.equal(shortPass.status, 400);
  });

  test('should prevent duplicate registration with existing email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'duplicate@vaultcorp.com',
        password: 'Password123!',
        fullName: 'First User',
        organizationName: 'VaultCorp'
      });

    const duplicateRes = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'duplicate@vaultcorp.com',
        password: 'Password123!',
        fullName: 'Second User',
        organizationName: 'VaultCorp'
      });

    assert.equal(duplicateRes.status, 409);
    assert.match(duplicateRes.body.error, /already exists/i);
  });

  test('should log in successfully with valid credentials and establish session', async () => {
    // Register first
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'bob@vaultcorp.com',
        password: 'Password123!',
        fullName: 'Bob Builder',
        organizationName: 'VaultCorp'
      });

    // Create a new agent to simulate clean client session
    const agent = request.agent(app);
    const loginRes = await agent
      .post('/api/auth/login')
      .send({
        email: 'bob@vaultcorp.com',
        password: 'Password123!'
      });

    assert.equal(loginRes.status, 200);
    assert.equal(loginRes.body.success, true);
    assert.equal(loginRes.body.user.email, 'bob@vaultcorp.com');

    // Check /api/auth/me using authenticated cookie
    const meRes = await agent.get('/api/auth/me');
    assert.equal(meRes.status, 200);
    assert.equal(meRes.body.authenticated, true);
    assert.equal(meRes.body.user.email, 'bob@vaultcorp.com');

    // Logout
    const logoutRes = await agent.post('/api/auth/logout');
    assert.equal(logoutRes.status, 200);

    // Verify session terminated
    const afterLogout = await agent.get('/api/auth/me');
    assert.equal(afterLogout.body.authenticated, false);
  });

  test('should reject login with wrong password and return 401', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({
        email: 'charlie@vaultcorp.com',
        password: 'Password123!',
        fullName: 'Charlie Green',
        organizationName: 'VaultCorp'
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'charlie@vaultcorp.com',
        password: 'WrongPassword999!'
      });

    assert.equal(loginRes.status, 401);
    assert.match(loginRes.body.error, /invalid email or password/i);
  });
});
