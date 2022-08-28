import { isNumber } from "./util.js";

let OPERATORS = ["+", "-", "*", "/", "%", "&", "^", "|", ">>", "<<"];
let VARIABLES = ["t", "sx", "sy", "mx", "my", "kx", "ky"];

class Op {
    /** @param {string} value */
    constructor(value) {
        this.value = value;
    }

    /** @returns {string} */
    toString() {
        return this.value;
    }

    /** @returns {Op} */
    static random() {
        let op = choose(
            "+", "-", "*", "/",
            "%", "<<", ">>",
            "&", "^", "|",
            "&", "^", "|");
        return new Op(op);
    }

}

class Value {
    /** @param {string} value */
    constructor(value) {
        this.value = value;
    }

    /** @returns {string} */
    toString() {
        return this.value;
    }

    static random() {
        let value = choose(
            "t", "t", "t", "t",
            "sx", "sx",
            "sy", "sy",
            "mx", "my", "kx", "ky", `${Math.floor(Math.random() * 256)}`);
        return new Value(value);
    }
}

class BinOp {
    /**
     * @param {Value | BinOp} left
     * @param {Op} op
     * @param {Value | BinOp} right
     */
    constructor(left, op, right) {
        this.left = left;
        this.op = op;
        this.right = right;
    }

    /** @returns {string} */
    toString() {
        return `(${this.left.toString()} ${this.op.toString()} ${this.right.toString()})`;
    }

    /**
     * @param {number} max_depth
     * @returns {BinOp}
     */
    static random(max_depth) {
        let op = Op.random();
        if (max_depth == 0) {
            let left = Value.random();
            let right = Value.random();
            return new BinOp(left, op, right);
        } else {
            // @ts-ignore
            let left = choose(Value.random(), BinOp.random(max_depth - 1));
            // @ts-ignore
            let right = choose(Value.random(), BinOp.random(max_depth - 1));
            return new BinOp(left, op, right);
        }
    }
}

/**
 * <variable> ::= t | sx | sy | mx | my | kx | ky
 * <value>    ::= <number> | <variable>
 * <op>       :: = + | - | * | / | % | << | >> | & | ^ | |
 * <term>     ::= "(" <expr> ")" | <value>
 * <expr>     ::= <term> (<op> <term>)?
 */
class TokenStream {
    /**
     * @typedef {string | Value | Op} Token
     * @param {Token[]} stream
     * @param {number} index
     */
    constructor(stream, index) {
        this.stream = stream;
        this.index = index;
    }

    /** @returns {Value | BinOp} */
    parse_term() {
        const next_token = this.peek();
        if (next_token == "(") {
            this.consume("(");
            const expr = this.parse_expr();
            this.consume(")");
            return expr;
        } else if (next_token instanceof Value) {
            this.consume(next_token);
            return next_token;
        } else {
            throw new Error(`Expected a right paren or value, got ${next_token}`);
        }
    }

    /** @returns {Value | BinOp} */
    parse_expr() {
        const l_term = this.parse_term();
        const op = this.peek();
        if (!(op instanceof Op)) {
            return l_term;
        }
        this.consume(op);
        const r_term = this.parse_term();
        return new BinOp(l_term, op, r_term);

    }

    /** @return {Token | null} */
    peek() {
        if (this.index < this.stream.length) {
            return this.stream[this.index];
        } else {
            return null;
        }
    }

    /** @param {Token} token */
    consume(token) {
        if (this.stream[this.index] == token) {
            this.index += 1;
        } else {
            throw new Error(`Expected ${token}, got ${this.stream[this.index]}`);
        }
    }

}

/**
 * Try to parse a string into an expression.
 * @param {string} bytebeat
 * @returns {Value | BinOp | null}
 */
export function try_parse(bytebeat) {
    const tokens = tokenize(bytebeat);

    try {
        let expr = tokens.parse_expr();
        return expr;
    } catch (e) {
        console.error("Couldn't parse token stream: ", tokens.stream, e);
        return null;
    }

    /**
     * @param {string} bytebeat
     * @returns {TokenStream}
     */
    function tokenize(bytebeat) {
        let i = 0;

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
                    tokens.push(new Op(op));
                    i += op.length;
                    continue outer;
                }
            }

            for (const varible of VARIABLES) {
                if (remaining.startsWith(varible)) {
                    tokens.push(new Value(varible));
                    i += varible.length;
                    continue outer;
                }
            }

            let number = try_consume_number(remaining);
            if (number != null) {
                tokens.push(new Value(number));
                i += number.length;
                continue;
            }

            console.log("Unrecognized token: ", this_char);
            i += 1;
        }
        return new TokenStream(tokens, 0);
    }

    /**
     * @param {string} input
     * @return {string | null} the number as a string
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
        return number == "" ? null : number;
    }
}

/**
 * Generates a random bytebeat.
 * @returns {string}
 */
export function random_bytebeat() {
    let expr = BinOp.random(20);
    return expr.toString();
}

/**
 * Mutate the passed bytebeat.
 * @param {string} bytebeat
 * @returns {string}
 */
export function mutate_bytebeat(bytebeat) {
    let match_values = /t|sx|sy|kx|ky|mx|my|[\d]+/g;
    let match_operators = /\+|\-|\*|\/|\^|\&|\||\%|\>\>|\<\</g;

    console.log(bytebeat);

    bytebeat = bytebeat.replace(match_values, (match, ...rest) => {
        console.log(match);
        if (Math.random() < 0.25) {
            console.log("h");
            return Value.random().toString();
        } else {
            return match;
        }
    })

    bytebeat = bytebeat.replace(match_operators, (match, ...rest) => {
        if (Math.random() < 0.25) {
            return Op.random().toString();
        } else {
            return match;
        }
    })

    return bytebeat;
}



/**
 * @template T
 * @param {T[]} values
 * @returns {T}
 */
function choose(...values) {
    let index = Math.floor(Math.random() * values.length);
    return values[index];
}
