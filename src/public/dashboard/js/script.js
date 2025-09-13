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
        document.getElementById('userid-input').textContent  = data.userId;
        document.getElementById('first-name-input').textContent  = data.firstName;
        document.getElementById('last-name-input').textContent  = data.lastName;
        document.getElementById('username-input').textContent  = data.username;
        document.getElementById('email-input').textContent  = data.email;

        // Handle roles as orange boxes
        const rolesContainer = document.getElementById('roles-input');
        rolesContainer.innerHTML = ''; // clear existing
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
            roleBox.className =
              'bg-orange-500 text-white px-3 py-1 rounded-lg text-sm font-semibold shadow-md';
            rolesContainer.appendChild(roleBox);
          });
        }

        document.getElementById('mfa-enabled-input').textContent  = data.mfaEnabled;

        sha256(data.email).then(hash => {
          document.getElementById('avatar').src =
            `https://www.gravatar.com/avatar/${hash}?&d=identicon&r=PG`;
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
