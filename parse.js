import { FLOAT_VARIABLES, Identifier, INTEGER_VARIABLES, is_bin_op_token, is_literal, is_type_token, is_un_op_token, tokenize } from "./tokenize.js";
import { array_to_string } from "./util.js";

/**
 * Typedef imports
 * @typedef {import("./tokenize.js").Literal} Literal
 * @typedef {import("./tokenize.js").UnaryOpToken} UnaryOpToken
 * @typedef {import("./tokenize.js").BinOpToken} BinOpToken
 * @typedef {import("./tokenize.js").TypeToken} TypeToken
 * @typedef {import("./tokenize.js").Token} Token
 * @typedef {import("./tokenize.js").TypeContext} TypeContext
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


const MAX_PRECEDENCE = 17;


export class Program {
    /**
     * @param {Declaration[]} declarations
     * @param {Expr} expr
     */
    constructor(declarations, expr) {
        this.declarations = declarations;
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

        const declaration = result[0];
        const expr = result[1];

        return new Program(declaration, expr);
        /**
         * Try to parse a string into an expression.
         * @param {string} bytebeat
         * @returns {[Declaration[], Expr] | Error}
         */
        function try_parse(bytebeat) {
            let tokens = tokenize(bytebeat);
            if (tokens instanceof Error) {
                return tokens;
            }

            let token_stream = new TokenStream(tokens);

            let declarations = [];
            while (true) {
                const declaration = token_stream.parse_declaration();
                if (declaration instanceof Error) {
                    console.log("Stopping decl parse", declaration)
                    break;
                } else {
                    declarations.push(declaration);
                }
            }

            const expr = token_stream.parse_expr();
            if (expr instanceof Error) { return expr; }

            if (token_stream.peek() != null) {
                return new Error(`TokenStream not empty after parse: [${array_to_string(token_stream.stream)}] @ ${token_stream.index}\ndeclaration: ${declarations.toString()}\nExpr: ${expr.toString("pretty")}`,
                    {
                        cause: {
                            stream: token_stream.stream,
                            index: token_stream.index,
                            declarations,
                            expr,
                        }
                    }
                );
            }
            return [declarations, expr];
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
            if (ident == "unknown" || ident == "error") {
                ident = "int";
            }
            program += style == "pretty" ? `${type} ${ident};\n` : `${type} ${ident};`;
        }

        for (const declaration of this.declarations ?? []) {
            const declaration_src = declaration.toString(style);
            program += style == "pretty" ? declaration_src + "\n" : declaration_src;
        }
        program += this.expr?.toString(style) ?? "";

        return program;
    }

    /**
     * @returns {Program}
     */
    simplify() {
        let declarations = [];
        for (const declaration of this.declarations) {
            declarations.push(declaration.simplify());
        }
        let expr = this.expr.simplify();
        return new Program(declarations, expr);
    }

    /** @returns {TypeContext} */
    get_type_ctx() {
        /** @type {TypeContext} */
        let type_ctx = {};
        for (const declaration of this.declarations) {
            for (const assign_or_ident of declaration.assign_or_idents) {
                if (assign_or_ident instanceof Identifier) {
                    const ident = assign_or_ident.identifier;
                    if (!(ident in type_ctx)) {
                        type_ctx[ident] = declaration.explicit_type ? declaration.explicit_type : "int";
                    }
                } else {
                    const ident = assign_or_ident.ident.identifier;
                    if (!(ident in type_ctx)) {
                        type_ctx[ident] = declaration.explicit_type ? declaration.explicit_type : assign_or_ident.expr_type(type_ctx);
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
}

class TernaryOp {
    constructor() { }
    precedence() { return 15; }
}

class TernaryOpExpr {
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

class Assignment {
    /**
     * @param {Identifier} ident
     * @param {Expr} expr
     */
    constructor(ident, expr) {
        this.ident = ident;
        this.expr = expr;
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        const ident = this.ident.toString();
        const expr = this.expr.toString(style);
        return style == "pretty" ? `${ident} = ${expr}` : `${ident}=${expr}`;
    }

    simplify() {
        const expr = this.expr.simplify();
        return new Assignment(this.ident, this.expr);
    }

    /**
     * @param {TypeContext} type_ctx
     * @returns {GLSLType}
     * */
    expr_type(type_ctx) {
        return this.expr.type(type_ctx);
    }
}

class Declaration {
    /**
     * @param {GLSLType | null} type
     * @param {(Assignment | Identifier)[]} assign_or_idents
     */
    constructor(type, assign_or_idents) {
        this.explicit_type = type;
        this.assign_or_idents = assign_or_idents;
    }

    /**
     * @param {PrintStyle} style
     * @returns {string}
     */
    toString(style) {
        let src = "";
        for (let i = 0; i < this.assign_or_idents.length; i++) {
            const assign_or_ident = this.assign_or_idents[i];
            src += assign_or_ident.toString(style);
            if (i != this.assign_or_idents.length - 1) {
                src += style == "pretty" ? ", " : ",";
            }
        }

        return `${src};`;
    }

    simplify() {
        const assign_or_ident = this.assign_or_idents.map((x) => x.simplify());
        return new Declaration(this.explicit_type, assign_or_ident);
    }
}

/**
 * <type>     ::= "int" | "float" | "bool"
 * <un_op>    ::= "+" | "-" | "~" | "!"
 * <bin_op>   ::= "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "&" | "^" | "|"
 * <literal>  ::= <number> | "true" | "false"
 * <value>    ::= <literal> | <identifier>
 * <term>     ::= "(" <expr> ")" | <value> | <un_op> <term>
 * <t_stream> ::= <term> (<bin_op> <term>)*
 * <expr>     ::= <t_stream> ("?" <expr> ":" <expr>)?
 * <assign>   ::= <ident> "=" <expr>
 * <a_stream> ::= <assign> ("," <assign>)*
 * <decl>     ::= <type>? (<ident> | <a_stream>) ";"
 * <program>  ::= <decl>* <expr>
 * The TokenStream contains a stream of Values, Ops, and strings (anything leftover, in this case
 * open and close parenthesis.) The TokenStream parens this stream into a single BinOp or Value.
 * 
 * A <term>, from the perspective of an <expr>, is a single unit.
 * 
 * @typedef {Value | BinOpExpr | UnaryOpExpr | TernaryOpExpr} Term
 * @typedef {Value | BinOpExpr | UnaryOpExpr | TernaryOpExpr} Expr
 * 
 */
class TokenStream {
    /**
     * @param {Token[]} stream
     */
    constructor(stream) {
        this.stream = stream;
        this.index = 0;
    }

    /** @returns {TypeToken | null} */
    try_parse_type() {
        const next_token = this.peek();
        if (is_type_token(next_token)) {
            this.consume_one();
            return next_token;
        } else {
            return null;
        }
    }

    parse_identifier() {
        const next_token = this.peek();
        if (next_token instanceof Identifier) {
            this.consume_one();
            return next_token;
        } else {
            return new Error(`Expected an identifier, got ${next_token}`, { cause: this.debug_info() });
        }
    }

    parse_value() {
        const next_token = this.peek();
        if (is_literal(next_token)) {
            this.consume_one();
            return new Value(next_token);
        } else if (next_token instanceof Identifier) {
            this.consume_one();
            return new Value(next_token);
        } else {
            return new Error(`Expected literal or identifier, got ${next_token}`, { cause: this.debug_info() });
        }

    }

    parse_un_op() {
        const next_token = this.peek();
        if (is_un_op_token(next_token)) {
            this.consume_one();
            return new UnaryOp(next_token);
        } else {
            return new Error(`Expected an UnOpToken, got ${next_token} `, { cause: this.debug_info() });
        }
    }

    parse_bin_op() {
        const next_token = this.peek();
        if (is_bin_op_token(next_token)) {
            this.consume_one();
            return new BinOp(next_token);
        } else {
            return new Error(`Expected a BinOpToken, got ${next_token}`, { cause: this.debug_info() });
        }
    }

    /** 
     * Consumes tokens from the TokenStream and constructs a Term
     * @returns {Term | Error} 
     */
    parse_term() {
        let token_stream = this.copy();

        const next_token = token_stream.peek();

        if (next_token == "(") {
            token_stream.consume_one();
            const expr = token_stream.parse_expr();
            const result = token_stream.try_consume(")");

            if (result instanceof Error) { return result; }
            this.commit(token_stream);

            return expr;
        } else if (is_un_op_token(next_token)) {
            const op = token_stream.parse_un_op();
            const term = token_stream.parse_term();

            if (op instanceof Error) { return op; }
            if (term instanceof Error) { return term; }
            this.commit(token_stream);

            return new UnaryOpExpr(term, op);
        } else {
            let value = token_stream.parse_value();

            if (value instanceof Error) { return value; }
            this.commit(token_stream);

            return value;
        }
    }


    /**
     * Parses <term> (<bin_op> <term>)* and returns an Expr
     * @returns {Expr | Error}
     */
    parse_term_stream() {
        let stream = this.copy();

        const first_term = stream.parse_term();
        if (first_term instanceof Error) { return first_term; }

        let terms = [first_term];
        let ops = [];
        while (true) {
            if (!is_bin_op_token(stream.peek())) {
                break;
            }
            const op = stream.parse_bin_op();
            const term = stream.parse_term();

            if (op instanceof Error) { return op; }
            if (term instanceof Error) { return term; }

            terms.push(term);
            ops.push(op);
        }

        console.assert(terms.length == ops.length + 1);

        const out_term = term_stream(terms, ops);
        if (out_term instanceof Error) { out_term.cause = { cause: stream.debug_info() }; return out_term; }
        this.commit(stream);
        return out_term;

        /**
         * Turn a stream of terms into a single Term. The terms and ops are interleaved 
         * like so:
         * terms: 0   1   2   3   4   5
         * ops  :   0   1   2   3   4
         * @param {Term[]} terms
         * @param {BinOp[]} ops
         * @return {Term | Error} The sequence of Terms and Ops transformed a single Term containing
         * all of the Terms as children. The return value is a Value is there was only one Term in
         * the input array. Otherweise the return value is a BinOp. Returns an Error if the term
         * stream could not be parsed into a term.
         */
        function term_stream(terms, ops) {
            if (ops.length + 1 != terms.length) {
                throw new Error(`Expected terms array to containg one more element than the ops array.Got ${terms.length} terms and ${ops.length} ops`)
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
                    console.assert(ops.length == 0, `Expected ops length to be zero, got ${ops} `);
                    return terms[0];
                }

                let associativity = BinOp.precedence_to_associativity(current_precedence);
                let i = associativity == "left" ? 0 : ops.length - 2;
                while (associativity == "left" ? i < ops.length : i > 0) {
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
                        i += associativity == "left" ? 1 : -1;
                    }
                }
            }

            return new Error(`Did not parse all of term stream: ${terms}, ${ops} `);
        }
    }

    /**
     * Parses <t_stream> ("?" <expr> ":" <expr>)? and returns an Expr
     * @returns {Expr | Error}
     */
    parse_expr() {
        let stream = this.copy();
        const term_stream = stream.parse_term_stream();
        if (term_stream instanceof Error) {
            return term_stream;
        }

        // Try to parse a ternary expression. If we can't, just return the existing term stream.
        // Commit the stream at this point--if we fail to consume a ternary expression at this point,
        // we will "fail" and return the valid term stream we just parsed.
        this.commit(stream);

        if (stream.peek() != "?") { return term_stream; }
        stream.consume_one();

        const true_expr = stream.parse_expr();
        if (true_expr instanceof Error) { return term_stream; }

        if (stream.peek() != ":") { return term_stream; }
        stream.consume_one();

        const false_expr = stream.parse_expr();
        if (false_expr instanceof Error) { return term_stream; }

        this.commit(stream);
        return new TernaryOpExpr(term_stream, true_expr, false_expr);
    }

    /**
     * @returns {Assignment | Error}
     */
    parse_assignment() {
        let stream = this.copy();
        const identifier = stream.parse_identifier();
        if (identifier instanceof Error) { return identifier; }

        const result_eq = stream.try_consume("=");
        if (result_eq instanceof Error) { return result_eq; }

        const expr = stream.parse_expr();
        if (expr instanceof Error) { return expr; }

        this.commit(stream);
        return new Assignment(identifier, expr);
    }

    parse_assignment_or_identifier() {
        {
            let stream = this.copy();
            const assignment = stream.parse_assignment();
            if (assignment instanceof Assignment) {
                this.commit(stream);
                return assignment;
            }
        }
        {
            let stream = this.copy();
            const identifier = stream.parse_identifier();
            if (identifier instanceof Identifier) {
                this.commit(stream);
                return identifier;
            } else {
                return identifier;
            }
        }
    }

    /** 
     * Consumes tokens from the TokenStream and constructs an Assign
     * @returns {Declaration | Error}
     */
    parse_declaration() {
        // debugger;
        let stream = this.copy();

        const type = stream.try_parse_type();

        let assign_or_idents = [];
        while (true) {
            const assign_or_ident = stream.parse_assignment_or_identifier();
            if (assign_or_ident instanceof Error) { break; }
            assign_or_idents.push(assign_or_ident);

            const result_comma = stream.try_consume(",");
            if (result_comma instanceof Error) { break; }
        }

        const result_semi = stream.try_consume(";");
        if (result_semi instanceof Error) { return result_semi; }

        this.commit(stream);
        return new Declaration(type, assign_or_idents);
    }

    /** 
     * Return the next Token without consuming it.
     * @return {Token | null} */
    peek() {
        if (this.index < this.stream.length) {
            return this.stream[this.index];
        } else {
            return null;
        }
    }

    /**
     * Advance the TokenStream by one token. if the TokenStream is empty, throws an error. This 
     * is intended for when you know that you wish to consume the next token.
     */
    consume_one() {
        if (this.index < this.stream.length) {
            this.index += 1;
        } else {
            throw new Error(`Cannot consume next token, current: ${this.index}, length: ${this.stream.length} `, { cause: this.debug_info() });
        }
    }

    /** 
     * Try to consume a Token. If the token does not match the passed token, an Error is returned.
     * @param {Token} token */
    try_consume(token) {
        if (this.stream[this.index] == token) {
            this.index += 1;
            return null;
        } else {
            return new Error(`Expected ${token}, got ${this.stream[this.index]}`, { cause: this.debug_info() });
        }
    }

    /**
     * Create a copy of this TokenStream. The other TokenStream is advanced to the point of this
     * TokenStream.
     * @returns {TokenStream}
     */
    copy() {
        let token_stream = new TokenStream(this.stream);
        token_stream.index = this.index;
        return token_stream;
    }

    /**
     * Commit the other TokenStream to this TokenStream. This should be called whenever parsing succeeds
     * on the other TokenStream
     * @param {TokenStream} other */
    commit(other) {
        this.index = other.index;
    }

    debug_info() {
        return {
            stream: this
        }
    }

    toString() {
        return `${array_to_string(this.stream)} @ ${this.index}`;
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