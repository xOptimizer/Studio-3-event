import { prisma } from './prisma.js';

const DEFAULT_TRANSACTION_OPTIONS = {
  maxWait: 10_000,
  timeout: 15_000,
};

const RETRYABLE_TRANSACTION_CODES = new Set(['P2028', 'P2034']);

function isRetryableTransactionError(error) {
  return RETRYABLE_TRANSACTION_CODES.has(error?.code);
}

export async function runTransaction(callback, options = {}) {
  const { maxAttempts = 3, ...transactionOptions } = options;
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await prisma.$transaction(callback, {
        ...DEFAULT_TRANSACTION_OPTIONS,
        ...transactionOptions,
      });
    } catch (error) {
      lastError = error;

      if (isRetryableTransactionError(error) && attempt < maxAttempts) {
        console.warn(
          `[db] Transaction attempt ${attempt}/${maxAttempts} failed (${error.code}); retrying`
        );
        await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}
