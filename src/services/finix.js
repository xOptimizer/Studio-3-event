import { env, finixBaseUrl } from '../config/env.js';

function getAuthHeader() {
  const credentials = Buffer.from(`${env.FINIX_API_USERNAME}:${env.FINIX_API_PASSWORD}`).toString('base64');
  return `Basic ${credentials}`;
}

export async function finixRequest(path, options = {}) {
  const response = await fetch(`${finixBaseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Finix-Version': '2022-02-01',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const embedded = data._embedded?.errors?.map((e) => e.message || e.code).filter(Boolean);
    const detail = embedded?.length ? embedded.join('; ') : data.message || response.statusText;
    const error = new Error(`Finix API error (${response.status}): ${detail}`);
    error.finixStatus = response.status;
    error.finixBody = data;
    throw error;
  }

  return data;
}

export async function createBuyerIdentity(name, email) {
  return finixRequest('/identities', {
    method: 'POST',
    body: {
      entity: {
        first_name: name.split(' ')[0] || name,
        last_name: name.split(' ').slice(1).join(' ') || name,
        email,
        type: 'PERSONAL',
      },
    },
  });
}

export async function createPaymentInstrument(identityId, token, name) {
  return finixRequest('/payment_instruments', {
    method: 'POST',
    body: {
      identity: identityId,
      token,
      type: 'TOKEN',
      name: name || 'Ticket Buyer',
    },
  });
}

export async function createWalletPaymentInstrument(identityId, { type, thirdPartyToken, name, address }) {
  return finixRequest('/payment_instruments', {
    method: 'POST',
    body: {
      identity: identityId,
      type,
      third_party_token: thirdPartyToken,
      name: name || 'Ticket Buyer',
      address,
    },
  });
}

export async function createApplePaySession({ displayName, domain, merchantIdentity, validationUrl }) {
  return finixRequest('/apple_pay_sessions', {
    method: 'POST',
    body: {
      display_name: displayName,
      domain,
      merchant_identity: merchantIdentity,
      validation_url: validationUrl,
    },
  });
}

export async function createTransfer(paymentInstrumentId, amountCents, fraudSessionId, tags) {
  const body = {
    amount: amountCents,
    currency: 'USD',
    source: paymentInstrumentId,
    merchant_identity: env.FINIX_MERCHANT_IDENTITY_ID,
  };

  if (fraudSessionId) {
    body.fraud_session_id = fraudSessionId;
  }

  if (tags) {
    body.tags = tags;
  }

  return finixRequest('/transfers', {
    method: 'POST',
    body,
  });
}

export async function getTransfer(transferId) {
  return finixRequest(`/transfers/${transferId}`);
}
