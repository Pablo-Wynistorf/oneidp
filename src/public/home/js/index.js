const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';


function get_username() {
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
    .then(username => {
      const usernameData = username.username;
      const usernameElement = document.getElementById('get-username');
      usernameElement.innerHTML = usernameData;
    })
    .catch(error => {
      handleError();
      window.location.href = '/login';
    });
  } catch (error) {
    handleError();
  }
}



function logout() {
  try {
    fetch(`/api/sso/auth/logout`, {
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
    fetch(`/api/sso/auth/logout/all`, {
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
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&.()/^])([A-Za-z\d@$!%*?&.]{8,})$/;
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
    fetch(`/api/sso/data/changepassword`, {
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
  displayError('Error: Password must be at least 5 characters');
}

function handle461Error() {
  document.getElementById('password-field').value = '';
  document.getElementById('password-retype-field').value = '';
  displayError('Error: Password must not have more than 23 characters');
  document.getElementById('passwordRequirementComponents').style.color = "red";
}

function handle462Error() {
  document.getElementById('password-field').value = '';
  document.getElementById('password-retype-field').value = '';
  displayError('Error: Password doesnt meet our requirements');
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
