const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { app, request, cleanDatabase } = require('./test-helper');

describe('Document Management & Storage Security', () => {
  let agent;

  beforeEach(async () => {
    cleanDatabase();
    agent = request.agent(app);

    await agent
      .post('/api/auth/register')
      .send({
        email: 'docadmin@trustvault.io',
        password: 'Password123!',
        fullName: 'Doc Admin',
        organizationName: 'Document Corp'
      });
  });

  test('should successfully upload a supported document and return metadata', async () => {
    const fileContent = 'Sensitive financial statements 2026';
    const uploadRes = await agent
      .post('/api/documents')
      .attach('file', Buffer.from(fileContent), 'statements_2026.pdf')
      .field('description', 'Official audit report');

    assert.equal(uploadRes.status, 201);
    assert.equal(uploadRes.body.success, true);
    assert.equal(uploadRes.body.document.originalName, 'statements_2026.pdf');
    assert.equal(uploadRes.body.document.mimeType, 'application/pdf');
    assert.equal(uploadRes.body.document.fileSize, Buffer.byteLength(fileContent));
  });

  test('should reject unauthorized file types (e.g., .exe)', async () => {
    const uploadRes = await agent
      .post('/api/documents')
      .attach('file', Buffer.from('binary-mock'), 'malware.exe')
      .field('description', 'Executable attempt');

    assert.equal(uploadRes.status, 400);
    assert.match(uploadRes.body.error, /file type not allowed/i);
  });

  test('should download uploaded document with proper content headers', async () => {
    const fileContent = 'Encrypted payload for testing download stream';
    const uploadRes = await agent
      .post('/api/documents')
      .attach('file', Buffer.from(fileContent), 'test_download.txt')
      .field('description', 'Download test');

    const docId = uploadRes.body.document.id;

    const downloadRes = await agent.get(`/api/documents/${docId}/download`);
    assert.equal(downloadRes.status, 200);
    assert.match(downloadRes.headers['content-disposition'], /attachment; filename="?test_download\.txt"?/i);
    assert.equal(downloadRes.text, fileContent);
  });

  test('should preview supported file inline', async () => {
    const fileContent = '# Markdown Readme Preview';
    const uploadRes = await agent
      .post('/api/documents')
      .attach('file', Buffer.from(fileContent), 'preview_doc.md')
      .field('description', 'Preview test');

    const docId = uploadRes.body.document.id;

    const previewRes = await agent.get(`/api/documents/${docId}/preview`);
    assert.equal(previewRes.status, 200);
    assert.match(previewRes.headers['content-disposition'], /inline; filename="preview_doc.md"/i);
    assert.equal(previewRes.text, fileContent);
  });

  test('should delete document and clean up physical storage file', async () => {
    const uploadRes = await agent
      .post('/api/documents')
      .attach('file', Buffer.from('Temporary file to be deleted'), 'delete_me.txt')
      .field('description', 'Deletion test');

    const docId = uploadRes.body.document.id;

    const deleteRes = await agent.delete(`/api/documents/${docId}`);
    assert.equal(deleteRes.status, 200);
    assert.equal(deleteRes.body.deleted, true);

    // Verify document can no longer be retrieved
    const getRes = await agent.get(`/api/documents/${docId}`);
    assert.equal(getRes.status, 404);
  });
});
