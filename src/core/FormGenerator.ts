/**
 * Payment Form Generator
 * 
 * Generates HTML forms for payment submission to CMI gateway.
 * Extracted from CMIPaymentGateway for Single Responsibility Principle.
 */

import { SanitizationUtil } from '@utils';

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
   * @returns HTML form string ready to send to browser
   */
  generate(params: Record<string, any>): string {
    const escapedGatewayUrl = SanitizationUtil.escapeHtml(this.gatewayUrl);

    const formInputs = Object.entries(params)
      .map(([key, value]) => {
        const escapedKey = SanitizationUtil.escapeHtml(key);
        const escapedValue = SanitizationUtil.escapeHtml(String(value));
        return `<input type="hidden" name="${escapedKey}" value="${escapedValue}" />`;
      })
      .join('\n');

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <title>Payment Redirect</title>
        </head>
        <body onload="document.paymentForm.submit();">
          <form method="POST" action="${escapedGatewayUrl}" name="paymentForm">
            ${formInputs}
            <noscript>
              <input type="submit" value="Click here to complete payment" />
            </noscript>
          </form>
        </body>
      </html>
      `.trim();
  }

  /**
   * Generate form inputs only (for custom form integration)
   *
   * @param params Payment parameters
   * @returns Array of input HTML strings
   */
  generateInputs(params: Record<string, any>): string[] {
    return Object.entries(params).map(([key, value]) => {
      const escapedKey = SanitizationUtil.escapeHtml(key);
      const escapedValue = SanitizationUtil.escapeHtml(String(value));
      return `<input type="hidden" name="${escapedKey}" value="${escapedValue}" />`;
    });
  }
}
