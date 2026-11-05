// src/core/CMIPaymentGateway.ts

import {
  PaymentConfig,
  PaymentRequest,
  CallbackResult,
  ConfirmationMode,
  CallbackMiddleware,
  CMIPaymentGatewayOptions,
} from "@types";
import { ConfigValidator } from "@validators";
import { SecretString } from "@utils";
import { logger } from "@logger";
import { CallbackHandler } from "./CallbackHandler";
import { PaymentBuilder } from "./PaymentBuilder";
import { FormGenerator } from "./FormGenerator";
import { CallbackVerifier } from "./CallbackVerifier";

/**
 * CMI Payment Gateway - Framework-agnostic payment integration
 *
 * Supports: Express, NestJS, Fastify, Koa, Next.js, and any Node.js framework
 *
 * @example Express (Auto-register)
 * ```
 * const gateway = new CMIPaymentGateway(config, { app });
 * ```
 *
 * @example NestJS (Manual register)
 * ```
 * const gateway = new CMIPaymentGateway(config);
 * const middleware = gateway.getCallbackMiddleware();
 * ```
 *
 * @example Next.js API Route
 * ```
 * const gateway = new CMIPaymentGateway(config);
 * const middleware = gateway.getCallbackMiddleware();
 * ```
 */
export class CMIPaymentGateway {
  // config intentionally does NOT carry storeKey — it lives only in secureStoreKey.
  private readonly config: Omit<PaymentConfig, 'storeKey'> & {
    confirmationMode?: ConfirmationMode;
  };

  // Extracted components
  private readonly paymentBuilder: PaymentBuilder;
  private readonly formGenerator: FormGenerator;
  private readonly callbackVerifier: CallbackVerifier;

  // Secure storage for storeKey
  private readonly secureStoreKey: SecretString;

  private callbackHandler: CallbackHandler | null = null;
  private middleware: CallbackMiddleware | null = null;

  /**
   * Initialize CMI Payment Gateway
   *
   * @param config Payment gateway configuration (respects PaymentConfig interface)
   * @param options Optional configuration (app, callbackPath, callbackConfig)
   *
   * @throws Error if config validation fails
   */
  constructor(
    config: PaymentConfig & { confirmationMode?: ConfirmationMode | string },
    options: CMIPaymentGatewayOptions = {}
  ) {
    // Validate configuration, normalize keys case-insensitively, and reject unknowns/duplicates
    const normalizedConfig = ConfigValidator.normalizeAndValidate(config as Record<string, any>);

    // Validate and normalize confirmation mode (case-insensitive)
    const normalizedConfirmationMode = ConfigValidator.validateConfirmationMode(
      config.confirmationMode as string | undefined
    );

    // Validate and normalize account type (case-insensitive)
    const normalizedAccountType = ConfigValidator.validateAccountType(
      normalizedConfig.accountType as string | undefined
    );

    // Wrap storeKey in SecretString to prevent accidental exposure BEFORE
    // storing config — storeKey is deliberately excluded from this.config.
    this.secureStoreKey = new SecretString(normalizedConfig.storeKey);

    // Store config WITHOUT storeKey — the key lives only in secureStoreKey.
    const { storeKey: _dropped, ...configWithoutKey } = normalizedConfig;
    this.config = {
      ...configWithoutKey,
      confirmationMode: normalizedConfirmationMode,
      accountType: normalizedAccountType,
    };

    // Initialize extracted components with SecretString
    this.paymentBuilder = new PaymentBuilder({
      clientId: this.config.clientId,
      storeKey: this.secureStoreKey,
      storetype: this.config.storetype,
      trantype: this.config.trantype,
      accountType: normalizedAccountType,
      callbackUrl: this.config.callbackUrl,
    });

    this.formGenerator = new FormGenerator(this.config.gatewayUrl);

    this.callbackVerifier = new CallbackVerifier({
      storeKey: this.secureStoreKey,
      confirmationMode: this.config.confirmationMode ?? 'manual',
    });

    // Initialize callback handler (always create it, framework-agnostic)
    this.initializeCallbackHandler(options.callbackConfig);

    // If Express app provided, auto-register callback endpoint
    if (options.app) {
      const callbackPath: string = options.callbackPath ?? '/api/payment/callback';
      this.registerExpressMiddleware(options.app, callbackPath);
    }
  }

