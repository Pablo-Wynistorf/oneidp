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
    const redirectUri = getRedirectUri();
    fetch(`/api/auth/mfa/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mfaVerifyCode: mfa_code, redirectUri })
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

function handle460Error() {
  displayAlertError('MFA not enabled');
  setTimeout(() => {
    window.location.replace('/home');
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
  const redirectUri = window.location.search.split('redirect=')[1];
  return redirectUri;
}


function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}
