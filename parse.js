import { Value, BinOpExpr, UnaryOpExpr, UnaryOp, BinOp, TernaryOpExpr, Statement, ExprList, Expr, Program } from "./ast.js";
import { Identifier, is_simple_bin_op_token, is_literal, is_type_token, is_un_op_token, tokenize } from "./tokenize.js";
import { array_to_string, assertType, unwrap } from "./util.js";

const MAX_PRECEDENCE = 17;

/**
 * Typedef imports
 * @typedef {import("./tokenize.js").TypeToken} TypeToken
 * @typedef {import("./tokenize.js").Literal} Literal
 * @typedef {import("./tokenize.js").Token} Token
 */


/** 
 * @typedef {TypeToken | Identifier | Literal | UnaryOp | BinOp | Expr | Statement | Program} ASTNode
 * @typedef {function(ASTNode[]): ASTNode | Error} ASTConstructor
 * @typedef {ASTNode | ASTNode[] | null | Error} ParseResult
 * @typedef {Expr} Term
 */

// If true, print debug information to the console when parsing
let DEBUG = false;
// The indent level for the debug print statements.
let INDENT = 0;
/**
 * A ParserRule describes a rule for parsing tokens from the TokenStream. There are two functions
 * an implementor of ParserRule must implement.
 * @method parse_impl Don't override the parse method, instead override this. This is the internal parse implementation.
 * This is wrapped by ParserRule's parse method. It receives a TokenStream and is expected to return
 * one of four things: 
 * - A single ASTNode
 * - Multiple ASTNodes, in an Array
 * - null, which means "successfully parsed, but did not return any ASTNode(s)"
 * - An Error, signalling that the ParserRule did not successfully parse the stream
 * The stream should be copied with stream.copy() and committed to with stream.commit(copied_stream)
 * The stream should ONLY be committed to if the rule successfully parsed and otherwise should not
 * (in other words, whenever parse_impl returns an ASTNode, ASTNode[], or null, commit the stream,
 * otherwise if it returns an Error, do not commit the stream). This is nessecary so that backtracking
 * can work (not committing the stream on an Error means that the tokens consumed during the failed
 * parsed are ignored, allowing a higher-level rule to backtrack and choose a different rule)
 * @method rule_string This is the textual representation of the rule. This should return a string.
 */
class ParserRule {
    /**
     * @returns {ParseResult}
     * @param {TokenStream} stream
     */
    parse(stream) {
        let name = this instanceof LookupRule ? this.name : this.rule_string();
        if (DEBUG) {
            console.log(`${"  ".repeat(INDENT)}${name} --> `)
            INDENT += 1;
        }

        let result = this.parse_impl(stream);

        if (DEBUG) {
            console.log(`${"  ".repeat(INDENT)}${name} <-- ${result}`)
            INDENT -= 1;
        }
        return result;
    }

    /**
     * @returns {ParseResult}
     * @param {TokenStream} stream
     */
    parse_impl(stream) {
        console.log(this);
        throw new Error(`parse_impl not implemented by ${this.constructor.name}.`);
    }

    /** @returns { string } */
    rule_string() {
        throw new Error(`rule_string not implemented by ${this.constructor.name}.`);
    }
}

/**
 * The KleeneStar rule. The Kleene Star (written as *) will attempt to apply the wrapped rule as 
 * many times as possible, which greedily consumes as many tokens as possible. It may succeed between
 * zero and unlimited times. The Kleene Star rule will return the successful parses in an array. Note
 * that this array is allowed to be empty (if the wrapped rule succeeds zero times). This also means
 * that the rule never fails, even if the wrapped rule succeeds zero times.
 */
class KleeneStar extends ParserRule {
    /**
     * @param {ParserRule} rule
     */
    constructor(rule) {
        super();
        this.rule = rule;
    }

