/** base64url <-> ArrayBuffer helpers plus WebAuthn ceremony wrappers. */

export function base64urlToBuffer(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  // Chunked to stay clear of the argument-count limit on large buffers.
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function isPasskeySupported() {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

/** Run an authentication ceremony and shape the payload the API expects. */
export async function getAssertion(options) {
  const publicKey = {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
  };

  if (Array.isArray(options.allowCredentials)) {
    publicKey.allowCredentials = options.allowCredentials.map((credential) => ({
      id: base64urlToBuffer(credential.id),
      type: credential.type,
      transports: credential.transports,
    }));
  }

  const assertion = await navigator.credentials.get({ publicKey });

  return {
    id: bufferToBase64url(assertion.rawId),
    rawId: bufferToBase64url(assertion.rawId),
    type: assertion.type,
    response: {
      authenticatorData: bufferToBase64url(assertion.response.authenticatorData),
      clientDataJSON: bufferToBase64url(assertion.response.clientDataJSON),
      signature: bufferToBase64url(assertion.response.signature),
      userHandle: assertion.response.userHandle
        ? bufferToBase64url(assertion.response.userHandle)
        : null,
    },
    clientExtensionResults: assertion.getClientExtensionResults(),
  };
}

/** Run a registration ceremony and shape the payload the API expects. */
export async function createCredential(options) {
  const credential = await navigator.credentials.create({
    publicKey: {
      ...options,
      challenge: base64urlToBuffer(options.challenge),
      user: { ...options.user, id: base64urlToBuffer(options.user.id) },
    },
  });

  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      attestationObject: bufferToBase64url(credential.response.attestationObject),
      clientDataJSON: bufferToBase64url(credential.response.clientDataJSON),
    },
  };
}

/**
 * Turn a WebAuthn DOMException into something worth showing a user.
 * `NotAllowedError` covers both an explicit cancel and a timeout.
 */
export function describePasskeyError(error) {
  switch (error?.name) {
    case 'NotAllowedError':
      return 'Passkey request was cancelled or timed out.';
    case 'InvalidStateError':
      return 'This device already has a passkey registered for your account.';
    case 'NotSupportedError':
      return 'This device does not support passkeys.';
    case 'SecurityError':
      return 'Passkeys require a secure (HTTPS) connection.';
    case 'AbortError':
      return 'Passkey request was aborted.';
    default:
      return error?.message || 'Passkey request failed.';
  }
}
