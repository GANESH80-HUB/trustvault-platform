const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, cleanDatabase } = require('./test-helper');

describe('Document Sharing & Access Revocation', () => {
  let adminAgent, viewerAgent;
  let docId;

  beforeEach(async () => {
    cleanDatabase();
    adminAgent = request.agent(app);
    viewerAgent = request.agent(app);

    // Register Admin
    await adminAgent
      .post('/api/auth/register')
      .send({
        email: 'admin@shares.com',
        password: 'Password123!',
        fullName: 'Admin Sharer',
        organizationName: 'Shares Inc'
      });

    // Register Viewer in same org
    await viewerAgent
      .post('/api/auth/register')
      .send({
        email: 'viewer@shares.com',
        password: 'Password123!',
        fullName: 'Viewer Recipient',
        organizationName: 'Shares Inc'
      });

    // Admin uploads document
    const uploadRes = await adminAgent
      .post('/api/documents')
      .attach('file', Buffer.from('Confidential Shared Data'), 'shared_contract.pdf')
      .field('description', 'Client contract');

    docId = uploadRes.body.document.id;
  });

  test('Viewer initially cannot access unshared document', async () => {
    const listRes = await viewerAgent.get('/api/documents');
    assert.equal(listRes.body.documents.length, 0);

    const getRes = await viewerAgent.get(`/api/documents/${docId}`);
    assert.ok([403, 404].includes(getRes.status));
  });

  test('Viewer gains access after document is shared, and loses access when revoked', async () => {
    // 1. Admin shares document with viewer
    const shareRes = await adminAgent
      .post(`/api/documents/${docId}/share`)
      .send({
        email: 'viewer@shares.com',
        permission: 'viewer'
      });

    assert.equal(shareRes.status, 200);
    assert.equal(shareRes.body.share.sharedWith.email, 'viewer@shares.com');
    const shareId = shareRes.body.share.shareId;

    // 2. Viewer can now list and download document
    const viewerList = await viewerAgent.get('/api/documents');
    assert.equal(viewerList.body.documents.length, 1);
    assert.equal(viewerList.body.documents[0].id, docId);

    const downloadRes = await viewerAgent.get(`/api/documents/${docId}/download`);
    assert.equal(downloadRes.status, 200);
    const content = downloadRes.text || downloadRes.body.toString();
    assert.equal(content, 'Confidential Shared Data');

    // 3. Admin revokes access
    const revokeRes = await adminAgent.delete(`/api/documents/${docId}/share/${shareId}`);
    assert.equal(revokeRes.status, 200);
    assert.equal(revokeRes.body.success, true);

    // 4. Viewer can no longer access document
    const listAfterRevoke = await viewerAgent.get('/api/documents');
    assert.equal(listAfterRevoke.body.documents.length, 0);

    const downloadAfterRevoke = await viewerAgent.get(`/api/documents/${docId}/download`);
    assert.ok([403, 404].includes(downloadAfterRevoke.status));
  });
});
