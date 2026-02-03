document.addEventListener('DOMContentLoaded', function() {
  fetchAuthorizedApps();
  fetchUserData();
  setupDialogHandlers();
});

let pendingRevokeClientId = null;

function fetchAuthorizedApps() {
  fetch('/api/oauth/user-consents', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(response => {
    if (!response.ok) throw new Error('Failed to fetch apps');
    return response.json();
  })
  .then(data => {
    displayAuthorizedApps(data.apps || []);
  })
  .catch(error => {
    document.getElementById('authorized-apps-container').innerHTML = 
      '<div class="text-gray-400 text-center py-4">Failed to load authorized apps</div>';
  });
}

function displayAuthorizedApps(apps) {
  const container = document.getElementById('authorized-apps-container');
  const countBadge = document.getElementById('apps-count');
  const viewAllContainer = document.getElementById('view-all-container');
  
  countBadge.textContent = apps.length;

  if (apps.length === 0) {
    container.innerHTML = '<div class="text-gray-400 text-center py-4 col-span-full">No authorized applications yet</div>';
    viewAllContainer.classList.add('hidden');
    return;
  }

  // Show max 10 apps on dashboard
  const displayApps = apps.slice(0, 10);
  
  // Show "View All" button if more than 10 apps
  if (apps.length > 10) {
    viewAllContainer.classList.remove('hidden');
  } else {
    viewAllContainer.classList.add('hidden');
  }

  container.innerHTML = displayApps.map(app => {
    const appDomain = getAppDomain(app.redirectUri);
    return `
    <div class="bg-gray-700 rounded-lg p-4">
      <div class="flex items-start justify-between">
        <div class="flex items-center gap-3 min-w-0 flex-1">
          <div class="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
            <span class="text-white font-bold text-lg">${app.appName.charAt(0).toUpperCase()}</span>
          </div>
          <div class="min-w-0">
            <h3 class="text-white font-semibold truncate">${escapeHtml(app.appName)}</h3>
          </div>
        </div>
      </div>
      <div class="mt-3 flex flex-wrap gap-1">
        ${app.consentedScopes.map(scope => `
          <span class="bg-gray-600 text-gray-200 px-2 py-0.5 rounded text-xs">${escapeHtml(scope)}</span>
        `).join('')}
      </div>
      <div class="mt-2 text-xs text-gray-300">
        Last used: ${formatDate(app.lastAuthAt)}
      </div>
      <div class="flex items-center gap-2 mt-3">
        ${appDomain ? `
          <a href="${escapeHtml(appDomain)}" target="_blank" rel="noopener noreferrer"
            class="flex-1 text-center px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
            Open
          </a>
        ` : ''}
        <button onclick="confirmRevoke('${escapeHtml(app.clientId)}', '${escapeHtml(app.appName)}')" 
          class="flex-1 px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded-lg transition-colors">
          Revoke
        </button>
      </div>
    </div>
  `}).join('');
}

function getAppDomain(redirectUri) {
  if (!redirectUri) return null;
  try {
    const url = new URL(redirectUri);
    return url.origin;
  } catch {
    return null;
  }
}

function confirmRevoke(clientId, appName) {
  pendingRevokeClientId = clientId;
  document.getElementById('revoke-app-name').textContent = appName;
  const dialog = document.getElementById('revoke-dialog');
  if (dialog.showModal) {
    dialog.showModal();
  }
}

function revokeAccess() {
  if (!pendingRevokeClientId) return;

  fetch(`/api/oauth/user-consents/${encodeURIComponent(pendingRevokeClientId)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(response => {
    if (!response.ok) throw new Error('Failed to revoke');
    return response.json();
  })
  .then(() => {
    document.getElementById('revoke-dialog').close();
    pendingRevokeClientId = null;
    displaySuccess('App access revoked successfully');
    fetchAuthorizedApps();
  })
  .catch(error => {
    displayError('Failed to revoke access');
  });
}

function setupDialogHandlers() {
  document.getElementById('confirm-revoke-button').addEventListener('click', revokeAccess);
  
  document.querySelectorAll('[data-close-modal]').forEach(button => {
    button.addEventListener('click', () => {
      const dialog = button.closest('dialog');
      if (dialog) dialog.close();
    });
  });
}

function fetchUserData() {
  fetch('/api/oauth/userinfo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  })
  .then(response => {
    if (!response.ok) throw new Error('Failed to fetch user data');
    return response.json();
  })
  .then(data => {
    document.getElementById('userid-input').textContent = data.userId;
    document.getElementById('first-name-input').textContent = data.firstName;
    document.getElementById('last-name-input').textContent = data.lastName;
    document.getElementById('username-input').textContent = data.username;
    document.getElementById('email-input').textContent = data.email;

    // Handle roles as orange boxes
    const rolesContainer = document.getElementById('roles-input');
    rolesContainer.innerHTML = '';
    let roles = [];
    if (Array.isArray(data.providerRoles)) {
      roles = data.providerRoles;
    } else if (typeof data.providerRoles === 'string') {
      roles = data.providerRoles.split(',').map(r => r.trim());
    }
    if (roles.length === 0) {
      rolesContainer.textContent = 'N/A';
    } else {
      roles.forEach(role => {
        const roleBox = document.createElement('span');
        roleBox.textContent = role;
        roleBox.className = 'bg-orange-500 text-white px-3 py-1 rounded-lg text-sm font-semibold shadow-md';
        rolesContainer.appendChild(roleBox);
      });
    }

    document.getElementById('mfa-enabled-input').textContent = data.mfaEnabled ? 'Yes' : 'No';

    sha256(data.email).then(hash => {
      document.getElementById('avatar').src = `https://www.gravatar.com/avatar/${hash}?&d=identicon&r=PG`;
    });
  })
  .catch(error => {
    window.location.href = '/login';
  });
}

function formatDate(dateString) {
  if (!dateString) return 'Unknown';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function displaySuccess(message) {
  new Noty({ type: 'success', layout: 'topRight', text: message, timeout: 3000 }).show();
}

function displayError(message) {
  new Noty({ type: 'error', layout: 'topRight', text: message, timeout: 5000 }).show();
}

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
}
