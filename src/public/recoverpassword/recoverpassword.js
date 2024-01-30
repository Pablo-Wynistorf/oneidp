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
    return response.json().then(data => {
      window.location.href = '/setpassword/';
    });
  } else if (response.status === 460) {
    handle460Error();
  }else {
    handleError();
  }
}

function handle460Error() {
  const usernameInput = document.getElementById('email');
  usernameInput.value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Email not found';
  usernameInput.parentElement.appendChild(alertDiv);
  usernameInput.addEventListener('click', () => {
    alertDiv.remove();
  });
  setTimeout(() => {
    alertDiv.remove();
  }, 5000);
}


function handleError() {
  const emailImput = document.getElementById('email');
  document.getElementById('email').value = '';
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'Something went wrong';
  emailImput.parentElement.appendChild(alertDiv);
  emailImput.addEventListener('click', () => {
    alertDiv.remove();
  });
}