import { isNumber } from "./util.js";

const OPERATORS = ["+", "-", "*", "/", "%", "&", "^", "|", ">>", "<<"];
export const VARIABLES = ["t", "sx", "sy", "mx", "my", "kx", "ky"];

const MAX_PRECEDENCE = 12;

// TODO: this global varible is very stupid and hacky
let ALLOWED_VALUES = VARIABLES;

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

    /**
     * @param {number} a
     * @param {number} b
     * @returns {number}
     */
    eval(a, b) {
        switch (this.value) {
            case "+": return a + b;
            case "-": return a - b;
            case "*": return a * b;
            case "/": return b == 0 ? 0 : (a / b) | 0;
            case "%": return b == 0 ? 0 : a % b;
            case "^": return a ^ b;
            case "&": return a & b;
            case "|": return a | b;
            case ">>": return a >> b;
            case "<<": return a << b;
            default: throw new Error(`Unable to eval "${a} ${this.value} ${b}"`);
        }
    }

    /**
     * Returns the precedence of the operator.
     * A lower value means higher precedence. 
     * @returns {number} */
    precedence() {
        switch (this.value) {
            case "*":
            case "/":
            case "%": return 4;
            case "+":
            case "-": return 5;
            case ">>":
            case "<<": return 6;
            case "&": return 9;
            case "^": return 10;
            case "|": return 11;
            default: throw new Error(`Unknown precedence for ${this.value}"`);
        }
    }

    /** @return {"left" | "right"} */
    lexicial_associativity() {
        switch (this.value) {
            case "+":
            case "-":
            case "*":
            case "/":
            case "%":
            case "&":
            case "^":
            case "|":
            case ">>":
            case "<<": return "left";
            default: throw new Error(`Unknown lexical associativity for ${this.value}"`);
        }
    }

    is_mathematically_associative() {
        switch (this.value) {
            case "+":
            case "*":
            case "&":
            case "^":
            case "|": return true;
            case "%":
            case "/":
            case "-":
            case ">>":
            case "<<": return false;
            default: throw new Error(`Unknown mathematical associativity for ${this.value}"`);
        }
    }
}

/** @template {string | number} [T=string | number] */
class Value {
    /** @param {T} value */
    constructor(value) {
        this.value = value;
    }

    /** @returns {this is Value<number>} */
    isNumber() {
        return typeof this.value == "number";
    }

    /** @returns {string} */
    toString() {
        return this.value.toString();
    }

    /** @returns Value */
    static random() {
        /** @type {string | number } */
        // @ts-ignore
        let value = choose(Math.floor(Math.random() * 256), ...ALLOWED_VALUES);
        return new Value(value);
    }
}

export class BinOp {
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
        let left = `${this.left.toString()}`;
        if (needs_parenthesis(this, this.left, "left")) {
            left = `(${left})`;
        }

        let right = `${this.right.toString()}`;
        if (needs_parenthesis(this, this.right, "right")) {
            right = `(${right})`;
        }

        return `${left} ${this.op.toString()} ${right}`;

