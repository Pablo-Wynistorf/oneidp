function sendAccessToken() {
  const accessToken = getCookie('access_token');
  if (accessToken) {
    fetch(`/api/sso/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    })
      .then(response => {
        if (response.ok) {
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


function redirect_register() {
  window.location.href = '/register'
}

function redirect_resetpassword() {
  window.location.href = '/recoverpassword'
}


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
    return response.json().then(data => {
      window.location.href = '/home';
    })
  } else if (response.status === 460) {
    handle460Error();
  } else if (response.status === 461) {
    return response.json().then(data => {
    handle461Error();
    window.location.href = '/emailverification';
    })
  } else {
    handleError();
  }
}

function handle460Error() {
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  usernameInput.value = '';
  passwordInput.value = '';
  usernameInput.classList.add('wiggle');
  passwordInput.classList.add('wiggle');
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Username or password wrong';
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

function handle461Error() {
  const usernameInput = document.getElementById('username');
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Email not verified';
  usernameInput.parentElement.appendChild(alertDiv);
  usernameInput.addEventListener('click', () => {
    alertDiv.remove();
  });
  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}

function handleError() {
  const usernameInput = document.getElementById('username');
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Something went wrong';
  usernameInput.parentElement.appendChild(alertDiv);
  usernameInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}



