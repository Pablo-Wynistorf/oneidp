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
          removeEmailVerificationToken();
          window.location.href = '/home/';
        }
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

function verifyEmail() {
  const email_verification_codeImput = document.getElementById('verification-code');
  const email_verification_code = email_verification_codeImput.value;
  const email_verification_token = getCookie('email_verification_token');
  if (email_verification_token) {
    fetch(`/api/sso/confirm`, {
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


function handleResponse(response) {
  if (response.status === 200) {
    return response.json().then(data => {
      removeEmailVerificationToken();
      window.location.href = '/home'
    })
  } else if (response.status === 460) {
    handle460Error();
  } else {
    handleError();
  }
}

function handle460Error() {
  const verification_codeInput = document.getElementById('verification-code');
  document.getElementById('verification-code').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Wrong verification code entered';
  verification_codeInput.parentElement.appendChild(alertDiv);
  verification_codeInput.addEventListener('click', () => {
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


function redirect_login() {
  window.location.href = '/login'
}