    /**
      * @returns {ParseResult}
      * @param {TokenStream} stream
      */
    parse_impl(stream) {
        let copy = stream.copy();
        /** @type {ASTNode[]} */
        let nodes = [];
        while (true) {
            const result = this.rule.parse(copy);
            if (result instanceof Error) {
                break;
            } else if (result instanceof Array) {
                nodes.push(...result);
            } else if (result === null) {
                continue;
            } else {
                nodes.push(result);
            }
        }
        stream.commit(copy);
        return nodes;
    }

    /** @returns { string } */
    rule_string() {
        return `(${this.rule.rule_string()})*`;
    }
}

/**
 * The Maybe rule. The Maybe rule (written as ?) will attempt to apply the wrapped rule. If the 
 * wrapped rule succeeds, it returns the wrapped rule's result. Otherwise, if the wrapped rule fails,
 * it returns null. This also means that this rule never fails.
 */
class MaybeRule extends ParserRule {
    /**
     * @param {ParserRule} rule
     */
    constructor(rule) {
        super();
        this.rule = rule;
    }

    /**
      * @returns {ParseResult}
      * @param {TokenStream} stream
      */
    parse_impl(stream) {
        let copy = stream.copy();
        const result = this.rule.parse(copy);
        if (result instanceof Error) {
            return null;
        } else {
            stream.commit(copy);
            return result;

        }
    }

    /** @returns { string } */
    rule_string() {
        return `(${this.rule.rule_string()})?`;
    }
}


/**
 * The Sequence rule. This rule wraps a sequential list of rules. It will attempt to parse the token stream against each
 * rule in order. If any rule fails, the entire SequenceRule is considered to fail. In other words,
 * this rule succeeds only if every rule it wraps succeeds, and fails if any rule fails to succeed.
 */
class SequenceRule extends ParserRule {
    /**
     * @param {ParserRule[]} rules A list of rules. When parsing, the rules are evaluated from the start
     * of the list to the end. If any rule does not match, then an Error is returned.
     * @param {ASTConstructor | null} make_node a function which constructs an ASTNode from
     * the given ASTNode sub-nodes. Called on successful parsing of all rules.
     */
    constructor(rules, make_node) {
        super();
        this.rules = rules;
        this.make_node = make_node;
    }

    /**
      * @returns {ParseResult}
      * @param {TokenStream} stream
      */
    parse_impl(stream) {
        let copy = stream.copy();
        /** @type {ASTNode[]} */
        let nodes = [];
        for (const rule of this.rules) {
            const result = rule.parse(copy);
            if (result instanceof Error) {
                return new Error(`Could not match ${this.rule_string()} (Reason: ${result})`);
            } else if (result instanceof Array) {
                nodes.push(...result);
            } else if (result === null) {
                continue;
            } else {
                nodes.push(result);
            }
        }
        stream.commit(copy);
        return this.make_node ? this.make_node(nodes) : nodes;
    }

    /** @returns { string } */
    rule_string() {
        return this.rules.map((rule) => rule.rule_string()).join(" ");
    }
}

/**
 * The Or rule. This rule wraps a sequential list of rules. It will attempt to parse the token stream
 * against each rule in order. The first rule which succeeds is returned (and the later rules are not run).
 * In other words, this rule succeeds if any rule it wraps succeeds, and fails if every rule fails to succeed.
 */
class OrRule extends ParserRule {
    /**
     * @param {ParserRule[]} rules A list of rules. When parsing, the rules are evaluated from the start
     * of the list to the end, and the first rule which happens to match is used as the offical match.
     * If none of the rules match, then an Error is returned.
     */
    constructor(rules) {
        super();
        this.rules = rules;
    }
    /**
      * @returns {ParseResult}
      * @param {TokenStream} stream
      */
    parse_impl(stream) {
        let copy = stream.copy();
        for (const rule of this.rules) {
            const result = rule.parse(copy);
            if (result instanceof Error) {
                continue;
            } else {
                stream.commit(copy);
                return result;
            }
        }

        return new Error(`Couldn't parse any rule from list: ${this.rule_string()}`);
    }

    /** @returns { string } */
    rule_string() {
        return this.rules.map((rule) => rule.rule_string()).join(" | ");
    }
}

