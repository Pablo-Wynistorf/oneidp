
document.addEventListener('DOMContentLoaded', function () {
  const toggleButton = document.getElementById('toggleButton');
  const innerCircle1 = document.getElementById('innerCircle1');
  const innerCircle2 = document.getElementById('innerCircle2');
  let toggle = false;

  // Function to update the toggle button based on the toggle state
  function updateToggleButton() {
    if (toggle) {
      toggleButton.classList.add('bg-blue-500');
      toggleButton.classList.remove('bg-gray-600');
      innerCircle1.classList.add('bg-transparent');
      innerCircle1.classList.remove('bg-white');
      innerCircle2.classList.add('bg-white');
      innerCircle2.classList.remove('bg-transparent');
    } else {
      toggleButton.classList.add('bg-gray-600');
      toggleButton.classList.remove('bg-blue-500');
      innerCircle1.classList.add('bg-white');
      innerCircle1.classList.remove('bg-transparent');
      innerCircle2.classList.add('bg-transparent');
      innerCircle2.classList.remove('bg-white');
    }
  }

  // Event listener for toggle button click
  toggleButton.addEventListener('click', function () {
    toggle = !toggle;
    updateToggleButton();
  });

  // Fetch user data and set the toggle state
  function fetchUserData() {
    fetch('/api/oauth/userinfo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    })
    .then(response => {
      if (response.ok) {
        return response.json();
      } else {
        throw new Error('Network response was not ok.');
      }
    })
    .then(data => {
      document.getElementById('username').innerHTML = data.username;

      toggle = data.mfaEnabled;
      updateToggleButton();

      sha256(data.email).then(hash => {
        document.getElementById('avatar').src = `https://www.gravatar.com/avatar/${hash}?&d=identicon&r=PG`;
      });
    })
    .catch(error => {
      console.error('There has been a problem with your fetch operation:', error);
    });
  }

  fetchUserData();
});

async function sha256(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(byte => byte.toString(16).padStart(2, '0')).join('');
  return hashHex;
}


function changePassword() {
  const currentPasswordInput = document.getElementById('current-password-input').value;
  const newPasswordInput = document.getElementById('new-password-input').value;
  try {
    fetch(`/api/auth/user/changepassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currentPassword: currentPasswordInput, newPassword: newPasswordInput})
    })
    .then(handleResponse)
  } catch (error) {
    handleError();
  }
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

function logout_everywhere() {
  try {
    fetch(`/api/auth/logoutall`, {
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
    .catch(error => {
      handleError();
    });
  } catch (error) {
    handleError();
  }
}


function handleError() {
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
