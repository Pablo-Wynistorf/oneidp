document.addEventListener('DOMContentLoaded', function() {
  fetchUserData();
  function fetchUserData() {
    try {
      fetch(`/api/oauth/userinfo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          handleError();
        }
      })
      .then(data => {
        document.getElementById('userid-input').value = data.userId;
        document.getElementById('username-input').value = data.username;
        document.getElementById('email-input').value = data.email;
        document.getElementById('roles-input').value = data.providerRoles;
        document.getElementById('mfa-enabled-input').value = data.mfaEnabled;

        sha256(data.email).then(hash => {
          document.getElementById('avatar').src = `https://www.gravatar.com/avatar/${hash}?&d=identicon&r=PG`;
        });

      })
      .catch(error => {
        handleError();
        window.location.href = '/login';
      });
    } catch (error) {
      handleError();
    }
  }
});

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return hashHex;
}


function logout() {
  try {
    fetch(`/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    })
    .then(response => {
      if (response.ok) {
        window.location.href = '/login';
      } else {
        handleError();
      }
    })
  } catch (error) {
    handleError();
  }
}

function handleError() {
  window.location.href = '/login';
}

function redirect_oidc_apps() {
  window.location.href = '/oidc/apps';
}

function redirect_oidc_roles() {
  window.location.href = '/oidc/roles';
}

function redirect_dashboard() {
  window.location.href = '/dashboard';
}
