const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';

function redirect_login() {
    window.location.href = '/login'
  }


function sendResetCode() {
  const resetEmailImput = document.getElementById('email');
  const email = resetEmailImput.value;

  fetch(`/api/sso/data/resetpassword`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email })
  })
  .then(handleResponse)
}

function handleResponse(response) {
  if (response.status === 200) {
      window.location.href = '/setpassword/';
  } else if (response.status === 460) {
    handle460Error();
  }else {
    handleError();
  }
}

function handle460Error() {
  usernameInput.value = '';
  displayError('Email not found')
}


function handleError() {
  document.getElementById('email').value = '';
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
