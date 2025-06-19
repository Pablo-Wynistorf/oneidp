addEventListener('DOMContentLoaded', () => {
  const passwordField = document.getElementById('password');

  const recoverButton = document.getElementById('recover-button');
  recoverButton.addEventListener('click', setNewPassword);

  document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      setNewPassword();
    }
  });
});

function setNewPassword() {
  const passwordinput = document.getElementById('password');
  const password = passwordinput.value;

  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = true;
  recoverButton.innerText = '';
  recoverButton.classList.add('flex', 'justify-center', 'items-center', 'text-gray-500')
  recoverButton.innerHTML = `<img src="/signup/images/spinner.svg" width="24" height="24" />`;

  if (!password || password === '' || password === 'undefined') {
    const recoverButton = document.getElementById('recover-button');
    recoverButton.disabled = false;
    recoverButton.innerText = 'Set new password';
    recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
    displayAlertError('All fields are required');
    return;
  }

  try {
    fetch(`/api/auth/user/setpassword`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password })
    })
    .then(handleResponse)
    .catch(handleError);
  } catch (error) {
    handleError();
  }
}


function handleResponse(response) {
  if (response.status === 200) {
    return handle200Response();
  } else if (response.status === 460) {
    return handle460Error();
  } else if (response.status === 461) {
    return handle461Error();
  } else {
    return handleError();
  }
}

function handle200Response() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === '' || redirectUri === 'undefined') {
    window.location.href = '/dashboard';
  } else {
    window.location.href = redirectUri;
  }
}

function handle460Error() {
  document.getElementById('password').value = '';
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = false;
  recoverButton.innerText = 'Set new password';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character')
}

function handle461Error() {
  document.getElementById('password').value = '';
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = false;
  recoverButton.innerText = 'Set new password';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  window.location.href = '/recovery';
}

function handleError() {
  document.getElementById('password').value = '';
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = false;
  recoverButton.innerText = 'Set new password';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Something went wrong')
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
