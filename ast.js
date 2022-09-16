import { RULES, TokenStream } from "./parse.js";
import { Identifier, is_literal, tokenize } from "./tokenize.js";
import { array_to_string, unwrap } from "./util.js";

/**
 * Typedef imports
 * @typedef {import("./tokenize.js").Literal} Literal
 * @typedef {import("./tokenize.js").UnaryOpToken} UnaryOpToken
 * @typedef {import("./tokenize.js").BinOpToken} BinOpToken
 * @typedef {import("./tokenize.js").TypeToken} TypeToken
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

export class TypeResult {
    /**
     * @param {GLSLType} type 
     * @param {Error[]} errors 
     */
    constructor(type, errors) {
        this.type = type;
        this.errors = errors;
    }

    is_err() {
        return this.type == "unknown" || this.type == "error";
    }

    /**
     * Expect this type to equal the passed type. Otherwise, return
     * @param {GLSLType | GLSLType[]} type
     * @param {string} error
     * @returns {TypeResult}
     */
    expect(type, error) {
        if (type instanceof Array && type.includes(this.type)) {
            return this;
        } else if (typeof type == "string" && type === this.type) {
            return this;
        }

        return TypeResult.err(error);
    }

    /**
     * @returns {string}
     */
    toString() {
        return this.type;
    }

    /**
     * Convience function for returning an okay TypeResult
     * @param {GLSLType} type
     */
    static ok(type) {
        return new TypeResult(type, []);
    }

    /**
     * Convience function for returning an unknown TypeResult
     * @param {string} error
     */
    static unknown(error) {
        return new TypeResult("unknown", [new Error(error)]);
    }

    /**
     * Convience function for returning an error TypeResult
     * @param {string} error
     */
    static err(error) {
        return new TypeResult("error", [new Error(error)]);
    }
}

export class TypeContext {
    constructor() {
        /** @type {{[ident: string]: {type: GLSLType, explicitly_declared: boolean}}} */
        this.types = {};
        /** @type {GLSLType} */
        this.default_type = "int";
        this.explicitly_typed = false;
    }

    /**
     * Attempts to add the given identifier/type pair to the TypeContext. If the identifier was 
     * already added to the TypeContext, nothing is added.
     * @param {Identifier} identifier
     * @param {GLSLType} type
     * @returns {TypeResult | null} returns null if the identifier was added to the TypeContext (so the
    identifier was not already in the TypeContext). Otherwise, returns the identifier's existing 
    type. If this is non-null, then the TypeContext was not updated.
     */
    add_type(identifier, type) {
        const ident = identifier.identifier;
        if (this.types[ident]) { return TypeResult.ok(this.types[ident].type); }
        this.types[ident] = { type, explicitly_declared: this.explicitly_typed };
        return null;
    }

    /**
     * @param {Identifier} lookup_ident 
     * @returns {TypeResult}
     */
    lookup(lookup_ident) {
        for (const [ident, type] of Object.entries(this.types)) {
            if (ident == lookup_ident.identifier) {
                return TypeResult.ok(type.type);
            }
        }
        return TypeResult.unknown(`Cant find ${lookup_ident.identifier} in type_ctx`);
    }

    /**
     * @param {boolean} value
     */
    set_explicitly_typed(value) {
        this.explicitly_typed = value;
    }

    /**
     * @param {GLSLType} type 
     */
    set_default_type(type) {
        this.default_type = type;
    }

    /**
     * @returns {GLSLType}
     */
    get_default_type() {
        return this.default_type;
    }
}

export class Program {
    /**
     * @param {Statement[]} statements
     * @param {Expr} expr
     */
    constructor(statements, expr) {
        this.statements = statements;
        this.expr = expr;

        // Perform type checking
        this.type_ctx = new TypeContext();
        this.type_errors = [];
        for (const statement of this.statements) {
            const stmt_type = statement.type(this.type_ctx);
            if (stmt_type.is_err()) {
                this.type_errors.push(stmt_type);
            }
        }
        const expr_type = this.expr.type(this.type_ctx);
        if (expr_type.is_err()) {
            this.type_errors.push(expr_type);
        }

        try {
            // check_ub can throw an exception if the program successfully parses but is
            // semenantically invalid (ex: "false + 1"). This is because check_ub can call
            // simplify, which can call eval, which throws on illegal input.
            this.ub_info = this.expr.check_ub();
        } catch (e) {
            this.ub_info = null;
        }
    }

