const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, cleanDatabase } = require('./test-helper');

describe('Multi-Tenant Data Isolation', () => {
  let alphaAgent, betaAgent;
  let alphaUser, betaUser;
  let alphaDocId;

  beforeEach(async () => {
    cleanDatabase();

    alphaAgent = request.agent(app);
    betaAgent = request.agent(app);

    // Register User in Organization Alpha
    const alphaReg = await alphaAgent
      .post('/api/auth/register')
      .send({
        email: 'ceo@alpha.com',
        password: 'Password123!',
        fullName: 'Alpha CEO',
        organizationName: 'Alpha Corporation'
      });
    alphaUser = alphaReg.body.user;

    // Register User in Organization Beta
    const betaReg = await betaAgent
      .post('/api/auth/register')
      .send({
        email: 'ceo@beta.com',
        password: 'Password123!',
        fullName: 'Beta CEO',
        organizationName: 'Beta Corporation'
      });
    betaUser = betaReg.body.user;

    // Alpha uploads a confidential document
    const uploadRes = await alphaAgent
      .post('/api/documents')
      .attach('file', Buffer.from('TOP SECRET ALPHA FINANCIAL REPORT'), 'alpha_confidential.txt')
      .field('description', 'Q4 Confidential Report for Alpha only');

    assert.equal(uploadRes.status, 201);
    alphaDocId = uploadRes.body.document.id;
  });

  test('Organization Beta cannot see Organization Alpha documents in list', async () => {
    const res = await betaAgent.get('/api/documents');
    assert.equal(res.status, 200);
    assert.equal(res.body.documents.length, 0, 'Beta organization must not see any Alpha documents');
  });

  test('Organization Beta cannot view metadata of Organization Alpha document', async () => {
    const res = await betaAgent.get(`/api/documents/${alphaDocId}`);
    assert.ok([403, 404].includes(res.status), 'Beta must receive 403 or 404 when querying Alpha document');
  });

  test('Organization Beta cannot download Organization Alpha document', async () => {
    const res = await betaAgent.get(`/api/documents/${alphaDocId}/download`);
    assert.ok([403, 404].includes(res.status), 'Beta must receive 403 or 404 when attempting to download Alpha document');
  });

  test('Organization Alpha cannot share document with a user belonging to another organization', async () => {
    const res = await alphaAgent
      .post(`/api/documents/${alphaDocId}/share`)
      .send({
        email: 'ceo@beta.com',
        permission: 'viewer'
      });

    assert.equal(res.status, 404, 'Sharing with user outside organization must be rejected');
    assert.match(res.body.error, /not a member of your organization/i);
  });
});
