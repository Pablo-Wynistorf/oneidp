const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';


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
        document.getElementById('username').textContent = data.username;
        document.getElementById('userid').textContent = data.userId;
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


document.getElementById("copyToClipboard").addEventListener("click", async function() {
  var copyText = document.getElementById("userid").textContent;
  try {
    await navigator.clipboard.writeText(copyText);
    displaySuccess('Copied to clipboard!');
  } catch (err) {
    console.error('Failed to copy text: ', err);
  }
});



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


function logoutAll() {
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


function add_oauth2_app() {
  window.location.href = '/home/oauth/settings';
}

function mfa_settings() {
  window.location.href = '/home/mfa/settings';
}

function setNewPassword() {
  var password1 = document.getElementById("password-field").value;
  var password2 = document.getElementById("password-retype-field").value;
  if (password1 === password2) {
    changePassword();
  } else {
    displayError('Error: Passwords do not match');
  }
}

const password = document.getElementById('password-field');
password.addEventListener('input', passwordRequirements);
password.addEventListener('blur', checkPasswordOnBlur);

function isStrongPassword(password) {
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\[\]{}|;:,.<>?])([A-Za-z\d!@#$%^&*()_+\[\]{}|;:,.<>?]{8,})$/;
  return passwordPattern.test(password);
}

function passwordRequirements(event) {
  const password = event.target.value;

  const isStrong = isStrongPassword(password);

  if (isStrong) {
    document.getElementById('passwordRequirementComponents').style.color = "green";
  } else {
    document.getElementById('passwordRequirementComponents').style.color = "red";
  }
}

function checkPasswordOnBlur(event) {
  const password = event.target.value;
  const isStrong = isStrongPassword(password);

  if (!isStrong && (password.trim() !== '')) {
    document.getElementById('passwordRequirementComponents').style.color = "red";

    if (!document.getElementById('passwordError')) {
      displayError('Password doesn\'t match our requirements');
    }
  }
}

function changePassword() {
  const passwordInput = document.getElementById('password-field');
  const password = passwordInput.value;
  try {
    fetch(`/api/auth/user/changepassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password })
    })
    .then(handleResponse)
  } catch (error) {
    handleError();
  }
}



function handleResponse(response) {
  if (response.status === 200) {
    return response.json().then(data => {
      return handle200()
    })
  } else if (response.status === 460) {
    handle460Error();
  } else if (response.status === 461) {
    handle461Error();
  } else if (response.status === 462) {
    handle462Error();
  } else if (response.status === 480) {
    window.location.href = '/login';
  } else {
    handleError();
  }
}


function handle200() {
  document.getElementById('password-field').value = '';
  document.getElementById('password-retype-field').value = '';
  document.getElementById('passwordRequirementComponents').style.color = "red";
  displaySuccess('Success: Password successfully changed');
}


function handle460Error() {
  document.getElementById('password-field').value = '';
  document.getElementById('password-retype-field').value = '';
  displayError('Error: Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character');
}

function handleError() {
  document.getElementById('password-field').value = '';
  document.getElementById('password-retype-field').value = '';
  displayError('Error: Something went wrong');
}

function displaySuccess(successMessage) {
  successBox.textContent = successMessage;
  document.body.appendChild(successBox);
  setTimeout(() => {
      successBox.remove();
  }, 2500);
}

function displayError(errorMessage) {
  errorBox.textContent = errorMessage;
  document.body.appendChild(errorBox);
  setTimeout(() => {
      errorBox.remove();
  }, 2500);
}
