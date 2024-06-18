document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('email-field').focus();
  const recoverButton = document.getElementById('recover-button');
  recoverButton.addEventListener('click', recover);
});

function recover() {
  const resetEmailImput = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = true;
  const email = resetEmailImput.value;

  recoverButton.innerText = '';
  recoverButton.classList.add('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  recoverButton.innerHTML = `<img src="/signup/images/spinner.svg" width="24" height="24" />`;

  if (email === '' || email === null || email === undefined) {
    recoverButton.disabled = false;
    recoverButton.innerText = 'Get recovery code';
    recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
    displayAlertError('Enter your email address to get a recovery code.');
    return;
  }

    fetch(`/api/auth/user/resetpassword`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email })
  })
    .then(handleResponse)
    .catch(handleError);
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
  const resetEmailImput = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  resetEmailImput.value = '';
  recoverButton.disabled = false;
  recoverButton.innerText = 'Get recovery code';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('No account found with that email address.')
}


function handleError() {
  const resetEmailImput = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  resetEmailImput.value = '';
  recoverButton.disabled = false;
  recoverButton.innerText = 'Get recovery code';
  recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500')
  displayAlertError('Something went wrong')
}


function redirect_login() {
  window.location.href = '/login';
}


function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}