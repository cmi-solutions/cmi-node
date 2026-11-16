// Reading CMI order statuses: TRANS_STAT codes, amounts in cents, ORDERSTATUS
// name:value text and the TRXn lines of an order history.
import type { CMIOrderStatus, CMIOrderTransaction, CMIOrderHistoryEntry } from './api.types';

interface StatusInfo {
  status: CMIOrderStatus;
  shipmentPossible: boolean;
  transient: boolean;
}

/** CMI's transaction status table (TRANS_STAT x CHARGE_TYPE_CD). */
export function describeStatus(statusCode: string, chargeType: string): StatusInfo {
  const code = statusCode.trim().toUpperCase();
  const charge = chargeType.trim().toUpperCase();
  if (charge === 'C' && (code === 'C' || code === 'S')) {
    return { status: 'refunded', shipmentPossible: false, transient: false };
  }
  switch (code) {
    case 'D': return { status: 'declined', shipmentPossible: false, transient: false };
    case 'A': return { status: 'preauthorized', shipmentPossible: false, transient: false };
    case 'C': return { status: 'captured', shipmentPossible: true, transient: false };
    case 'S': return { status: 'settled', shipmentPossible: true, transient: false };
    case 'V': return { status: 'voided', shipmentPossible: false, transient: false };
    case 'PN': return { status: 'pending', shipmentPossible: false, transient: true };
    case 'R': return { status: 'reversal_required', shipmentPossible: false, transient: true };
    case 'NW': return { status: 'processing', shipmentPossible: false, transient: true };
    case 'ERR': return { status: 'error', shipmentPossible: false, transient: false };
    case 'CNCL': return { status: 'cancelled', shipmentPossible: false, transient: false };
    default: return { status: 'unknown', shipmentPossible: false, transient: false };
  }
}

/** "9196" (cents) -> 91.96. Undefined when empty or not a whole number. */
export function centsToAmount(value: string | undefined): number | undefined {
  const text = value?.trim();
  if (!text || !/^-?\d+$/.test(text)) return undefined;
  return Number(text) / 100;
}

const nonEmpty = (value: string | undefined): string | undefined => {
  const text = value?.trim();
  return text ? text : undefined;
};

/**
 * Reads the ORDERSTATUS text: "ORD_ID:x CHARGE_TYPE_CD:S ... AUTH_DTTM:2017-05-20 14:18:00.427 ...".
 * Pairs are tab-separated; spaces are accepted too (values such as dates may contain spaces,
 * so a new pair only starts at a name made of capitals, digits and underscores).
 *
 * One forward scan: the names are found first, and each value is the text up to the
 * next name, so the time grows linearly with the text's size.
 */
export function parseOrderStatusText(text: string): Record<string, string> {
  const pairs: Record<string, string> = Object.create(null);
  // A name starts the text or follows whitespace, and ends with ":".
  const names = [...text.matchAll(/(^|\s)([A-Z][A-Z0-9_]*):/g)];
  names.forEach((match, index) => {
    const valueStart = match.index + match[0].length;
    const valueEnd = index + 1 < names.length ? names[index + 1].index : text.length;
    pairs[match[2]] = text.slice(valueStart, valueEnd).trim();
  });
  return pairs;
}

/** Builds a transaction from the status fields (Extra elements, ORDERSTATUS as fallback). */
export function transactionFromStatusFields(fields: Readonly<Record<string, string>>): CMIOrderTransaction {
  const statusCode = nonEmpty(fields.TRANS_STAT) ?? '';
  const chargeType = nonEmpty(fields.CHARGE_TYPE_CD) ?? '';
  return {
    ...describeStatus(statusCode, chargeType),
    statusCode,
    chargeType,
    originalAmount: centsToAmount(fields.ORIG_TRANS_AMT),
    capturedAmount: centsToAmount(fields.CAPTURE_AMT),
    authorizedAt: nonEmpty(fields.AUTH_DTTM),
    capturedAt: nonEmpty(fields.CAPTURE_DTTM),
    authCode: nonEmpty(fields.AUTH_CODE),
    hostRefNum: nonEmpty(fields.HOST_REF_NUM),
    hostReturnCode: nonEmpty(fields.PROC_RET_CD),
    transId: nonEmpty(fields.TRANS_ID),
    settleId: nonEmpty(fields.SETTLEID),
    xid: nonEmpty(fields.XID_3D),
    cavv: nonEmpty(fields.CAVV_3D),
    eci: nonEmpty(fields.ECI_3D),
    mdStatus: nonEmpty(fields.MDSTATUS),
  };
}

