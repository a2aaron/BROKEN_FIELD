import { FLOAT_VARIABLES, INTEGER_VARIABLES, is_bin_op_token, is_un_op_token, tokenize } from "./tokenize.js";

/**
 * Typedef imports
 * @typedef {import("./tokenize.js").UnaryOpToken} UnaryOpToken
 * @typedef {import("./tokenize.js").BinOpToken} BinOpToken
 * @typedef {import("./tokenize.js").Token} Token
 */

/**
 * Undefined Behavior Typedefs
 * @typedef {"divide by zero" | "overwide left shift"} UBType
 * @typedef {{location: Expr, type: UBType}} UBInfo
 */

/**
 * @typedef {"boolean" | "float" | "int" | "unknown" | "error"} GLSLType
 */

const MAX_PRECEDENCE = 12;


export class Program {
    /** @param {string} bytebeat */
    constructor(bytebeat) {
        let expr = try_parse(bytebeat);
        if (expr instanceof Error) {
            this.error = expr;
            this.expr = null;
            this.ub_info = null;
            return;
        }

        this.error = null;
        this.expr = expr;
        this.ub_info = expr.check_ub();

        /**
         * Try to parse a string into an expression.
         * @param {string} bytebeat
         * @returns {Expr | Error}
         */
        function try_parse(bytebeat) {
            let tokens = tokenize(bytebeat);
            if (tokens instanceof Error) {
                return tokens;
            }

            try {
                let expr = tokens.parse_expr();
                return expr;
            } catch (err) {
                if (err instanceof Error) {
                    return err;
                } else {
                    throw err;
                }
            }
        }
    }
}

export class UnaryOp {
    /** @param {UnaryOpToken} value */
    constructor(value) { this.value = value; }

    /** @returns {string} */
    toString() { return this.value; }

    /**
     * @template {number | boolean} T
     * @param {T} a
     * @returns {T}
     */
    eval(a) {
        // TODO: how to make this typecheck?
        switch (this.value) {
            // @ts-ignore
            case "+": return +a;
            // @ts-ignore
            case "-": return -a;
            // @ts-ignore
            case "~": return ~a;
            // @ts-ignore
            case "!": return !a;
        }
    }

    precedence() { return 3; }

    /** @return {"right"} */
    lexicial_associativity() { return "right"; }
}

export class BinOp {
    /** @param {BinOpToken} value */
    constructor(value) {
        this.value = value;
    }

    /** @returns {string} */
    toString() {
        return this.value;
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
        }
    }

    /** @return {"left" | "right"} */
    lexicial_associativity() { return "left"; }

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
        }
    }
}


/** @template {string | number | boolean} [T=string | number | boolean] */
export class Value {
    /** @param {T} value */
    constructor(value) {
        this.value = value;
    }

    /** @returns {GLSLType} */
    type() {
        if (typeof this.value == "string") {
            if (INTEGER_VARIABLES.includes(this.value)) {
                return "int";
            } else if (FLOAT_VARIABLES.includes(this.value)) {
                return "float";
            }
        } else if (typeof this.value == "number") {
            return Number.isInteger(this.value) ? "int" : "float";
        } else if (typeof this.value == "boolean") {
            return "boolean";
        }
        return "unknown";
    }

    /** @returns {this is Value<number>} */
    isNumber() {
        return typeof this.value == "number";
    }

    /** @returns {string} */
    toString() {
        return this.value.toString();
    }

    /** @returns {Value<T>} */
    simplify() { return this; }

    check_ub() { return null; }
}

export class UnaryOpExpr {
    /**
     * @param {Expr} value
     * @param {UnaryOp} op
     */
    constructor(value, op) {
        this.value = value;
        this.op = op;
    }

    /** @returns {string} */
    toString() {
        if (needs_parenthesis(this, this.value, "right")) {
            return `${this.op.toString()}(${this.value.toString()})`;
        } else {
            return `${this.op.toString()}${this.value.toString()}`;
        }
    }

