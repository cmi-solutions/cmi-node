import { StoreType, AccountTypeValue } from "@constants";

/**
 * Payment gateway configuration
 * 
 * @property {string} storeKey - Secret key for hash generation
 * @property {string} clientId - Client ID provided by CMI
 * @property {string} gatewayUrl - CMI gateway URL
 * @property {StoreType} storetype - Store type (3D secure or not)
 * @property {string} trantype - Transaction type (PreAuth, Auth, etc.)
 * @property {AccountTypeValue} [accountType] - Account type ('inshore' or 'offshore'). Defaults to 'inshore'.
 * @property {string} [callbackUrl] - Optional callback URL
 *   - If provided: Use this URL for payment callbacks (manual mode)
 *   - If omitted: Use SDK-managed callback handler (automatic mode)
 */

export interface PaymentConfig {
  storeKey: string;
  clientId: string;
  gatewayUrl: string;
  storetype: StoreType;
  trantype: string;
  accountType?: AccountTypeValue;
  callbackUrl?: string;
}