  /**
   * Initialize callback handler with user configuration
   *
   * @internal
   */
  private initializeCallbackHandler(
    userCallbackConfig?: CMIPaymentGatewayOptions["callbackConfig"]
  ): void {
    // Create handler
    this.callbackHandler = new CallbackHandler(this, {
      ...userCallbackConfig,
      autoRespond: userCallbackConfig?.autoRespond ?? true,
      supportGetMethod: userCallbackConfig?.supportGetMethod ?? false,
    });

    // Store middleware
    this.middleware = this.callbackHandler.middleware();
  }

  /**
   * Get callback middleware for manual registration with ANY framework
   *
   * Use this with NestJS, Fastify, Koa, Next.js, or any other framework
   *
   * @returns Express/Connect compatible middleware function
   *
   * @throws Error if middleware is not initialized
   */
  public getCallbackMiddleware(): CallbackMiddleware {
    if (!this.middleware) {
      throw new Error(
        "Callback middleware not initialized. Please ensure CMIPaymentGateway is properly constructed."
      );
    }

    return this.middleware;
  }

  /**
   * Register callback middleware with Express app (auto-registration)
   *
   * This is optional - only called if Express app is passed to constructor
   *
   * @internal
   */
  private registerExpressMiddleware(app: any, callbackPath: string): void {
    if (!this.middleware) return;

    try {
      // Register POST endpoint
      app.post(callbackPath, this.middleware);
      logger.info(
        `CMI Payment Gateway: Callback handler auto-registered at POST ${callbackPath}`
      );
      logger.info(
        `Confirmation Mode: ${this.config.confirmationMode ?? "manual"}`
      );
    } catch (error) {
      logger.error(
        "Failed to auto-register Express callback middleware:",
        error
      );
      // Re-throw so the caller knows registration silently failed.
      // A payment callback endpoint that was never registered is a
      // show-stopping bug — it must not be swallowed.
      throw new Error(
        `CMI Payment Gateway: Failed to register callback at POST ${callbackPath}. ` +
        `Ensure you passed a valid Express app instance. Original error: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create callback handler manually (if not using auto-setup)
   * 
   * @warning Do not use this method if you have already registered a callback 
   * endpoint via the constructor options (`options.app`) or via another helper, 
   * as registering multiple handlers on the same route may cause your `onSuccess` 
   * callback to execute twice.
   */
  createCallbackHandler(
    options?: CMIPaymentGatewayOptions["callbackConfig"]
  ): CallbackHandler {
    return new CallbackHandler(this, options);
  }

  /**
   * Create payment parameters for initiating a payment
   *
   * @param paymentRequest Payment request details (uses your PaymentRequest type)
   * @returns Payment parameters ready to send to CMI
   *
   * @example
   * ```
   * const params = gateway.createPaymentParams({
   *   amount: 100.00,
   *   email: 'customer@example.com',
   *   BillToName: 'John Doe',
   *   okUrl: 'https://yoursite.com/success',
   *   failUrl: 'https://yoursite.com/failure',
   *   currency: '504'
   * });
   * ```
   */
  createPaymentParams(paymentRequest: PaymentRequest): Record<string, any> {
    return this.paymentBuilder.build(paymentRequest);
  }

  /**
   * Generate HTML form for payment submission
   *
   * @param params Payment parameters
   * @param options Optional configuration (e.g. nonce for CSP)
   * @returns HTML form string ready to send to browser
   *
   * @example
   * ```
   * const form = gateway.generatePaymentForm(params, { nonce: 'your-csp-nonce' });
   * res.setHeader('Content-Type', 'text/html');
   * res.send(form);
   * ```
   */
  generatePaymentForm(params: Record<string, any>, options?: { nonce?: string }): string {
    return this.formGenerator.generate(params, options);
  }

  /**
   * Verify callback from CMI
   *
   * Validates the hash (HASH #2 - Incoming) and returns payment status
   *
   * @param callbackParams Parameters received from CMI callback
   * @returns Callback verification result (uses your CallbackResult type)
   *
   * @example
   * ```
   * const result = gateway.verifyCallback(callbackParams);
   * if (result.success) {
   *   // Payment successful, update database
   * }
   * ```
   */
  verifyCallback(callbackParams: Record<string, any>): CallbackResult {
    return this.callbackVerifier.verify(callbackParams);
  }

  /**
   * Get current confirmation mode
   *
   * @returns Current confirmation mode ('auto' or 'manual')
   */
  public getConfirmationMode(): ConfirmationMode {
    return this.config.confirmationMode ?? 'manual';
  }

  /**
   * Get gateway configuration (sanitized - excludes storeKey for security)
   *
   * @returns Configuration object without sensitive data
   */
  getConfig(): Omit<PaymentConfig, 'storeKey'> {
    // storeKey was never stored in this.config — return as-is.
    return this.config;
  }


}
