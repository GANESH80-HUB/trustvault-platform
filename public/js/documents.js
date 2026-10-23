let currentSession = null;
let activeDocumentId = null;

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const date = new Date(isoStr);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Fetch and render document list
async function loadDocuments() {
  const search = document.getElementById('search-input')?.value || '';
  const filter = document.getElementById('filter-select')?.value || 'all';

  const tbody = document.getElementById('documents-tbody');
  const emptyState = document.getElementById('documents-empty');

  try {
    const query = new URLSearchParams({ search, filter }).toString();
    const res = await fetch(`/api/documents?${query}`);
    if (!res.ok) throw new Error('Failed to load documents');
    const data = await res.json();

    if (data.documents && data.documents.length > 0) {
      if (emptyState) emptyState.style.display = 'none';
      if (tbody) {
        tbody.innerHTML = data.documents.map(doc => {
          const canManage = currentSession?.organization.role === 'admin' || doc.isOwner || doc.accessLevel === 'editor';
          const canDelete = currentSession?.organization.role === 'admin' || doc.isOwner;

          return `
            <tr>
              <td>
                <div style="font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 0.5rem;">
                  <span>${getFileIcon(doc.mimeType)}</span>
                  <span>${escapeHtml(doc.originalName)}</span>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted); margin-left: 1.75rem;">
                  ${escapeHtml(doc.description || 'No description')}
                </div>
              </td>
              <td>${formatBytes(doc.fileSize)}</td>
              <td>${escapeHtml(doc.uploader.name)}</td>
              <td>
                <span class="role-pill role-${doc.accessLevel}">${doc.accessLevel}</span>
              </td>
              <td>
                ${doc.shareCount > 0 ? `<span style="font-size: 0.8rem; color: var(--accent-secondary);">${doc.shareCount} shared</span>` : '<span style="color: var(--text-dim); font-size: 0.8rem;">Private</span>'}
              </td>
              <td>${formatDate(doc.createdAt)}</td>
              <td class="text-right">
                <div style="display: inline-flex; gap: 0.4rem;">
                  <button class="btn btn-secondary btn-sm" onclick="previewDocument('${doc.id}', '${escapeHtml(doc.originalName)}', '${doc.mimeType}')" title="Preview">
                    Preview
                  </button>
                  <a href="/api/documents/${doc.id}/download" class="btn btn-secondary btn-sm" title="Download">
                    Download
                  </a>
                  ${canManage ? `
                    <button class="btn btn-secondary btn-sm" onclick="openShareModal('${doc.id}')" title="Share & Permissions">
                      Share
                    </button>
                  ` : ''}
                  ${canDelete ? `
                    <button class="btn btn-danger btn-sm" onclick="confirmDelete('${doc.id}', '${escapeHtml(doc.originalName)}')">
                      Delete
                    </button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('');
      }
    } else {
      if (tbody) tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
    }
  } catch (err) {
    console.error('Failed to list documents:', err);
    showToast('Failed to load documents', 'error');
  }
}

function getFileIcon(mime) {
  if (mime.includes('pdf')) return '📄';
  if (mime.includes('image')) return '🖼️';
  if (mime.includes('text') || mime.includes('markdown') || mime.includes('csv')) return '📝';
  if (mime.includes('sheet') || mime.includes('excel')) return '📊';
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📈';
  return '📦';
}

// Upload Modal Functions
function openUploadModal() {
  if (currentSession?.organization.role === 'viewer') {
    showToast('Viewers do not have permission to upload documents', 'error');
    return;
  }
  const modal = document.getElementById('upload-modal');
  if (modal) modal.classList.add('open');
}

function closeUploadModal() {
  const modal = document.getElementById('upload-modal');
  if (modal) modal.classList.remove('open');
  const form = document.getElementById('upload-form');
  if (form) form.reset();
}

// Share Modal Functions
async function openShareModal(documentId) {
  activeDocumentId = documentId;
  const modal = document.getElementById('share-modal');
  if (!modal) return;

  try {
    const res = await fetch(`/api/documents/${documentId}`);
    if (!res.ok) throw new Error('Failed to load document metadata');
    const data = await res.json();
    const doc = data.document;

    document.getElementById('share-modal-doc-name').textContent = doc.originalName;
    renderSharesList(doc.shares || []);

    modal.classList.add('open');
  } catch (err) {
    showToast('Failed to open document sharing panel', 'error');
  }
}

function renderSharesList(shares) {
  const container = document.getElementById('shares-list-container');
  if (!container) return;

  if (shares.length === 0) {
    container.innerHTML = `
      <div style="font-size: 0.8rem; color: var(--text-dim); padding: 0.75rem; text-align: center;">
        No active individual shares. This document is private to you and organization admins.
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <table class="data-table" style="font-size: 0.8rem;">
      <thead>
        <tr>
          <th>Shared With</th>
          <th>Permission</th>
          <th class="text-right">Action</th>
        </tr>
      </thead>
      <tbody>
        ${shares.map(s => `
          <tr>
            <td>
              <div style="font-weight: 600;">${escapeHtml(s.full_name)}</div>
              <div style="color: var(--text-muted); font-size: 0.75rem;">${escapeHtml(s.email)}</div>
            </td>
            <td>
              <span class="role-pill role-${s.permission}">${s.permission}</span>
            </td>
            <td class="text-right">
              <button class="btn btn-danger btn-sm" onclick="revokeShare('${s.share_id}')">
                Revoke
              </button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function closeShareModal() {
  const modal = document.getElementById('share-modal');
  if (modal) modal.classList.remove('open');
  activeDocumentId = null;
}

async function revokeShare(shareId) {
  if (!confirm('Are you sure you want to revoke access for this member?')) return;
  try {
    const res = await fetch(`/api/documents/${activeDocumentId}/share/${shareId}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to revoke share');

    showToast('Access revoked successfully', 'success');
    openShareModal(activeDocumentId); // Refresh modal
    loadDocuments(); // Refresh table counts
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Preview Modal Functions
async function previewDocument(documentId, filename, mimeType) {
  const modal = document.getElementById('preview-modal');
  const title = document.getElementById('preview-title');
  const body = document.getElementById('preview-body');
  const downloadBtn = document.getElementById('preview-download-link');

  if (!modal || !body) return;

  title.textContent = filename;
  downloadBtn.href = `/api/documents/${documentId}/download`;
  body.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">Loading preview...</div>';
  modal.classList.add('open');

  try {
    if (mimeType.startsWith('image/')) {
      body.innerHTML = `
        <div style="display: flex; justify-content: center; align-items: center; max-height: 70vh; overflow: auto;">
          <img src="/api/documents/${documentId}/preview" style="max-width: 100%; max-height: 65vh; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);" alt="${escapeHtml(filename)}">
        </div>
      `;
    } else if (mimeType.includes('pdf')) {
      body.innerHTML = `
        <iframe src="/api/documents/${documentId}/preview" style="width: 100%; height: 65vh; border: none; border-radius: var(--radius-sm); background: #fff;"></iframe>
      `;
    } else if (mimeType.includes('text') || mimeType.includes('json') || mimeType.includes('csv') || mimeType.includes('markdown')) {
      const res = await fetch(`/api/documents/${documentId}/preview`);
      const text = await res.text();
      body.innerHTML = `
        <pre style="background: #090d14; border: 1px solid var(--border-subtle); padding: 1rem; border-radius: var(--radius-sm); max-height: 65vh; overflow: auto; font-family: monospace; font-size: 0.85rem; color: var(--text-main); white-space: pre-wrap;"><code>${escapeHtml(text)}</code></pre>
      `;
    } else {
      body.innerHTML = `
        <div style="text-align: center; padding: 3rem 1rem;">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">📦</div>
          <div style="font-weight: 600; font-size: 1.1rem; margin-bottom: 0.5rem;">Preview not supported for this file format</div>
          <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1.5rem;">Please download the document to inspect its contents locally.</div>
          <a href="/api/documents/${documentId}/download" class="btn btn-primary">Download File (${escapeHtml(filename)})</a>
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--accent-danger);">Failed to load document preview.</div>';
  }
}

function closePreviewModal() {
  const modal = document.getElementById('preview-modal');
  if (modal) modal.classList.remove('open');
  const body = document.getElementById('preview-body');
  if (body) body.innerHTML = '';
}

// Delete Document
async function confirmDelete(documentId, name) {
  if (!confirm(`Are you sure you want to permanently delete "${name}"? This action cannot be undone.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/documents/${documentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to delete document');

    showToast('Document deleted permanently', 'success');
    loadDocuments();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  currentSession = await checkAuth(true);
  if (!currentSession) return;

  // If Viewer, hide upload button
  if (currentSession.organization.role === 'viewer') {
    const uploadBtn = document.getElementById('page-upload-btn');
    if (uploadBtn) uploadBtn.style.display = 'none';
  }

  loadDocuments();

  // Search and filter listeners
  document.getElementById('search-input')?.addEventListener('input', debounce(loadDocuments, 300));
  document.getElementById('filter-select')?.addEventListener('change', loadDocuments);

  // Check URL params for direct action
  const params = new URLSearchParams(window.location.search);
  if (params.get('action') === 'upload') {
    openUploadModal();
  }
  if (params.get('id')) {
    openShareModal(params.get('id'));
  }

  // Upload Form Submission
  const uploadForm = document.getElementById('upload-form');
  uploadForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('upload-file');
    const descInput = document.getElementById('upload-desc');
    const submitBtn = uploadForm.querySelector('button[type="submit"]');

    if (!fileInput.files || fileInput.files.length === 0) {
      showToast('Please select a file to upload', 'error');
      return;
    }

    const file = fileInput.files[0];
    if (file.size > 20 * 1024 * 1024) {
      showToast('File size exceeds the 20MB limit', 'error');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('description', descInput.value.trim());

    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading securely...';

    try {
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');

      showToast('Document uploaded successfully!', 'success');
      closeUploadModal();
      loadDocuments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Upload Document';
    }
  });

  // Share Form Submission
  const shareForm = document.getElementById('share-form');
  shareForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const emailInput = document.getElementById('share-email');
    const permSelect = document.getElementById('share-permission');
    const submitBtn = shareForm.querySelector('button[type="submit"]');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Granting...';

    try {
      const res = await fetch(`/api/documents/${activeDocumentId}/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput.value.trim(),
          permission: permSelect.value
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to share document');

      showToast(data.message, 'success');
      emailInput.value = '';
      openShareModal(activeDocumentId);
      loadDocuments();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Share Access';
    }
  });

  // Close modals on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeUploadModal();
      closeShareModal();
      closePreviewModal();
    }
  });
});

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
