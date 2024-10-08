document.addEventListener('DOMContentLoaded', () => {
  const emailField = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');

  emailField.focus();

  emailField.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      recover();
    }
  });

  recoverButton.addEventListener('click', recover);
});

async function recover() {
  const resetEmailInput = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = true;
  const email = resetEmailInput.value;

  recoverButton.innerText = '';
  recoverButton.classList.add('flex', 'justify-center', 'items-center', 'text-gray-500');
  recoverButton.innerHTML = `<img src="/signup/images/spinner.svg" width="24" height="24" />`;

  if (email === '' || email === null || email === undefined) {
    recoverButton.disabled = false;
    recoverButton.innerText = 'Get recovery code';
    recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500');
    displayAlertError('Enter your email address to get a recovery code.');
    return;
  }

  await fetch(`/api/auth/user/resetpassword`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email })
  })
    .then(response => {
      if (response.status === 200) {
        return handle200Response();
      } else if (response.status === 404) {
        return handle404Error();
      } else {
        return handleError();
      }
    });
}

function handle200Response() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/setpassword';
  } else {
    window.location.href = `/setpassword?redirectUri=${redirectUri}`;
  }
}

function handle404Error() {
  const resetEmailInput = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  resetEmailInput.value = '';
  recoverButton.disabled = false;
  recoverButton.innerText = 'Get recovery code';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500');
  displayAlertError('No account found with that email address.');
}

function handleError() {
  const resetEmailInput = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  resetEmailInput.value = '';
  recoverButton.disabled = false;
  recoverButton.innerText = 'Get recovery code';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500');
  displayAlertError('Something went wrong');
}

function redirect_login() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/login';
  } else {
    window.location.href = `/login?redirectUri=${redirectUri}`;
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


function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}
