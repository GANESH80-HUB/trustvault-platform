const path = require('path');
const fs = require('fs');
const request = require('supertest');

// Set test environment variables BEFORE importing app
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-secret-key-12345678901234567890';
const testDataDir = path.resolve(__dirname, '../data_test');
process.env.DATA_DIR = testDataDir;
process.env.DB_PATH = path.join(testDataDir, 'test.db');
process.env.STORAGE_DIR = path.join(testDataDir, 'private_storage');

if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}
if (!fs.existsSync(process.env.STORAGE_DIR)) {
  fs.mkdirSync(process.env.STORAGE_DIR, { recursive: true });
}

const app = require('../src/server');
const { getDb } = require('../src/database');

function cleanDatabase() {
  const db = getDb();
  // Clear tables in reverse dependency order
  db.exec(`
    DELETE FROM audit_events;
    DELETE FROM document_shares;
    DELETE FROM documents;
    DELETE FROM organization_members;
    DELETE FROM sessions;
    DELETE FROM users;
    DELETE FROM organizations;
  `);

  // Clean test files from storage
  const storageFiles = fs.readdirSync(process.env.STORAGE_DIR);
  for (const file of storageFiles) {
    if (file !== '.gitkeep') {
      try {
        fs.unlinkSync(path.join(process.env.STORAGE_DIR, file));
      } catch (_) {}
    }
  }
}

module.exports = {
  app,
  request,
  cleanDatabase,
  getDb
};
