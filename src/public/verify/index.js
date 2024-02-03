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
  return null;
}

function verifyEmail() {
  const email_verification_codeImput = document.getElementById('verification-code');
  const email_verification_code = email_verification_codeImput.value;
  const email_verification_token = getCookie('email_verification_token');
  if (email_verification_token) {
    fetch(`/api/sso/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${email_verification_token}`
      },
      body: JSON.stringify({ email_verification_token, email_verification_code})
    })
    .then(handleResponse)
  }
}

function removeEmailVerificationToken() {
  var pastDate = new Date(0);
  document.cookie = "email_verification_token=; expires=" + pastDate.toUTCString() + "; path=/";
  return null;
}

function removeEmailVerificationCode() {
  var pastDate = new Date(0);
  document.cookie = "email_verification_code=; expires=" + pastDate.toUTCString() + "; path=/";
  return null;
}

function handleResponse(response) {
  if (response.status === 200) {
    removeEmailVerificationToken();
    removeEmailVerificationCode();
    window.location.href = '/home'
    } else if (response.status === 460) {
    handle460Error();
  } else {
    handleError();
  }
}

function handle460Error() {
  document.getElementById('verification-code').value = '';
  displayError('Error: Wrong verification code entered')
}


function handleError() {
  document.getElementById('password').value = '';
  document.getElementById('password-retype').value = '';
  displayError('Something went wrong')
}


function redirect_login() {
  window.location.href = '/login'
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
