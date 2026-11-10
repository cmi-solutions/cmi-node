/**
 * Parity with CMI's reference PHP scripts (PackageIntegrationEcomCmi_V2.0/2.Scripts/PHP).
 *
 * Every expected value below was computed by running the PHP reference code itself
 * (str_without_accents, natcasesort, html_entity_decode and the ver3 hash from
 * 2.SendData.php and callback.php) with PHP 8.3, store key "TEST1234".
 * Do not edit them by hand: regenerate them from PHP if the reference changes.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CMIPaymentGateway } from '../src/core/CMIPaymentGateway.js';
import { CallbackHandler } from '../src/core/CallbackHandler.js';
import { HashUtil } from '../src/utils/hash.util.js';
import { SanitizationUtil } from '../src/utils/sanitization.util.js';
import { phpStrnatcasecmp, phpHtmlEntityDecode } from '../src/utils/php-compat.util.js';
import { configureLogger } from '../src/logger/index.js';

configureLogger({ enabled: false });

const config = {
    storeKey: 'TEST1234',
    clientId: '600200127',
    gatewayUrl: 'https://testpayment.cmi.co.ma/fim/est3Dgate',
    storetype: '3d_pay_hosting' as const,
    trantype: 'PreAuth',
    callbackUrl: 'https://shop.example.ma/callback',
};

// Request input → hash computed by 2.SendData.php on the same (raw) values.
const REQUEST_CASES: Array<{ name: string; request: Record<string, any>; phpHash: string }> = [
    {
        "name": "PHP sample billing fields",
        "request": {
            "amount": "10.25",
            "currency": "504",
            "email": "email@domaine.com",
            "BillToName": "name",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "lang": "fr",
            "BillToCompany": "billToCompany",
            "BillToStreet1": "100 rue adress",
            "BillToCity": "casablanca",
            "BillToStateProv": "Maarif Casablanca",
            "BillToPostalCode": "20230",
            "BillToCountry": "504",
            "tel": "0021201020304",
            "refreshtime": "5"
        },
        "phpHash": "07Kx1Wzz/2+9ScEUnKjJUVqhsW0BtgCnFj0KHMKt+zbc2KBP2VoU17xzAqGbMcxVSN5h0hfIDx1s/VJEs4LNug=="
    },
    {
        "name": "12 cart items (natural sort)",
        "request": {
            "amount": "10.25",
            "currency": "504",
            "email": "email@domaine.com",
            "BillToName": "name",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "lang": "fr",
            "id1": "p1",
            "qty1": "1",
            "price1": "1.00",
            "id2": "p2",
            "qty2": "2",
            "price2": "1.00",
            "id3": "p3",
            "qty3": "3",
            "price3": "1.00",
            "id4": "p4",
            "qty4": "4",
            "price4": "1.00",
            "id5": "p5",
            "qty5": "5",
            "price5": "1.00",
            "id6": "p6",
            "qty6": "6",
            "price6": "1.00",
            "id7": "p7",
            "qty7": "7",
            "price7": "1.00",
            "id8": "p8",
            "qty8": "8",
            "price8": "1.00",
            "id9": "p9",
            "qty9": "9",
            "price9": "1.00",
            "id10": "p10",
            "qty10": "10",
            "price10": "1.00",
            "id11": "p11",
            "qty11": "11",
            "price11": "1.00",
            "id12": "p12",
            "qty12": "12",
            "price12": "1.00"
        },
        "phpHash": "XQkx2bG/Ezrvz3/X5GKB5YcKQap/2DZqwU7gV5yxX6vE797qVbDcAxY7SqdOFjdv0JD8+YLWKzEWDhXu1Hg3rg=="
    },
    {
        "name": "custom value with outer spaces",
        "request": {
            "amount": "10.25",
            "currency": "504",
            "email": "email@domaine.com",
            "BillToName": "name",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "lang": "fr",
            "note": "  hello  "
        },
        "phpHash": "wb0XbaUxX2T7kAr+yDyBTQt2IvtqlsQ9PuaBNYG3C/wuETUvpnyQK/n1p9/0kI0YLDUtNlUKeJSVuw9aPhubJg=="
    },
    {
        "name": "custom value ending in a non-breaking space",
        "request": {
            "amount": "10.25",
            "currency": "504",
            "email": "email@domaine.com",
            "BillToName": "name",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "lang": "fr",
            "note": "hello "
        },
        "phpHash": "+y6Lk7NRcZXMr3GkIGM3ebcdjvYnryeH0VQZj8SYciM8HDVg3ZLEvatHOk5PmsjrpUMrXw4FKwcq33u9nGkZlA=="
    },
    {
        "name": "description containing &amp;",
        "request": {
            "amount": "10.25",
            "currency": "504",
            "email": "email@domaine.com",
            "BillToName": "name",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "lang": "fr",
            "description": "Tom &amp; Jerry"
        },
        "phpHash": "iaH+WvbHRdN/pARI4glWFyFxQ++HOYOI6B4TpXOV5Wk/ettsFnpJtm5t1eN2Uzc5MsU60hIobNojTXR1mLi44Q=="
    },
    {
        "name": "value with | and \\",
        "request": {
            "amount": "10.25",
            "currency": "504",
            "email": "email@domaine.com",
            "BillToName": "name",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "lang": "fr",
            "note": "ORDER-256712jbs\\j6b|"
        },
        "phpHash": "0oguwSiPBrRdrVc0p51NTYvKY2c2yWDe7TjeZi1H1aAtvv1VxaxDBgyp43dZe4yzlGT3EizVBHXIoLqrumHoRA=="
    },
    {
        "name": "field name starting with _",
        "request": {
            "amount": "10.25",
            "currency": "504",
            "email": "email@domaine.com",
            "BillToName": "name",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "lang": "fr",
            "_ref": "x1"
        },
        "phpHash": "QycrrxtxRYYIYqgY/hhcIm3qUFA0MfmREivj5Wi4yjvCgeA23OUAXgj6rVTFwxh03LpgogbDptWOb30hq3keWQ=="
    },
    {
        "name": "accents and symbols in billing fields",
        "request": {
            "amount": "10.25",
            "currency": "504",
            "email": "email@domaine.com",
            "BillToName": "José Müller-Øster",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "lang": "fr",
            "BillToStreet1": "100, rue Ibn Sina",
            "BillToCity": "Fès",
            "BillToStateProv": "L'Oriental"
        },
        "phpHash": "4P5e4FKB4T2P3/PJQL+hKUkoZGcH1JB6jD499KIzu05G+SdUp900Sw9UWapGif+oiTAoV457EeDCiTHS6pkCIQ=="
    }
];

// Callbacks signed with callback.php's algorithm → callback.php's answer.
const CALLBACK_CASES: Array<{ name: string; fields: Record<string, string>; phpAnswer: string }> = [
    {
        "name": "approved",
        "fields": {
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "clientId": "600200127",
            "trantype": "PreAuth",
            "amount": "10.25",
            "currency": "504",
            "storetype": "3d_pay_hosting",
            "email": "email@domaine.com",
            "BillToName": "name",
            "lang": "fr",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "hashAlgorithm": "ver3",
            "callbackUrl": "https://shop.example.ma/callback",
            "BillToCompany": "billToCompany",
            "BillToStreet1": "100 rue adress",
            "BillToCity": "casablanca",
            "BillToCountry": "504",
            "BillToStateProv": "Maarif Casablanca",
            "BillToPostalCode": "20230",
            "tel": "0021201020304",
            "AutoRedirect": "false",
            "refreshtime": "5",
            "Response": "Approved",
            "ProcReturnCode": "00",
            "AuthCode": "746579",
            "TransId": "17327P7GH13718",
            "EXTRA.TRXDATE": "23/11/2026 15:57:06",
            "EXTRA.CARDBRAND": "VISA",
            "MaskedPan": "400000***7190",
            "mdStatus": "1",
            "HostRefNum": "732715056928",
            "acqStan": "56928",
            "ReturnOid": "123ABC",
            "ErrMsg": "",
            "clientIp": "81.192.141.16",
            "HASH": "+QG97hA6n29un04lXWD2NvM9x8Och7/nJM+X2vV3/CgiAPfbjQPaxa+IuvfzRUlqRZMqf0OUzA2hw3pYr8lavg=="
        },
        "phpAnswer": "ACTION=POSTAUTH"
    },
    {
        "name": "declined (ProcReturnCode 99)",
        "fields": {
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "clientId": "600200127",
            "trantype": "PreAuth",
            "amount": "10.25",
            "currency": "504",
            "storetype": "3d_pay_hosting",
            "email": "email@domaine.com",
            "BillToName": "name",
            "lang": "fr",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "hashAlgorithm": "ver3",
            "callbackUrl": "https://shop.example.ma/callback",
            "BillToCompany": "billToCompany",
            "BillToStreet1": "100 rue adress",
            "BillToCity": "casablanca",
            "BillToCountry": "504",
            "BillToStateProv": "Maarif Casablanca",
            "BillToPostalCode": "20230",
            "tel": "0021201020304",
            "AutoRedirect": "false",
            "refreshtime": "5",
            "Response": "Declined",
            "ProcReturnCode": "99",
            "AuthCode": "746579",
            "TransId": "17327P7GH13718",
            "EXTRA.TRXDATE": "23/11/2026 15:57:06",
            "EXTRA.CARDBRAND": "VISA",
            "MaskedPan": "400000***7190",
            "mdStatus": "1",
            "HostRefNum": "732715056928",
            "acqStan": "56928",
            "ReturnOid": "123ABC",
            "ErrMsg": "Declined",
            "clientIp": "81.192.141.16",
            "HASH": "0eJ1XC5/I5C8zPPq/1omEDxu7CJKZklAfv3nOfvsp7Agm4MI69+J5TRrY1h60CD2Q8C9d68RQHr12BugThxvCw=="
        },
        "phpAnswer": "APPROVED"
    },
    {
        "name": "ProcReturnCode missing",
        "fields": {
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "clientId": "600200127",
            "trantype": "PreAuth",
            "amount": "10.25",
            "currency": "504",
            "storetype": "3d_pay_hosting",
            "email": "email@domaine.com",
            "BillToName": "name",
            "lang": "fr",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "hashAlgorithm": "ver3",
            "callbackUrl": "https://shop.example.ma/callback",
            "BillToCompany": "billToCompany",
            "BillToStreet1": "100 rue adress",
            "BillToCity": "casablanca",
            "BillToCountry": "504",
            "BillToStateProv": "Maarif Casablanca",
            "BillToPostalCode": "20230",
            "tel": "0021201020304",
            "AutoRedirect": "false",
            "refreshtime": "5",
            "Response": "Error",
            "AuthCode": "746579",
            "TransId": "17327P7GH13718",
            "EXTRA.TRXDATE": "23/11/2026 15:57:06",
            "EXTRA.CARDBRAND": "VISA",
            "MaskedPan": "400000***7190",
            "mdStatus": "1",
            "HostRefNum": "732715056928",
            "acqStan": "56928",
            "ReturnOid": "123ABC",
            "ErrMsg": "",
            "clientIp": "81.192.141.16",
            "HASH": "sBdXPoVuAleIRlw42m315pe9BQy4t1ERD1wjbJC4ggSGGNG1Vv5TAbCAup/hMuvVnFfyWcISXCaSetR60IOHuQ=="
        },
        "phpAnswer": "APPROVED"
    },
    {
        "name": "leading space in a value",
        "fields": {
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "clientId": "600200127",
            "trantype": "PreAuth",
            "amount": "10.25",
            "currency": "504",
            "storetype": "3d_pay_hosting",
            "email": "email@domaine.com",
            "BillToName": "name",
            "lang": "fr",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "hashAlgorithm": "ver3",
            "callbackUrl": "https://shop.example.ma/callback",
            "BillToCompany": "billToCompany",
            "BillToStreet1": "100 rue adress",
            "BillToCity": "casablanca",
            "BillToCountry": "504",
            "BillToStateProv": " Casablanca",
            "BillToPostalCode": "20230",
            "tel": "0021201020304",
            "AutoRedirect": "false",
            "refreshtime": "5",
            "Response": "Approved",
            "ProcReturnCode": "00",
            "AuthCode": "746579",
            "TransId": "17327P7GH13718",
            "EXTRA.TRXDATE": "23/11/2026 15:57:06",
            "EXTRA.CARDBRAND": "VISA",
            "MaskedPan": "400000***7190",
            "mdStatus": "1",
            "HostRefNum": "732715056928",
            "acqStan": "56928",
            "ReturnOid": "123ABC",
            "ErrMsg": "",
            "clientIp": "81.192.141.16",
            "HASH": "2sXlFAm8zxasMgzTY0hIcL+isQXm+18o/ejttcUheED5T3TDeClE+7v2CG0ItzRZb7vdygtBNc+bUHCVL+0CMg=="
        },
        "phpAnswer": "ACTION=POSTAUTH"
    },
    {
        "name": "HTML entity in a value",
        "fields": {
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "clientId": "600200127",
            "trantype": "PreAuth",
            "amount": "10.25",
            "currency": "504",
            "storetype": "3d_pay_hosting",
            "email": "email@domaine.com",
            "BillToName": "name",
            "lang": "fr",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "hashAlgorithm": "ver3",
            "callbackUrl": "https://shop.example.ma/callback",
            "BillToCompany": "billToCompany",
            "BillToStreet1": "100 rue adress",
            "BillToCity": "casablanca",
            "BillToCountry": "504",
            "BillToStateProv": "Maarif Casablanca",
            "BillToPostalCode": "20230",
            "tel": "0021201020304",
            "AutoRedirect": "false",
            "refreshtime": "5",
            "Response": "Approved",
            "ProcReturnCode": "00",
            "AuthCode": "746579",
            "TransId": "17327P7GH13718",
            "EXTRA.TRXDATE": "23/11/2026 15:57:06",
            "EXTRA.CARDBRAND": "VISA",
            "MaskedPan": "400000***7190",
            "mdStatus": "1",
            "HostRefNum": "732715056928",
            "acqStan": "56928",
            "ReturnOid": "123ABC",
            "ErrMsg": "Card holder&#39;s bank &amp; co",
            "clientIp": "81.192.141.16",
            "HASH": "mNYuZALS7Ix/SOJrYalgHkggptJipxPWNZNd3y6jYXIbGXDCWDB5ouyNlKThdun5gxt422Jn9fKSYcTShvm7vg=="
        },
        "phpAnswer": "ACTION=POSTAUTH"
    },
    {
        "name": "value ending in a newline",
        "fields": {
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "clientId": "600200127",
            "trantype": "PreAuth",
            "amount": "10.25",
            "currency": "504",
            "storetype": "3d_pay_hosting",
            "email": "email@domaine.com",
            "BillToName": "name",
            "lang": "fr",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "hashAlgorithm": "ver3",
            "callbackUrl": "https://shop.example.ma/callback",
            "BillToCompany": "billToCompany",
            "BillToStreet1": "100 rue adress",
            "BillToCity": "casablanca",
            "BillToCountry": "504",
            "BillToStateProv": "Maarif Casablanca",
            "BillToPostalCode": "20230",
            "tel": "0021201020304",
            "AutoRedirect": "false",
            "refreshtime": "5",
            "Response": "Approved",
            "ProcReturnCode": "00",
            "AuthCode": "746579",
            "TransId": "17327P7GH13718",
            "EXTRA.TRXDATE": "23/11/2026 15:57:06",
            "EXTRA.CARDBRAND": "VISA",
            "MaskedPan": "400000***7190",
            "mdStatus": "1",
            "HostRefNum": "732715056928",
            "acqStan": "56928",
            "ReturnOid": "123ABC",
            "ErrMsg": "Approved\n",
            "clientIp": "81.192.141.16",
            "HASH": "tLC+3iKiUBLrtcEBwGhf1QQIgRFKJ3qvZeeRf4CeWACOpAQ6+lt80EB++xsFxR/DkgKNQ61R1GuZSsHro0TPkA=="
        },
        "phpAnswer": "ACTION=POSTAUTH"
    },
    {
        "name": "12 cart items",
        "fields": {
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "clientId": "600200127",
            "trantype": "PreAuth",
            "amount": "10.25",
            "currency": "504",
            "storetype": "3d_pay_hosting",
            "email": "email@domaine.com",
            "BillToName": "name",
            "lang": "fr",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "hashAlgorithm": "ver3",
            "callbackUrl": "https://shop.example.ma/callback",
            "AutoRedirect": "false",
            "id1": "p1",
            "qty1": "1",
            "price1": "1.00",
            "id2": "p2",
            "qty2": "2",
            "price2": "1.00",
            "id3": "p3",
            "qty3": "3",
            "price3": "1.00",
            "id4": "p4",
            "qty4": "4",
            "price4": "1.00",
            "id5": "p5",
            "qty5": "5",
            "price5": "1.00",
            "id6": "p6",
            "qty6": "6",
            "price6": "1.00",
            "id7": "p7",
            "qty7": "7",
            "price7": "1.00",
            "id8": "p8",
            "qty8": "8",
            "price8": "1.00",
            "id9": "p9",
            "qty9": "9",
            "price9": "1.00",
            "id10": "p10",
            "qty10": "10",
            "price10": "1.00",
            "id11": "p11",
            "qty11": "11",
            "price11": "1.00",
            "id12": "p12",
            "qty12": "12",
            "price12": "1.00",
            "Response": "Approved",
            "ProcReturnCode": "00",
            "AuthCode": "746579",
            "TransId": "17327P7GH13718",
            "EXTRA.TRXDATE": "23/11/2026 15:57:06",
            "EXTRA.CARDBRAND": "VISA",
            "MaskedPan": "400000***7190",
            "mdStatus": "1",
            "HostRefNum": "732715056928",
            "acqStan": "56928",
            "ReturnOid": "123ABC",
            "ErrMsg": "",
            "clientIp": "81.192.141.16",
            "HASH": "Y8wn35g81Mz3jRCDmEXOAyldF3pvDS+p3GSChkJrE4VgTRoOvEmAJd/noXs37jKTmUMBz+S+p5VWum3y+WOOVg=="
        },
        "phpAnswer": "ACTION=POSTAUTH"
    },
    {
        "name": "apostrophe in BillToName",
        "fields": {
            "oid": "123ABC",
            "rnd": "abcdefghij",
            "clientId": "600200127",
            "trantype": "PreAuth",
            "amount": "10.25",
            "currency": "504",
            "storetype": "3d_pay_hosting",
            "email": "email@domaine.com",
            "BillToName": "O'Neil",
            "lang": "fr",
            "okUrl": "https://shop.example.ma/ok",
            "failUrl": "https://shop.example.ma/fail",
            "shopUrl": "https://shop.example.ma",
            "hashAlgorithm": "ver3",
            "callbackUrl": "https://shop.example.ma/callback",
            "BillToCompany": "billToCompany",
            "BillToStreet1": "100 rue adress",
            "BillToCity": "casablanca",
            "BillToCountry": "504",
            "BillToStateProv": "Maarif Casablanca",
            "BillToPostalCode": "20230",
            "tel": "0021201020304",
            "AutoRedirect": "false",
            "refreshtime": "5",
            "Response": "Approved",
            "ProcReturnCode": "00",
            "AuthCode": "746579",
            "TransId": "17327P7GH13718",
            "EXTRA.TRXDATE": "23/11/2026 15:57:06",
            "EXTRA.CARDBRAND": "VISA",
            "MaskedPan": "400000***7190",
            "mdStatus": "1",
            "HostRefNum": "732715056928",
            "acqStan": "56928",
            "ReturnOid": "123ABC",
            "ErrMsg": "",
            "clientIp": "81.192.141.16",
            "HASH": "fVpDdtCTFLODpGsMDe63eUGxgwCNKNbslvhV4UNqvSlpWhvan9ZblGLC1pxxoTSqOlEZV4WiyXAB3PKSsEIhDg=="
        },
        "phpAnswer": "ACTION=POSTAUTH"
    }
];

// trim(str_without_accents($value)) from 2.SendData.php
const ACCENT_CASES: Record<string, string> = {
    "José Martin": "Jose Martin",
    "Jean-Pierre Dupont": "Jean-Pierre Dupont",
    "O'Neil": "ONeil",
    "100, rue Ibn Sina": "100 rue Ibn Sina",
    "Bd. Zerktouni N°12": "Bd Zerktouni N12",
    "Fès": "Fes",
    "Ærøskøbing Œuvre straße": "AEroskobing OEuvre strasze",
    "محمد العلوي": ""
};

describe('PHP parity — payment request hash (2.SendData.php)', () => {
    const gateway = new CMIPaymentGateway(config);
    for (const c of REQUEST_CASES) {
        it(`same hash as PHP: ${c.name}`, () => {
            const params = gateway.createPaymentParams(c.request as any);
            assert.equal(params.hash, c.phpHash);
        });
    }

    it('posts exactly the values it hashes', () => {
        const params = gateway.createPaymentParams({ ...REQUEST_CASES[0].request, note: '  hello  ' } as any);
        assert.equal(params.note, 'hello');
        const { hash, ...posted } = params;
        assert.equal(HashUtil.generate(posted, 'TEST1234'), hash);
    });
});

describe('PHP parity — callback (callback.php)', () => {
    const gateway = new CMIPaymentGateway({ ...config, confirmationMode: 'auto' });
    const handler = new CallbackHandler(gateway);
    for (const c of CALLBACK_CASES) {
        it(`same answer as PHP (${c.phpAnswer}): ${c.name}`, () => {
            const result = gateway.verifyCallback(c.fields);
            assert.equal(result.verified, true);
            assert.equal(handler.getResponse(result).body, c.phpAnswer);
        });
    }

    it('answers FAILURE when the hash was tampered with', () => {
        const fields = { ...CALLBACK_CASES[0].fields, amount: '1.00' };
        const result = gateway.verifyCallback(fields);
        assert.equal(result.verified, false);
        assert.equal(handler.getResponse(result).body, 'FAILURE');
    });

    it('reports an authentic decline as DECLINED, never as an approved status', () => {
        const result = gateway.verifyCallback(CALLBACK_CASES[1].fields);
        assert.equal(result.success, false);
        assert.equal(result.status, 'DECLINED');
    });

    it('treats ProcReturnCode "0" as a decline (CMI only sends "00" for success)', () => {
        const fields: Record<string, string> = { ...CALLBACK_CASES[0].fields, ProcReturnCode: '0' };
        delete fields.HASH;
        fields.HASH = HashUtil.generateForCallback(fields, 'TEST1234');
        assert.equal(gateway.verifyCallback(fields).status, 'DECLINED');
    });
});

describe('PHP parity — helpers', () => {
    for (const [input, expected] of Object.entries(ACCENT_CASES)) {
        it(`str_without_accents(${JSON.stringify(input)}) → ${JSON.stringify(expected)}`, () => {
            assert.equal(SanitizationUtil.removeAccents(input), expected);
        });
    }

    it('sorts field names like natcasesort()', () => {
        const keys = ['price10', 'price2', 'price1', 'qty10', 'qty9', '_charset_', 'amount', 'EXTRA.TRXDATE', 'BillToName', 'item007', 'item7'];
        assert.deepEqual(
            [...keys].sort(phpStrnatcasecmp),
            ['amount', 'BillToName', 'EXTRA.TRXDATE', 'item007', 'item7', 'price1', 'price2', 'price10', 'qty9', 'qty10', '_charset_']
        );
    });

    it('decodes entities like html_entity_decode(ENT_QUOTES, UTF-8)', () => {
        assert.equal(phpHtmlEntityDecode('Tom &amp; Jerry &#39;x&#x27; &eacute; &apos; &AMP; &euro;'), "Tom & Jerry 'x' é &apos; &AMP; €");
    });

    it('applies the "document" rule of the CMI guide (§4.1.4) in the hash', () => {
        assert.equal(SanitizationUtil.applyDocumentRule('document abc'), 'document.abc');
        assert.equal(SanitizationUtil.applyDocumentRule('documentabc'), 'document.bc');
        assert.equal(SanitizationUtil.applyDocumentRule('document.bc'), 'document.bc');
        assert.equal(
            HashUtil.generate({ description: 'Achat documentation' }, 'K'),
            HashUtil.generate({ description: 'Achat document.tion' }, 'K')
        );
    });
});

describe('Billing data accepted like PHP', () => {
    const gateway = new CMIPaymentGateway(config);
    const base = REQUEST_CASES[0].request;

    for (const tel of ['0612345678', '0522123456', '0021201020304', '+212612345678', '06 12 34 56 78']) {
        it(`accepts the phone number ${tel}`, () => {
            assert.doesNotThrow(() => gateway.createPaymentParams({ ...base, tel } as any));
        });
    }

    it('rejects a BillToName with no character CMI accepts', () => {
        assert.throws(() => gateway.createPaymentParams({ ...base, BillToName: 'محمد العلوي' } as any), /BillToName/);
    });

    it('drops an optional billing field the cleaning leaves empty', () => {
        const params = gateway.createPaymentParams({ ...base, BillToCity: 'الرباط' } as any);
        assert.equal(Object.keys(params).some((k) => k.toLowerCase() === 'billtocity'), false);
    });
});

describe('validateOrder — order check before CMI is answered', () => {
    const gateway = new CMIPaymentGateway({ ...config, confirmationMode: 'auto' });
    const approved = CALLBACK_CASES[0].fields;

    const run = async (options: ConstructorParameters<typeof CallbackHandler>[1]) => {
        const sent: string[] = [];
        const order: string[] = [];
        const handler = new CallbackHandler(gateway, {
            ...options,
            onSuccess: () => { order.push('onSuccess'); },
            onFailure: () => { order.push('onFailure'); },
        });
        const res: any = { status: () => res, send: (b: string) => { sent.push(b); order.push('answer'); return res; } };
        await handler.middleware()({ method: 'POST', body: approved }, res);
        return { sent, order };
    };

    it('answers ACTION=POSTAUTH when the order matches', async () => {
        const { sent, order } = await run({ validateOrder: (r) => r.orderData?.amount === 10.25 });
        assert.deepEqual(sent, ['ACTION=POSTAUTH']);
        assert.deepEqual(order, ['answer', 'onSuccess']);
    });

    it('answers FAILURE (no capture) when the order does not match', async () => {
        const { sent, order } = await run({ validateOrder: async () => false });
        assert.deepEqual(sent, ['FAILURE']);
        assert.deepEqual(order, ['answer', 'onFailure']);
    });

    it('answers FAILURE when validateOrder throws', async () => {
        const { sent } = await run({ validateOrder: () => { throw new Error('database down'); } });
        assert.deepEqual(sent, ['FAILURE']);
    });

    it('is applied by handle() too, used by the Next.js, Fastify, Hono and NestJS adapters', async () => {
        const handler = new CallbackHandler(gateway, { validateOrder: () => false });
        const result = await handler.handle(approved);
        assert.equal(result.status, 'FAILURE');
        assert.equal(handler.getResponse(result).body, 'FAILURE');
    });
});
