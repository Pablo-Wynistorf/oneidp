const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';

const password = document.getElementById('password-field');
password.addEventListener('input', passwordRequirements);


function isStrongPassword(password) {
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[@$!%*?&.()/^])([A-Za-z\d@$!%*?&.]{8,})$/;
  return passwordPattern.test(password);
}

function passwordRequirements(event) {
  const password = event.target.value;

  const isStrong = isStrongPassword(password);

  if (isStrong) {
    document.getElementById('passwordRequirementComponents').style.color = "green";
    document.getElementById('register-button').disabled = false;
  } else {
    document.getElementById('passwordRequirementComponents').style.color = "red";
    document.getElementById('register-button').disabled = true;
  }
}

function checkPasswordOnBlur(event) {
  const password = event.target.value;
  const isStrong = isStrongPassword(password);

  if (!isStrong && (password.trim() !== '')) {
    document.getElementById('passwordRequirementComponents').style.color = "red";

    if (!document.getElementById('passwordError')) {
      displayError('Error: Password doesn\'t match our requirements');
    }
  }
}


function createUser() {
  var password1 = document.getElementById("password-field").value;
  var password2 = document.getElementById("password-retype-field").value;
    if (password1 === password2) {
        register();
    } else {
      displayError("Error: Passwords do not match")
      document.getElementById('passwordRequirementComponents').style.color = "red";
      document.getElementById('register-button').disabled = true;
      document.getElementById("password-field").value = '';
      document.getElementById("password-retype-field").value = '';

    }
}


function register() {
  const username = document.getElementById('username-field').value;
  const password = document.getElementById('password-field').value;
  const email = document.getElementById('email-field').value;
  document.getElementById('register-button').disabled = true;
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
  document.getElementById('register-button').disabled = false;
  if (response.status === 200) {
    return response.json().then((data) => {
      const redirectUri = getRedirectUri();
      window.location.href = '/verify' + (redirectUri ? `?redirect_uri=${redirectUri}` : '');
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

function handle429Error() {
  displayError('Error: Too many requests')
}


function handle460Error() {
  const emailInput = document.getElementById('email-field');
  emailInput.value = '';
  displayError('Error: Email already registered')
}


function handle461Error() {
  const usernameInput = document.getElementById('username-field');
  usernameInput.value = '';
  displayError('Error: Username already used')
}

function handle462Error() {
  const usernameInput = document.getElementById('username-field');
  usernameInput.value = '';
  displayError('Username must only contain letters, numbers, and dashes and be between 3 and 20 characters')
}


function handle463Error() {
  const usernameInput = document.getElementById('username-field');
  usernameInput.value = '';
  displayError('Error: Username cannot have more than 20 characters')
}

function handle464Error() {
  const passwordInput = document.getElementById('password-field');
  passwordInput.value = '';
  document.getElementById('passwordRequirementComponents').style.color = "red";
  document.getElementById('register-button').disabled = true;
  displayError('Error: Pasword cannot have more than 23 characters')
}

function handle465Error() {
  const passwordInput = document.getElementById('password-field');
  passwordInput.value = '';
  document.getElementById('passwordRequirementComponents').style.color = "red";
  document.getElementById('register-button').disabled = true;
  displayError('Error: Pasword must have at least 8 characters')
}

function handle466Error() {
  const emailInput = document.getElementById('email-field');
  emailInput.value = '';
  displayError('Error: Invalid email address')
}

function handle467Error() {
  document.getElementById('passwordRequirementComponents').style.color = "red";
  document.getElementById('register-button').disabled = true;
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
  }, 4000);
}

function getRedirectUri() {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUri = urlParams.get('redirect_uri');
  return redirectUri;
}

document.querySelector('#email-field').focus();

document.addEventListener('keypress', function(event) {
  if (event.key === 'Enter') {
    createUser();
  }
});