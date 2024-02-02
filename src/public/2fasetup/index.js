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
  .then(response => response.json())
  .then(data => {
      document.getElementById('qrCode').src = data.imageUrl;
      document.getElementById('secret').value = data.secret;
      qrCodeLoaded = true;
  })
}