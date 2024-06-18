document.addEventListener('DOMContentLoaded', () => {
  const usernameEmailField = document.getElementById('username-email-field');
  if (usernameEmailField) {
    usernameEmailField.focus();
  }

  const loginButton = document.querySelector('.login-button');
  if (loginButton) {
    loginButton.addEventListener('click', login);
  }

  document.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      login();
    }
  });
});

function login() {
  const usernameInput = document.getElementById('username-email-field');
  const passwordInput = document.getElementById('password-field');
  const username_or_email = usernameInput.value;
  const password = passwordInput.value;
  const redirectUri = getRedirectUri();
  fetch(`/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username_or_email, password, redirectUri })
  })
    .then(response => handleResponse(response, { redirectUri }));
}


function handleResponse(response, data) {
  const redirectUri = data.redirectUri;
  if (response.status === 200) {
    if (redirectUri === 'null') {
      window.location.href = '/home';
    } else if (!redirectUri) {
      window.location.href = 'home';
    } else {
      window.location.href = redirectUri;
    }
  } else if (response.status === 461) {
    handle461Error();
  } else if (response.status === 462) {
    handle462Error();
  } else if (response.status === 463) {
    handle463Error(redirectUri);
  } else {
    handleError();
  }
}

function handle461Error() {
  displayAlertError('Email not verified')
  window.location.href = '/verify';
}

function handle462Error() {
  const usernameInput = document.getElementById('username-email-field');
  const passwordInput = document.getElementById('password-field');
  usernameInput.value = '';
  passwordInput.value = '';
  displayAlertError('Username or password is incorrect');
}


function handle463Error(redirectUri) {
  window.location.replace(`/mfa/?redirect=${redirectUri}` || '/mfa')
}

function handleError() {
  displayAlertError('Something went wrong')
}

function redirect_register() {
  const redirectUrl = getRedirectUri()
  window.location.href = '/register' + (redirectUrl ? `?redirect=${redirectUrl}` : '');
}

function getRedirectUri() {
  const redirectUri = window.location.search.split('redirect=')[1];
  return redirectUri;
}


function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}
