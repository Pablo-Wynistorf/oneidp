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
  fetch(`/2fa/setup`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  })
  .then(response => handleResponse(response)) // Fixed this line
  .then(data => {
    document.getElementById('qrCode').src = data.imageUrl;
    document.getElementById('secret').value = data.secret;
    qrCodeLoaded = true;
  })
  .catch(error => {
    console.error('Error:', error);
    handleError();
  }); // Added catch block to handle errors
}

function handleResponse(response) {
  if (response.status === 200) {
    return response.json(); // Added to parse response body as JSON
  } else if (response.status === 460) {
    return handle460Error();
  } else if (response.status === 404) {
    handle404Error();
    throw new Error('Resource not found'); // Throwing error for resource not found
  } else {
    handleError();
    throw new Error('Unknown error'); // Throwing error for unknown error
  }
}

function handle460Error() {
  const alertDiv = document.createElement('div');
  alertDiv.className = 'alert';
  alertDiv.textContent = '2FA Already enabled';
  const passwordInput = document.getElementById('2facode');
  passwordInput.parentElement.appendChild(alertDiv);
  passwordInput.addEventListener('click', () => {
    alertDiv.remove();
  });

  window.location.replace('/home');
  setTimeout(() => {
    alertDiv.remove();
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