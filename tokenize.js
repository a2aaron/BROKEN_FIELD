import { BinOp, TokenStream, Value } from "./parse.js";

/**
 * @typedef {number | boolean} Literal
 * @typedef {"+" | "-" | "*" | "/" | "%" | "&" | "^" | "|" | ">>" | "<<"} BinOpToken
 * @typedef {"+" | "-" | "~" | "!"} UnaryOpToken
 * @typedef {BinOpToken | UnaryOpToken} OpToken
 * @typedef {"int" | "float" | "bool"} TypeToken
 * @typedef {"(" | ")" | "=" | ";" | TypeToken | OpToken | Identifier | Literal} Token
 */

/** @type {BinOpToken[]} */
const BINARY_OPERATORS = ["+", "-", "*", "/", "%", "&", "^", "|", ">>", "<<"];
/** @type {UnaryOpToken[]} */
const UNARY_OPERATORS = ["+", "-", "~", "!"];
/** @type {OpToken[]} */
// @ts-ignore
const OPERATORS = BINARY_OPERATORS.concat(UNARY_OPERATORS);

export const INTEGER_VARIABLES = ["t", "sx", "sy", "mx", "my", "kx", "ky"];
export const FLOAT_VARIABLES = ["t_f", "sx_f", "sy_f", "mx_f", "my_f", "kx_f", "ky_f"];

const BOOLEANS = ["true", "false"];

/** @type {TypeToken[]} */
const TYPE_TOKENS = ["int", "float", "bool"];

export class Identifier {
    /** @param {string} identifier */
    constructor(identifier) {
        this.identifier = identifier;
    }

    toString() { return this.identifier; }

    type() {
        if (INTEGER_VARIABLES.includes(this.identifier)) {
            return "int";
        } else if (FLOAT_VARIABLES.includes(this.identifier)) {
            return "float";
        } else {
            return "unknown";
        }
    }
}


/**
* Tokensize the bytebeat into a TokenStream. A token is a Value, Op, an open paren,
* or a close paren.
* @param {string} bytebeat the bytebeat source to tokenize
* @returns {TokenStream | Error} the tokenized bytebeat, or an error if the bytebeat could not be tokenized
*/
export function tokenize(bytebeat) {
    let i = 0;

    /** @type {Token[]} */
    let tokens = [];
    outer:
    while (i < bytebeat.length) {
        let remaining = bytebeat.substring(i);

        let this_char = bytebeat[i];

        if (this_char == " " || this_char == "\n") {
            i += 1;
            continue;
        }

        if (["(", ")", "=", ";"].includes(this_char)) {
            i += 1;
            // @ts-ignore
            tokens.push(this_char);
            continue;
        }

        for (const op of OPERATORS) {
            if (remaining.startsWith(op)) {
                tokens.push(op);
                i += op.length;
                continue outer;
            }
        }

        for (const bool of BOOLEANS) {
            if (remaining.startsWith(bool)) {
                tokens.push(bool == "true");
                i += bool.length;
                continue outer;
            }
        }

        for (const type of TYPE_TOKENS) {
            if (remaining.startsWith(type)) {
                tokens.push(type);
                i += type.length;
                continue outer;
            }
        }

        let number = try_consume_number(remaining);
        if (number != null) {
            tokens.push(number.value);
            i += number.tokens_consumed;
            continue;
        }

        let ident = try_consume_identifier(remaining);
        if (ident != null) {
            tokens.push(new Identifier(ident.ident));
            i += ident.tokens_consumed;
            continue;
        }
        return new Error(`Unrecognized token: ${this_char}`);
    }
    return new TokenStream(tokens);
}

/**
 * @param {Token | null} token 
 * @returns {token is Literal}
 */
export function is_literal(token) {
    return typeof token == "number" || typeof token == "boolean"
}

/**
 * @param {Token | null} token
 * @returns {token is BinOpToken}
 */
export function is_bin_op_token(token) {
    // @ts-ignore
    return BINARY_OPERATORS.includes(token);
}


/**
 * @param {Token | null} token
 * @returns {token is UnaryOpToken}
 */
export function is_un_op_token(token) {
    // @ts-ignore
    return UNARY_OPERATORS.includes(token);
}

/**
 * @param {Token | null} token
 * @returns {token is TypeToken}
 */
export function is_type_token(token) {
    // @ts-ignore
    return TYPE_TOKENS.includes(token);
}

/**
 * @param {string} input
 * @return {{ident: string, tokens_consumed: number} | null}
 */
function try_consume_identifier(input) {
    // Match a single alphabetical (and _) and then match any number of alphanumeric (and _), at the
    // start of the string.
    let regex = /^[a-zA-Z_][a-zA-Z_0-9]*/;
    let matches = regex.exec(input);
    if (!matches) {
        return null;
    }
    return { ident: matches[0], tokens_consumed: matches[0].length };
}

/**
 * @param {string} input
 * @return {{value: number, tokens_consumed: number} | null}
 */
function try_consume_number(input) {
    let number = "";
    for (let i = 0; i < input.length; i++) {
        let this_char = input[i];
        if (!isNaN(parseInt(this_char))) {
            number += this_char;
        } else {
            break;
        }
    }
    return number == "" ? null : { value: parseInt(number), tokens_consumed: number.length };
}