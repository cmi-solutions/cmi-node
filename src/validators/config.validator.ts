import { PaymentConfig } from '@types';
import { ConfirmationMode } from '@types';
import {
  isSupportedStoreType,
  SUPPORTED_STORE_TYPES,
  isSupportedTranType,
  SUPPORTED_TRAN_TYPES,
  isSupportedConfirmationMode,
  SUPPORTED_CONFIRMATION_MODES,
  isSupportedAccountType,
  SUPPORTED_ACCOUNT_TYPES,
  AccountTypeValue
} from '@constants';
import { Validator } from './validator';

export class ConfigValidator extends Validator {
  /**
   * Map of lowercase case-insensitive input keys -> canonical camelCase schema keys.
   */
  private static readonly CONFIG_SCHEMA_MAP: Record<string, keyof PaymentConfig> = {
    'storekey':    'storeKey',
    'clientid':    'clientId',
    'gatewayurl':  'gatewayUrl',
    'storetype':   'storetype',
    'trantype':    'trantype',
    'accounttype': 'accountType',
    'callbackurl': 'callbackUrl'
  };

  /**
   * Validates and normalizes raw configuration input:
   * 1. Rejects completely unknown fields
   * 2. Detects duplicates (e.g. providing both clientid and clientId)
   * 3. Normalizes all known fields to their correct internal camelCase casing.
   * 4. Runs existing config validations on the normalized object.
   */
  static normalizeAndValidate(rawConfig: Record<string, any>): PaymentConfig {
    const normalized: Record<string, any> = {};

    for (const [key, value] of Object.entries(rawConfig)) {
      // We skip internal non-cmi fields some frameworks might inject, 
      // but if the user provided confirmationMode explicitly, keep it.
      if (key === 'confirmationMode') {
        normalized[key] = value;
        continue;
      }

      const lowerKey = key.toLowerCase();
      const mappedKey = this.CONFIG_SCHEMA_MAP[lowerKey];

      if (!mappedKey) {
        throw new Error(
          `Unknown configuration field detected: "${key}". The configuration must only contain valid schema fields.`
        );
      }

      if (mappedKey in normalized) {
        throw new Error(
          `Duplicate configuration field detected: "${key}" maps to the same field as a previously provided key ("${mappedKey}"). ` +
          `Ensure each field is provided only once.`
        );
      }

      normalized[mappedKey] = value;
    }

    // Now validate the strictly generated, correctly cased config object
    this.validate(normalized as PaymentConfig);

    return normalized as PaymentConfig;
  }

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

    // Validate accountType (optional, default: inshore)
    if (config.accountType) {
        const normalizedAccountType = config.accountType.toLowerCase();
        if (!isSupportedAccountType(normalizedAccountType)) {
            throw new Error(
                `Unsupported account type: "${config.accountType}". ` +
                `Supported types: ${SUPPORTED_ACCOUNT_TYPES.join(', ')}`
            );
        }
    }
  }

  /**
   * Validate and normalize account type
   */
  static validateAccountType(type: string | undefined): AccountTypeValue {
    if (!type) return 'inshore';
    
    const normalized = type.toLowerCase();
    if (!isSupportedAccountType(normalized)) {
        throw new Error(
            `Unsupported account type: "${type}". ` +
            `Supported types: ${SUPPORTED_ACCOUNT_TYPES.join(', ')}`
        );
    }
    return normalized as AccountTypeValue;
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
