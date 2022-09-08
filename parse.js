import { Value, BinOpExpr, UnaryOpExpr, UnaryOp, BinOp, TernaryOpExpr, Statement } from "./ast.js";
import { Identifier, is_simple_bin_op_token, is_literal, is_type_token, is_un_op_token } from "./tokenize.js";
import { array_to_string } from "./util.js";

const MAX_PRECEDENCE = 17;

/**
 * Typedef imports
 * @typedef {import("./tokenize.js").TypeToken} TypeToken
 * @typedef {import("./tokenize.js").Token} Token
 */

/**
 * <type>     ::= "int" | "float" | "bool"
 * <un_op>    ::= "+" | "-" | "~" | "!"
 * // <bin_op> does not include "=" or ","
 * <bin_op>   ::= "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "&" | "^" | "|"...
 * <literal>  ::= <number> | "true" | "false"
 * <value>    ::= <literal> | <identifier>
 * <term>     ::= "(" <expr> ")" | <value> | <un_op> <term>
 * <t_stream> ::= <term> (<bin_op> <term>)*
 * <simple>   ::= <t_stream> ("?" <expr> ":" <expr>)?
 * <assign>   ::= <ident> "=" <simple>
 * <expr>     ::= <assign> | <simple>
 * <e_stream> ::= <expr> ("," <expr>)*
 * <stmt>     ::= <type>? (<e_stream>) ";"
 * <program>  ::= <stmt>* <expr>
 * 
 * @typedef {Expr} Term
 * @typedef {Expr} SimpleExpr
 * @typedef {Value | BinOpExpr | UnaryOpExpr | TernaryOpExpr} Expr
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
        if (is_simple_bin_op_token(next_token)) {
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
     * @returns {Term | Error}
     */
    parse_term_stream() {
        let stream = this.copy();

        const first_term = stream.parse_term();
        if (first_term instanceof Error) { return first_term; }

        let terms = [first_term];
        let ops = [];
        while (true) {
            if (!is_simple_bin_op_token(stream.peek())) {
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
     * @returns {SimpleExpr | Error}
     */
    parse_simple_expr() {
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
     * @returns {Expr | Error}
     */
    parse_assignment() {
        let stream = this.copy();
        const identifier = stream.parse_identifier();
        if (identifier instanceof Error) { return identifier; }

        const result_eq = stream.try_consume("=");
        if (result_eq instanceof Error) { return result_eq; }

        const expr = stream.parse_simple_expr();
        if (expr instanceof Error) { return expr; }

        this.commit(stream);
        return new BinOpExpr(new Value(identifier), new BinOp("="), expr);
    }

    parse_expr() {
        {
            let stream = this.copy();
            const assignment = stream.parse_assignment();
            if (!(assignment instanceof Error)) {
                this.commit(stream);
                return assignment;
            }
        }
        {
            let stream = this.copy();
            const expr = stream.parse_simple_expr();
            if (!(expr instanceof Error)) {
                this.commit(stream);
            }
            return expr;
        }
    }

    /** 
     * Consumes tokens from the TokenStream and constructs an Assign
     * @returns {Statement | Error}
     */
    parse_statement() {
        // debugger;
        let stream = this.copy();

        const type = stream.try_parse_type();

        let exprs = [];
        while (true) {
            const expr = stream.parse_expr();
            if (expr instanceof Error) { break; }
            exprs.push(expr);

            const result_comma = stream.try_consume(",");
            if (result_comma instanceof Error) { break; }
        }

        const result_semi = stream.try_consume(";");
        if (result_semi instanceof Error) { return result_semi; }

        this.commit(stream);
        return new Statement(type, exprs);
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