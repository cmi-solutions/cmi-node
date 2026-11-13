// CC5 transport: sends one CC5Request to CMI's XML API and reads the CC5Response.
// Shared by the kits that call CMI's XML API (API kit, and later Tokenization).
//
// - The request is posted as the form field DATA=<?xml ...?><CC5Request>...</CC5Request>,
//   with the API user's Name, Password and ClientId first.
// - https only (plain http only for localhost); redirects are refused, so the
//   credentials are never resent to another URL.
// - One attempt only: nothing is retried automatically (see CMIApiError).

import { logger } from '@shared/logger';
import { SecretString } from '@shared/security/secret-string.util';
import { Validator } from '@shared/validation/validator';
import { CMIApiError } from './errors';
import { buildCC5Request, parseCC5Response, CC5XmlError, type CC5Node, type CC5Response } from './xml';

/** Settings of a connection to CMI's XML API. */
export interface CC5TransportConfig {
  /**
   * URL of CMI's XML API (CC5). Must use https:// (plain http only for localhost).
   * CMI gives it to you together with the API user.
   */
  apiUrl: string;
  /** Merchant ID (ClientId), up to 15 characters. */
  clientId: string;
  /** API user name (the `Name` credential), created for API access in CMI's back office. */
  username: string;
  /** API user password. Kept in a private field, never logged or included in errors. */
  password: string;
  /** Request timeout in milliseconds, for the whole call (connection and answer). Default 30000. */
  timeoutMs?: number;
  /**
   * The fetch function to use. Defaults to the global fetch (Node 22+).
   * Useful for a proxy agent or for tests.
   */
  fetch?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;
/** CMI's answers are a few kilobytes; anything far bigger is not a CC5Response. */
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_CLIENT_ID_LENGTH = 15;
const MAX_CREDENTIAL_LENGTH = 255;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\x00-\x1F\x7F]/;

class UrlValidator extends Validator {
  static isAllowedApiUrl(url: string): boolean {
    return this.isSecureOrLocalUrl(url);
  }
}

