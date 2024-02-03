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
          throw new Error('Something went wrong');
        }
      })
      .then(username => {
        const usernameData = username.username;
        const usernameElement = document.getElementById('get-username');
        usernameElement.innerHTML = usernameData;
      })
      .catch(error => {
        window.location.href = '/login';
        const alertDiv = document.createElement('div');
        alertDiv.className = 'alert';
        alertDiv.textContent = error.message;
        const newPasswordInput = document.getElementById('newPassword');
        newPasswordInput.parentElement.appendChild(alertDiv);
        
        newPasswordInput.addEventListener('click', () => {
          alertDiv.remove();
        });
        
        setTimeout(() => {
          alertDiv.remove();
        }, 5000);
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
    const passwordRetype_input = document.getElementById('newPassword-retype');
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert';
    alertDiv.textContent = 'Passwords do not match';
    document.getElementById("newPassword-retype").value = '';
    passwordRetype_input.parentElement.appendChild(alertDiv);
    passwordRetype_input.addEventListener('click', () => {
      alertDiv.remove();
    });
    setTimeout(() => {
      alertDiv.remove();
    }, 5000);
  }
}

const password = document.getElementById('newPassword');
password.addEventListener('input', passwordRequirements);
password.addEventListener('blur', checkPasswordOnBlur);
password.addEventListener('click', removePasswordAlert);

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
      const alertDiv = document.createElement('div');
      alertDiv.textContent = 'Password doesn\'t match our requirements';
      alertDiv.className = 'alert';
      alertDiv.id = 'passwordError';
      document.getElementById('newPassword-retype').parentElement.appendChild(alertDiv);
    }
  }
}

function removePasswordAlert() {
  const alertElement = document.getElementById('passwordError');
  if (alertElement) {
    alertElement.parentElement.removeChild(alertElement);
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
  const passwordInput = document.getElementById('newPassword');
  document.getElementById("newPassword-retype").value = '';
  document.getElementById("newPassword").value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert200';
  alertDiv.textContent = 'Password successfully changed';
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}


function handle460Error() {
  const passwordInput = document.getElementById('newPassword');
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword-retype').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Password must be at least 5 characters';
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

function handle461Error() {
  const passwordInput = document.getElementById('newPassword');
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword-retype').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Password must not have more than 23 characters';
  document.getElementById('passwordRequirementComponents').style.color = "red";
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

function handle462Error() {
  const passwordInput = document.getElementById('newPassword');
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword-retype').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Password doesnt meet our requirements';
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}



function handleError() {
  const passwordInput = document.getElementById('newPassword');
  document.getElementById('newPassword').value = '';
  document.getElementById('newPassword-retype').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Something went wrong';
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}
