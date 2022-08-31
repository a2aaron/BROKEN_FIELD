import { BinOp, TokenStream, Value } from "./parse.js";

/**
 * @typedef {"+" | "-" | "*" | "/" | "%" | "&" | "^" | "|" | ">>" | "<<"} BinOpToken
 * @typedef {"+" | "-" | "~" | "!"} UnaryOpToken
 * @typedef {BinOpToken | UnaryOpToken} OpToken
 * @typedef {"int" | "float" | "bool"} TypeToken
 * @typedef {"(" | ")" | TypeToken | OpToken | Value} Token
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

const VALUE_TOKENS = INTEGER_VARIABLES.concat(FLOAT_VARIABLES);


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
        let next_char = i + 1 < bytebeat.length ? bytebeat[i + 1] : null;

        if (this_char == " " || this_char == "\n") {
            i += 1;
            continue;
        }

        if (this_char == "(" || this_char == ")") {
            i += 1;
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
                tokens.push(new Value(bool == "true"));
                i += bool.length;
                continue outer;
            }
        }

        for (const value of VALUE_TOKENS) {
            if (remaining.startsWith(value)) {
                tokens.push(new Value(value));
                i += value.length;
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
            tokens.push(new Value(number.value));
            i += number.tokens_consumed;
            continue;
        }

        return new Error(`Unrecognized token: ${this_char}`);
    }
    return new TokenStream(tokens);
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