/**
 * A rule which tries to match a single token from the TokenStream. If the token matches, this rule
 * passes the token to the `func` callback, which should transform the Token into a useful ParseResult.
 * If `func` succeeds, the token is consumed and the produced ASTNode is returned. Otherwise, the rule fails.
 */
class MatchOne extends ParserRule {
    /**
     * @param {function(Token): ParseResult} func A matching rule. This is a function which takes
     * a token and should return an ASTNode if the rule matches, and null if it does not match.
     * Note that some Tokens are also ASTNodes (for example, Identifiers), so the matching rule does
     * not nessecarily have to return something other than the input Token. If the rule matches, the
     * token is consumed from the TokenStream.
     * @param {string} name
     */
    constructor(func, name) {
        super();
        this.func = func;
        this.name = name;
    }

    /**
     * @returns {ParseResult}
     * @param {TokenStream} stream
     */
    parse_impl(stream) {
        const next_token = stream.peek();
        if (next_token == null) {
            return new Error("Expected a token, got an empty stream.");
        }
        let node = this.func(next_token);
        if (node instanceof Error) {
            return node;
        } else {
            stream.consume_one();
            return node;
        }
    }

    /** @returns { string } */
    rule_string() {
        return `${this.name}`;
    }
}

/**
 * This rule is a convience rule for referring to rules in the global RULES object. When this rule is
 * executed, it simply looks up the given name in the RULES object and executes the corresponding rule.
 */
class LookupRule extends ParserRule {
    /** @param {string} name */
    constructor(name) {
        super();
        this.name = name;
    }

    /**
     * @returns {ParseResult}
     * @param {TokenStream} stream
     */
    parse_impl(stream) {
        if (!RULES[this.name]) {
            throw new Error(`Cannot find rule ${this.name}`);
        }
        const rule = RULES[this.name];
        const result = rule.parse(stream);
        return result;
    }

    /** @returns { string } */
    rule_string() {
        return `<${this.name}>`;
    }
}

/**  
 * Convience function for creating an OrRule. The rules are a list that will be wrapped in an OrRule
 * , followed by a KleenStar. If a rule is a bare string, it is assumed to refer to a key in the
 * RULES object (and hence is wrapped inside of a LookupRule)
 * @param {(ParserRule | string)[]} rules
 **/
function or(...rules) {
    const mapped_rules = rules.map((x) => typeof x == "string" ? new LookupRule(x) : x)
    return new OrRule(mapped_rules);
}

/** 
 * Convience function for creating a SequenceRule. `make_node` is an ASTConstructor or null (if null,
 * the SequenceRule returns the ASTNode array it creates as-is). `rules` is a sequence of rules. If
 * one of the rules is a bare string, it is assumed to refer to a key in the RULES object (and hence
 * is wrapped inside of a LookupRule)
 * @param {ASTConstructor | null} make_node
 * @param {(ParserRule | string)[]} rules 
 */
function seq(make_node, ...rules) {
    const mapped_rules = rules.map((x) => typeof x == "string" ? new LookupRule(x) : x)
    return new SequenceRule(mapped_rules, make_node);
}

/** 
 * Convience function for creating a MatchOne rule. The token is returned as null, so rules consuming
 * this one will throw away the token after consumption.
 * @param {import("./tokenize.js").TextualToken} rule
 **/
function lit(rule) {
    return new MatchOne((token) => rule === token ? null : new Error(`Expected ${rule}, got ${token}`), `"${rule}"`);
}

/** 
 * Convience function for creating a KleenStar. The rules are a list that will be wrapped in a 
 * SequenceRule, followed by a KleenStar. The SequenceRule will have a null ASTConstructor, so this
 * rule will return the ASTNode array as is. If a rule is a bare string, it is assumed to refer to a
 * key in the RULES object (and hence is wrapped inside of a LookupRule).
 * @param {(ParserRule | string)[]} rules 
 */
function star(...rules) {
    return new KleeneStar(seq(null, ...rules));
}

