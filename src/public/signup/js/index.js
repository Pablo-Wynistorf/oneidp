document.addEventListener('DOMContentLoaded', () => {
  const firstNameField = document.getElementById('first-name-field');
  const lastNameField = document.getElementById('last-name-field');
  const usernameField = document.getElementById('username-field');
  const emailField = document.getElementById('email-field');
  const passwordField = document.getElementById('password-field');
  const signupButton = document.getElementById('signup-button');

  if (firstNameField) {
    firstNameField.focus();
  }

  const validateFields = () => {
    const allFilled =
      firstNameField.value.trim() &&
      lastNameField.value.trim() &&
      usernameField.value.trim() &&
      emailField.value.trim() &&
      passwordField.value.trim();

    signupButton.disabled = !allFilled;
    signupButton.classList.toggle('opacity-50', !allFilled);
    signupButton.classList.toggle('cursor-not-allowed', !allFilled);
  };

  [firstNameField, lastNameField, usernameField, emailField, passwordField].forEach(field =>
    field.addEventListener('input', validateFields)
  );

  validateFields();

  if (signupButton) {
    signupButton.addEventListener('click', signup);
  }

  document.addEventListener('keypress', (event) => {
    if (event.key === 'Enter' && !signupButton.disabled) {
      signup();
    }
  });
});


function signup() {
  const firstName = document.getElementById('first-name-field').value;
  const lastName = document.getElementById('last-name-field').value;
  const username = document.getElementById('username-field').value;
  const password = document.getElementById('password-field').value;
  const email = document.getElementById('email-field').value;
  const signupButton = document.getElementById('signup-button');

  signupButton.disabled = true;
  signupButton.innerText = '';
  signupButton.classList.add('flex', 'justify-center', 'items-center', 'text-gray-500');
  signupButton.innerHTML = `<img src="/signup/images/spinner.svg" width="24" height="24" />`;

  if (!firstName || !lastName || !username || !password || !email) {
    signupButton.disabled = false;
    signupButton.innerText = 'Create account';
    signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500');
    displayAlertError('All fields are required');
    return;
  }

  fetch(`/api/auth/signup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ firstName, lastName, username, password, email }),
  })
    .then(handleResponse)
    .catch(handleError);
}


function handleResponse(response) {
  document.getElementById('signup-button').disabled = false;
  if (response.status === 200) {
    handle200Response();
  } else if (response.status === 429) {
    handle429Error();
  } else if (response.status === 460) {
    handle460Error();
  } else if (response.status === 461) {
    handle461Error();
  } else if (response.status === 462) {
    handle462Error();
  } else if (response.status === 463) {
    handle463Error();
  } else if (response.status === 464) {
    handle464Error();
  } else {
    handleError();
  }
}

function handle200Response() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/verify';
  } else {
    window.location.href = '/verify' + (redirectUri ? `?redirectUri=${redirectUri}` : '');
  }
}

function handle429Error() {
  resetSignupButton();
  displayAlertError('Error: Too many requests');
}

function handle460Error() {
  resetSignupButton();
  document.getElementById('username-field').value = '';
  displayAlertError('Username must only contain letters, numbers, and dashes and be between 3 and 20 characters');
}

function handle461Error() {
  resetSignupButton();
  document.getElementById('email-field').value = '';
  displayAlertError('Invalid email address');
}

function handle462Error() {
  resetSignupButton();
  document.getElementById('password-field').value = '';
  displayAlertError('Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character');
}

function handle463Error() {
  resetSignupButton();
  displayAlertError('Email already registered');
}

function handle464Error() {
  resetSignupButton();
  displayAlertError('Username already taken');
}

function handleError() {
  resetSignupButton();
  displayAlertError('Something went wrong, please try again later');
}

function resetSignupButton() {
  const signupButton = document.getElementById('signup-button');
  signupButton.disabled = false;
  signupButton.innerText = 'Create account';
  signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500');
}

function displayAlertSuccess(message) {
  new Noty({
    text: message,
    type: 'success',
    layout: 'topRight',
    timeout: 5000,
    theme: 'metroui',
    progressBar: true
  }).show();
}

function displayAlertError(message) {
  new Noty({
    text: message,
    type: 'error',
    layout: 'topRight',
    timeout: 5000,
    theme: 'metroui',
    progressBar: true
  }).show();
}

function redirect_login() {
  const redirectUrl = getRedirectUri();
  if (!redirectUrl || redirectUrl === 'null' || redirectUrl === 'undefined') {
    window.location.href = '/login';
  } else {
    window.location.href = `/login?redirectUri=${redirectUrl}`;
  }
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

function getRedirectUri() {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUri = urlParams.get('redirectUri');
  if (redirectUri) {
    const queryString = window.location.search;
    return queryString.substring(queryString.indexOf('redirectUri=') + 'redirectUri='.length);
  }
  return null;
}
