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
  loginButton.classList.add('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  loginButton.innerHTML = `<img src="/login/images/spinner.svg" width="24" height="24" />`

  const username_or_email = usernameInput.value;
  const password = passwordInput.value;
  const redirectUri = getRedirectUri();

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
    body: JSON.stringify({ username_or_email, password, redirectUri })
  })
    .then(response => handleResponse(response, { redirectUri }));
}


function handleResponse(response, data) {
  const redirectUri = data.redirectUri;
  if (response.status === 200) {
    if (redirectUri === 'null' || redirectUri === 'undefined') {
      window.location.href = '/dashboard';
    } else if (!redirectUri) {
      window.location.href = '/dashboard';
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
  const loginButton = document.getElementById('login-button');
  loginButton.disabled = false;
  loginButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  loginButton.innerHTML = `Sign In`
  usernameInput.value = '';
  passwordInput.value = '';
  usernameInput.focus();
  displayAlertError('Username or password is incorrect');
}


function handle463Error(redirectUri) {
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    return window.location.replace('/mfa')
  }
  window.location.replace(`/mfa/?redirect=${redirectUri}`)
}

function handleError() {
  displayAlertError('Something went wrong')
}

function redirect_signup() {
  const redirectUrl = getRedirectUri()
  if (!redirectUrl || redirectUrl === 'null' || redirectUrl === 'undefined') {
    window.location.href = '/signup';
  } else {
  window.location.href = `/signup?redirect=${redirectUrl}`;
  }
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
