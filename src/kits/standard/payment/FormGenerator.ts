/**
 * Payment Form Generator
 * 
 * Generates HTML forms for payment submission to CMI gateway.
 * Extracted from CMIPaymentGateway for Single Responsibility Principle.
 * 
 * The generated page includes a polished loading overlay (spinner, animated
 * dots, lock icon, "Secured by CMI" badge) that displays while the form
 * auto-submits in the background.
 * 
 * **CSP Note:** The generated form uses inline `<style>` and `<script>` tags.
 * If your application enforces a strict Content-Security-Policy that blocks
 * `'unsafe-inline'`, pass a `nonce` option — it will be applied to both tags.
 * Alternatively, use `generateInputs()` to build a custom form with your own
 * submission logic.
 */

import { SanitizationUtil } from '@standard/utils';

/**
 * Generates HTML payment forms for CMI gateway submission
 */
export class FormGenerator {
  private readonly gatewayUrl: string;

  constructor(gatewayUrl: string) {
    this.gatewayUrl = gatewayUrl;
  }

  /**
   * Generate HTML form for payment submission
   *
   * @param params Payment parameters (already include hash)
   * @param options Optional configuration (nonce for CSP support)
   * @returns HTML form string ready to send to browser
   */
  generate(params: Readonly<Record<string, unknown>>, options?: { nonce?: string }): string {
    const escapedGatewayUrl = SanitizationUtil.escapeHtml(this.gatewayUrl);

    const formInputs = Object.entries(params)
      .map(([key, value]) => {
        const escapedKey = SanitizationUtil.escapeHtml(key);
        const escapedValue = SanitizationUtil.escapeHtml(String(value));
        return `<input type="hidden" name="${escapedKey}" value="${escapedValue}" />`;
      })
      .join('\n');

    const nonceAttribute = options?.nonce ? ` nonce="${SanitizationUtil.escapeHtml(options.nonce)}"` : '';

    return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Payment Redirect</title>
    <style${nonceAttribute}>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%);
        color: #e2e8f0;
        overflow: hidden;
      }

      .loader-overlay {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2rem;
        animation: fadeIn 0.4s ease-out;
      }

      /* Spinner ring */
      .spinner {
        position: relative;
        width: 72px;
        height: 72px;
      }

      .spinner-ring {
        width: 72px;
        height: 72px;
        border: 3px solid rgba(99, 102, 241, 0.15);
        border-top-color: #818cf8;
        border-radius: 50%;
        animation: spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
      }

      .spinner-glow {
        position: absolute;
        inset: -4px;
        border-radius: 50%;
        background: conic-gradient(from 0deg, transparent 60%, rgba(129, 140, 248, 0.12));
        animation: spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        filter: blur(6px);
      }

      /* Lock icon inside spinner */
      .spinner-icon {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 22px;
        height: 22px;
        opacity: 0.7;
      }

      .spinner-icon svg {
        width: 100%;
        height: 100%;
        fill: #a5b4fc;
      }

      /* Text */
      .loader-text {
        text-align: center;
      }

      .loader-title {
        font-size: 1.125rem;
        font-weight: 600;
        letter-spacing: 0.025em;
        color: #f1f5f9;
      }

      .loader-subtitle {
        margin-top: 0.5rem;
        font-size: 0.875rem;
        color: #94a3b8;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }

      /* Animated dots */
      .dot {
        display: inline-block;
        width: 4px;
        height: 4px;
        margin: 0 1px;
        border-radius: 50%;
        background: #94a3b8;
        animation: dotPulse 1.4s ease-in-out infinite;
      }
      .dot:nth-child(2) { animation-delay: 0.2s; }
      .dot:nth-child(3) { animation-delay: 0.4s; }

      /* Subtle footer badge */
      .secure-badge {
        margin-top: 0.5rem;
        display: flex;
        align-items: center;
        gap: 0.375rem;
        font-size: 0.75rem;
        color: #64748b;
        letter-spacing: 0.04em;
      }

      .secure-badge svg {
        width: 12px;
        height: 12px;
        fill: #64748b;
      }

      /* Animations */
      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to   { opacity: 1; transform: translateY(0); }
      }

      @keyframes dotPulse {
        0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
        40% { opacity: 1; transform: scale(1.2); }
      }

      /* Noscript fallback styling */
      noscript {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        color: #cbd5e1;
        font-size: 0.9375rem;
      }

      noscript button {
        padding: 0.75rem 2rem;
        border: none;
        border-radius: 8px;
        background: linear-gradient(135deg, #6366f1, #818cf8);
        color: #fff;
        font-size: 0.9375rem;
        font-weight: 600;
        cursor: pointer;
        transition: opacity 0.2s;
      }

      noscript button:hover { opacity: 0.9; }
    </style>
  </head>
  <body>
    <form method="POST" action="${escapedGatewayUrl}" name="paymentForm" id="paymentForm">
      ${formInputs}
      <noscript>
        <p>JavaScript is required for automatic redirect.</p>
        <button type="submit">Continue to Payment</button>
      </noscript>
    </form>

    <div class="loader-overlay" id="loaderOverlay">
      <div class="spinner">
        <div class="spinner-glow"></div>
        <div class="spinner-ring"></div>
        <div class="spinner-icon">
          <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1s3.1 1.39 3.1 3.1v2z"/></svg>
        </div>
      </div>
      <div class="loader-text">
        <div class="loader-title">Redirecting to secure payment via CMI platform</div>
        <div class="loader-subtitle">
          Please wait<span class="dot"></span><span class="dot"></span><span class="dot"></span>
        </div>
      </div>
      <div class="secure-badge">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-2 16l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z"/></svg>
        Secured by CMI
      </div>
    </div>

    <script${nonceAttribute}>
      // Use HTMLFormElement.prototype.submit.call() to prevent
      // DOM clobbering if a hidden input is named "submit".
      HTMLFormElement.prototype.submit.call(document.forms.namedItem('paymentForm'));
    </script>
  </body>
</html>`.trim();
  }

  /**
   * Generate form inputs only (for custom form integration)
   *
   * @param params Payment parameters
   * @returns Array of input HTML strings
   */
  generateInputs(params: Readonly<Record<string, unknown>>): string[] {
    return Object.entries(params).map(([key, value]) => {
      const escapedKey = SanitizationUtil.escapeHtml(key);
      const escapedValue = SanitizationUtil.escapeHtml(String(value));
      return `<input type="hidden" name="${escapedKey}" value="${escapedValue}" />`;
    });
  }
}
