addEventListener('DOMContentLoaded', () => {
  const verifyCodeInput = document.getElementById('verify-code');
  verifyCodeInput.focus();

  verifyCodeInput.addEventListener('input', function() {
    if (this.value.length === 6) {
      if (this.value.match(/^[0-9]+$/)) {
        verifyCode(this.value);
      } else {
        displayAlertError('Please enter a valid verification code');
        this.value = '';
      }
    } else if (this.value.length > 6) {
      this.value = this.value.slice(0, 6);
    }
  });
});


function verifyCode() {
  const verify_code = document.getElementById('verify-code').value;

  if (verify_code.length === 6) {
    fetch(`/api/auth/user/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email_verification_code: verify_code })
    })
      .then(handleResponse)
      .catch(handleError);
  }
}

function handleResponse(response) {
  if (response.status === 200) {
      window.location.href = '/dashboard';
    }
    else if (response.status === 460) {
    return handle460Error();
  } else if (response.status === 400) {
    window.location.href = '/login';
  } else {
    handleError();
  }
}

function handle460Error() {
  displayAlertError('Wrong verification code entered');
  document.getElementById('verify-code').value = '';
  document.getElementById('verify-code').focus();
}

function handleError() {
  displayAlertError('An error occurred. Please try again later.');
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
