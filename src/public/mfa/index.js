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


var inputs = document.querySelectorAll('#mfaInputContainer input');
var collectedInputs = '';

const mfa_token = getCookie('mfa_token');

inputs.forEach(function(input) {
    input.addEventListener('input', function() {
        collectedInputs = ''; 
        inputs.forEach(function(input) {
            collectedInputs += input.value;
        });
        if (collectedInputs.length === inputs.length) {
            fetch(`/api/mfa/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${mfa_token}`
                },
                body: JSON.stringify({
                    'mfaVerifyCode': collectedInputs
                })
            })
            .then(response => handleResponseVerify(response)) 
            .catch(error => handleError(error));
        }
    });
});



function handleResponse(response) {
  if (response.status === 200) {
    document.cookie = "mfa_token=; expires=" + pastDate.toUTCString() + "; path=/";
  } else if (response.status === 460) {
    return handle460Error();
  } else {
    handleError();
  }
}


function handleResponseVerify(response) {
  if (response.status === 200) {
    displaySuccess('Success: Verified! . You\'re getting redirected')
    setTimeout(() => {
      window.location.replace('/home')
  }, 2500);
  } else if (response.status === 460) {
    return handle460Error();
  } else if (response.status === 461) {
    handle461Error();
  } else {
    handleError();
  }
}


function handle460Error() {
  displayError('MFA not enabld');
  setTimeout(() => {
    window.location.replace('/home');
  }, 5000);
}

function handle461Error() {
  displayError('Error: MFA verification code invalid');
  clearInputValues();
  jumpToFirstInput();
}


function handleError() {
  displayError('Something went wrong, try again later')
  clearInputValues();
  jumpToFirstInput();
  window.location.replace('/home')
}


function clearInputValues() {
  var inputs = document.querySelectorAll('#mfaInputContainer input');
  inputs.forEach(function(input) {
    input.value = '';
  });
}

function jumpToFirstInput() {
  var firstInput = document.querySelector('#mfaInputContainer input');
  if (firstInput) {
    firstInput.focus();
  }
}


function displayError(errorMessage) {
  errorBox.textContent = errorMessage;
  document.body.appendChild(errorBox);
  setTimeout(() => {
      errorBox.remove();
  }, 2500);
}

function displaySuccess(successMessage) {
  successBox.textContent = successMessage;
  document.body.appendChild(successBox);
  setTimeout(() => {
      successBox.remove();
  }, 2500);
}


function moveToNextOrPreviousInput(input, isBackspace) {
  const maxLength = parseInt(input.getAttribute('maxlength'));
  const currentLength = input.value.length;
  
  if (isBackspace && currentLength === 0) {
    const previousInput = input.previousElementSibling;
    if (previousInput) {
      previousInput.focus();
    }
  } else if (!isBackspace && currentLength >= maxLength) {
    const nextInput = input.nextElementSibling;
    if (nextInput) {
      nextInput.focus();
    }
  }
}

function onlyNumbers(event) {
  const key = event.key;
  if (isNaN(key) && key !== "Backspace") {
    event.preventDefault();
  }
}

function handleKeyDown(event) {
  const key = event.key;
  if (key === "Backspace") {
    const input = event.target;
    moveToNextOrPreviousInput(input, true);
  }
}