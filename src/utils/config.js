const path = require('path');
const fs = require('fs');
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = parseInt(process.env.PORT, 10) || 3000;
const DEFAULT_DEV_SECRET = 'trustvault-dev-session-secret-change-me-in-production-min32chars';
const SESSION_SECRET = process.env.SESSION_SECRET || DEFAULT_DEV_SECRET;

if (NODE_ENV === 'production' && SESSION_SECRET === DEFAULT_DEV_SECRET) {
  console.warn('[SECURITY WARNING] Running in production with default SESSION_SECRET! Please set SESSION_SECRET environment variable.');
}

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB, 10) || 20;

// Persistent data path: Can point to a Render Persistent Disk (e.g. /var/data)
const DATA_DIR = process.env.DATA_DIR 
  ? path.resolve(process.env.DATA_DIR) 
  : path.resolve(__dirname, '../../data');

const DB_PATH = process.env.DB_PATH 
  ? path.resolve(process.env.DB_PATH) 
  : path.join(DATA_DIR, 'trustvault.db');

const STORAGE_DIR = process.env.STORAGE_DIR 
  ? path.resolve(process.env.STORAGE_DIR) 
  : path.join(DATA_DIR, 'private_storage');

// Ensure storage directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

module.exports = {
  NODE_ENV,
  PORT,
  SESSION_SECRET,
  DATA_DIR,
  DB_PATH,
  STORAGE_DIR,
  MAX_FILE_SIZE_MB,
  isProduction: NODE_ENV === 'production'
};
