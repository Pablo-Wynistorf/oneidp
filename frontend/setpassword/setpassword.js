function sendAccessToken() {
  const access_token = getCookie('access_token');
  if (access_token) {
    fetch(`/api/sso/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${access_token}`
      }
    })
      .then(response => {
        if (response.ok) {
          removeResetToken()
          window.location.href = '/home/';
        }
      });
  }
}


function ingestCode() {
  const password_reset_code = getCookie('password_reset_code');
  if (password_reset_code) {
    document.getElementById('reset-code').value = password_reset_code;
  }
}

function getCookie(name) {
  const cookieArray = document.cookie.split(';');
  for (const cookie of cookieArray) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name) {
      return cookieValue;
    }
  }
  return null;
}


function passwordCheck() {
  var password1 = document.getElementById("password").value;
  var password2 = document.getElementById("password-retype").value;
  var reset_code = document.getElementById("reset-code").value;
  
  if (reset_code.length < 6) {
    const resetCodeInput = document.getElementById('reset-code');
    const resetCodeAlert = document.createElement('div');
    resetCodeAlert.className = 'alert';
    resetCodeAlert.textContent = 'Enter at least 6 digits';
    resetCodeInput.value = '';
    resetCodeInput.parentElement.appendChild(resetCodeAlert);
    resetCodeInput.addEventListener('click', () => {
      resetCodeAlert.remove();
    });
  }
  if (password1 === password2) {
    setNewPassword();
  } else {
    const passwordRetype_input = document.getElementById('password-retype');
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert';
    alertDiv.textContent = 'Passwords do not match';
    document.getElementById("password-retype").value = '';
    passwordRetype_input.parentElement.appendChild(alertDiv);
    passwordRetype_input.addEventListener('click', () => {
      alertDiv.remove();
    });
  }
}


function setNewPassword() {
  const passwordInput = document.getElementById('password');
  const password_reset_codeImput = document.getElementById('reset-code');
  const password = passwordInput.value;
  const password_reset_code = password_reset_codeImput.value;
  const password_reset_token = getCookie('password_reset_token');
  if (password_reset_token) {
    fetch(`/api/sso/data/setpassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${password_reset_token}`
      },
      body: JSON.stringify({ password, password_reset_token, password_reset_code})
    })
    .then(handleResponse)
  }
}

function removeResetToken() {
  var pastDate = new Date(0);
  document.cookie = "password_reset_token=; expires=" + pastDate.toUTCString() + "; path=/";
  document.cookie = "password_reset_code=; expires=" + pastDate.toUTCString() + "; path=/";
  return null;
}


function handleResponse(response) {
  if (response.status === 200) {
    return response.json().then(data => {
      removeResetToken();
      window.location.href = '/home'
    })
  } else if (response.status === 460) {
    handle460Error();
  } else if (response.status === 461) {
    handle461Error();
  } else if (response.status === 463) {
    handle463Error();
  } else if (response.status === 464) {
    handle464Error();
  } else {
    handleError();
  }
}

function handle460Error() {
  const reset_codeInput = document.getElementById('reset-code');
  document.getElementById('reset-code').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Wrong recovery code entered';
  reset_codeInput.parentElement.appendChild(alertDiv);
  reset_codeInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

function handle463Error() {
  const passwordInput = document.getElementById('password');
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Password must have at least 8 characters';
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });
  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

function handle464Error() {
  const passwordInput = document.getElementById('password');
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Password cannot have more than 23 characters';
  document.getElementById('passwordRequirementComponents').style.color = "red";
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });
  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}



function handle461Error() {
  const passwordInput = document.getElementById('password');
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Password must have at least 5 characters';
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });
  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

function handleError() {
  const passwordInput = document.getElementById('password');
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Something went wrong';
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });
}


const password = document.getElementById('password');
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
      document.getElementById('password-retype').parentElement.appendChild(alertDiv);
    }
  }
}

function removePasswordAlert() {
  const alertElement = document.getElementById('passwordError');
  if (alertElement) {
    alertElement.parentElement.removeChild(alertElement);
  }
}