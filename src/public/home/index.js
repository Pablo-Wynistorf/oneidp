const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';

function getCookie(name) {
  const cookieArray = document.cookie.split(';');
  for (const cookie of cookieArray) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name) {
      return cookieValue;
    }
  }
  window.location.href = '/login';
}


function get_username() {
  const accessToken = getCookie('access_token');
  if (accessToken) {
    fetch(`/api/sso/data/username`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })
      .then(response => {
        if (response.ok) {
          return response.json();
        } else {
          displayError(`Error: Fetching username failed`);
        }
      })
      .then(username => {
        const usernameData = username.username;
        const usernameElement = document.getElementById('get-username');
        usernameElement.innerHTML = usernameData;
      })
      .catch(error => {
        window.location.href = '/login';
        displayError(`User verification error:${error}`);
      });
  }
}



function logout() {
  var pastDate = new Date(0);
  document.cookie = "access_token=; expires=" + pastDate.toUTCString() + "; path=/";
  window.location.href = '/login';
  return null;
}


function logoutAll() {
  const accessToken = getCookie('access_token');
  if (accessToken) {
    fetch(`/api/sso/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })
      .then(response => {
        if (response.ok) {
          var pastDate = new Date(0);
          document.cookie = "access_token=; expires=" + pastDate.toUTCString() + "; path=/";
          window.location.href = '/login';
          return null;
        }
      });
  }
}

function setup_mfa() {
  window.location.href = '/home/mfa/setup';
}

function setNewPassword() {
  var password1 = document.getElementById("newPassword").value;
  var password2 = document.getElementById("newPassword-retype").value;
  if (password1 === password2) {
    changePassword();
  } else {
    displayError('Error: Passwords do not match');
  }
}

const password = document.getElementById('newPassword');
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
  const passwordInput = document.getElementById('newPassword');
  const password = passwordInput.value;
  const accessToken = getCookie('access_token');
  if (accessToken) {
    fetch(`/api/sso/data/changepassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ password, accessToken})
    })
    .then(handleResponse)
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
  displaySuccess('Success: Password successfully changed');
}


function handle460Error() {
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword-retype').value = '';
  displayError('Error: Password must be at least 5 characters');
}

function handle461Error() {
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword-retype').value = '';
  displayError('Error: Password must not have more than 23 characters');
  document.getElementById('passwordRequirementComponents').style.color = "red";
}

function handle462Error() {
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword-retype').value = '';
  displayError('Error: Password doesnt meet our requirements');
}

function handleError() {
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword-retype').value = '';
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
