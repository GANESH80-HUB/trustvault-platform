const multer = require('multer');

function errorHandler(err, req, res, next) {
  // Handle Multer limits & file errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File size exceeds maximum allowed limit (20MB).'
      });
    }
    return res.status(400).json({
      error: `File upload error: ${err.message}`
    });
  }

  // Handle file filter rejections
  if (err && err.message && err.message.includes('File type not allowed')) {
    return res.status(400).json({
      error: err.message
    });
  }

  // Handle explicit status errors thrown by services
  if (err && err.status) {
    return res.status(err.status).json({
      error: err.message || 'An error occurred processing your request'
    });
  }

  // Handle generic errors
  console.error('[UNHANDLED ERROR]', err);
  const message = process.env.NODE_ENV === 'production' 
    ? 'Internal server error occurred' 
    : (err.message || 'Internal server error');

  res.status(500).json({ error: message });
}

module.exports = errorHandler;
