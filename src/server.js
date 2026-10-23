const express = require('express');
const path = require('path');
const helmet = require('helmet');
const session = require('express-session');
const rateLimit = require('express-rate-limit');

const { PORT, NODE_ENV, SESSION_SECRET, isProduction } = require('./utils/config');
const { getDb } = require('./database');
const SqliteSessionStore = require('./utils/sessionStore');
const errorHandler = require('./middleware/errorHandler');

// Route imports
const healthRoutes = require('./routes/health');
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/documents');
const organizationRoutes = require('./routes/organizations');
const auditRoutes = require('./routes/audit');

const app = express();

// Initialize database
const db = getDb();

// Trust reverse proxy (essential for Render and secure cookies)
app.set('trust proxy', 1);

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'"],
        objectSrc: ["'none'"]
      }
    },
    crossOriginEmbedderPolicy: false
  })
);

// Standard body parsers
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Persistent SQLite-backed session
app.use(
  session({
    name: 'trustvault.sid',
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: new SqliteSessionStore({ db }),
    cookie: {
      httpOnly: true,
      secure: isProduction, // Render uses HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  })
);

// Rate limiting on sensitive authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

// API Routes
app.use('/api/health', healthRoutes);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/audit', auditRoutes);

// Serve static frontend assets
const publicDir = path.join(__dirname, '../public');
app.use(express.static(publicDir));

// Clean URL routing for primary pages
app.get('/login', (req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'));
});

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'));
});

app.get('/documents', (req, res) => {
  res.sendFile(path.join(publicDir, 'documents.html'));
});

app.get('/audit', (req, res) => {
  res.sendFile(path.join(publicDir, 'audit.html'));
});

// Fallback to index.html for root or unknown client routes
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Centralized error handling
app.use(errorHandler);

// Start server if executed directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`=========================================`);
    console.log(`  TrustVault Server Running on port ${PORT}`);
    console.log(`  Environment: ${NODE_ENV}`);
    console.log(`  Storage: Private isolated storage active`);
    console.log(`  URL: http://localhost:${PORT}`);
    console.log(`=========================================`);
  });
}

module.exports = app;
