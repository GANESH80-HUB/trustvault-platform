const Database = require('better-sqlite3');
const { DB_PATH } = require('./utils/config');

let dbInstance = null;

function getDb(customPath = null) {
  if (customPath) {
    const db = new Database(customPath);
    setupPragmasAndSchema(db);
    return db;
  }

  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    setupPragmasAndSchema(dbInstance);
  }

  return dbInstance;
}

function setupPragmasAndSchema(db) {
  // Enforce foreign key constraints and performance tuning
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  // Relational Schema Migration
  db.exec(`
    -- Organizations (Multi-tenant boundary)
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Users
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Organization Memberships (RBAC & multi-tenancy mapping)
    CREATE TABLE IF NOT EXISTS organization_members (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK(role IN ('admin', 'editor', 'viewer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(organization_id, user_id)
    );

    -- Documents (Scoped strictly to an organization)
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      uploader_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      original_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      mime_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Document Shares (Explicit role grants within the organization)
    CREATE TABLE IF NOT EXISTS document_shares (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      shared_with_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      shared_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      permission TEXT NOT NULL CHECK(permission IN ('editor', 'viewer')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, shared_with_user_id)
    );

    -- Persistent Sessions (Stored in DB to survive redeploys and restarts)
    CREATE TABLE IF NOT EXISTS sessions (
      sid TEXT PRIMARY KEY,
      sess TEXT NOT NULL,
      expired INTEGER NOT NULL
    );

    -- Audit Events (Append-only security and activity trail)
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'FAILURE')),
      ip_address TEXT,
      user_agent TEXT,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes for high-performance scoped lookups
    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_members_org_user ON organization_members(organization_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_docs_org ON documents(organization_id);
    CREATE INDEX IF NOT EXISTS idx_docs_uploader ON documents(uploader_id);
    CREATE INDEX IF NOT EXISTS idx_shares_doc ON document_shares(document_id);
    CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(shared_with_user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_org_created ON audit_events(organization_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action);
    CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
  `);
}

module.exports = {
  getDb,
  setupPragmasAndSchema
};
