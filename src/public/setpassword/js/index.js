addEventListener('DOMContentLoaded', () => {
  ingestCode();
  const recoveryCode = document.getElementById('recovery-code');
  recoveryCode.focus();

  const passwordField = document.getElementById('password');

  const recoverButton = document.getElementById('recover-button');
  recoverButton.addEventListener('click', setNewPassword);

  recoveryCode.addEventListener('input', function() {
    if (this.value.length === 6) {
      if (this.value.match(/^[0-9]+$/)) {
        passwordField.focus();
      } else {
        displayAlertError('Please enter a valid recovery code');
        this.value = '';
      }
    } else if (this.value.length > 6) {
      this.value = this.value.slice(0, 6);
    }
  });

  document.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      setNewPassword();
    }
  });
});

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


function ingestCode() {
  const password_reset_code = getCookie('password_reset_code');
  if (password_reset_code) {
    const recoveryCode = document.getElementById('recovery-code');
    recoveryCode.value = password_reset_code;
    const passwordField = document.getElementById('password');
    passwordField.focus();
    recoveryCode.disabled = true;
  }
}

function setNewPassword() {
  const passwordinput = document.getElementById('password');
  const recoveryCodeInput = document.getElementById('recovery-code');
  const password = passwordinput.value;
  const recoveryCode = recoveryCodeInput.value;

  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = true;
  recoverButton.innerText = '';
  recoverButton.classList.add('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  recoverButton.innerHTML = `<img src="/signup/images/spinner.svg" width="24" height="24" />`;

  if (!password || password === '' || password === 'undefined' || !recoveryCode || recoveryCode === '' || recoveryCode === 'undefined') {
    const recoverButton = document.getElementById('recover-button');
    recoverButton.disabled = false;
    recoverButton.innerText = 'Set new account password';
    recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
    displayAlertError('All fields are required');
    return;
  }

  try {
    fetch(`/api/auth/user/setpassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password, password_reset_code: recoveryCode })
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
      window.location.href = '/dashboard'
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
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = false;
  recoverButton.innerText = 'Set new account password';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character')
}

function handle461Error() {
  removeResetCode();
  document.getElementById('recovery-code').value = '';
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = false;
  recoverButton.innerText = 'Set new account password';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Wrong recovery code entered')
}

function handleError() {
  removeResetCode();
  document.getElementById('password').value = '';
  document.getElementById('recovery-code').value = '';
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = false;
  recoverButton.innerText = 'Set new account password';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Something went wrong')
}


function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}
