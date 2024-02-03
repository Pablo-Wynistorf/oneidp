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
  fetch(`/mfa/setup`, {
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
    console.error('Error:', error);
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
            fetch(`/mfa/setup/verify`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`
                },
                body: JSON.stringify({
                    'mfaVerifyCode': `${collectedInputs}`
                })
            })
            .then(response => handleResponse(response))
            handleResponse(response)
            .catch(error => {
                console.error('Error:', error);
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
  } else if (response.status === 404) {
    handle404Error();
    throw new Error('Resource not found');
  } else {
    handleError();
    throw new Error('Unknown error');
  }
}

function handle460Error() {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = 'MFA Already enabled';
  const passwordInput = document.getElementById('twoFaInputContainer');
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });
  setTimeout(() => {
    alertDiv.remove();
    window.location.replace('/home');
  }, 5000);
}

function handleError() {
  // Handle generic error, could be logging, displaying a message, etc.
  console.error('An error occurred');
}

function handle404Error() {
  // Handle 404 error, could be logging, displaying a message, etc.
  console.error('Resource not found');
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
  // Allow only numbers and the backspace key
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