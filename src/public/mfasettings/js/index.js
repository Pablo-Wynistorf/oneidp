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
  document.getElementById('scan-info').style.display = 'block';
  fetch(`/api/mfa/setup`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success === true) {
      document.getElementById('code-box').style.display = 'block'
      document.getElementById('qrCode').style.display = 'block';
      document.getElementById('qrCode').src = data.imageUrl;
      document.querySelector('.mfa-code-input:first-child').focus();
      qrCodeLoaded = true;
    } else if (data.success === false) {
      document.getElementById('btn').style.display = 'block';
      document.getElementById('scan-info').style.display = 'none';
    }
  })
}

var inputs = document.querySelectorAll('.input-container input');

inputs.forEach(function(input) {
    input.addEventListener('input', function(event) {
        var isBackspace = event.inputType === 'deleteContentBackward';
        moveToNextOrPreviousInput(input, isBackspace);
        var collectedInputs = '';
        inputs.forEach(function(input) {
            input.value = input.value.replace(/\D/g, '');
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
                    'mfaVerifyCode': collectedInputs
                })
            })
            .then(response => handleResponseVerify(response))
            .catch(error => handleError(error));
        }
    });
});

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
    if (nextInput && !isNaN(parseInt(event.data))) {
      nextInput.focus();
    }
  }
}





function activate_mfa() {
  fetch(`/api/mfa/setup`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  })
  .then(response => response.json())
  .then(data => {
    if (data.success === true) {
      console.log(data.imageUrl)
      document.getElementById('qrCode').src = data.imageUrl;
      document.getElementById('secret').value = data.secret;
      document.getElementById('qrCode').style.display = 'block';
      document.getElementById('scan-info').style.display = 'block';
      qrCodeLoaded = true;
    }
  })
}

function disable_mfa() {
  fetch(`/api/mfa/disable`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  })
  .then(response => handleResponseMfaDisable(response))
}

function handleResponseMfaDisable(response) {
  if (response.status === 200) {
    displaySuccess("Success: MFA Disabled")
    document.getElementById('btn').style.display = 'none';
    document.getElementById('scan-info').style.display = 'block';
    document.getElementById('qrCode').style.display = 'block';
    document.getElementById('code-box').style.display = 'block';
    document.querySelector('.mfa-code-input:first-child').focus();
    activate_mfa();
  } else if (response.status === 462) {
    return handle462Error();
  } else {
    handleError();
  }
}

function handleResponse(response) {
  if (response.status === 200) {
    document.getElementsByClassName('textbox').style.display = 'block';
  } else if (response.status === 460) {
    return handle460Error();
  } else {
    handleError();
  }
}

function handleResponseVerify(response) {
  if (response.status === 200) {
    displaySuccess('Success: MFA enabled')
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
  document.getElementById('code-box').style.display = 'none';
  document.getElementById('qrCode').style.display = 'none';
  document.getElementById('btn').style.display = 'block';
  displayError('MFA is already enabled');
}

function handle461Error() {
  displayError('Error: MFA verification code invalid');
  clearInputValues();
  jumpToFirstInput();
}


function handle462Error() {
  displayError('MFA is not enabled');
  document.getElementById('btn').style.display = 'block';
}

function handleError() {
  displayError('Something went wrong, try again later');
  clearInputValues();
  jumpToFirstInput();
}


function clearInputValues() {
  var inputs = document.querySelectorAll('.mfa-code-input');
  inputs.forEach(function(input) {
    input.value = '';
  });
}


function jumpToFirstInput() {
  var firstInput = document.querySelector('.mfa-code-input');
  if (firstInput) {
    firstInput.focus();
  }
}


function redirect_home() {
 window.location.replace('/home')
}

function displayError(errorMessage) {
  errorBox.textContent = errorMessage;
  document.body.appendChild(errorBox);
  setTimeout(() => {
      errorBox.remove();
  }, 5000);
}

function displaySuccess(successMessage) {
  successBox.textContent = successMessage;
  document.body.appendChild(successBox);
  setTimeout(() => {
      successBox.remove();
  }, 2500);
}
