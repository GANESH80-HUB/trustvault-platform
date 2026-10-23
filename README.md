# TrustVault — Enterprise Secure Document Sharing

A secure, multi-tenant document-sharing web application built from scratch with a unified single-application architecture. TrustVault provides cryptographic access controls, strict tenant data isolation, private document streaming without public static asset exposure, and an immutable audit trail.

---

## 1. Architectural Highlights

- **Single Deployment**: One unified Node.js/Express service that delivers both the responsive vanilla HTML5/CSS3 frontend and the authenticated REST API from the same domain. Zero cross-origin dependencies or split deployments.
- **Tenant Isolation**: Every organization lives in its own boundary. Foreign key constraints and scoped SQL queries ensure users from one organization cannot access, share, or even detect documents from another organization.
- **Server-Enforced RBAC**:
  - **Organization Admin**: Full administrative rights (manage members, promote/demote roles, view immutable audit logs, upload/download/share/revoke all tenant documents).
  - **Editor**: Can upload documents, manage their own files, share documents they own, and access shared documents with editor grants. Cannot view admin audit logs or modify member roles.
  - **Viewer**: Read-only access to documents explicitly shared with them. Cannot upload, share, or delete documents, and cannot view administrative audit logs.
- **Private Storage**: Uploaded documents are saved with randomized UUID filenames outside the `public/` web root. Files are never served as static assets. Downloads and previews stream strictly through authenticated, permission-checked endpoints.
- **Immutable Audit Trail**: Append-only audit events capture user registrations, logins, uploads, downloads, previews, sharing, and revocations with actor context and IP metadata.

---

## 2. Directory Structure

```text
TrustVault/
├── data/
│   ├── private_storage/    # Private uploaded files (never public)
│   └── trustvault.db       # SQLite relational database
├── public/
│   ├── index.html          # Public landing page
│   ├── login.html          # Authentication (Sign In & Register)
│   ├── dashboard.html      # Real-time metrics and recent activity
│   ├── documents.html      # Repository, upload, preview & sharing
│   ├── audit.html          # Immutable security audit viewer (Admin)
│   ├── css/
│   │   └── style.css       # Obsidian dark aesthetic with neon teal accents
│   └── js/
│       ├── auth.js         # Session check, toast notifications & forms
│       ├── dashboard.js    # Live KPI hydration & recent feeds
│       ├── documents.js    # Upload, download, preview, share & revoke
│       └── audit.js        # Audit trail filtering & pagination
├── src/
│   ├── database.js         # Relational SQLite schema, PRAGMAs & indexes
│   ├── server.js           # Express app, security headers, sessions & routing
│   ├── middleware/
│   │   ├── auth.js         # requireAuth & requireRole RBAC middleware
│   │   ├── errorHandler.js # Safe error handling without stack leaks
│   │   └── upload.js       # Multer configuration with MIME & size checks
│   ├── routes/
│   │   ├── auth.js         # Register, login, logout, profile
│   │   ├── documents.js    # CRUD, download, preview, share, revoke
│   │   ├── organizations.js# Members management and role changes
│   │   ├── audit.js        # Audit trail queries (Admin only)
│   │   └── health.js       # Health probe for Render monitoring
│   ├── services/
│   │   ├── authService.js
│   │   ├── documentService.js
│   │   ├── organizationService.js
│   │   └── auditService.js
│   └── utils/
│       ├── config.js       # Environment configuration & paths
│       ├── sessionStore.js # SQLite-backed session store
│       └── validator.js    # RFC-compliant input sanitization
├── tests/
│   ├── test-helper.js      # Clean test database fixtures
│   ├── auth.test.js        # Session & authentication tests
│   ├── isolation.test.js   # Multi-tenant isolation verification
│   ├── permissions.test.js # Admin vs Editor vs Viewer RBAC tests
│   ├── documents.test.js   # Storage, mime filtering & streaming tests
│   ├── sharing.test.js     # Grant and revoke share verification
│   └── audit.test.js       # Audit trail immutability tests
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

## 3. Local Installation and Setup

### Prerequisites
- Node.js 20.0.0 or higher
- npm 9.0.0 or higher

### Installation
Clone the repository and install dependencies:
```bash
npm install
```

### Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Default configuration inside `.env`:
```env
PORT=3000
NODE_ENV=development
SESSION_SECRET=trustvault-dev-session-secret-change-me-in-production-min32chars
DATA_DIR=./data
MAX_FILE_SIZE_MB=20
```

### Run Automated Tests
Execute the 24 automated tests covering authentication, RBAC, multi-tenant isolation, uploads, downloads, sharing, and audit logging:
```bash
npm test
```
*All 24 test suites execute sequentially with isolated database fixtures and return a 100% pass rate.*

### Start Application
Run in development mode with auto-reload:
```bash
npm run dev
```

Or run in standard production mode:
```bash
npm start
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 4. Production Persistence Architecture on Render

