
document.addEventListener('DOMContentLoaded', function () {
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

  if (!currentPasswordInput || !newPasswordInput) {
    displayAlertError('Error: Both fields are required.');
    return;
  }

  try {
    fetch(`/api/auth/user/changepassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currentPassword: currentPasswordInput, newPassword: newPasswordInput})
    })
    .then(response => {
      if (response.ok) {
        document.getElementById('current-password-input').value = '';
        document.getElementById('new-password-input').value = '';
        displayAlertSuccess('Password changed successfully.');
      } else if (response.status === 460) {
        displayAlertError('Error: Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character');
      } else if (response.status === 461) {
        displayAlertError('Error: Current password is incorrect');
      }
      else {
        handleError();
      }
    }
    )
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