    /** 
     * @param {string} bytebeat 
     * @returns {Program | Error}
     */
    static parse(bytebeat) {
        let tokens = tokenize(bytebeat);
        if (tokens instanceof Error) {
            return tokens;
        }

        let token_stream = new TokenStream(tokens);

        const result = RULES.program.parse(token_stream);

        if (token_stream.peek() != null) {
            return new Error(`TokenStream not empty after parse: [${array_to_string(token_stream.stream)}] @ ${token_stream.index}`,
                {
                    cause: {
                        stream: token_stream.stream,
                        index: token_stream.index,
                        result,
                    }
                }
            );
        } else if (!(result instanceof Program)) {
            return new Error(`Expected parsed result to be a Program, got ${result?.constructor.name}`,
                {
                    cause: {
                        stream: token_stream.stream,
                        index: token_stream.index,
                        result,
                    }
                }
            );
        }
        return result;
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        let program = "";
        for (const [ident, { type, explicitly_declared }] of Object.entries(this.type_ctx.types)) {
            if (!explicitly_declared) {
                program += style == "pretty" ? `${type} ${ident};\n` : `${type} ${ident};`;
            }
        }

        for (const statement of this.statements ?? []) {
            const statement_src = statement.toString(style);
            program += style == "pretty" ? statement_src + "\n" : statement_src;
        }

        let expr_src = this.expr?.toString(style) ?? "";
        if (this.expr instanceof ExprList) {
            expr_src = `(${expr_src})`;
        }
        program += expr_src;

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


export class Expr {
    /**
     * @param {TypeContext} type_ctx
     * @returns {TypeResult}
     * */
    type(type_ctx) {
        throw new Error("Not implemented");
    }

    /**
     * Return if the BinOpExpr definitely has undefined behavior.
     * @returns {UBInfo | null}
     */
    check_ub() {
        throw new Error("Not implemented");
    }

    /**
     * @returns {Expr}
     */
    simplify() {
        throw new Error();
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        throw new Error("Not implemented");
    }
}

export class OpExpr extends Expr {
    /** @returns {number} */
    op_precedence() { throw new Error("Not implemented"); }
    /** @returns {string} */
    op_value() { throw new Error("Not implemented"); }
}

/** @template {Identifier | Literal} [T=Identifier | Literal] */
export class Value extends Expr {
    /** @param {T | string} value */
    constructor(value) {
        super();
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
     * @returns {TypeResult}
     * */
    type(type_ctx) {
        if (this.value instanceof Identifier) {
            return this.value.type(type_ctx);
        } else if (typeof this.value == "number") {
            const type = Number.isInteger(this.value) ? "int" : "float";
            return TypeResult.ok(type);
        } else if (typeof this.value == "boolean") {
            return TypeResult.ok("bool");
        }
        throw new Error(`expected value to be an int, float, bool, or identifier. Got ${this.value}`);
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

    /**
     * @param {Value} a
     * @param {Value} b
     */
    static eq(a, b) {
        if (a.value instanceof Identifier && b.value instanceof Identifier) {
            return a.value.identifier == b.value.identifier;
        } else {
            return a.value == b.value;
        }
    }
}

export class UnaryOpExpr extends OpExpr {
    /**
     * @param {Expr} value
     * @param {UnaryOp} op
     */
    constructor(value, op) {
        super();
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
     * @returns {TypeResult}
     * */
    type(type_ctx) {
        let value_type = this.value.type(type_ctx);
        if (value_type.is_err()) { return value_type; }

        /** @type {GLSLType | GLSLType[]} */
        let expected;
        switch (this.op.value) {
            case "+": expected = ["int", "float"]; break;
            case "-": expected = ["int", "float"]; break;
            case "~": expected = ["int"]; break;
            case "!": expected = ["bool"]; break;
        }
        return value_type
            .expect(expected, `Cannot apply unary operator ${this.op.toString()} to expression of type ${value_type}`);
    }

    op_precedence() { return this.op.precedence(); }
    op_value() { return this.op.value; }
}

export class BinOpExpr extends OpExpr {
    /**
     * @param {Expr} left
     * @param {BinOp} op
     * @param {Expr} right
     */
    constructor(left, op, right) {
        super();
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
     * @returns {TypeResult}
     * */
    type(type_ctx) {
        if (this.op.value == "=") {
            const { ident, expr } = unwrap(this.as_assignment());
            const expr_type = expr.type(type_ctx);
            const expected_type = type_ctx.add_type(ident, expr_type.type) ?? expr_type;
            return expected_type.expect(expr_type.type, `Expression type ${expr_type} does not match expected type ${expected_type}`);
        }

        let left_ty = this.left.type(type_ctx);
        let right_ty = this.right.type(type_ctx);

        switch (this.op.value) {
            case "+":
            case "-":
            case "*":
            case "/":
            case "%": return match_ty(left_ty, right_ty, ["int", "float"], "same");
            case "^":
            case "&":
            case "|":
            case ">>":
            case "<<": return match_ty(left_ty, right_ty, ["int"], "same");
            case ">":
            case "<":
            case ">=":
            case "<=": return match_ty(left_ty, right_ty, ["int", "float"], "bool");
            case "==":
            case "!=": return match_ty(left_ty, right_ty, ["int", "float", "bool"], "bool");
            case "&&":
            case "||":
            case "^^": return match_ty(left_ty, right_ty, ["bool"], "bool");
            case ",": return TypeResult.err(`Cannot assign type to binary operator ","`);
        }

        /**
         * Require that both types equal one of the expected_types, or else return the "error" type
         * @param {TypeResult} left_ty
         * @param {TypeResult} right_ty
         * @param {GLSLType[]} expected_types
         * @param {GLSLType | "same"} return_type
         */
        function match_ty(left_ty, right_ty, expected_types, return_type) {
            for (const type of expected_types) {
                if (left_ty.type == type && right_ty.type == type) {
                    return TypeResult.ok(return_type == "same" ? type : return_type);
                }
            }
            return TypeResult.err(`Expected ${expected_types}, got ${left_ty} and ${right_ty}`);
        }

    }
    /**
     * @returns {{ ident: Identifier, expr: Expr } | null} 
     */
    as_assignment() {
        if (this.op.value == "=") {
            if (this.left instanceof Value && this.left.value instanceof Identifier) {
                const ident = this.left.value;
                const expr = this.right;
                return { ident, expr };
            } else {
                throw new Error(`Assignment Expr without left - side equal to ident ${this.toString("pretty")} `);
            }
        } else {
            return null;
        }
    }

    op_precedence() { return this.op.precedence(); }
    op_value() { return this.op.value; }
}

export class TernaryOpExpr extends OpExpr {
    /**
     * @param {Expr} cond_expr
     * @param {Expr} true_expr
     * @param {Expr} false_expr
     */
    constructor(cond_expr, true_expr, false_expr) {
        super();
        this.cond_expr = cond_expr;
        this.true_expr = true_expr;
        this.false_expr = false_expr;
    }

    /**
     * @param {PrintStyle} style
     * @returns {String}
     */
    toString(style) {
        let cond_src = this.cond_expr.toString(style);
        const true_src = this.true_expr.toString(style);
        const false_src = this.false_expr.toString(style);

        if (this.cond_expr instanceof OpExpr && this.cond_expr.op_precedence() >= this.op_precedence()) {
            cond_src = `(${cond_src})`;
        }

        if (style == "pretty") {
            return `${cond_src} ? ${true_src} : ${false_src} `;
        } else {
            return `${cond_src}?${true_src}:${false_src} `;
        }
    }

    /**
    * @param {TypeContext} type_ctx
    * @returns {TypeResult}
    * */
    type(type_ctx) {
        let cond_ty = this.cond_expr.type(type_ctx)
        cond_ty = cond_ty.expect("bool", `Expected conditional type to be bool, got ${cond_ty}`);
        let true_ty = this.true_expr.type(type_ctx);
        let false_ty = this.false_expr.type(type_ctx);

        if (true_ty.is_err()) {
            return true_ty;
        } else if (false_ty.is_err()) {
            return false_ty;
        } else {
            return true_ty.expect(false_ty.type, `Expected true and false arms of Ternary op to match. Got: ${true_ty}, ${false_ty}`);
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

    op_precedence() { return 15; }
    op_value() { return "[ternary]"; }
}

export class ExprList extends OpExpr {
    /**
     * @param {Expr[]} exprs
     */
    constructor(exprs) {
        super();
        this.exprs = exprs;
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        let src = "";
        for (let i = 0; i < this.exprs.length; i++) {
            const expr = this.exprs[i];
            src += expr.toString(style);
            if (i != this.exprs.length - 1) {
                src += style == "pretty" ? ", " : ",";
            }
        }

        return src;
    }

    /**
     * @returns {ExprList}
     */
    simplify() {
        const exprs = this.exprs.map((x) => x.simplify());
        return new ExprList(exprs);
    }

    /**
     * @param {TypeContext} type_ctx 
     * @returns {TypeResult}
     */
    type(type_ctx) {
        for (let i = 0; i < this.exprs.length; i++) {
            const stmt_expr = this.exprs[i];
            let type;
            if (stmt_expr instanceof Value && stmt_expr.value instanceof Identifier) {
                const ident = stmt_expr.value;
                type_ctx.add_type(ident, type_ctx.get_default_type())
                type = TypeResult.ok(type_ctx.get_default_type());
            } else {
                type = stmt_expr.type(type_ctx);
            }

            if (i == this.exprs.length - 1) {
                return type;
            }
        }
        return TypeResult.err("Cannot type ExprList of length 0");
    }

    /**
     * @returns {UBInfo | null}
     */
    check_ub() {
        for (const expr of this.exprs) {
            const ub_info = expr.check_ub();
            if (ub_info) { return ub_info; }
        }
        return null;
    }

    op_precedence() { return 17; }
    op_value() { return "[comma]"; }
}

export class FunctionCall extends Expr {
    /**
     * @param {Identifier} identifier
     * @param {ExprList} args
     */
    constructor(identifier, args) {
        super();
        this.identifier = identifier;
        this.args = args;
    }

    /**
     * @param {TypeContext} type_ctx
     * @returns {TypeResult}
     */
    type(type_ctx) {
        this.args.type(type_ctx);
        switch (this.identifier.identifier) {
            case "int": return TypeResult.ok("int");
            case "float": return TypeResult.ok("float");
            case "bool": return TypeResult.ok("bool");
        }
        return TypeResult.ok("unknown");
    }

    /**
     * @param {string | Identifier} ident 
     * @param {Expr | Expr[]} expr 
     */
    static wrap(ident, expr) {
        const identifier = ident instanceof Identifier ? ident : new Identifier(ident);
        const args = expr instanceof Array ? new ExprList(expr) : new ExprList([expr]);
        return new FunctionCall(identifier, args);
    }

    /**
     * Return if the BinOpExpr definitely has undefined behavior.
     * @returns {UBInfo | null}
     */
    check_ub() {
        return this.args.check_ub();
    }

    /**
     * @returns {Expr}
     */
    simplify() {
        const eval_result = this.try_eval();
        if (eval_result) {
            return eval_result;
        }
        return new FunctionCall(this.identifier, this.args.simplify())
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        return `${this.identifier.toString()} (${this.args.toString(style)})`;
    }

    /**
     * @returns {Value | null}
     */
    try_eval() {
        const value = extract_one(this.args.exprs);
        if (value instanceof Value) {
            let int_value;
            let float_value;
            let bool_value;
            if (typeof value.value == "number") {
                int_value = Math.trunc(value.value);
                float_value = value.value;
                bool_value = value.value != 0;
            } else if (typeof value.value == "boolean") {
                int_value = value.value ? 1 : 0;
                float_value = value.value ? 1.0 : 0.0;
                bool_value = value.value;
            } else {
                throw new Error(`Unknown typeof ${typeof value.value} `);
            }

            switch (this.identifier.identifier) {
                case "int": return new Value(int_value);
                case "float": return new Value(float_value);
                case "bool": return new Value(bool_value);
            }
        }

        return null;

        /**
         * @param {Expr[]} values 
         */
        function extract_one(values) {
            return values.length == 1 ? values[0] : null;
        }
    }
}

export class Statement {
    /**
     * @param {GLSLType | null} type
     * @param {Expr} expr
     */
    constructor(type, expr) {
        this.explicit_type = type;
        this.expr = expr;
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        return this.explicit_type ? `${this.explicit_type} ${this.expr.toString(style)};` : `${this.expr.toString(style)};`;
    }

    simplify() {
        return new Statement(this.explicit_type, this.expr.simplify());
    }

    /**
     * @param {TypeContext} type_ctx
     * @returns {TypeResult}
     */
    type(type_ctx) {
        const old_default = type_ctx.get_default_type();

        if (this.explicit_type) {
            type_ctx.set_default_type(this.explicit_type);
        }

        const expr_ty = this.expr.type(type_ctx);

        type_ctx.set_default_type(old_default);
        return expr_ty;
    }
}

/**
 * @param {BinOpExpr | UnaryOpExpr} parent
 * @param {Expr} child
 * @param {"left" | "right"} which_child
 */
function needs_parenthesis(parent, child, which_child) {
    // If the child is not an OpExpr, then it's a single "atom" and never needs parenthesis
    // Currently this implies that child is a Value or a FunctionCall, which never needs parenthesis.
    if (!(child instanceof OpExpr)) {
        return false;
    }

    // If the child binds more loosely than the parent, but we need the child to bind
    // stronger, use parens
    if (parent.op_precedence() < child.op_precedence()) {
        return true;
    } else if (parent.op_precedence() == child.op_precedence()) {
        // If the parent is a UnaryOp, we only need parenthsis to differentiate ++x from +(+x) and -- from -(-x).
        if (parent instanceof UnaryOpExpr) {
            if (child instanceof UnaryOpExpr) {
                let plus_plus = parent.op_value() == "+" && child.op_value() == "+";
                let minus_minus = parent.op_value() == "-" && child.op_value() == "-";
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
        return !(parent.op.is_mathematically_associative() && parent.op_value() == child.op_value());
    } else {
        return false;
    }
}

/**
 * @param {Expr} left 
 * @param {Expr} right 
 * @returns {boolean}
 */
function expr_eq(left, right) {
    if (left instanceof Value && right instanceof Value) {
        return Value.eq(left, right);
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