/** 
 * Convience function for creating a MaybeRule. The rules are a list that will be wrapped in a 
 * SequenceRule, followed by a MaybeRule. The SequenceRule will have a null ASTConstructor, so this
 * rule will return the ASTNode array as is. If a rule is a bare string, it is assumed to refer to a
 * key in the RULES object (and hence is wrapped inside of a LookupRule).
 * @param {(ParserRule | string)[]} rules 
 */
function maybe(...rules) {
    return new MaybeRule(seq(null, ...rules));
}


/**
 * The following RULES object encodes the rules below.
 * <type>     ::= "int" | "float" | "bool"
 * <un_op>    ::= "+" | "-" | "~" | "!"
 * // <bin_op> does not include "=" or ",". this set only includes the operators that are
 * // value-producing (that is, you can evaluate them to a value and they do not have side-effects)
 * <bin_op>   ::= "+" | "-" | "*" | "/" | "%" | "<<" | ">>" | "&" | "^" | "|"...
 * <literal>  ::= <number> | "true" | "false"
 * <value>    ::= <literal> | <identifier>
 * // This is where parenthesis is allowed for expr-recursion
 * <term>     ::= "(" <expr_list> ")" | <value> | <un_op> <term>
 * <t_stream> ::= <term> (<bin_op> <term>)*
 * // A "simple" expr is any expr containing a value-producing op
 * <simple>   ::= <t_stream> ("?" <expr> ":" <expr>)?
 * <assign>   ::= <ident> "=" <simple>
 * <expr>     ::= <assign> | <simple>
 * <expr_list>::= <expr> ("," <expr>)*
 * <stmt>     ::= <type>? <expr_list> ";"
 * <program>  ::= <stmt>* <expr_list>
 */
/** @type {{[rule: string]: ParserRule}} */
export const RULES = {
    type: new MatchOne(make_type_token, "<type token>"),
    identifier: new MatchOne(make_identifier, "<identifier>"),
    literal: new MatchOne(make_literal, "<literal>"),
    un_op: new MatchOne(make_unop, "<unary operator>"),
    bin_op: new MatchOne(make_bin_op, "<binary operator>"),
    value: new MatchOne(make_value, "<value>"),
    un_op_expr: seq(make_unop_expr,
        "un_op", "term"),
    term_stream: seq(make_binop_from_list,
        "term", star("bin_op", "term")),
    term: or(
        "value",
        "un_op_expr",
        seq(null,
            lit("("), "expr_list", lit(")"))),
    simple: seq(maybe_make_ternary,
        "term_stream", maybe(lit("?"), "expr", lit(":"), "expr")),
    assign: seq(make_assign,
        "identifier", lit("="), "expr"),
    expr: or("assign", "simple"),
    expr_list: seq(make_expr_list, "expr", star(lit(","), "expr")),
    stmt: seq(make_statement,
        maybe("type"), "expr_list", lit(";")),
    program: seq(make_program, star("stmt"), "expr_list")
}

/** @param {Token} token */
function make_type_token(token) {
    return is_type_token(token) ? token : new Error(`Expected type token, got ${token}`);
}

/** @param {Token} token */
function make_identifier(token) {
    return token instanceof Identifier ? token : new Error(`Expected identifier, got ${token}`);
}

/** @param {Token} token */
function make_literal(token) {
    return is_literal(token) ? new Value(token) : new Error(`Expected literal, got ${token}`);
}

/** @param {Token} token */
function make_value(token) {
    return is_literal(token) || token instanceof Identifier ? new Value(token) : new Error(`Expected an identifier or literal, got ${token}`);
}

/** @param {Token} token */
function make_unop(token) {
    return is_un_op_token(token) ? new UnaryOp(token) : new Error(`Expected unary op, got ${token}`);
}

/** @param {Token} token */
function make_bin_op(token) {
    return is_simple_bin_op_token(token) ? new BinOp(token) : new Error(`Expected binary op, got ${token}`);
}

