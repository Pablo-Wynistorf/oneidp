addEventListener('DOMContentLoaded', () => {
  const mfaCodeInput = document.getElementById('mfa-code');
  mfaCodeInput.focus();

  mfaCodeInput.addEventListener('input', function() {
    if (this.value.length === 6) {
      if (this.value.match(/^[0-9]+$/)) {
        verifyCode(this.value);
      } else {
        displayAlertError('Please enter a valid MFA code');
        this.value = '';
      }
    } else if (this.value.length > 6) {
      this.value = this.value.slice(0, 6);
    }
  });
});


function verifyCode() {
  const mfa_code = document.getElementById('mfa-code').value;

  if (mfa_code.length === 6) {
    fetch(`/api/auth/mfa/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mfaVerifyCode: mfa_code })
    })
      .then(response => handleResponse(response))
      .catch(handleError);
  }
}


function handleResponse(response) {
  if (response.status === 200) {
    return handle200Response();
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

function handle200Response() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/dashboard';
  } else {
    window.location.href = redirectUri;
  }
}

function handle460Error() {
  displayAlertError('MFA not enabled');
  setTimeout(() => {
    window.location.replace('/dashboard');
  }, 2000);
}

function handle461Error() {
  document.getElementById('mfa-code').value = '';
  document.getElementById('mfa-code').focus();
  displayAlertError('MFA code is incorrect');
}

function handle462Error() {
  displayAlertError('MFA session expired. Please login again start a new session');
  setTimeout(() => {
    window.location.replace('/login');
  }, 2000);
}

function handleError() {
  displayAlertError('An error occurred');
}

function getRedirectUri() {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUri = urlParams.get('redirectUri');
  if (redirectUri) {
    const queryString = window.location.search;
    return queryString.substring(queryString.indexOf('redirectUri=') + 'redirectUri='.length);
  }
  return null;
}



function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}
