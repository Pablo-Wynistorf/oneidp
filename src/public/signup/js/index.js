document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('email-field')) {
    document.getElementById('email-field').focus();
  }

  document.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
      signup();
    }
  });
});


function signup() {
  const username = document.getElementById('username-field').value;
  const password = document.getElementById('password-field').value;
  const email = document.getElementById('email-field').value;
  document.getElementById('signup-button').disabled = true;

  if (!username || !password || !email) {
    displayAlertError('Error: All fields are required');
    document.getElementById('signup-button').disabled = false;
    return;
  }

  fetch(`/api/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password, email}),
  })
    .then(handleResponse)
    .catch(handleError);
}



function handleResponse(response) {
  document.getElementById('signup-button').disabled = false;
  if (response.status === 200) {
    return response.json().then((data) => {
      const redirectUri = getRedirectUri();
      window.location.href = '/verify' + (redirectUri ? `?redirect=${redirectUri}` : '');
    });
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
    handle464Error()
  }else {
    handleError();
  }
}

function handle429Error() {
  displayAlertError('Error: Too many requests')
}


function handle460Error() {
  document.getElementById('username-field').value = '';
  displayAlertError('Username must only contain letters, numbers, and dashes and be between 3 and 20 characters')
}

function handle461Error() {
  document.getElementById('email-field').value = '';
  displayAlertError('Invalid email address')
}

function handle462Error() {
  document.getElementById('password-field').value = '';
  displayAlertError('Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character')
}

function handle463Error() {
  document.getElementById('email-field').value = '';
  displayAlertError('Email already registered')
}

function handle464Error() {
  document.getElementById('username-field').value = '';
  displayAlertError('Username already taken')
}

function handleError() {
  displayAlertError('Something went wrong, please try again later')
}


function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}

function redirect_login() {
  const redirectUrl = getRedirectUri()
  if (!redirectUrl || redirectUrl === 'null' || redirectUrl === 'undefined') {
    window.location.href = '/login';
  } else {
  window.location.href = `/login?redirect=${redirectUrl}`;
  }
}



function getRedirectUri() {
  const redirectUri = window.location.search.split('redirect=')[1];
  return redirectUri;
}