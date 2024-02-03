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

const accessToken = getCookie('access_token');
if (accessToken) {
  fetch(`/api/mfa/setup`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  })
  .then(response => handleResponse(response))
  .then(data => {
    document.getElementById('qrCode').src = data.imageUrl;
    document.getElementById('secret').value = data.secret;
    qrCodeLoaded = true;
  })
  .catch(error => {
    handleError();
  });
}

var inputs = document.querySelectorAll('#mfaInputContainer input');
var collectedInputs = '';
inputs.forEach(function(input) {
    input.addEventListener('input', function() {
        collectedInputs = '';
        inputs.forEach(function(input) {
            collectedInputs += input.value;
        });
        if (collectedInputs.length === inputs.length) {
            fetch(`/api/mfa/setup/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    'mfaVerifyCode': `${collectedInputs}`
                })
            })
            .then(response)
            handleResponse(response)
            .catch(error => {
                handleError();
            });
        }
    });
});



function handleResponse(response) {
  if (response.status === 200) {
    return response.json();
  } else if (response.status === 460) {
    return handle460Error();
  } else if (response.status === 461) {
    handle461Error();
  } else {
    handleError();

  }
}

function handle460Error() {
  displayError('Error: MFA already enabled');
  setTimeout(() => {
    window.location.replace('/home');
  }, 5000);
}

function handle461Error() {
  displayError('Error: MFA verification code invalid');
}

function handleError() {
  displayError('Something went wrong, try again later')
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