/**
 * @typedef {import("./ast.js").GLSLType} GLSLType
 */

/**
 * @typedef {number | boolean} Literal
 * @typedef {"+" | "-" | "*" | "/" | "%" | "&" | "^" | "|" | ">>" | "<<" | ">" | "<" | ">=" | "<=" | "==" | "!=" | "&&" | "^^" | "||" } BinOpToken
 * @typedef {"+" | "-" | "~" | "!"} UnaryOpToken
 * @typedef {BinOpToken | UnaryOpToken} OpToken
 * @typedef {"int" | "float" | "bool"} TypeToken
 * @typedef {"true" | "false"} BoolToken
 * @typedef {"(" | ")" | ";" | ":" | "?" | "=" | "," | TypeToken | BoolToken | OpToken } TextualToken
 * @typedef {TextualToken | Identifier | Literal} Token
 * @typedef {{[ident: string]: GLSLType}} TypeContext
 */

/** @type {BinOpToken[]} */
const BINARY_OPERATORS = ["+", "-", "*", "/", "%", "&", "^", "|", ">>", "<<", ">=", "<=", "==", "!=", ">", "<", "&&", "^^", "||"];
/** @type {UnaryOpToken[]} */
const UNARY_OPERATORS = ["+", "-", "~", "!"];
/** @type {OpToken[]} */
// @ts-ignore
const OPERATORS = BINARY_OPERATORS.concat(UNARY_OPERATORS);
/** @type {TypeToken[]} */
const TYPE_TOKENS = ["int", "float", "bool"];
/** @type {BoolToken[]} */
const BOOLEANS = ["true", "false"];

/** @type {TextualToken[]} */
// @ts-ignore
const TEXT_TOKENS = OPERATORS.concat(BOOLEANS, TYPE_TOKENS, ["(", ")", "=", ";", ":", "?", "=", ","]).sort((x, y) => y.length - x.length);

export const INTEGER_VARIABLES = ["t", "sx", "sy", "mx", "my", "kx", "ky"];
export const FLOAT_VARIABLES = ["t_f", "sx_f", "sy_f", "mx_f", "my_f", "kx_f", "ky_f"];


export class Identifier {
    /** @param {string} identifier */
    constructor(identifier) {
        this.identifier = identifier;
    }

    toString() { return this.identifier; }
    simplify() { return this; }

    /**
     * @param {TypeContext} type_ctx 
     * @returns {GLSLType}
     */
    type(type_ctx) {
        if (INTEGER_VARIABLES.includes(this.identifier)) {
            return "int";
        } else if (FLOAT_VARIABLES.includes(this.identifier)) {
            return "float";
        } else {
            for (const [ident, type] of Object.entries(type_ctx)) {
                if (ident == this.identifier) {
                    return type;
                }
            }
            return "unknown";
        }
    }
}


/**
* Tokensize the bytebeat into a TokenStream. A token is a Value, Op, an open paren,
* or a close paren.
* @param {string} bytebeat the bytebeat source to tokenize
* @returns {Token[] | Error} the tokenized bytebeat, or an error if the bytebeat could not be tokenized
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

        for (const token of TEXT_TOKENS) {
            if (remaining.startsWith(token)) {
                if (token === "true") {
                    tokens.push(true);
                } else if (token === "false") {
                    tokens.push(false);
                } else {
                    tokens.push(token);
                }
                i += token.length;
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
    return tokens;
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