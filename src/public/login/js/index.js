document.addEventListener('DOMContentLoaded', () => {
  const usernameEmailField = document.getElementById('username-email-field');
  if (usernameEmailField) {
    usernameEmailField.focus();
  }

  const loginButton = document.getElementById('login-button');
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
  const loginButton = document.getElementById('login-button');

  loginButton.disabled = true;
  loginButton.innerText = '';
  loginButton.classList.add('flex', 'justify-center', 'items-center', 'text-gray-500')
  loginButton.innerHTML = `<img src="/login/images/spinner.svg" width="24" height="24" />`

  const username_or_email = usernameInput.value;
  const password = passwordInput.value;

  if (!username_or_email || !password) {
    displayAlertError('Error: All fields are required');
    loginButton.disabled = false;
    loginButton.innerText = 'Sign In';
    loginButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
    return;
  }

  fetch(`/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username_or_email, password })
  })
    .then(response => handleResponse(response));
}


function handleResponse(response) {
  if (response.status === 200) {
    handle200Response();
  } else if (response.status === 461) {
    handle461Error();
  } else if (response.status === 462) {
    handle462Error();
  } else if (response.status === 463) {
    handle463Error();
  } else {
    handleError();
  }
}


function handle200Response() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/dashboard';
  } else {
    window.location.href = redirectUri;
  }
}

function handle461Error() {
  displayAlertError('Email not verified');
  const redirectUrl = getRedirectUri();
    window.location.replace(`/verify?redirectUri=${redirectUrl}`);
}

function handle462Error() {
  const usernameInput = document.getElementById('username-email-field');
  const passwordInput = document.getElementById('password-field');
  const loginButton = document.getElementById('login-button');

  loginButton.disabled = false;
  loginButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500');
  loginButton.innerHTML = 'Sign In';

  usernameInput.value = '';
  passwordInput.value = '';
  usernameInput.focus();

  displayAlertError('Username or password is incorrect');
}

function handle463Error() {
  const redirectUrl = getRedirectUri();
  if (!redirectUrl || redirectUrl === 'null' || redirectUrl === 'undefined') {
    window.location.href = '/mfa';
  } else {
    window.location.href = `/mfa?redirectUri=${redirectUrl}`;
  }
}

function handleError() {
  displayAlertError('Something went wrong');
}

function redirect_signup() {
  const redirectUrl = getRedirectUri();
  if (!redirectUrl || redirectUrl === 'null' || redirectUrl === 'undefined') {
    window.location.href = '/signup';
  } else {
    window.location.href = `/signup?redirectUri=${redirectUrl}`;
  }
}

function redirect_recovery() {
  const redirectUrl = getRedirectUri();
  if (!redirectUrl || redirectUrl === 'null' || redirectUrl === 'undefined') {
    window.location.href = '/recovery';
  } else {
    window.location.href = `/recovery?redirectUri=${redirectUrl}`;
  }
}

function getRedirectUri() {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUri = urlParams.get('redirectUri');
  if (redirectUri) {
    const queryString = window.location.search;
    return queryString.substring(queryString.indexOf('redirectUri=') + 'redirectUri='.length);
  }
  return null;
}

function handleGitHubAuth() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/api/auth/github';
  } else {
    window.location.href = `/api/auth/github?redirectUri=${redirectUri}`;
  }
}

function handleGoogleAuth() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/api/auth/google';
  } else {
    window.location.href = `/api/auth/google?redirectUri=${redirectUri}`;
  }
}


function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}
