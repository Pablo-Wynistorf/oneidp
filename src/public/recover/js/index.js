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

function recover() {
  const resetEmailInput = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  recoverButton.disabled = true;
  const email = resetEmailInput.value;

  recoverButton.innerText = '';
  recoverButton.classList.add('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500');
  recoverButton.innerHTML = `<img src="/signup/images/spinner.svg" width="24" height="24" />`;

  if (email === '' || email === null || email === undefined) {
    recoverButton.disabled = false;
    recoverButton.innerText = 'Get recovery code';
    recoverButton.classList.remove('flex', 'justify-center', 'items-center', 'h-6', 'w-6', 'text-gray-500');
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
    .then(response => {
      if (response.status === 200) {
        return window.location.replace('/setpassword');
      } else if (response.status === 404) {
        handle404Error();
      } else {
        handleError();
      }
    });
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

function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}
