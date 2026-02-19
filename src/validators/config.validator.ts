import { PaymentConfig } from '@types';
import { ConfirmationMode } from '@types';
import {
  isSupportedStoreType,
  SUPPORTED_STORE_TYPES,
  isSupportedTranType,
  SUPPORTED_TRAN_TYPES,
  isSupportedConfirmationMode,
  SUPPORTED_CONFIRMATION_MODES
} from '@constants';
import { Validator } from './validator';

export class ConfigValidator extends Validator {
  /**
   * Validate payment gateway configuration
   */
  static validate(config: PaymentConfig): void {
    const required: (keyof PaymentConfig)[] = [
      'storeKey', 'clientId', 'gatewayUrl', 'storetype',
      'trantype',
    ];

    for (const field of required) {
      if (!config[field]) {
        throw new Error(`Missing required config field: ${field}`);
      }
    }

    if (!this.isNumeric(config.clientId.toString())) {
      throw new Error(`clientId must be numeric: ${config.clientId}`);
    }

    if (!this.isValidUrl(config.gatewayUrl) || !this.hasHttpProtocol(config.gatewayUrl)) {
      throw new Error(`Invalid gatewayUrl: ${config.gatewayUrl} or missing http/https protocol`);
    }

    // Only validate callbackUrl if provided (it's optional now)
    if (config.callbackUrl) {
      // TODO : add a warning Log when the user provides a localhost URL
      if (!this.isValidUrl(config.callbackUrl) || !this.hasHttpProtocol(config.callbackUrl)) {
        throw new Error(`Invalid callbackUrl: ${config.callbackUrl} or missing http/https protocol`);
      }
    }

    // Validate storetype (case-insensitive)
    const normalizedStoreType = config.storetype.toLowerCase();
    if (!isSupportedStoreType(normalizedStoreType)) {
      throw new Error(
        `Unsupported store type: "${config.storetype}". ` +
        `Supported types (case-insensitive): ${SUPPORTED_STORE_TYPES.join(', ')}`
      );
    }

    // Validate trantype (case-insensitive)
    const normalizedTranType = config.trantype.toLowerCase();
    if (!isSupportedTranType(normalizedTranType)) {
      throw new Error(
        `Unsupported transaction type: "${config.trantype}". ` +
        `Supported types (case-insensitive): ${SUPPORTED_TRAN_TYPES.join(', ')}`
      );
    }
  }

  /**
   * Validate confirmation mode (case-insensitive)
   * This is separate because confirmationMode is optional and passed differently
   */
  static validateConfirmationMode(mode: string | undefined): ConfirmationMode {
    // Default to 'manual' if not provided
    if (mode === undefined || mode === null || mode === '') {
      return 'manual';
    }

    const normalizedMode = mode.toLowerCase();
    if (!isSupportedConfirmationMode(normalizedMode)) {
      throw new Error(
        `Unsupported confirmation mode: "${mode}". ` +
        `Supported modes (case-insensitive): ${SUPPORTED_CONFIRMATION_MODES.join(', ')}`
      );
    }

    return normalizedMode as ConfirmationMode;
  }
}
