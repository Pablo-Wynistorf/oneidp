const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';


const inputs = document.querySelectorAll('.mfa-code-input');
var collectedInputs = '';

function verifyCode() {
  let code = '';
  inputs.forEach(input => {
    code += input.value;
  });

  if (code.length === 6) {
    const redirectUri = getRedirectUri();
    fetch(`/api/mfa/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mfaVerifyCode: code, redirectUri })
    })
      .then(response => handleResponse(response, { redirectUri }))
      .catch(handleError);
  }
}


function handleResponse(response, data) {
  const redirectUri = data.redirectUri;
  if (response.status === 200) {
    if (redirectUri === 'null') {
      window.location.href = '/home';
    } else if (!redirectUri) {
      window.location.href = '/home';
    } else {
    window.location.href = redirectUri;
    }
  } else if (response.status === 460) {
    return handle460Error();
  } else if (response.status === 461) {
    return handle461Error();
  } else if (response.status === 462) {
    return handle462Error();
  } else {
    handleError();
  }
}

function handleError() {
  displayError('An error occurred');
}

function handle460Error() {
  displayError('MFA not enabled');
  setTimeout(() => {
    window.location.replace('/home');
  }, 5000);
}

function handle461Error() {
  displayError('MFA code is incorrect');
  inputs.forEach(input => {
    input.value = '';
  }); 
  inputs[0].focus();
}

function handle462Error() {
  displayError('MFA session expired. Please login again start a new session');
  setTimeout(() => {
    window.location.replace('/login');
  }, 5000);
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

function getRedirectUri() {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUri = urlParams.get('redirect_uri');
  return redirectUri;
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
  if (!/^\d$/.test(key) && key !== "Backspace") {
    event.preventDefault();
  }
}

function handleKeyDown(event) {
  const key = event.key;
  const input = event.target;

  if (key === "Backspace") {
    moveToNextOrPreviousInput(input, true);
  } else if ((event.ctrlKey || event.metaKey) && key === "v" && input === document.querySelector('.mfa-code-input:first-child')) {
    event.preventDefault();
    navigator.clipboard.readText().then(pastedText => {
      if (pastedText.length === 6 && /^\d+$/.test(pastedText)) {
        const codes = pastedText.split('');
        codeInputs.forEach((input, index) => {
          input.value = codes[index];
          if (index < codeInputs.length - 1) {
            moveToNextOrPreviousInput(input, false);
          }
        });

        verifyCode();
      }
    }).catch(err => {
      console.error('Failed to read clipboard data: ', err);
    });
  } else {
    const inputValue = input.value;
    if (inputValue.length === 1 && /^\d+$/.test(inputValue)) {
      moveToNextOrPreviousInput(input, false);
    } else if (inputValue.length === 6 && /^\d+$/.test(inputValue)) {
      verifyCode();
    }
  }
}

const codeInputs = document.querySelectorAll('.mfa-code-input');
codeInputs.forEach(input => {
  input.addEventListener('input', function (e) {
    moveToNextOrPreviousInput(this, false);
    verifyCode();
  });
  input.addEventListener('keydown', handleKeyDown);
  input.addEventListener('keypress', onlyNumbers);
});

document.querySelector('.mfa-code-input:first-child').focus();
