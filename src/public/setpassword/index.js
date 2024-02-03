const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';

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
  document.getElementById('reset-code').value = '';
  displayError('Error: Wrong recovery code entered')
}

function handle463Error() {
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  displayError('Password must have at least 8 characters')
}

function handle464Error() {
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  displayError('Password cannot have more than 23 characters')
}



function handle461Error() {
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  displayError('Password must have at least 5 characters')
}

function handleError() {
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  displayError('Error: Something went wrong')
}


const password = document.getElementById('password');
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
    document.getElementById('passwordRequirementComponents').style.color = "#f23f42";
  }
}

function checkPasswordOnBlur(event) {
  const password = event.target.value;
  const isStrong = isStrongPassword(password);

  if (!isStrong && (password.trim() !== '')) {
    document.getElementById('passwordRequirementComponents').style.color = "#f23f42";

    if (!document.getElementById('passwordError')) {
      displayError('Password doesn\'t match our requirements')
  }
 }
}

function removePasswordAlert() {
  const alertElement = document.getElementById('passwordError');
  if (alertElement) {
    alertElement.parentElement.removeChild(alertElement);
  }
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
