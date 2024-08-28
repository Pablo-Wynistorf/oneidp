document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('email-field')) {
    document.getElementById('email-field').focus();
  }

  const signupButton = document.getElementById('signup-button')
  if (signupButton) {
    signupButton.addEventListener('click', signup);
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
  const signupButton = document.getElementById('signup-button')

  signupButton.disabled = true;
  signupButton.innerText = '';
  signupButton.classList.add('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  signupButton.innerHTML = `<img src="/signup/images/spinner.svg" width="24" height="24" />`;

  if (!username || !password || !email) {
    const signupButton = document.getElementById('signup-button');
    signupButton.disabled = false;
    signupButton.innerText = 'Create account';
    signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
    displayAlertError('All fields are required');
    return;
  }

  fetch(`/api/auth/signup`, {
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
    handle464Error()
  }else {
    handleError();
  }
}

function handle200Response() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/dashboard';
  } else {
    window.location.href = '/verify' + (redirectUri ? `?redirectUri=${redirectUri}` : '');
  }
}

function handle429Error() {
  const signupButton = document.getElementById('signup-button');
  signupButton.disabled = false;
  signupButton.innerText = 'Create account';
  signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Error: Too many requests')
}


function handle460Error() {
  const signupButton = document.getElementById('signup-button');
  signupButton.disabled = false;
  signupButton.innerText = 'Create account';
  signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  document.getElementById('username-field').value = '';
  displayAlertError('Username must only contain letters, numbers, and dashes and be between 3 and 20 characters')
}

function handle461Error() {
  const signupButton = document.getElementById('signup-button');
  signupButton.disabled = false;
  signupButton.innerText = 'Create account';
  signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  document.getElementById('email-field').value = '';
  displayAlertError('Invalid email address')
}

function handle462Error() {
  const signupButton = document.getElementById('signup-button');
  signupButton.disabled = false;
  signupButton.innerText = 'Create account';
  signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  document.getElementById('password-field').value = '';
  displayAlertError('Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character')
}

function handle463Error() {
  const signupButton = document.getElementById('signup-button');
  signupButton.disabled = false;
  signupButton.innerText = 'Create account';
  signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Email already registered')
}

function handle464Error() {
  const signupButton = document.getElementById('signup-button');
  signupButton.disabled = false;
  signupButton.innerText = 'Create account';
  signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Username already taken')
}

function handleError() {
  const signupButton = document.getElementById('signup-button');
  signupButton.disabled = false;
  signupButton.innerText = 'Create account';
  signupButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
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
  window.location.href = `/login?redirectUri=${redirectUrl}`;
  }
}


function getRedirectUri() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('redirectUri');
}