import { TokenStream } from "./parse.js";
import { Identifier, is_literal, tokenize } from "./tokenize.js";
import { array_to_string, unwrap } from "./util.js";

/**
 * Typedef imports
 * @typedef {import("./tokenize.js").Literal} Literal
 * @typedef {import("./tokenize.js").UnaryOpToken} UnaryOpToken
 * @typedef {import("./tokenize.js").BinOpToken} BinOpToken
 * @typedef {import("./tokenize.js").TypeToken} TypeToken
 * @typedef {import("./tokenize.js").TypeContext} TypeContext
 * @typedef {import("./parse.js").Expr} Expr 
 */

/**
 * Undefined Behavior Typedefs
 * @typedef {"divide by zero" | "overwide left shift"} UBType
 * @typedef {{location: Expr, type: UBType}} UBInfo
 */

/**
 * @typedef {TypeToken | "unknown" | "error"} GLSLType
 * @typedef {"pretty" | "minimal"} PrintStyle
 */

export class Program {
    /**
     * @param {Statement[]} statements
     * @param {Expr} expr
     */
    constructor(statements, expr) {
        this.statements = statements;
        this.expr = expr;
        this.ub_info = this.expr.check_ub();
    }

    /** 
     * @param {string} bytebeat 
     * @returns {Program | Error}
     */
    static parse(bytebeat) {
        let result = try_parse(bytebeat);
        if (result instanceof Error) {
            return result;
        }

        const statements = result[0];
        const expr = result[1];

        return new Program(statements, expr);
        /**
         * Try to parse a string into an expression.
         * @param {string} bytebeat
         * @returns {[Statement[], Expr] | Error}
         */
        function try_parse(bytebeat) {
            let tokens = tokenize(bytebeat);
            if (tokens instanceof Error) {
                return tokens;
            }

            let token_stream = new TokenStream(tokens);

            let statements = [];
            while (true) {
                const statement = token_stream.parse_statement();
                if (statement instanceof Error) {
                    // console.log("Stopping stmt parse", statement)
                    break;
                } else {
                    statements.push(statement);
                }
            }

            const expr = token_stream.parse_simple_expr();
            if (expr instanceof Error) { return expr; }

            if (token_stream.peek() != null) {
                return new Error(`TokenStream not empty after parse: [${array_to_string(token_stream.stream)}] @ ${token_stream.index}\statements: ${statements.toString()}\nExpr: ${expr.toString("pretty")}`,
                    {
                        cause: {
                            stream: token_stream.stream,
                            index: token_stream.index,
                            statements,
                            expr,
                        }
                    }
                );
            }
            return [statements, expr];
        }
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        let program = "";
        let type_ctx = this.get_type_ctx();
        for (let [ident, type] of Object.entries(type_ctx)) {
            program += style == "pretty" ? `${type} ${ident};\n` : `${type} ${ident};`;
        }

        for (const statement of this.statements ?? []) {
            const statement_src = statement.toString(style);
            program += style == "pretty" ? statement_src + "\n" : statement_src;
        }
        program += this.expr?.toString(style) ?? "";

        return program;
    }

    /**
     * @returns {Program}
     */
    simplify() {
        let statements = [];
        for (const statement of this.statements) {
            statements.push(statement.simplify());
        }
        let expr = this.expr.simplify();
        return new Program(statements, expr);
    }

    /** @returns {TypeContext} */
    get_type_ctx() {
        /** @type {TypeContext} */
        let type_ctx = {};
        for (const statement of this.statements) {
            for (const stmt_expr of statement.exprs) {
                if (stmt_expr instanceof Value && stmt_expr.value instanceof Identifier) {
                    const ident = stmt_expr.value.identifier;
                    if (!(ident in type_ctx)) {
                        type_ctx[ident] = statement.explicit_type ? statement.explicit_type : "int";
                    }
                } else if (stmt_expr instanceof BinOpExpr && stmt_expr.as_assignment()) {
                    const { ident, expr } = unwrap(stmt_expr.as_assignment());
                    if (!(ident in type_ctx)) {
                        type_ctx[ident] = statement.explicit_type ? statement.explicit_type : expr.type(type_ctx);
                    }
                }
            }
        }
        return type_ctx;
    }
}

export class UnaryOp {
    /** @param {UnaryOpToken} value */
    constructor(value) { this.value = value; }

    toString() { return this.value; }

