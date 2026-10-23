// Global Toast System
function showToast(message, type = 'success') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 4000);
}

// Global Session Check & Navbar Hydration
async function checkAuth(requireActiveSession = false) {
  try {
    const res = await fetch('/api/auth/me');
    const data = await res.json();

    if (!data.authenticated) {
      if (requireActiveSession) {
        window.location.href = '/login';
      }
      return null;
    }

    // Hydrate user badge in header if present
    const userContainer = document.getElementById('user-nav-container');
    if (userContainer) {
      const roleClass = `role-${data.organization.role}`;
      userContainer.innerHTML = `
        <div class="user-badge">
          <span>${data.organization.name}</span>
          <span style="color: var(--text-dim)">•</span>
          <span style="color: var(--text-main); font-weight: 600;">${data.user.fullName}</span>
          <span class="role-pill ${roleClass}">${data.organization.role}</span>
        </div>
        <button id="logout-btn" class="btn btn-secondary btn-sm" title="Sign Out">
          Sign Out
        </button>
      `;

      document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    }

    // Hide admin-only links (like Audit Log) for non-admin users
    if (data.organization.role !== 'admin') {
      const auditLink = document.getElementById('nav-audit-link');
      if (auditLink) auditLink.style.display = 'none';
    }

    return data;
  } catch (err) {
    console.error('Session verification failed:', err);
    if (requireActiveSession) {
      window.location.href = '/login';
    }
    return null;
  }
}

// Global Logout Handler
async function handleLogout() {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      window.location.href = '/login';
    } else {
      showToast('Logout failed', 'error');
    }
  } catch (err) {
    console.error('Logout error:', err);
    window.location.href = '/login';
  }
}

// Login & Register Form Logic (used on login.html)
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabLoginBtn = document.getElementById('tab-login-btn');
  const tabRegisterBtn = document.getElementById('tab-register-btn');

  // Handle URL tab parameter (?tab=register)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('tab') === 'register' && tabRegisterBtn) {
    switchTab('register');
  }

  function switchTab(tab) {
    if (tab === 'login') {
      tabLoginBtn?.classList.add('active');
      tabRegisterBtn?.classList.remove('active');
      if (loginForm) loginForm.style.display = 'block';
      if (registerForm) registerForm.style.display = 'none';
    } else {
      tabRegisterBtn?.classList.add('active');
      tabLoginBtn?.classList.remove('active');
      if (loginForm) loginForm.style.display = 'none';
      if (registerForm) registerForm.style.display = 'block';
    }
  }

  tabLoginBtn?.addEventListener('click', () => switchTab('login'));
  tabRegisterBtn?.addEventListener('click', () => switchTab('register'));

  // Handle Login submission
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = loginForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Authenticating...';

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Authentication failed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      showToast('Login successful! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
    } catch (err) {
      showToast('Network error while logging in', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });

  // Handle Register submission
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = registerForm.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    const fullName = document.getElementById('register-name').value.trim();
    const organizationName = document.getElementById('register-org').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    if (password.length < 8) {
      showToast('Password must be at least 8 characters long', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, organizationName, email, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showToast(data.error || 'Registration failed', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
        return;
      }

      showToast('Registration successful! Redirecting...', 'success');
      setTimeout(() => {
        window.location.href = '/dashboard';
      }, 500);
    } catch (err) {
      showToast('Network error while registering', 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  });
});
