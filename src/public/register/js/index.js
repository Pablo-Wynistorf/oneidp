const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';

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


const password = document.getElementById('password-field');

function isStrongPassword(password) {
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&.()/^])([A-Za-z\d@$!%*?&.]{8,})$/;
  return passwordPattern.test(password);
}

function passwordRequirements(event) {
  const password = event.target.value;

  const isStrong = isStrongPassword(password);

  if (isStrong) {
    document.getElementById('passwordRequirementComponents').style.color = "green";
    document.getElementById('btn').disabled = false;
  } else {
    document.getElementById('passwordRequirementComponents').style.color = "red";
    document.getElementById('btn').disabled = true;
  }
}

function checkPasswordOnBlur(event) {
  const password = event.target.value;
  const isStrong = isStrongPassword(password);

  if (!isStrong && (password.trim() !== '')) {
    document.getElementById('passwordRequirementComponents').style.color = "red";

    if (!document.getElementById('passwordError')) {
      const alertDiv = document.createElement('div');
      alertDiv.textContent = 'Password doesn\'t match our requirements';
      alertDiv.className = 'alert';
      alertDiv.id = 'passwordError';
      document.getElementById('password-retype').parentElement.appendChild(alertDiv);
    }
  }
}


function createUser() {
  var password1 = document.getElementById("password-field").value;
  var password2 = document.getElementById("password-retype-field").value;
    if (password1 === password2) {
        register();
    } else {
      const passwordRetype_imput = document.getElementById('password-retype-field');
      const alertDiv = document.createElement('div');
    }
}


function register() {
  const username = document.getElementById('username-field').value;
  const password = document.getElementById('password-field').value;
  const email = document.getElementById('email-field').value;
  fetch(`/api/sso/auth/register`, {
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
  if (response.status === 200) {
    return response.json().then((data) => {
      window.location.href = '/verify';
    });
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
  } else if (response.status === 465) {
    handle465Error();
  } else if (response.status === 466) {
    handle466Error();
  } else if (response.status === 467) {
    handle467Error();
  }else {
    handleError();
  }
}


function handle460Error() {
  const emailInput = document.getElementById('email');
  emailInput.value = '';
  displayError('Error: Email already registered')
}


function handle461Error() {
  const usernameInput = document.getElementById('username');
  usernameInput.value = '';
  displayError('Error: Username already used')
}

function handle462Error() {
  const passwordInput = document.getElementById('password');
  const passwordInputRetype = document.getElementById('password-retype');
  passwordInput.value = '';
  passwordInputRetype.value = '';
  displayError('Error: Password must have at least 8 characters')
}


function handle463Error() {
  const usernameInput = document.getElementById('username');
  usernameInput.value = '';
  displayError('Error: Username cannot have more than 20 characters')
}

function handle465Error() {
  const passwordInput = document.getElementById('password');
  passwordInput.value = '';
  displayError('Error: Pasword must have at least 8 characters')
}

function handle464Error() {
  const passwordInput = document.getElementById('password');
  passwordInput.value = '';
  displayError('Error: Pasword cannot have more than 23 characters')
}

function handle466Error() {
  emailInput.value = '';
  displayError('Error: Invalid email address')
}

function handle467Error() {
  document.getElementById('passwordRequirementComponents').style.color = "red";
  displayError('Error: Password doesnt meet our requirements')
}

function handleError() {
  displayError('Error: Something went wrong')
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