    /**
     * @template {Literal} T
     * @param {Literal} a
     * @returns {Literal}
     */
    eval(a) {
        if (typeof a == "number") {
            switch (this.value) {
                case "+": return +a;
                case "-": return -a;
                case "~": return ~a;
                case "!": throw new Error(`Type mismatch: cannot eval ${this.value}${a}`);
            }
        } else {
            switch (this.value) {
                case "+":
                case "-":
                case "~": throw new Error(`Type mismatch: cannot eval ${this.value}${a}`);
                case "!": return !a;
            }
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
     * @param {Literal} a
     * @param {Literal} b
     * @returns {Literal}
     */
    eval(a, b) {
        if (typeof a == "number" && typeof b == "number") {
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

        if (typeof a == "boolean" && typeof b == "boolean") {
            switch (this.value) {
                case "&&": return a && b;
                case "||": return a || b;
                case "^^": return a != b;
            }
        }

        switch (this.value) {
            case ">": return a > b;
            case "<": return a < b;
            case ">=": return a >= b;
            case "<=": return a <= b;
            case "==": return a == b;
            case "!=": return a != b;
        }

        throw new Error(`Type mismatch: cannot eval ${a} ${this.value} ${b}`);
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
            case ">":
            case "<":
            case ">=":
            case "<=": return 7;
            case "==":
            case "!=": return 8;
            case "&": return 9;
            case "^": return 10;
            case "|": return 11;
            case "&&": return 12;
            case "^^": return 13;
            case "||": return 14;
            case "=": return 16;
            case ",": return 17;
        }
    }

    /**
     * @param {number} precedence
     */
    static precedence_to_associativity(precedence) {
        return precedence == 16 ? "right" : "left";
    }

    /** @return {"left" | "right"} */
    lexicial_associativity() {
        return "left";
    }
    is_mathematically_associative() {
        return ["+", "*", "&", "^", "|", "&&", "||", "^^", "=="].includes(this.value);
    }
}


/** @template {Identifier | Literal} [T=Identifier | Literal] */
export class Value {
    /** @param {T | string} value */
    constructor(value) {
        /** @type {T} */
        this.value;
        if (typeof value == "string") {
            // @ts-ignore
            this.value = new Identifier(value);
        } else {
            this.value = value;
        }
    }

    /**
     * @param {TypeContext} type_ctx
     * @returns {GLSLType}
     * */
    type(type_ctx) {
        if (this.value instanceof Identifier) {
            return this.value.type(type_ctx);
        } else if (typeof this.value == "number") {
            return Number.isInteger(this.value) ? "int" : "float";
        } else if (typeof this.value == "boolean") {
            return "bool";
        }
        return "unknown";
    }

    /** @returns {this is Value<Literal>} */
    isLiteral() {
        return is_literal(this.value);
    }

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

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        if (needs_parenthesis(this, this.value, "right")) {
            return `${this.op.toString()}(${this.value.toString(style)})`;
        } else {
            return `${this.op.toString()}${this.value.toString(style)}`;
        }
    }

    /**
     * @returns {Expr}
     */
    simplify() {
        let value = this.value.simplify();
        if (value instanceof Value) {
            if (value.isLiteral()) {
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

    /**
     * @param {TypeContext} type_ctx
     * @returns {GLSLType}
     * */
    type(type_ctx) {
        let value_type = this.value.type(type_ctx);
        if (is_unknown_or_error(value_type)) {
            return value_type;
        }

        switch (this.op.value) {
            case "+": return value_type == "int" || value_type == "float" ? value_type : "error";
            case "-": return value_type == "int" || value_type == "float" ? value_type : "error";
            case "~": return value_type == "int" ? value_type : "error";
            case "!": return value_type == "bool" ? value_type : "error";
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

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        let left = `${this.left.toString(style)}`;
        if (needs_parenthesis(this, this.left, "left")) {
            left = `(${left})`;
        }

        let right = `${this.right.toString(style)}`;
        if (needs_parenthesis(this, this.right, "right")) {
            right = `(${right})`;
        }

        if (style == "pretty") {
            return `${left} ${this.op.toString()} ${right}`;
        } else {
            return `${left}${this.op.toString()}${right}`;
        }
    }

    /** @returns {Expr} */
    simplify() {
        let left = this.left.simplify();
        let right = this.right.simplify();

        if (left instanceof Value && right instanceof Value) {
            if (left.isLiteral() && right.isLiteral()) {
                return new Value(this.op.eval(left.value, right.value));
            }
        }

        /** @type {[string | number, string, string | number, string | number, string?][]} */
        let rules = [
            // Constant Identities
            ["?a", "+", 0, "?a", "commutative"],
            ["?a", "-", 0, "?a"],
            ["?a", "*", 0, 0, "commutative"],
            ["?a", "*", 1, "?a", "commutative"],
            ["?a", "/", 1, "?a"],
            [0, "/", "?a", 0],
            // Modulo Identities
            ["?a", "%", -1, 0],
            ["?a", "%", 0, 0],
            ["?a", "%", 1, 0],
            // Reflexive Identities
            ["?a", "-", "?a", 0],
            ["?a", "/", "?a", 1],
            ["?a", "^", "?a", 0],
            ["?a", "%", "?a", 0],
            ["?a", "&", "?a", "?a"],
            ["?a", "|", "?a", "?a"],
            // Bitwise w Zero
            ["?a", "&", 0, 0, "commutative"],
            ["?a", "|", 0, "?a", "commutative"],
            ["?a", "^", 0, "?a", "commutative"],
            // Bitshift w Zero
            ["?a", ">>", 0, "?a"],
            ["?a", "<<", 0, "?a"],
            [0, ">>", "?a", 0],
            [0, "<<", "?a", 0],
        ];
        for (let [r_left, rule_op, r_right, rule_result, commutative] of rules) {
            /** @type {"?a" | Expr} */
            const rule_left = r_left == "?a" ? "?a" : new Value(r_left);
            /** @type {"?a" | Expr} */
            const rule_right = r_right == "?a" ? "?a" : new Value(r_right);
            /** @type {"?a" | Expr} */
            const result = rule_result == "?a" ? "?a" : new Value(rule_result);

            const is_commutative = commutative === "commutative";

            let applied = try_apply_rule(rule_left, rule_op, rule_right, result, left, this.op.toString(), right);
            if (is_commutative && applied == null) {
                applied = try_apply_rule(rule_left, rule_op, rule_right, result, right, this.op.toString(), left);
            }

            if (applied) {
                return applied;
            }
        }

        if (this.op.toString() == "-") {
            // ?x - (-?a) => ?x + ?a
            if (right instanceof UnaryOpExpr && right.op.toString() == "-") {
                return new BinOpExpr(left, new BinOp("+"), right.value);
            } else if (right instanceof Value && typeof right.value == "number" && right.value < 0) {
                return new BinOpExpr(left, new BinOp("+"), new Value(-right.value));
            }

        }

        return new BinOpExpr(left, this.op, right);


        /**
         * Check if the rule-values matches the actual values
         * @param {"?a" | Expr} rule_left
         * @param {string} rule_op
         * @param {"?a" | Expr} rule_right
         * @param {"?a" | Expr} result
         * @param {Expr} left
         * @param {string} op
         * @param {Expr} right
         * @returns {Expr | null}
         */
        function try_apply_rule(rule_left, rule_op, rule_right, result, left, op, right) {
            const op_matches = rule_op == op;

            const wild_left = rule_left === "?a";
            const wild_right = rule_right === "?a";

            let values_match = false;
            if (wild_left && wild_right) {
                values_match = expr_eq(left, right);
            } else {
                values_match = (wild_left || expr_eq(rule_left, left)) && (wild_right || expr_eq(rule_right, right));
            }

            if (op_matches && values_match) {
                if (result == "?a") {
                    if (rule_left == "?a") {
                        return left;
                    } else if (rule_right == "?a") {
                        return right;
                    } else {
                        throw new Error("Malformed simplification rule.");
                    }
                } else {
                    return result;
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

    /**
     * @param {TypeContext} type_ctx
     * @returns {GLSLType}
     * */
    type(type_ctx) {
        let left_ty = this.left.type(type_ctx);
        let right_ty = this.right.type(type_ctx);

        switch (this.op.value) {
            case "+":
            case "-":
            case "*":
            case "/":
            case "%": return require(left_ty, right_ty, ["int", "float"], "same");
            case "^":
            case "&":
            case "|":
            case ">>":
            case "<<": return require(left_ty, right_ty, ["int"], "same");
            case ">":
            case "<":
            case ">=":
            case "<=": return require(left_ty, right_ty, ["int", "float"], "bool");
            case "==":
            case "!=": return require(left_ty, right_ty, ["int", "float", "bool"], "bool");
            case "&&":
            case "||":
            case "^^": return require(left_ty, right_ty, ["bool"], "bool");
            case "=": { console.log(this); return right_ty; }
            case ",": return "error";
        }

        /**
         * Require that both types equal one of the expected_types, or else return the "error" type
         * @param {GLSLType} left_type
         * @param {GLSLType[]} expected_types
         * @param {GLSLType} right_type
         * @param {GLSLType | "same"} return_type
         */
        function require(left_type, right_type, expected_types, return_type) {
            for (const type of expected_types) {
                if (left_type == type && right_type == type) {
                    return return_type == "same" ? type : return_type;
                }
            }
            return "error";
        }

    }
    /**
     * @returns {{ ident: string, expr: Expr } | null} 
     */
    as_assignment() {
        if (this.op.value == "=") {
            if (this.left instanceof Value && this.left.value instanceof Identifier) {
                const ident = this.left.value.identifier;
                const expr = this.right;
                return { ident, expr };
            } else {
                throw new Error(`Assignment Expr without left-side equal to ident ${this.toString("pretty")}`);
            }
        } else {
            return null;
        }
    }
}

class TernaryOp {
    constructor() { }
    precedence() { return 15; }
}

export class TernaryOpExpr {
    /**
     * @param {Expr} cond_expr
     * @param {Expr} true_expr
     * @param {Expr} false_expr
     */
    constructor(cond_expr, true_expr, false_expr) {
        this.cond_expr = cond_expr;
        this.true_expr = true_expr;
        this.false_expr = false_expr;
        this.op = new TernaryOp();
    }

    /**
     * @param {PrintStyle} style
     * @returns {String}
     */
    toString(style) {
        const cond_src = this.cond_expr.toString(style);
        const true_src = this.true_expr.toString(style);
        const false_src = this.false_expr.toString(style);
        if (style == "pretty") {
            return `${cond_src} ? ${true_src} : ${false_src}`;
        } else {
            return `${cond_src}?${true_src}:${false_src}`;
        }
    }

    /**
    * @param {TypeContext} type_ctx
    * @returns {GLSLType}
    * */
    type(type_ctx) {
        let cond_ty = this.cond_expr.type(type_ctx);
        let true_ty = this.true_expr.type(type_ctx);
        let false_ty = this.false_expr.type(type_ctx);
        if (cond_ty != "bool") { return cond_ty; }
        else if (is_unknown_or_error(true_ty)) {
            return true_ty;
        } else if (is_unknown_or_error(false_ty)) {
            return false_ty;
        } else if (true_ty != false_ty) {
            return "error";
        } else {
            return true_ty;
        }
    }

    /**
     * 
     * @returns {Expr}
     */
    simplify() {
        let cond = this.cond_expr.simplify();
        if (cond instanceof Value && cond.value === true) {
            return this.true_expr.simplify();
        } else if (cond instanceof Value && cond.value === false) {
            return this.false_expr.simplify()
        } else {
            return new TernaryOpExpr(cond, this.true_expr.simplify(), this.false_expr.simplify());
        }
    }
    /**
     * @returns {UBInfo | null}
     */
    check_ub() {
        return null;
    }
}

export class Statement {
    /**
     * @param {GLSLType | null} type
     * @param {Expr[]} exprs
     */
    constructor(type, exprs) {
        this.explicit_type = type;
        this.exprs = exprs;
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        let src = "";
        for (let i = 0; i < this.exprs.length; i++) {
            const assign_or_ident = this.exprs[i];
            src += assign_or_ident.toString(style);
            if (i != this.exprs.length - 1) {
                src += style == "pretty" ? ", " : ",";
            }
        }

        return `${src};`;
    }

    simplify() {
        const assign_or_ident = this.exprs.map((x) => x.simplify());
        return new Statement(this.explicit_type, assign_or_ident);
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

    if (child instanceof TernaryOpExpr) {
        return true;
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
 * @param {Expr} left 
 * @param {Expr} right 
 * @returns {boolean}
 */
function expr_eq(left, right) {
    if (left instanceof Value && right instanceof Value) {
        return left.value === right.value;
    } else if (left instanceof UnaryOpExpr && right instanceof UnaryOpExpr) {
        return left.op === right.op && expr_eq(left.value, right.value);
    } else if (left instanceof BinOpExpr && right instanceof BinOpExpr) {
        return left.op === right.op && expr_eq(left.left, right.left) && expr_eq(left.right, right.right);
    } else {
        return false;
    }
}

/**
 * @param {Expr} expr
 * @returns {Identifier | Literal | null}
 */
function expr_extract_value(expr) {
    let simple_expr = expr.simplify();
    if (simple_expr instanceof Value) {
        return simple_expr.value;
    } else {
        return null;
    }
}
