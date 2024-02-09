const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';



function sendResetCode() {
  const resetEmailImput = document.getElementById('email-field');
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
      window.location.href = '/setpassword';
  } else if (response.status === 404) {
    handle404Error();
  }else {
    handleError();
  }
}

function handle404Error() {
  document.getElementById('email-field').value = '';
  displayError('Error: No account found with that email address.')
}


function handleError() {
  document.getElementById('email-field').value = '';
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

document.querySelector('#email-field').focus();

document.addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    sendResetCode();
  }
});