let currentPage = 1;
let totalPages = 1;

function formatDate(isoStr) {
  if (!isoStr) return '—';
  const date = new Date(isoStr);
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

async function loadAuditLogs(page = 1) {
  currentPage = page;
  const action = document.getElementById('filter-action')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  const actorEmail = document.getElementById('filter-actor')?.value.trim() || '';

  const tbody = document.getElementById('audit-tbody');
  const emptyState = document.getElementById('audit-empty');

  try {
    const params = new URLSearchParams({
      page: currentPage,
      limit: 25
    });

    if (action) params.append('action', action);
    if (status) params.append('status', status);
    if (actorEmail) params.append('actorEmail', actorEmail);

    const res = await fetch(`/api/audit?${params.toString()}`);
    if (res.status === 403) {
      showToast('Access denied: Audit log is restricted to Organization Administrators', 'error');
      setTimeout(() => { window.location.href = '/dashboard'; }, 1500);
      return;
    }

    if (!res.ok) throw new Error('Failed to load audit logs');
    const data = await res.json();

    totalPages = data.totalPages || 1;
    document.getElementById('page-indicator').textContent = `Page ${data.page} of ${totalPages} (${data.total} total events)`;
    document.getElementById('prev-btn').disabled = data.page <= 1;
    document.getElementById('next-btn').disabled = data.page >= totalPages;

    if (data.events && data.events.length > 0) {
      if (emptyState) emptyState.style.display = 'none';
      if (tbody) {
        tbody.innerHTML = data.events.map(ev => `
          <tr>
            <td style="font-size: 0.8rem; color: var(--text-muted); font-family: monospace;">
              ${formatDate(ev.created_at)}
            </td>
            <td>
              <span class="badge ${ev.status === 'SUCCESS' ? 'badge-success' : 'badge-failure'}">
                ${ev.action}
              </span>
            </td>
            <td>
              <div style="font-weight: 600;">${escapeHtml(ev.actor_email || 'System / Anonymous')}</div>
              <div style="font-size: 0.75rem; color: var(--text-dim); font-family: monospace;">
                IP: ${escapeHtml(ev.ip_address || '—')}
              </div>
            </td>
            <td>
              <span style="font-weight: 500;">${escapeHtml(ev.resource_type)}</span>
              ${ev.resource_id ? `<div style="font-size: 0.725rem; color: var(--text-dim); font-family: monospace;">${escapeHtml(ev.resource_id.slice(0, 13))}...</div>` : ''}
            </td>
            <td class="text-right">
              <button class="btn btn-secondary btn-sm" onclick='inspectEvent(${JSON.stringify(ev).replace(/'/g, "&apos;")})'>
                Inspect
              </button>
            </td>
          </tr>
        `).join('');
      }
    } else {
      if (tbody) tbody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'block';
    }
  } catch (err) {
    console.error('Audit fetch error:', err);
    showToast('Failed to load audit logs', 'error');
  }
}

function inspectEvent(event) {
  const modal = document.getElementById('details-modal');
  const content = document.getElementById('details-content');
  if (!modal || !content) return;

  content.textContent = JSON.stringify(event, null, 2);
  modal.classList.add('open');
}

function closeDetailsModal() {
  const modal = document.getElementById('details-modal');
  if (modal) modal.classList.remove('open');
}

document.addEventListener('DOMContentLoaded', async () => {
  const session = await checkAuth(true);
  if (!session) return;

  if (session.organization.role !== 'admin') {
    showToast('Access denied: Audit trail is restricted to administrators', 'error');
    window.location.href = '/dashboard';
    return;
  }

  loadAuditLogs(1);

  document.getElementById('filter-action')?.addEventListener('change', () => loadAuditLogs(1));
  document.getElementById('filter-status')?.addEventListener('change', () => loadAuditLogs(1));
  document.getElementById('filter-actor')?.addEventListener('input', debounce(() => loadAuditLogs(1), 300));

  document.getElementById('prev-btn')?.addEventListener('click', () => {
    if (currentPage > 1) loadAuditLogs(currentPage - 1);
  });

  document.getElementById('next-btn')?.addEventListener('click', () => {
    if (currentPage < totalPages) loadAuditLogs(currentPage + 1);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDetailsModal();
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
