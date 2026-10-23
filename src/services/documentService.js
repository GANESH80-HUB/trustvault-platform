const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('../database');
const { STORAGE_DIR } = require('../utils/config');
const Validator = require('../utils/validator');

class DocumentService {
  /**
   * Upload and register a new document
   */
  static createDocument({
    organizationId,
    uploaderId,
    originalName,
    storagePath,
    mimeType,
    fileSize,
    description = ''
  }) {
    const db = getDb();
    const docId = crypto.randomUUID();
    const sanitizedName = Validator.sanitizeFilename(originalName);
    const sanitizedDesc = Validator.sanitizeString(description, 500);

    const stmt = db.prepare(`
      INSERT INTO documents (
        id, organization_id, uploader_id, original_name,
        storage_path, mime_type, file_size, description
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      docId,
      organizationId,
      uploaderId,
      sanitizedName,
      storagePath,
      mimeType,
      fileSize,
      sanitizedDesc
    );

    return this.getDocumentById({
      documentId: docId,
      organizationId,
      userId: uploaderId,
      role: 'admin' // Creator always has full view of newly uploaded doc
    });
  }

  /**
   * Lists documents accessible to the given user within their organization
   */
  static listDocuments({ organizationId, userId, role, search = '', filter = 'all' }) {
    const db = getDb();
    const params = [organizationId];

    let baseQuery = `
      SELECT 
        d.id,
        d.organization_id,
        d.uploader_id,
        d.original_name,
        d.mime_type,
        d.file_size,
        d.description,
        d.created_at,
        d.updated_at,
        u.full_name as uploader_name,
        u.email as uploader_email,
        s.permission as shared_permission,
        (SELECT COUNT(*) FROM document_shares WHERE document_id = d.id) as share_count
      FROM documents d
      JOIN users u ON d.uploader_id = u.id
      LEFT JOIN document_shares s ON d.id = s.document_id AND s.shared_with_user_id = ?
      WHERE d.organization_id = ?
    `;

    // Re-order params to bind shared_with_user_id first, then organization_id
    const queryParams = [userId, organizationId];

    // Access control scoping:
    // Admin: can see all documents in the organization.
    // Editor: can see documents they uploaded OR documents shared with them.
    // Viewer: can ONLY see documents explicitly shared with them.
    if (role === 'editor') {
      baseQuery += ' AND (d.uploader_id = ? OR s.shared_with_user_id IS NOT NULL)';
      queryParams.push(userId);
    } else if (role === 'viewer') {
      baseQuery += ' AND s.shared_with_user_id IS NOT NULL';
    }

    // Filter by type: 'owned' (uploaded by me) or 'shared' (shared with me)
    if (filter === 'owned') {
      baseQuery += ' AND d.uploader_id = ?';
      queryParams.push(userId);
    } else if (filter === 'shared') {
      baseQuery += ' AND d.uploader_id != ? AND s.shared_with_user_id IS NOT NULL';
      queryParams.push(userId);
    }

    // Search query
    if (search && search.trim()) {
      baseQuery += ' AND (d.original_name LIKE ? OR d.description LIKE ?)';
      const term = `%${search.trim()}%`;
      queryParams.push(term, term);
    }

    baseQuery += ' ORDER BY d.created_at DESC';

    const rows = db.prepare(baseQuery).all(...queryParams);

    return rows.map(row => {
      let accessLevel = 'viewer';
      if (role === 'admin' || row.uploader_id === userId) {
        accessLevel = 'owner';
      } else if (row.shared_permission === 'editor') {
        accessLevel = 'editor';
      }

      return {
        id: row.id,
        organizationId: row.organization_id,
        uploaderId: row.uploader_id,
        originalName: row.original_name,
        mimeType: row.mime_type,
        fileSize: row.file_size,
        description: row.description,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        uploader: {
          name: row.uploader_name,
          email: row.uploader_email
        },
        accessLevel,
        isOwner: row.uploader_id === userId || role === 'admin',
        shareCount: row.share_count
      };
    });
  }

  /**
   * Retrieves single document metadata with access verification
   */
  static getDocumentById({ documentId, organizationId, userId, role }) {
    const db = getDb();

    // Check organization boundary
    const doc = db.prepare(`
      SELECT 
        d.*,
        u.full_name as uploader_name,
        u.email as uploader_email,
        s.permission as shared_permission
      FROM documents d
      JOIN users u ON d.uploader_id = u.id
      LEFT JOIN document_shares s ON d.id = s.document_id AND s.shared_with_user_id = ?
      WHERE d.id = ? AND d.organization_id = ?
    `).get(userId, documentId, organizationId);

    if (!doc) {
      throw { status: 404, message: 'Document not found or access denied' };
    }

    // Permission check
    const isOwner = doc.uploader_id === userId || role === 'admin';
    const isShared = doc.shared_permission !== null && doc.shared_permission !== undefined;

    if (!isOwner && !isShared) {
      throw { status: 403, message: 'You do not have permission to access this document' };
    }

    // Fetch active shares if user is owner/admin or editor
    let shares = [];
    if (isOwner || doc.shared_permission === 'editor') {
      shares = db.prepare(`
        SELECT 
          s.id as share_id,
          s.permission,
          s.created_at as shared_at,
          u.id as user_id,
          u.email,
          u.full_name,
          sharer.full_name as shared_by_name
        FROM document_shares s
        JOIN users u ON s.shared_with_user_id = u.id
        JOIN users sharer ON s.shared_by_user_id = sharer.id
        WHERE s.document_id = ?
        ORDER BY s.created_at DESC
      `).all(documentId);
    }

    return {
      id: doc.id,
      organizationId: doc.organization_id,
      uploaderId: doc.uploader_id,
      originalName: doc.original_name,
      storagePath: doc.storage_path,
      mimeType: doc.mime_type,
      fileSize: doc.file_size,
      description: doc.description,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      uploader: {
        name: doc.uploader_name,
        email: doc.uploader_email
      },
      accessLevel: isOwner ? 'owner' : (doc.shared_permission || 'viewer'),
      isOwner,
      shares
    };
  }

  /**
   * Retrieves verified storage path for streaming download / preview
   */
  static getFilePathForAccess({ documentId, organizationId, userId, role }) {
    const doc = this.getDocumentById({ documentId, organizationId, userId, role });

    // Defensive check against path traversal
    const safePath = path.resolve(STORAGE_DIR, doc.storagePath);
    if (!safePath.startsWith(path.resolve(STORAGE_DIR))) {
      throw { status: 400, message: 'Invalid storage reference' };
    }

    if (!fs.existsSync(safePath)) {
      throw { status: 404, message: 'Underlying document file not found on storage' };
    }

    return {
      filePath: safePath,
      originalName: doc.originalName,
      mimeType: doc.mimeType,
      fileSize: doc.fileSize
    };
  }

  /**
   * Shares a document with another member in the same organization
   */
  static shareDocument({
    documentId,
    organizationId,
    sharedByUserId,
    sharedByRole,
    targetUserEmail,
    permission = 'viewer'
  }) {
    const cleanEmail = targetUserEmail ? targetUserEmail.trim().toLowerCase() : '';
    if (!['editor', 'viewer'].includes(permission)) {
      throw { status: 400, message: "Permission must be either 'editor' or 'viewer'" };
    }

    // Verify document exists and requester has permission to share
    const doc = this.getDocumentById({
      documentId,
      organizationId,
      userId: sharedByUserId,
      role: sharedByRole
    });

    if (!doc.isOwner && doc.accessLevel !== 'editor') {
      throw { status: 403, message: 'You do not have permission to share this document' };
    }

    const db = getDb();

    // Verify target user exists and is member of this organization
    const targetMember = db.prepare(`
      SELECT m.user_id, u.email, u.full_name
      FROM organization_members m
      JOIN users u ON m.user_id = u.id
      WHERE m.organization_id = ? AND u.email = ?
    `).get(organizationId, cleanEmail);

    if (!targetMember) {
      throw { status: 404, message: 'User is not a member of your organization' };
    }

    if (targetMember.user_id === sharedByUserId) {
      throw { status: 400, message: 'You cannot share a document with yourself' };
    }

    if (targetMember.user_id === doc.uploaderId) {
      throw { status: 400, message: 'User is already the owner of this document' };
    }

    const shareId = crypto.randomUUID();

    // Upsert share record
    const stmt = db.prepare(`
      INSERT INTO document_shares (
        id, document_id, shared_with_user_id, shared_by_user_id, organization_id, permission
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(document_id, shared_with_user_id) DO UPDATE SET
        permission = excluded.permission,
        shared_by_user_id = excluded.shared_by_user_id,
        created_at = CURRENT_TIMESTAMP
    `);

    stmt.run(shareId, documentId, targetMember.user_id, sharedByUserId, organizationId, permission);

    return {
      shareId,
      documentId,
      sharedWith: {
        userId: targetMember.user_id,
        email: targetMember.email,
        fullName: targetMember.full_name
      },
      permission
    };
  }

  /**
   * Revokes document access from a user
   */
  static revokeShare({ documentId, organizationId, userId, role, shareId }) {
    const doc = this.getDocumentById({
      documentId,
      organizationId,
      userId,
      role
    });

    if (!doc.isOwner && doc.accessLevel !== 'editor') {
      throw { status: 403, message: 'You do not have permission to manage shares for this document' };
    }

    const db = getDb();
    const share = db.prepare(`
      SELECT s.*, u.email as target_email
      FROM document_shares s
      JOIN users u ON s.shared_with_user_id = u.id
      WHERE s.id = ? AND s.document_id = ? AND s.organization_id = ?
    `).get(shareId, documentId, organizationId);

    if (!share) {
      throw { status: 404, message: 'Share record not found' };
    }

    db.prepare('DELETE FROM document_shares WHERE id = ?').run(shareId);

    return {
      revoked: true,
      shareId,
      targetEmail: share.target_email
    };
  }

  /**
   * Deletes a document and its storage file
   */
  static deleteDocument({ documentId, organizationId, userId, role }) {
    const doc = this.getDocumentById({
      documentId,
      organizationId,
      userId,
      role
    });

    if (!doc.isOwner) {
      throw { status: 403, message: 'Only the document owner or organization administrator can delete this document' };
    }

    const db = getDb();

    // Delete DB record (foreign keys cascade to shares)
    db.prepare('DELETE FROM documents WHERE id = ? AND organization_id = ?').run(documentId, organizationId);

    // Delete physical file safely
    try {
      const safePath = path.resolve(STORAGE_DIR, doc.storagePath);
      if (fs.existsSync(safePath)) {
        fs.unlinkSync(safePath);
      }
    } catch (err) {
      console.error('Failed to unlink physical file:', err.message);
    }

    return {
      deleted: true,
      documentId,
      originalName: doc.originalName
    };
  }

  /**
   * Retrieves real metrics for organization dashboard
   */
  static getStats({ organizationId, userId, role }) {
    const db = getDb();

    // Total documents in organization
    const orgDocsCount = db.prepare(`
      SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_bytes
      FROM documents
      WHERE organization_id = ?
    `).get(organizationId);

    // Documents uploaded by this user
    const userDocsCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM documents
      WHERE organization_id = ? AND uploader_id = ?
    `).get(organizationId, userId).count;

    // Documents shared with this user
    const sharedWithUserCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM document_shares
      WHERE organization_id = ? AND shared_with_user_id = ?
    `).get(organizationId, userId).count;

    // Active members in organization
    const memberCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM organization_members
      WHERE organization_id = ?
    `).get(organizationId).count;

    // Recent 5 documents
    const recentDocs = this.listDocuments({
      organizationId,
      userId,
      role
    }).slice(0, 5);

    return {
      totalOrgDocuments: orgDocsCount.count,
      totalStorageBytes: orgDocsCount.total_bytes,
      userUploadedCount: userDocsCount,
      sharedWithUserCount: sharedWithUserCount,
      totalMembers: memberCount,
      recentDocuments: recentDocs
    };
  }
}

module.exports = DocumentService;
