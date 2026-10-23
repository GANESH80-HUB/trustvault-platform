const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, cleanDatabase } = require('./test-helper');

describe('Role-Based Access Control (Admin, Editor, Viewer)', () => {
  let adminAgent, editorAgent, viewerAgent;

  beforeEach(async () => {
    cleanDatabase();

    adminAgent = request.agent(app);
    editorAgent = request.agent(app);
    viewerAgent = request.agent(app);

    // 1. Admin registers the organization
    await adminAgent
      .post('/api/auth/register')
      .send({
        email: 'admin@apex.com',
        password: 'Password123!',
        fullName: 'Admin User',
        organizationName: 'Apex Security'
      });

    // 2. Editor registers and gets added by admin
    await editorAgent
      .post('/api/auth/register')
      .send({
        email: 'editor@apex.com',
        password: 'Password123!',
        fullName: 'Editor User',
        organizationName: 'Apex Security' // joins Apex Security
      });

    // Admin updates editor's role to 'editor'
    const membersRes = await adminAgent.get('/api/organizations/members');
    const editorMember = membersRes.body.members.find(m => m.email === 'editor@apex.com');
    await adminAgent
      .patch(`/api/organizations/members/${editorMember.member_id}`)
      .send({ role: 'editor' });

    // 3. Viewer registers (default role is 'viewer')
    await viewerAgent
      .post('/api/auth/register')
      .send({
        email: 'viewer@apex.com',
        password: 'Password123!',
        fullName: 'Viewer User',
        organizationName: 'Apex Security'
      });
  });

  test('Viewer cannot upload documents (returns 403)', async () => {
    const res = await viewerAgent
      .post('/api/documents')
      .attach('file', Buffer.from('Viewer document content'), 'viewer_doc.txt')
      .field('description', 'Attempted viewer upload');

    assert.equal(res.status, 403);
    assert.match(res.body.error, /insufficient permissions/i);
  });

  test('Viewer cannot view audit trail (returns 403)', async () => {
    const res = await viewerAgent.get('/api/audit');
    assert.equal(res.status, 403);
  });

  test('Viewer cannot modify member roles (returns 403)', async () => {
    const res = await viewerAgent
      .post('/api/organizations/members')
      .send({ email: 'new@apex.com', role: 'editor' });

    assert.equal(res.status, 403);
  });

  test('Editor can upload documents', async () => {
    const res = await editorAgent
      .post('/api/documents')
      .attach('file', Buffer.from('Editor report draft'), 'editor_draft.txt')
      .field('description', 'Draft document uploaded by editor');

    assert.equal(res.status, 201);
    assert.equal(res.body.document.originalName, 'editor_draft.txt');
  });

  test('Editor cannot view administrative audit logs', async () => {
    const res = await editorAgent.get('/api/audit');
    assert.equal(res.status, 403);
  });

  test('Admin can access audit logs and manage members', async () => {
    const auditRes = await adminAgent.get('/api/audit');
    assert.equal(auditRes.status, 200);
    assert.ok(Array.isArray(auditRes.body.events));

    const membersRes = await adminAgent.get('/api/organizations/members');
    assert.equal(membersRes.status, 200);
    assert.equal(membersRes.body.members.length, 3);
  });
});