// The TRXn columns, in CMI's order.
const HISTORY_COLUMNS = [
  'chargeType', 'statusCode', 'originalAmount', 'capturedAmount', 'authorizedAt', 'capturedAt',
  'voidedAt', 'hostRefNum', 'authCode', 'hostReturnCode', 'transId', 'settleId', 'xid', 'cavv',
  'eci', 'mdStatus',
] as const;
type HistoryColumn = (typeof HISTORY_COLUMNS)[number];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

/**
 * Splits a TRXn line into its columns.
 *
 * CMI documents the line as tab-separated, with empty columns kept. Lines where the
 * tabs were turned into spaces are read too: dates ("2017-05-20 14:18:00.427") are
 * joined back, and the dates fill the authorized / captured / voided columns in turn.
 */
function historyColumns(line: string): Partial<Record<HistoryColumn, string>> {
  const columns: Partial<Record<HistoryColumn, string>> = {};
  if (line.includes('\t')) {
    line.split('\t').forEach((value, index) => {
      const name = HISTORY_COLUMNS[index];
      if (name) columns[name] = value.trim();
    });
    return columns;
  }

  const tokens = line.trim().split(/\s+/);
  const values: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (DATE.test(tokens[i]) && TIME.test(tokens[i + 1] ?? '')) {
      values.push(`${tokens[i]} ${tokens[i + 1]}`);
      i++;
    } else {
      values.push(tokens[i]);
    }
  }
  const [chargeType, statusCode, originalAmount, capturedAmount, ...rest] = values;
  Object.assign(columns, { chargeType, statusCode, originalAmount, capturedAmount });
  const dates: Array<'authorizedAt' | 'capturedAt' | 'voidedAt'> = ['authorizedAt', 'capturedAt', 'voidedAt'];
  let next = 0;
  while (next < dates.length && rest.length && DATE.test(rest[0].split(' ')[0])) {
    columns[dates[next++]] = rest.shift();
  }
  const tail: HistoryColumn[] = ['hostRefNum', 'authCode', 'hostReturnCode', 'transId', 'settleId', 'xid', 'cavv', 'eci', 'mdStatus'];
  tail.forEach((name, index) => {
    if (rest[index] !== undefined) columns[name] = rest[index];
  });
  return columns;
}

/** Reads one TRXn line of an order history. */
export function parseHistoryLine(line: string): CMIOrderHistoryEntry {
  const c = historyColumns(line);
  const statusCode = nonEmpty(c.statusCode) ?? '';
  const chargeType = nonEmpty(c.chargeType) ?? '';
  return {
    ...describeStatus(statusCode, chargeType),
    statusCode,
    chargeType,
    originalAmount: centsToAmount(c.originalAmount),
    capturedAmount: centsToAmount(c.capturedAmount),
    authorizedAt: nonEmpty(c.authorizedAt),
    capturedAt: nonEmpty(c.capturedAt),
    voidedAt: nonEmpty(c.voidedAt),
    hostRefNum: nonEmpty(c.hostRefNum),
    authCode: nonEmpty(c.authCode),
    hostReturnCode: nonEmpty(c.hostReturnCode),
    transId: nonEmpty(c.transId),
    settleId: nonEmpty(c.settleId),
    xid: nonEmpty(c.xid),
    cavv: nonEmpty(c.cavv),
    eci: nonEmpty(c.eci),
    mdStatus: nonEmpty(c.mdStatus),
    raw: line,
  };
}

/** The TRX1..TRXn lines of an order history, in order (by number, not by tag order). */
export function historyLines(extra: Readonly<Record<string, string>>): string[] {
  return Object.keys(extra)
    .map((key) => /^TRX(\d+)$/.exec(key))
    .filter((m): m is RegExpExecArray => m !== null)
    .sort((a, b) => Number(a[1]) - Number(b[1]))
    .map((m) => extra[m[0]])
    .filter((line) => line.trim() !== '');
}
