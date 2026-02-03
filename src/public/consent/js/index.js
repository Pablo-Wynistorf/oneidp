const scopeDescriptions = {
  openid: { name: 'OpenID', description: 'Verify your identity' },
  profile: { name: 'Profile', description: 'Access your name and username' },
  email: { name: 'Email', description: 'Access your email address' },
  offline_access: { name: 'Offline Access', description: 'Stay signed in and access your data when you\'re not using the app' }
};

let consentParams = {};

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  
  consentParams = {
    client_id: urlParams.get('client_id'),
    redirect_uri: urlParams.get('redirect_uri'),
    scope: urlParams.get('scope') || 'openid',
    state: urlParams.get('state'),
    nonce: urlParams.get('nonce'),
    code_challenge: urlParams.get('code_challenge'),
    code_challenge_method: urlParams.get('code_challenge_method')
  };

  if (!consentParams.client_id) {
    displayError('Invalid request: No client_id provided');
    return;
  }

  // Fetch app info
  try {
    const response = await fetch(`/api/oauth/consent/app-info?client_id=${encodeURIComponent(consentParams.client_id)}`);
    if (!response.ok) {
      displayError('Application not found');
      return;
    }
    const data = await response.json();
    document.getElementById('app-name').textContent = data.appName;
  } catch (error) {
    displayError('Failed to load application info');
    return;
  }

  // Display requested scopes
  const scopeList = document.getElementById('scope-list');
  const scopes = consentParams.scope.split(' ');
  
  scopes.forEach(scope => {
    const scopeInfo = scopeDescriptions[scope];
    if (scopeInfo) {
      const li = document.createElement('li');
      li.className = 'flex items-start';
      li.innerHTML = `
        <svg class="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span class="text-gray-200">
          <span class="font-medium">${scopeInfo.name}:</span> ${scopeInfo.description}
        </span>
      `;
      scopeList.appendChild(li);
    }
  });

  // Setup button handlers
  document.getElementById('authorize-button').addEventListener('click', handleAuthorize);
  document.getElementById('deny-button').addEventListener('click', handleDeny);
});

async function handleAuthorize() {
  const button = document.getElementById('authorize-button');
  button.disabled = true;
  button.textContent = 'Authorizing...';

  try {
    const response = await fetch('/api/oauth/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: consentParams.client_id,
        scope: consentParams.scope,
        action: 'approve'
      })
    });

    if (!response.ok) {
      const error = await response.json();
      displayError(error.error || 'Failed to authorize');
      button.disabled = false;
      button.textContent = 'Authorize';
      return;
    }

    // Redirect back to authorize endpoint to complete the flow
    const authorizeUrl = new URL('/api/oauth/authorize', window.location.origin);
    authorizeUrl.searchParams.set('client_id', consentParams.client_id);
    authorizeUrl.searchParams.set('redirect_uri', consentParams.redirect_uri);
    authorizeUrl.searchParams.set('scope', consentParams.scope);
    if (consentParams.state) authorizeUrl.searchParams.set('state', consentParams.state);
    if (consentParams.nonce) authorizeUrl.searchParams.set('nonce', consentParams.nonce);
    if (consentParams.code_challenge) authorizeUrl.searchParams.set('code_challenge', consentParams.code_challenge);
    if (consentParams.code_challenge_method) authorizeUrl.searchParams.set('code_challenge_method', consentParams.code_challenge_method);

    window.location.href = authorizeUrl.toString();
  } catch (error) {
    displayError('Something went wrong. Please try again.');
    button.disabled = false;
    button.textContent = 'Authorize';
  }
}

function handleDeny() {
  // Redirect back to the app with an error
  if (consentParams.redirect_uri) {
    const redirectUrl = new URL(consentParams.redirect_uri);
    redirectUrl.searchParams.set('error', 'access_denied');
    redirectUrl.searchParams.set('error_description', 'User denied the authorization request');
    if (consentParams.state) redirectUrl.searchParams.set('state', consentParams.state);
    window.location.href = redirectUrl.toString();
  } else {
    window.location.href = '/';
  }
}

function displayError(message) {
  new Noty({
    type: 'error',
    layout: 'topRight',
    text: message,
    timeout: 5000
  }).show();
}
