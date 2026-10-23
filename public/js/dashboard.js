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
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

async function loadDashboard() {
  const session = await checkAuth(true);
  if (!session) return;

  try {
    const res = await fetch('/api/documents/stats');
    if (!res.ok) throw new Error('Failed to load statistics');
    const stats = await res.json();

    // Hydrate KPI cards
    document.getElementById('stat-total-docs').textContent = stats.totalOrgDocuments;
    document.getElementById('stat-storage-used').textContent = formatBytes(stats.totalStorageBytes);
    document.getElementById('stat-uploaded-by-me').textContent = stats.userUploadedCount;
    document.getElementById('stat-shared-with-me').textContent = stats.sharedWithUserCount;

    // Render Recent Documents
    const recentTableBody = document.getElementById('recent-docs-tbody');
    const emptyDocs = document.getElementById('recent-docs-empty');

    if (stats.recentDocuments && stats.recentDocuments.length > 0) {
      if (emptyDocs) emptyDocs.style.display = 'none';
      if (recentTableBody) {
        recentTableBody.innerHTML = stats.recentDocuments.map(doc => `
          <tr>
            <td>
              <div style="font-weight: 600; color: var(--text-main);">${escapeHtml(doc.originalName)}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(doc.description || 'No description')}</div>
            </td>
            <td>${formatBytes(doc.fileSize)}</td>
            <td>${escapeHtml(doc.uploader.name)}</td>
            <td>
              <span class="role-pill role-${doc.accessLevel}">${doc.accessLevel}</span>
            </td>
            <td>${formatDate(doc.createdAt)}</td>
            <td class="text-right">
              <a href="/documents?id=${doc.id}" class="btn btn-secondary btn-sm">Inspect</a>
            </td>
          </tr>
        `).join('');
      }
    } else {
      if (recentTableBody) recentTableBody.innerHTML = '';
      if (emptyDocs) emptyDocs.style.display = 'block';
    }

    // Load recent activity for admin
    if (session.organization.role === 'admin') {
      const activitySection = document.getElementById('admin-activity-section');
      if (activitySection) activitySection.style.display = 'block';

      const auditRes = await fetch('/api/audit?limit=6');
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        const activityBody = document.getElementById('recent-activity-tbody');
        const emptyActivity = document.getElementById('recent-activity-empty');

        if (auditData.events && auditData.events.length > 0) {
          if (emptyActivity) emptyActivity.style.display = 'none';
          if (activityBody) {
            activityBody.innerHTML = auditData.events.map(ev => `
              <tr>
                <td>
                  <span class="badge ${ev.status === 'SUCCESS' ? 'badge-success' : 'badge-failure'}">
                    ${ev.action}
                  </span>
                </td>
                <td>${escapeHtml(ev.actor_email || 'System')}</td>
                <td>${escapeHtml(ev.resource_type || '—')}</td>
                <td>${formatDate(ev.created_at)}</td>
              </tr>
            `).join('');
          }
        } else {
          if (activityBody) activityBody.innerHTML = '';
          if (emptyActivity) emptyActivity.style.display = 'block';
        }
      }
    }
  } catch (err) {
    console.error('Error hydrating dashboard:', err);
    showToast('Failed to load dashboard metrics', 'error');
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

document.addEventListener('DOMContentLoaded', loadDashboard);