    /**
     * @returns {Expr}
     */
    simplify() {
        let value = this.value.simplify();
        if (value instanceof Value) {
            if (value.isNumber()) {
                return new Value(this.op.eval(value.value));
            }
        }

        if (this.op.value == "+") {
            return value.simplify();
        }

        if (value instanceof UnaryOpExpr) {
            let both_minus = this.op.value == "-" && value.op.value == "-";
            let both_tilde = this.op.value == "~" && value.op.value == "~";
            let both_bang = this.op.value == "!" && value.op.value == "!";
            if (both_minus || both_tilde || both_bang) {
                return value.value.simplify();
            }
        }

        return this;
    }

    check_ub() { return null; }

    /** @returns {GLSLType} */
    type() {
        let value_type = this.value.type();
        if (is_unknown_or_error(value_type)) {
            return value_type;
        }

        switch (this.op.value) {
            case "+": return value_type == "int" || value_type == "float" ? value_type : "error";
            case "-": return value_type == "int" || value_type == "float" ? value_type : "error";
            case "~": return value_type == "int" ? value_type : "error";
            case "!": return value_type == "boolean" ? value_type : "error";
        }
    }
}

export class BinOpExpr {
    /**
     * @param {Expr} left
     * @param {BinOp} op
     * @param {Expr} right
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
    }

    /** @returns {Expr} */
    simplify() {
        let left = this.left.simplify();
        let right = this.right.simplify();

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

        // ?x - (-?a) => ?x + ?a
        if (right instanceof UnaryOpExpr) {
            if (right.op.toString() == "-" && this.op.toString() == "-") {
                return new BinOpExpr(left, new BinOp("+"), right.value);
            }
        }

        return new BinOpExpr(left, this.op, right);


        /**
         * Check if the rule-values matches the actual values
         * @param {string} rule_left
         * @param {string} rule_op
         * @param {string} rule_right
         * @param {string | number} result
         * @param {Expr} left
         * @param {string} op
         * @param {Expr} right
         * @returns {Expr | null}
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

    /**
     * Return if the BinOpExpr definitely has undefined behavior.
     * @returns {UBInfo | null}
     */
    check_ub() {
        let left = this.left.check_ub();
        if (left) {
            return left;
        }

        let right = this.right.check_ub();
        if (right) {
            return right;
        }

        let right_val = expr_extract_value(this.right);

        let divide_by_zero = this.op.value == "/" && right_val === 0;
        let overwide_shift = this.op.value == "<<" && (typeof right_val == "number" && right_val > 32);

        if (divide_by_zero) {
            return { location: this, type: "divide by zero" };
        } else if (overwide_shift) {
            return { location: this, type: "overwide left shift" };
        } else {
            return null;
        }
    }

    /** @returns {GLSLType} */
    type() {
        let left_ty = this.left.type();
        let right_ty = this.right.type();

        if (is_unknown_or_error(left_ty)) {
            return left_ty;
        } else if (is_unknown_or_error(right_ty)) {
            return right_ty;
        }

        switch (this.op.value) {
            case "+":
            case "-":
            case "*":
            case "/":
            case "%": return require(left_ty, right_ty, "int", "float")
            case "^":
            case "&":
            case "|":
            case ">>":
            case "<<": return require(left_ty, right_ty, "int");
        }

        /**
         * Require that both types equal one of the expected_types, or else return the "error" type
         * @param {GLSLType} left_type
         * @param {GLSLType[]} expected_types
         * @param {GLSLType} right_type
         */
        function require(left_type, right_type, ...expected_types) {
            for (const type of expected_types) {
                if (left_type == type && right_type == type) {
                    return type;
                }
            }
            return "error";
        }
    }
}

/**
 * <variable> ::= "t" | "sx" | "sy" | "mx" | "my" | "kx" | k"y"
 * <un_op>    ::= "+" | "-" | "~" | "!"
 * <bin_op>   ::= "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "&" | "^" | "|"
 * <value>    ::= <number> | <variable>
 * <term>     ::= "(" <expr> ")" | <value> | <un_op> <term>
 * <expr>     ::= <term> (<bin_op> <term>)*
 * The TokenStream contains a stream of Values, Ops, and strings (anything leftover, in this case
 * open and close parenthesis.) The TokenStream parens this stream into a single BinOp or Value.
 * 
 * A <term>, from the perspective of an <expr>, is a single unit.
 * 
 * @typedef {Value | BinOpExpr | UnaryOpExpr} Term
 * @typedef {Value | BinOpExpr | UnaryOpExpr} Expr
 * 
 */
export class TokenStream {
    /**
     * @param {Token[]} stream
     */
    constructor(stream) {
        this.stream = stream;
        this.index = 0;
    }

