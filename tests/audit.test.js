const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, cleanDatabase } = require('./test-helper');

describe('Audit Trail & Immutability', () => {
  let adminAgent;

  beforeEach(async () => {
    cleanDatabase();
    adminAgent = request.agent(app);

    // 1. Register Admin
    await adminAgent
      .post('/api/auth/register')
      .send({
        email: 'auditor@enterprise.com',
        password: 'Password123!',
        fullName: 'Chief Auditor',
        organizationName: 'Enterprise Audit Org'
      });
  });

  test('should record audit events across document lifecycle', async () => {
    // 2. Upload document
    const uploadRes = await adminAgent
      .post('/api/documents')
      .attach('file', Buffer.from('Audit test document content'), 'audit_doc.pdf')
      .field('description', 'Test for audit trail');

    const docId = uploadRes.body.document.id;

    // 3. Download document
    await adminAgent.get(`/api/documents/${docId}/download`);

    // 4. Query audit logs
    const auditRes = await adminAgent.get('/api/audit');
    assert.equal(auditRes.status, 200);

    const actions = auditRes.body.events.map(e => e.action);
    assert.ok(actions.includes('AUTH_REGISTER'), 'Must include AUTH_REGISTER event');
    assert.ok(actions.includes('DOCUMENT_UPLOAD'), 'Must include DOCUMENT_UPLOAD event');
    assert.ok(actions.includes('DOCUMENT_DOWNLOAD'), 'Must include DOCUMENT_DOWNLOAD event');

    // Verify event structure
    const uploadEvent = auditRes.body.events.find(e => e.action === 'DOCUMENT_UPLOAD');
    assert.equal(uploadEvent.actor_email, 'auditor@enterprise.com');
    assert.equal(uploadEvent.status, 'SUCCESS');
    assert.equal(uploadEvent.resource_type, 'DOCUMENT');
    assert.equal(uploadEvent.resource_id, docId);
  });

  test('audit events cannot be modified or deleted via user-facing APIs', async () => {
    // Verify DELETE or PUT on /api/audit is rejected
    const deleteAttempt = await adminAgent.delete('/api/audit');
    assert.ok([404, 405].includes(deleteAttempt.status));

    const putAttempt = await adminAgent.put('/api/audit');
    assert.ok([404, 405].includes(putAttempt.status));
  });
});
