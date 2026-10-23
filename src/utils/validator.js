const path = require('path');

class Validator {
  static isValidEmail(email) {
    if (!email || typeof email !== 'string') return false;
    // Standard RFC 5322 regex subset
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/;
    return emailRegex.test(email.trim()) && email.length <= 254;
  }

  static isValidPassword(password) {
    if (!password || typeof password !== 'string') return false;
    // Minimum 8 characters, at least one letter and one number
    return password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password);
  }

  static sanitizeString(str, maxLength = 255) {
    if (typeof str !== 'string') return '';
    return str.trim().slice(0, maxLength);
  }

  static sanitizeFilename(filename) {
    if (!filename || typeof filename !== 'string') return 'document';
    // Strip directory traversal components and illegal characters
    const base = path.basename(filename);
    const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_');
    return cleaned.slice(0, 150) || 'document';
  }

  static isValidUUID(id) {
    if (!id || typeof id !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(id);
  }
}

module.exports = Validator;