    parse_un_op() {
        const next_token = this.peek();
        if (is_un_op_token(next_token)) {
            this.consume(next_token);
            return new UnaryOp(next_token);
        } else {
            throw new Error(`Expected a BinOpToken, got ${next_token}`);
        }
    }

    parse_bin_op() {
        const next_token = this.peek();
        if (is_bin_op_token(next_token)) {
            this.consume(next_token);
            return new BinOp(next_token);
        } else {
            throw new Error(`Expected a BinOpToken, got ${next_token}`);
        }
    }

    /** 
     * Consumes tokens from the TokenStream and constructs a Term
     * @returns {Term} 
     * @throws {Error} throws if the TokenStream is malformed
     */
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
        } else if (is_un_op_token(next_token)) {
            const op = this.parse_un_op();
            const term = this.parse_term()
            return new UnaryOpExpr(term, op);
        } else {
            throw new Error(`Expected a right paren or value, got ${next_token}`);
        }
    }

    /** 
     * Consumes tokens from the TokenStream and constructs an Expr
     * @returns {Expr}
     * @throws {Error} throws if the TokenStream is malformed
     */
    parse_expr() {
        let terms = [];
        let ops = [];

        terms.push(this.parse_term());
        while (true) {
            if (!is_bin_op_token(this.peek())) {
                break;
            }
            const op = this.parse_bin_op();
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
         * Turn a stream of terms into a single Term. The terms and ops are interleaved 
         * like so:
         * terms: 0   1   2   3   4   5
         * ops  :   0   1   2   3   4
         * @param {Term[]} terms
         * @param {BinOp[]} ops
         * @return {Term} The sequence of Terms and Ops transformed a single Term containing
         * all of the Terms as children. The return value is a Value is there was only one Term in
         * the input array. Otherweise the return value is a BinOp.
         * @throws {Error} Throws if the term stream could not be parsed into a term.
         */
        function term_stream(terms, ops) {
            if (ops.length + 1 != terms.length) {
                throw new Error(`Expected terms array to containg one more element than the ops array. Got ${terms.length} terms and ${ops.length} ops`)
            }

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
                        let bound_term = new BinOpExpr(left_term, op, right_term);

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
 * @param {BinOpExpr | UnaryOpExpr} parent
 * @param {Expr} child
 * @param {"left" | "right"} which_child
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
        // If the parent is a UnaryOp, we only need parenthsis to differentiate ++x from +(+x) and -- from -(-x).
        if (parent instanceof UnaryOpExpr) {
            if (child instanceof UnaryOpExpr) {
                let plus_plus = parent.op.value == "+" && child.op.value == "+";
                let minus_minus = parent.op.value == "-" && child.op.value == "-";
                return !plus_plus && !minus_minus;
            }
            return false;
        }

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

/** @param {GLSLType} type  */
function is_unknown_or_error(type) {
    return type == "unknown" || type == "error";
}

/**
 * @param {Expr} expr
 * @returns {string | number | boolean | null}
 */
function expr_extract_value(expr) {
    let simple_expr = expr.simplify();
    if (simple_expr instanceof Value) {
        return simple_expr.value;
    } else {
        return null;
    }
}