/**
 * @typedef {import("./ast.js").GLSLType} GLSLType
 */

import { TypeContext, TypeResult } from "./ast.js";
import { array_to_string, assert, assertBoolean, assertNumber } from "./util.js";

/**
 * @typedef {"+" | "-" | "*" | "/" | "%" | "&" | "^" | "|" | ">>" | "<<" | ">" | "<" | ">=" | "<=" | "==" | "!=" | "&&" | "^^" | "||" | "=" | ","} BinOpToken
 * @typedef {"+" | "-" | "~" | "!"} UnaryOpToken
 * @typedef {BinOpToken | UnaryOpToken} OpToken
 * @typedef {"int" | "float" | "bool"} TypeToken
 * @typedef {"true" | "false"} BoolToken
 * @typedef {"(" | ")" | ";" | ":" | "?" | TypeToken | BoolToken | OpToken } TextualToken
 * @typedef {TextualToken | Identifier | Literal} Token
 */

/** @type {BinOpToken[]} */
export const SIMPLE_BINARY_OPERATORS = ["+", "-", "*", "/", "%", "&", "^", "|", ">>", "<<", ">=", "<=", "==", "!=", ">", "<", "&&", "^^", "||"];
/** @type {UnaryOpToken[]} */
export const UNARY_OPERATORS = ["+", "-", "~", "!"];
/** @type {OpToken[]} */
// @ts-ignore
const OPERATORS = SIMPLE_BINARY_OPERATORS.concat(UNARY_OPERATORS, ["=", ","]);
/** @type {TypeToken[]} */
export const TYPE_TOKENS = ["int", "float", "bool"];
/** @type {BoolToken[]} */
const BOOLEANS = ["true", "false"];

/** @type {TextualToken[]} */
// @ts-ignore
const TEXT_TOKENS = OPERATORS.concat(BOOLEANS, TYPE_TOKENS, ["(", ")", "=", ";", ":", "?"]).sort((x, y) => y.length - x.length);

export const INTEGER_VARIABLES = ["t", "sx", "sy", "mx", "my", "kx", "ky"];
export const FLOAT_VARIABLES = ["t_f", "sx_f", "sy_f", "mx_f", "my_f", "kx_f", "ky_f"];

export class Literal {
    /** @param {string} value */
    constructor(value) {
        this.value = value;
    }

    /**
     * @param {number} value
     * @param {"int" | "float"} type
     */
    static fromNumber(value, type) {
        switch (type) {
            case "int": assert(Number.isInteger(value), `Expected int, got ${value}`); return new Literal(value.toFixed(0));
            case "float": return new Literal(value.toFixed(1));
        }
    }

    /**
     * @param {boolean} value
     */
    static fromBool(value) {
        return value == true ? new Literal("true") : new Literal("false");
    }

    type() {
        if (this.value === "true" || this.value === "false") {
            return "bool";
        } else if (this.value.includes(".")) {
            return "float";
        } else {
            return "int";
        }
    }

    toString() {
        return this.value;
    }

    toValue() {
        if (this.value === "true") {
            return true;
        } else if (this.value === "false") {
            return false;
        } else {
            return Number(this.value);
        }
    }

    /** @returns {Literal} */
    coerceInt() {
        let value = this.toValue();
        switch (this.type()) {
            case "int": assertNumber(value); return this;
            case "float": assertNumber(value); return Literal.fromNumber(Math.trunc(value), "int");
            case "bool": assertBoolean(value); return new Literal(value ? "1" : "0");
        }
    }

    /** @returns {Literal} */
    coerceFloat() {
        let value = this.toValue();
        switch (this.type()) {
            case "int": assertNumber(value); return new Literal(value.toFixed(1));
            case "float": assertNumber(value); return this;
            case "bool": assertBoolean(value); return new Literal(value ? "1.0" : "0.0");
        }
    }

    /** @returns {Literal} */
    coerceBool() {
        let value = this.toValue();
        switch (this.type()) {
            case "int": assertNumber(value); return Literal.fromBool(value === 0);
            case "float": assertNumber(value); return Literal.fromBool(value === 0);
            case "bool": assertBoolean(value); return this;
        }
    }
}

export class Identifier {
    /** @param {string} identifier */
    constructor(identifier) {
        this.identifier = identifier;
    }

    toString() { return this.identifier; }
    simplify() { return this; }

    /**
     * @param {TypeContext} type_ctx 
     * @returns {TypeResult}
     */
    type(type_ctx) {
        if (INTEGER_VARIABLES.includes(this.identifier)) {
            return TypeResult.ok("int");
        } else if (FLOAT_VARIABLES.includes(this.identifier)) {
            return TypeResult.ok("float");
        } else {
            return type_ctx.lookup(this);
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
                if (token === "true" || token === "false") {
                    tokens.push(new Literal(token));
                } else {
                    tokens.push(token);
                }
                i += token.length;
                continue outer;
            }
        }

        let number = try_consume_number(remaining);
        if (number != null) {
            tokens.push(new Literal(number.value));
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
 * @returns {token is BinOpToken}
 */
export function is_simple_bin_op_token(token) {
    // @ts-ignore
    return SIMPLE_BINARY_OPERATORS.includes(token);
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
 * @return {{value: string, tokens_consumed: number} | null}
 */
function try_consume_number(input) {
    let number = "";
    for (let i = 0; i < input.length; i++) {
        const this_char = input[i];
        const is_digit = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "."].includes(this_char);
        if (!isNaN(Number(number + this_char)) && is_digit) {
            number += this_char;
        } else {
            break;
        }
    }
    return number == "" ? null : { value: number, tokens_consumed: number.length };
}
