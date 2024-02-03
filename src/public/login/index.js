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

document.getElementById("loginForm").addEventListener("submit", function(event) {
  event.preventDefault();
  login();
});


function login() {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const username_or_email = usernameInput.value;
  const password = passwordInput.value;

  fetch(`/api/sso/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username_or_email, password })
  })
    .then(handleResponse)
}


function handleResponse(response) {
  if (response.status === 200) {
    window.location.href = '/home';
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


function handle461Error() {
  displayError('Email not verified')
  window.location.href = '/verify';
}

function handle462Error() {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  usernameInput.value = '';
  passwordInput.value = '';
  usernameInput.classList.add('wiggle');
  passwordInput.classList.add('wiggle');
  displayError('Username or password wrong')
}

function handle463Error() {
  window.location.replace('/mfa')
}

function handleError() {
  displayError('Something went wrong')
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
