/**
 * HTML escaping utilities — prevent XSS in email templates and API responses
 */

// Escape HTML special characters in user-supplied strings going into emails/HTML
exports.escHtml = (str) => {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

// Sanitize text for use in plain text contexts (strip HTML tags)
exports.stripHtml = (str) => {
  if (!str) return '';
  return String(str).replace(/<[^>]*>/g, '').trim();
};

// Validate and sanitize odometer reading
exports.sanitizeOdometer = (val) => {
  const n = parseInt(val);
  if (isNaN(n) || n < 0 || n > 9999999) return null;
  return n;
};

// Sanitize serial number (alphanumeric + hyphens only)
exports.sanitizeSerial = (str) => {
  if (!str) return '';
  return String(str).replace(/[^A-Z0-9\-\s]/gi, '').trim().toUpperCase().slice(0, 50);
};

// Sanitize plate number
exports.sanitizePlate = (str) => {
  if (!str) return '';
  return String(str).replace(/[^A-Z0-9\-\s]/gi, '').trim().toUpperCase().slice(0, 20);
};
