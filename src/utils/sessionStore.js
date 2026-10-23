const session = require('express-session');

class SqliteSessionStore extends session.Store {
  constructor(options = {}) {
    super();
    this.db = options.db;
    if (!this.db) {
      throw new Error('SqliteSessionStore requires a database instance');
    }
    this.cleanupIntervalMs = options.cleanupIntervalMs || 15 * 60 * 1000; // 15 mins

    // Start background cleanup
    this.cleanupTimer = setInterval(() => {
      this.clearExpired();
    }, this.cleanupIntervalMs);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  get(sid, callback) {
    try {
      const now = Date.now();
      const row = this.db.prepare('SELECT sess, expired FROM sessions WHERE sid = ?').get(sid);

      if (!row) {
        return callback(null, null);
      }

      if (row.expired <= now) {
        this.destroy(sid, () => {});
        return callback(null, null);
      }

      const sess = JSON.parse(row.sess);
      return callback(null, sess);
    } catch (err) {
      return callback(err);
    }
  }

  set(sid, sess, callback) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 24 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;
      const sessStr = JSON.stringify(sess);

      const stmt = this.db.prepare(`
        INSERT INTO sessions (sid, sess, expired)
        VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET
          sess = excluded.sess,
          expired = excluded.expired
      `);
      stmt.run(sid, sessStr, expired);

      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  destroy(sid, callback) {
    try {
      this.db.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  touch(sid, sess, callback) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 24 * 60 * 60 * 1000;
      const expired = Date.now() + maxAge;

      this.db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?').run(expired, sid);
      if (callback) callback(null);
    } catch (err) {
      if (callback) callback(err);
    }
  }

  clearExpired() {
    try {
      const now = Date.now();
      this.db.prepare('DELETE FROM sessions WHERE expired <= ?').run(now);
    } catch (err) {
      console.error('Error clearing expired sessions:', err.message);
    }
  }
}

module.exports = SqliteSessionStore;
