const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const { STORAGE_DIR, MAX_FILE_SIZE_MB } = require('../utils/config');

// Safe file extension whitelist
const ALLOWED_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.md', '.csv', '.json',
  '.png', '.jpg', '.jpeg', '.webp', '.svg',
  '.zip'
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, STORAGE_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    // Use random UUID for private storage filename to guarantee uniqueness and prevent directory traversal
    const safeStorageName = `${crypto.randomUUID()}${ext}`;
    cb(null, safeStorageName);
  }
});

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      new Error(`File type not allowed. Supported formats: PDF, DOCX, XLSX, PPTX, CSV, TXT, Markdown, PNG, JPG, WEBP, ZIP.`),
      false
    );
  }
  cb(null, true);
};

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_MB * 1024 * 1024 // e.g. 20MB
  },
  fileFilter
});

module.exports = upload;
