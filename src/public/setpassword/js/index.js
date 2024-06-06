const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';

function ingestCode() {
  const password_reset_code = getCookie('password_reset_code');
  if (password_reset_code) {
    const resetCodeField = document.getElementById('reset-code-field');
    resetCodeField.value = password_reset_code;
    resetCodeField.addEventListener('mouseenter', function() {
      this.disabled = true;
    });
    resetCodeField.addEventListener('mouseleave', function() {
      this.disabled = false;
    });
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
  var password1 = document.getElementById("password-field").value;
  var password2 = document.getElementById("password-retype-field").value;
  var reset_code = document.getElementById("reset-code-field").value;
  
  if (reset_code.length < 6) {
    displayError('Recovery code must have at least 6 characters');
  }
  if (password1 === password2) {
    setNewPassword();
  } else {
    displayError('Passwords do not match');
  }
}

function setNewPassword() {
  const passwordInput = document.getElementById('password-field');
  const resetCodeInput = document.getElementById('reset-code-field');
  const password = passwordInput.value;
  const password_reset_code = resetCodeInput.value;

  try {
    fetch(`/api/auth/user/setpassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password, password_reset_code })
    })
    .then(handleResponse)
    .catch(handleError);
  } catch (error) {
    handleError();
  }
}

function removeResetCode() {
  var pastDate = new Date(0);
  document.cookie = "password_reset_code=; expires=" + pastDate.toUTCString() + "; path=/";
  return null;
}


function handleResponse(response) {
  if (response.status === 200) {
    return response.json().then(data => {
      removeResetCode();
      window.location.href = '/home'
    })
  } else if (response.status === 460) {
    handle460Error();
  } else if (response.status === 461) {
    handle461Error();
  } else {
    handleError();
  }
}


function handle460Error() {
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  displayError('Error: Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character')
}

function handle461Error() {
  document.getElementById('reset-code').value = '';
  displayError('Error: Wrong recovery code entered')
}

function handleError() {
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  displayError('Error: Something went wrong')
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