/** @param {ASTNode[]} nodes */
function make_unop_expr(nodes) {
    const [op, value] = nodes;
    assertType(op, UnaryOp);
    assertType(value, Expr);
    console.assert(nodes.length == 2);
    return new UnaryOpExpr(value, op);
}

/** @param {ASTNode[]} nodes */
function make_binop_from_list(nodes) {
    /** @type {Term[]} */
    let terms = [];
    /** @type {BinOp[]} */
    let ops = [];
    for (let i = 0; i < nodes.length; i += 1) {
        let node = nodes[i];
        if (i % 2 == 0) {
            assertType(node, Expr);
            terms.push(node);
        } else {
            assertType(node, BinOp);
            ops.push(node)
        }
    }

    return term_stream(terms, ops);
}

/** @param {ASTNode[]} nodes */
function maybe_make_ternary(nodes) {
    if (nodes.length == 1) {
        const expr = nodes[0];
        assertType(expr, Expr);
        return expr;
    } else if (nodes.length == 3) {
        const [cond_expr, true_expr, false_expr] = nodes;
        assertType(cond_expr, Expr);
        assertType(true_expr, Expr);
        assertType(false_expr, Expr);
        return new TernaryOpExpr(cond_expr, true_expr, false_expr);
    } else {
        throw new Error(`Expected nodes to be length 1 or 3, got ${nodes.length}`);
    }
}

/** @param {ASTNode[]} nodes */
function make_assign(nodes) {
    if (nodes.length == 2) {
        const [left, right] = nodes;
        assertType(left, Identifier);
        assertType(right, Expr);
        return new BinOpExpr(new Value(left), new BinOp("="), right);
    } else {
        throw new Error(`Expected nodes to be length 1 or 2, got ${nodes.length}`);
    }

}

/** @param {ASTNode[]} nodes */
function make_expr_list(nodes) {
    if (nodes.length == 1) {
        assertType(nodes[0], Expr)
        return nodes[0];
    } else {
        const exprs = nodes.map((x) => { assertType(x, Expr); return x; });
        return new ExprList(exprs);
    }
}

/** @param {ASTNode[]} nodes */
function make_statement(nodes) {
    if (nodes.length == 1) {
        assertType(nodes[0], Expr);
        return new Statement(null, nodes[0]);
    } else if (nodes.length == 2) {
        const [type, expr] = nodes;
        // @ts-ignore
        if (!is_type_token(type)) { throw new Error(`Expected ${type} to be a TypeToken!`); };
        assertType(expr, Expr);
        return new Statement(type, expr);
    } else {
        throw new Error(`Expected nodes to be length 1 or 2, got ${nodes.length}`);
    }
}

/** @param {ASTNode[]} nodes */
function make_program(nodes) {
    if (nodes.length == 0) {
        throw new Error(`Expected nodes to be at least length 1, got ${nodes.length}`);
    }

    if (nodes.length == 1) {
        assertType(nodes[0], Expr)
        return new Program([], nodes[0]);
    } else {
        const statements = nodes
            .slice(0, -1)
            .map((stmt) => {
                assertType(stmt, Statement);
                return stmt;
            });
        const expr = nodes[nodes.length - 1];
        assertType(expr, Expr);
        return new Program(statements, expr);
    }
}

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


/**
 * @param {string} bytebeat
 * @param {string} rule
 */
export function debug_parse(bytebeat, rule) {
    DEBUG = true;
    let tokens = tokenize(bytebeat);
    if (tokens instanceof Error) { throw tokens; }
    // @ts-ignore
    let token_stream = new TokenStream(tokens);
    const result = RULES[rule].parse(token_stream);
    DEBUG = false;
    // @ts-ignore
    return [result, token_stream.index, result?.toString("pretty"), RULES[rule].rule_string()];
}
// @ts-ignore
window.debug_parse = debug_parse;

export class TokenStream {
    /**
     * @param {Token[]} stream
     */
    constructor(stream) {
        this.stream = stream;
        this.index = 0;
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
