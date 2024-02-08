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


function redirect_register() {
  window.location.href = '/register'
}

function redirect_resetpassword() {
  window.location.href = '/recover'
}

document.getElementById("login-button").addEventListener("submit", function(event) {
  event.preventDefault();
  login();
});


function login() {
  const usernameInput = document.getElementById('username-field');
  const passwordInput = document.getElementById('password-field');
  const username_or_email = usernameInput.value;
  const password = passwordInput.value;
  const redirectUri = getRedirectUri();
  fetch(`/api/sso/auth/login`, {
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
    window.location.href = redirectUri || '/home';
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
  displayError('Email not verified')
  window.location.href = '/verify';
}

function handle462Error() {
  const usernameInput = document.getElementById('username-field');
  const passwordInput = document.getElementById('password-field');
  usernameInput.value = '';
  passwordInput.value = '';
  usernameInput.classList.add('wiggle');
  passwordInput.classList.add('wiggle');
  displayError('Username or password wrong')
}

function handle463Error(redirectUri) {
  window.location.replace(`/mfa/?redirect_uri=${redirectUri}` || '/mfa')
}

function handleError() {
  displayError('Something went wrong')
}


function getRedirectUri() {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUri = urlParams.get('redirect_uri');
  return redirectUri;
}




function displaySuccess(successMessage) {
  successBox.textContent = successMessage;
  document.body.appendChild(successBox);
  setTimeout(() => {
      successBox.remove();
  }, 3500);
}

function displayError(errorMessage) {
  errorBox.textContent = errorMessage;
  document.body.appendChild(errorBox);
  setTimeout(() => {
      errorBox.remove();
  }, 3500);
}
