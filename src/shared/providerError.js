class ProviderError extends Error {
  constructor(code, stage = 'provider', retryAfterMs = 0) {
    super(code);
    this.code = code;
    this.stage = stage;
    this.retryAfterMs = retryAfterMs;
  }
}

function safeError(error) {
  return error instanceof ProviderError ? `${error.stage}:${error.code}` : 'internal-error';
}

module.exports = { ProviderError, safeError };