### The Ephemeral Disk Challenge
Standard Render web service containers have an ephemeral local disk. Any files saved directly inside the container root (`./data/trustvault.db` or `./private_storage/`) are wiped whenever Render redeploys or restarts the container.

### The Render Persistent Solution: Render Disks
TrustVault is built with a flexible `DATA_DIR` configuration designed specifically for **Render Persistent Disks**:

1. In Render, attach a **Persistent Disk** to your Web Service:
   - **Mount Path**: `/var/data`
   - **Size**: 1 GB (or as required)
2. In your Render Web Service Environment Settings, set:
   ```env
   DATA_DIR=/var/data
   ```
3. When the service boots:
   - TrustVault automatically ensures `/var/data/private_storage` exists on the persistent mount.
   - The SQLite database file resides at `/var/data/trustvault.db`.
   - SQLite Write-Ahead Logging (`WAL` mode) ensures ACID durability.
   - All uploaded documents are stored on the persistent disk at `/var/data/private_storage/`.
   - All sessions are persisted in the `sessions` table in the SQLite database on the persistent disk.

**Result**: Zero data loss across deployments, container restarts, or daily spin-downs.

---

## 5. Render Deployment Steps (Single Web Service)

Deploying TrustVault to Render requires only **one Web Service**:

1. **Push your code to a clean GitHub repository** (see Section 6).
2. Log in to your [Render Dashboard](https://dashboard.render.com/) and click **New +** &rarr; **Web Service**.
3. Select your newly created **TrustVault** repository.
4. Configure the Web Service settings:
   - **Name**: `trustvault`
   - **Environment**: `Node`
   - **Branch**: `main`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: `Starter` (required to attach persistent disk)
5. **Attach Persistent Disk**:
   - Scroll to **Disks** &rarr; click **Add Disk**.
   - **Name**: `vault-disk`
   - **Mount Path**: `/var/data`
   - **Size**: `1 GB` (or larger)
6. **Set Environment Variables**:
   - `NODE_ENV`: `production`
   - `SESSION_SECRET`: *(Generate a secure 32+ character random string)*
   - `DATA_DIR`: `/var/data`
   - `MAX_FILE_SIZE_MB`: `20`
7. **Health Check Path**:
   - Under **Advanced Settings**, set **Health Check Path** to `/api/health`.
8. Click **Create Web Service**.

Render will build the dependencies, run the unified Express server, mount the persistent disk, and expose your service on your custom `*.onrender.com` domain.

---

## 6. GitHub Setup and Push Commands

To publish this new project to a new, empty repository on GitHub:

```bash
# 1. Initialize git if not already initialized
git init -b main

# 2. Stage all project files
git add .

# 3. Commit the clean architecture
git commit -m "Initial commit: TrustVault clean architecture with single-application Render deployment"

# 4. Link to your NEW GitHub repository (replace with your repo URL)
git remote add origin https://github.com/<your-username>/<your-new-repo>.git

# 5. Push to GitHub
git push -u origin main
```

---

## 7. Security & Compliance Checklist

- [x] **No Static Exposure**: Private documents are kept in `DATA_DIR/private_storage` and never exposed via `express.static`.
- [x] **Strict Content-Disposition**: Downloads set `attachment`, previews set `inline` with explicit MIME headers.
- [x] **Directory Traversal Prevention**: Storage filenames use cryptographic UUIDs (`crypto.randomUUID()`) and `path.resolve` boundary verification.
- [x] **Brute-Force Rate Limiting**: `/api/auth/login` and `/api/auth/register` are protected by `express-rate-limit`.
- [x] **HTTP-Only Cookies**: Session cookies enforce `httpOnly: true`, `sameSite: 'lax'`, and `secure: true` in production.
- [x] **SQL Injection Defense**: 100% parameterized queries using `better-sqlite3` prepared statements.
- [x] **Audit Immutability**: No API routes exist to alter or delete recorded audit entries.
