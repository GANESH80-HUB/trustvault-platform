const express = require('express');
const path = require('path');
const DocumentService = require('../services/documentService');
const AuditService = require('../services/auditService');
const upload = require('../middleware/upload');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Get real organization dashboard stats
router.get('/stats', requireAuth, (req, res, next) => {
  try {
    const stats = DocumentService.getStats({
      organizationId: req.membership.organizationId,
      userId: req.user.id,
      role: req.membership.role
    });
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// List documents accessible to the current user
router.get('/', requireAuth, (req, res, next) => {
  try {
    const { search, filter } = req.query;
    const documents = DocumentService.listDocuments({
      organizationId: req.membership.organizationId,
      userId: req.user.id,
      role: req.membership.role,
      search,
      filter
    });
    res.json({ documents });
  } catch (err) {
    next(err);
  }
});

// Upload document (Admin and Editor only; Viewer is rejected)
router.post(
  '/',
  requireAuth,
  requireRole(['admin', 'editor']),
  upload.single('file'),
  (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided for upload' });
      }

      const { description } = req.body;
      const doc = DocumentService.createDocument({
        organizationId: req.membership.organizationId,
        uploaderId: req.user.id,
        originalName: req.file.originalname,
        storagePath: req.file.filename,
        mimeType: req.file.mimetype || 'application/octet-stream',
        fileSize: req.file.size,
        description
      });

      AuditService.log({
        organizationId: req.membership.organizationId,
        actorId: req.user.id,
        actorEmail: req.user.email,
        action: 'DOCUMENT_UPLOAD',
        resourceType: 'DOCUMENT',
        resourceId: doc.id,
        status: 'SUCCESS',
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
        details: {
          originalName: doc.originalName,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType
        }
      });

      res.status(201).json({
        success: true,
        message: 'Document uploaded successfully',
        document: doc
      });
    } catch (err) {
      next(err);
    }
  }
);

// Get single document metadata
router.get('/:id', requireAuth, (req, res, next) => {
  try {
    const doc = DocumentService.getDocumentById({
      documentId: req.params.id,
      organizationId: req.membership.organizationId,
      userId: req.user.id,
      role: req.membership.role
    });
    res.json({ document: doc });
  } catch (err) {
    next(err);
  }
});

// Download document
router.get('/:id/download', requireAuth, (req, res, next) => {
  try {
    const fileInfo = DocumentService.getFilePathForAccess({
      documentId: req.params.id,
      organizationId: req.membership.organizationId,
      userId: req.user.id,
      role: req.membership.role
    });

    AuditService.log({
      organizationId: req.membership.organizationId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'DOCUMENT_DOWNLOAD',
      resourceType: 'DOCUMENT',
      resourceId: req.params.id,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        originalName: fileInfo.originalName
      }
    });

    res.download(fileInfo.filePath, fileInfo.originalName);
  } catch (err) {
    next(err);
  }
});

// Preview document inline
router.get('/:id/preview', requireAuth, (req, res, next) => {
  try {
    const fileInfo = DocumentService.getFilePathForAccess({
      documentId: req.params.id,
      organizationId: req.membership.organizationId,
      userId: req.user.id,
      role: req.membership.role
    });

    AuditService.log({
      organizationId: req.membership.organizationId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'DOCUMENT_PREVIEW',
      resourceType: 'DOCUMENT',
      resourceId: req.params.id,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        originalName: fileInfo.originalName
      }
    });

    res.setHeader('Content-Type', fileInfo.mimeType);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileInfo.originalName)}"`);
    res.sendFile(fileInfo.filePath);
  } catch (err) {
    next(err);
  }
});

// Share document with an organization member
router.post('/:id/share', requireAuth, requireRole(['admin', 'editor']), (req, res, next) => {
  try {
    const { email, permission } = req.body;
    const result = DocumentService.shareDocument({
      documentId: req.params.id,
      organizationId: req.membership.organizationId,
      sharedByUserId: req.user.id,
      sharedByRole: req.membership.role,
      targetUserEmail: email,
      permission: permission || 'viewer'
    });

    AuditService.log({
      organizationId: req.membership.organizationId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'DOCUMENT_SHARE',
      resourceType: 'DOCUMENT',
      resourceId: req.params.id,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        sharedWithEmail: result.sharedWith.email,
        permission: result.permission
      }
    });

    res.status(200).json({
      success: true,
      message: `Document successfully shared with ${result.sharedWith.email}`,
      share: result
    });
  } catch (err) {
    next(err);
  }
});

// Revoke document access
router.delete('/:id/share/:shareId', requireAuth, requireRole(['admin', 'editor']), (req, res, next) => {
  try {
    const result = DocumentService.revokeShare({
      documentId: req.params.id,
      organizationId: req.membership.organizationId,
      userId: req.user.id,
      role: req.membership.role,
      shareId: req.params.shareId
    });

    AuditService.log({
      organizationId: req.membership.organizationId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'DOCUMENT_REVOKE',
      resourceType: 'DOCUMENT',
      resourceId: req.params.id,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        shareId: req.params.shareId,
        targetEmail: result.targetEmail
      }
    });

    res.json({
      success: true,
      message: 'Access revoked successfully'
    });
  } catch (err) {
    next(err);
  }
});

// Delete document
router.delete('/:id', requireAuth, requireRole(['admin', 'editor']), (req, res, next) => {
  try {
    const result = DocumentService.deleteDocument({
      documentId: req.params.id,
      organizationId: req.membership.organizationId,
      userId: req.user.id,
      role: req.membership.role
    });

    AuditService.log({
      organizationId: req.membership.organizationId,
      actorId: req.user.id,
      actorEmail: req.user.email,
      action: 'DOCUMENT_DELETE',
      resourceType: 'DOCUMENT',
      resourceId: req.params.id,
      status: 'SUCCESS',
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      details: {
        originalName: result.originalName
      }
    });

    res.json({
      success: true,
      deleted: true,
      message: 'Document deleted permanently'
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