        /**
         * @param {BinOp} parent
         * @param {BinOp | Value} child
         * @param {"left" | right} which_child
         */
        function needs_parenthesis(parent, child, which_child) {
            if (child instanceof Value) {
                return false;
            }

            // If the child binds more loosely than the parent, but we need the child to bind
            // stronger, use parens
            if (parent.op.precedence() < child.op.precedence()) {
                return true;
            } else if (parent.op.precedence() == child.op.precedence()) {
                // If the parent and child bind equally, then we need to check that the unparenthesized
                // expression would be the same as the intended expression.
                // Most operators are [lexically] left-associative. (That means "a op1 b op2 c" is equal to "(a op1 b) op2 c")
                // These comments will assume left-associativity, which you must reverse if the operator
                // is actually right-associative.
                // In order to not have the parenthesis we need that "a op1 b op2 c" would equal the intended expression.

                // If the intended expression is (a op1 b) op2 c (that is to say, we are considering the parent the left child), 
                // then we do not need the parenthesis, since the expression already parenthesizes how we intend.
                if (which_child == parent.op.lexicial_associativity()) {
                    return false;
                }
                // Otherwise, we are considering the right child, and need to check that (a op1 b) op2 c would equal a op1 (b op2 c)
                // (since a op1 b op2 c = (a op1 b) op2 c, if we have the above condition, then we can remove the parenthesis)
                // The equality condition holds only when the two ops are the same operator and the op is mathematically
                // associative (that is, we need "op1 = op2" and "(a op b) op c == a op (b op c)").
                // We need the mathamethical associativity requirement, because something like / would not work
                // (a / b) / c != a / (b / c)

                // We also need the same-operator requirement, because of the example below:
                // For example, a * b * c  = (a * b) * c  = a * (b * c)
                // however,     a + b * c != (a + b) * c != (a + b) * c, even if + had the same precedence as *.
                return !(parent.op.is_mathematically_associative() && parent.op.value == child.op.value);
            } else {
                return false;
            }
        }
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
            /** @type { Value | BinOp } */
            // @ts-ignore
            let left = choose(Value.random(), BinOp.random(max_depth - 1));
            /** @type { Value | BinOp } */
            // @ts-ignore
            let right = choose(Value.random(), BinOp.random(max_depth - 1));
            return new BinOp(left, op, right);
        }
    }

    /** @returns {BinOp | Value} */
    simplify() {
        let left = this.left;
        if (left instanceof BinOp) {
            left = left.simplify();
        }

        let right = this.right;
        if (right instanceof BinOp) {
            right = right.simplify();
        }

        if (left instanceof Value && right instanceof Value) {
            if (left.isNumber() && right.isNumber()) {
                return new Value(this.op.eval(left.value, right.value));
            }
        }

        /** @type {[string, string, string, string | number, string?][]} */
        let rules = [
            // Constant Identities
            ["?a", "+", "0", "?a", "commutative"],
            ["?a", "-", "0", "?a"],
            ["?a", "*", "0", 0, "commutative"],
            ["?a", "*", "1", "?a", "commutative"],
            ["?a", "/", "1", "?a"],
            [" 0", "/", "?a", 0],
            // Modulo Identities
            ["?a", "%", "-1", 0],
            ["?a", "%", "0", 0],
            ["?a", "%", "1", 0],
            // Reflexive Identities
            ["?a", "-", "?a", 0],
            ["?a", "/", "?a", 1],
            ["?a", "^", "?a", 0],
            ["?a", "%", "?a", 0],
            ["?a", "&", "?a", "?a"],
            ["?a", "|", "?a", "?a"],
            // Bitwise w Zero
            ["?a", "&", "0", 0, "commutative"],
            ["?a", "|", "0", "?a", "commutative"],
            ["?a", "^", "0", "?a", "commutative"],
            // Bitshift w Zero
            ["?a", ">>", "0", "?a"],
            ["?a", "<<", "0", "?a"],
            ["0", ">>", "?a", 0],
            ["0", "<<", "?a", 0],
        ];
        for (let [rule_left, rule_op, rule_right, result, commutative] of rules) {
            rule_left = rule_left.trim();
            rule_op = rule_op.trim();
            rule_right = rule_right.trim();
            const is_commutative = commutative === "commutative";

            let applied = try_apply_rule(rule_left, rule_op, rule_right, result, left, this.op.toString(), right);
            if (is_commutative && applied == null) {
                applied = try_apply_rule(rule_left, rule_op, rule_right, result, right, this.op.toString(), left);
            }

            if (applied) {
                return applied;
            }
        }
        return new BinOp(left, this.op, right);


        /**
         * Check if the rule-values matches the actual values
         * @param {string} rule_left
         * @param {string} rule_op
         * @param {string} rule_right
         * @param {string | number} result
         * @param {Value | BinOp} left
         * @param {string} op
         * @param {Value | BinOp} right
         * @returns {Value | BinOp | null}
         */
        function try_apply_rule(rule_left, rule_op, rule_right, result, left, op, right) {
            const op_matches = rule_op == op;

            const wild_left = rule_left == "?a";
            const wild_right = rule_right == "?a";

            let values_match = false;
            if (wild_left && wild_right) {
                values_match = left.toString() === right.toString();
            } else {
                values_match = (wild_left || rule_left === left.toString()) && (wild_right || rule_right === right.toString());
            }

            if (op_matches && values_match) {
                if (result == "?a" && rule_left == "?a") {
                    return left;
                } else if (result == "?a" && rule_left == "?a") {
                    return right;
                } else {
                    return new Value(result);
                }
            }

            return null;
        }
    }
}