/** A required text setting: trimmed, not empty, not too long, no control characters. */
export function requireText(value: unknown, name: string, maxLength: number, trim = true): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} is required and must be a non-empty string.`);
  }
  const text = trim ? value.trim() : value;
  if (text.length > maxLength) throw new Error(`${name} must be at most ${maxLength} characters.`);
  if (CONTROL_CHARS.test(text)) {
    throw new Error(`${name} must not contain control characters (line breaks, tabs, invisible characters).`);
  }
  return text;
}

const isTimeout = (error: unknown) =>
  error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');

/** One connection to CMI's XML API, with its credentials. Server-only. */
export class CC5Transport {
  readonly #apiUrl: string;
  readonly #clientId: string;
  readonly #username: string;
  readonly #password: SecretString;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(config: CC5TransportConfig) {
    if (!config || typeof config !== 'object') throw new Error('The CMI API client needs a configuration object.');

    const apiUrl = requireText(config.apiUrl, 'apiUrl', 2048);
    if (!UrlValidator.isAllowedApiUrl(apiUrl)) {
      throw new Error(`apiUrl must be an https:// URL (plain http only for localhost), got "${apiUrl}".`);
    }
    this.#apiUrl = apiUrl;
    this.#clientId = requireText(config.clientId, 'clientId', MAX_CLIENT_ID_LENGTH);
    this.#username = requireText(config.username, 'username', MAX_CREDENTIAL_LENGTH);
    // The password is not trimmed: spaces around it may be part of it.
    if (typeof config.password !== 'string' || config.password === '') {
      throw new Error('password is required and must be a non-empty string.');
    }
    this.#password = new SecretString(requireText(config.password, 'password', MAX_CREDENTIAL_LENGTH, false));

    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
      throw new Error(`timeoutMs must be a whole number of milliseconds between 1 and ${MAX_TIMEOUT_MS}.`);
    }
    this.#timeoutMs = timeoutMs;

    const fetchImpl = config.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
      throw new Error('No fetch function available: use Node.js 22 or later, or pass `fetch` in the config.');
    }
    this.#fetch = fetchImpl;
  }

  /** Non-secret settings, for logs and inspect output. */
  describe(): { apiUrl: string; clientId: string; password: string } {
    return { apiUrl: this.#apiUrl, clientId: this.#clientId, password: '********' };
  }

  /**
   * Sends one CC5Request (credentials first, then `elements`) and reads the CC5Response.
   * Throws CMIApiError when no usable answer comes back. Never retries.
   */
  async send(operation: string, orderId: string, elements: ReadonlyArray<readonly [string, CC5Node]>): Promise<CC5Response> {
    const xml = buildCC5Request([
      ['Name', this.#username],
      ['Password', this.#password.getValue()],
      ['ClientId', this.#clientId],
      ...elements,
    ]);
    // One deadline for the whole call: connecting, the headers and the body.
    const signal = AbortSignal.timeout(this.#timeoutMs);
    const timedOut = () => {
      logger.warn(`CMI API ${operation} for order ${orderId}: timed out`);
      return new CMIApiError('TIMEOUT', operation, `CMI API ${operation} timed out after ${this.#timeoutMs} ms.`);
    };

    let response: Response;
    try {
      response = await this.#fetch(this.#apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/xml, text/xml, */*',
        },
        body: new URLSearchParams({ DATA: xml }).toString(),
        // A redirect would resend the credentials to another URL: refuse it.
        redirect: 'error',
        signal,
      });
    } catch (error) {
      if (isTimeout(error)) throw Object.assign(timedOut(), { cause: error });
      logger.warn(`CMI API ${operation} for order ${orderId}: network error`);
      throw new CMIApiError('NETWORK', operation,
        `CMI API ${operation} failed: ${error instanceof Error ? error.message : 'network error'}.`, { cause: error });
    }

    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      logger.warn(`CMI API ${operation} for order ${orderId}: HTTP ${response.status}`);
      throw new CMIApiError('HTTP_STATUS', operation, `CMI API ${operation} answered HTTP ${response.status}.`, {
        status: response.status,
      });
    }

    let body: string;
    try {
      body = await readBody(response);
    } catch (error) {
      // The deadline can pass while the answer is still arriving: that is a timeout too.
      if (isTimeout(error) || signal.aborted) throw Object.assign(timedOut(), { cause: error });
      if (error instanceof CC5XmlError) {
        logger.warn(`CMI API ${operation} for order ${orderId}: invalid answer (${error.message})`);
        throw new CMIApiError('INVALID_RESPONSE', operation, `CMI API ${operation}: ${error.message}`, { cause: error });
      }
      logger.warn(`CMI API ${operation} for order ${orderId}: network error while reading the answer`);
      throw new CMIApiError('NETWORK', operation, `CMI API ${operation}: the connection failed while reading the answer.`, {
        cause: error,
      });
    }

    let answer: CC5Response;
    try {
      answer = parseCC5Response(body);
    } catch (error) {
      const reason = error instanceof CC5XmlError ? error.message : 'the answer could not be read';
      logger.warn(`CMI API ${operation} for order ${orderId}: invalid answer (${reason})`);
      throw new CMIApiError('INVALID_RESPONSE', operation, `CMI API ${operation}: ${reason}`, { cause: error });
    }

    logger.debug(
      `CMI API ${operation} for order ${orderId}: ${answer.fields.Response ?? '?'} (${answer.fields.ProcReturnCode ?? '?'})`,
    );
    return answer;
  }
}

/** Reads the body (at most MAX_RESPONSE_BYTES) in the charset it declares, UTF-8 by default. */
async function readBody(response: Response): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) throw new CC5XmlError('The CMI answer is too large.');

  const chunks: Uint8Array[] = [];
  let size = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new CC5XmlError('The CMI answer is too large.');
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  // Charset: the Content-Type header, else the XML declaration, else UTF-8.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 200));
  const charset =
    /charset=["']?([\w-]+)/i.exec(response.headers.get('content-type') ?? '')?.[1] ??
    /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ??
    'utf-8';
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}
