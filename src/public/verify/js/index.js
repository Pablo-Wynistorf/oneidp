const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';

function verifyCode() {
  const codeInputs = document.querySelectorAll('.verification-code-input');
  let code = '';
  codeInputs.forEach(input => {
    code += input.value;
  });

  if (code.length === 6) {
    fetch(`/api/sso/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_verification_code: code })
    })
      .then(handleResponse)
      .catch(handleError);
  }
}

function removeEmailVerificationToken() {
  var pastDate = new Date(0);
  document.cookie = "email_verification_token=; expires=" + pastDate.toUTCString() + "; path=/";
  return null;
}

function handleResponse(response) {
  if (response.status === 200) {
    removeEmailVerificationToken();
    window.location.href = '/home';
  } else if (response.status === 460) {
    handle460Error();
  } else if (response.status === 400) {
    window.location.href = '/login';
  } else {
    handleError();
  }
}

function handle460Error() {
  document.querySelector('.verification-code-input:first-child').focus();
  document.querySelectorAll('.verification-code-input').forEach(input => {
    input.value = '';
  });
  displayError('Error: Wrong verification code entered');
}

function handleError() {
  document.querySelector('.verification-code-input:first-child').focus();
  document.querySelectorAll('.verification-code-input').forEach(input => {
    input.value = '';
  });
  displayError('Something went wrong');
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
  } else if ((event.ctrlKey || event.metaKey) && key === "v" && input === document.querySelector('.verification-code-input:first-child')) {
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


const codeInputs = document.querySelectorAll('.verification-code-input');
codeInputs.forEach(input => {
  input.addEventListener('input', function (e) {
    moveToNextOrPreviousInput(this, false);
    verifyCode();
  });
  input.addEventListener('keydown', handleKeyDown);
  input.addEventListener('keypress', onlyNumbers);
});

document.querySelector('.verification-code-input:first-child').focus();
