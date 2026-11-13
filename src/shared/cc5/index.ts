// CC5: CMI's XML API format and transport, shared by the kits that call it.
export { CC5Transport, requireText } from './transport';
export type { CC5TransportConfig } from './transport';
export { CMIApiError } from './errors';
export type { CMIApiErrorCode } from './errors';
export { buildCC5Request, parseCC5Response, escapeXml, CC5XmlError } from './xml';
export type { CC5Node, CC5Response } from './xml';