/**
 * <variable> ::= t | sx | sy | mx | my | kx | ky
 * <value>    ::= <number> | <variable>
 * <op>       :: = + | - | * | / | % | << | >> | & | ^ | |
 * <term>     ::= "(" <expr> ")" | <value>
 * <expr>     ::= <term> (<op> <term>)*
 * The TokenStream contains a stream of Values, Ops, and strings (anything leftover, in this case
 * open and close parenthesis.) The TokenStream parens this stream into a single BinOp or Value.
 * 
 * Explanation of grammar: The "term" and "expr" are largely the same concept--both will parse to either
 * a Value or BinOp. However, an expression is a sequence of terms, while a term is typically a "single expression"
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

    /** 
     * @typedef {Value | BinOp} Term
     * @returns {Term} */
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
        let terms = [];
        let ops = [];

        terms.push(this.parse_term());
        while (true) {
            const op = this.peek();
            if (!(op instanceof Op)) {
                break;
            }
            this.consume(op);
            const term = this.parse_term();

            terms.push(term);
            ops.push(op);
        }

        console.assert(terms.length == ops.length + 1);

        if (terms.length == 1 && ops.length == 0) {
            return terms[0];
        }
        return term_stream(terms, ops);

        /**
         * Turn a stream of terms into a single Value or BinOp. The terms and ops are interleaved 
         * like so:
         * terms: 0   1   2   3   4   5
         * ops  :   0   1   2   3   4
         * @param {Term[]} terms
         * @param {Op[]} ops
         * @return {Value | BinOp}
         */
        function term_stream(terms, ops) {
            // We scan over the term stream, looking for a highest-precendence op (numberically, this is the lowest 
            // op.precendence() value). For the first one we find, we bind the two adjacent terms around it
            // and create a single larger term containing the terms and op. Then we keep doing this until
            // we've covered all the ops of that precedence. This continues down the precendence list
            // until we have bound all the terms into just one term, producing the AST for this term-stream 
            // TODO: this code currently only works for left-associative operators. it will need to 
            // scan in the opposite direction (right to left) for right-associative operators.
            for (let current_precedence = 0; current_precedence <= MAX_PRECEDENCE; current_precedence += 1) {
                if (terms.length == 1) {
                    console.assert(ops.length == 0, `Expected ops length to be zero, got ${ops}`);
                    return terms[0];
                }
                let i = 0;
                while (i < ops.length) {
                    if (ops[i].precedence() == current_precedence) {
                        let left_term = terms[i];
                        let right_term = terms[i + 1];
                        let op = ops[i];
                        let bound_term = new BinOp(left_term, op, right_term);

                        // remove the op from the ops array
                        ops.splice(i, 1);
                        // replace the left and right terms with just the bound term
                        terms.splice(i, 2, bound_term);
                        // Deliberately stay on the current term/op position--the next op in the 
                        // list has just been shifted into the current position.
                    } else {
                        i += 1;
                    }
                }
            }

            throw new Error(`Did not parse all of term stream: ${terms}, ${ops}`);
        }
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
     * Tokensize the bytebeat into a sequence of tokens. A token is a Value, Op, an open paren,
     * or a close paren.
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
                tokens.push(new Value(number.value));
                i += number.tokens_consumed;
                continue;
            }

            console.log("Unrecognized token: ", this_char);
            i += 1;
        }
        return new TokenStream(tokens, 0);
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
}

/**
 * Generates a random bytebeat.
 * @returns {string}
 * @param {string[]} allowed_values
 */
export function random_bytebeat(allowed_values) {
    ALLOWED_VALUES = allowed_values;
    let expr = BinOp.random(20);
    return expr.toString();
}

/**
 * Mutate the passed bytebeat.
 * @param {string} bytebeat
 * @param {string[]} allowed_values
 * @param {boolean} mutate_ops
 * @param {boolean} mutate_values
 * @returns {string}
 */
export function mutate_bytebeat(bytebeat, allowed_values, mutate_ops, mutate_values) {
    ALLOWED_VALUES = allowed_values;
    let match_values = /t|sx|sy|kx|ky|mx|my|[\d]+/g;
    let match_operators = /\+|\-|\*|\/|\^|\&|\||\%|\>\>|\<\</g;

    console.log(bytebeat);

    if (mutate_values) {
        bytebeat = bytebeat.replace(match_values, (match, ...rest) => {
            console.log(match);
            if (Math.random() < 0.25) {
                console.log("h");
                return Value.random().toString();
            } else {
                return match;
            }
        });
    }

    if (mutate_ops) {
        bytebeat = bytebeat.replace(match_operators, (match, ...rest) => {
            if (Math.random() < 0.25) {
                return Op.random().toString();
            } else {
                return match;
            }
        });
    }


    return bytebeat;
}



/**
 * @template T
 * @param {T[]} values
 * @returns {T}
 */
function choose(...values) {
    let value = values[Math.floor(Math.random() * values.length)];
    return value;
}
