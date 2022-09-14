import { BinOpExpr, BinOp, Value, UnaryOpExpr, UnaryOp, Program, Expr } from "./ast.js";
import { INTEGER_VARIABLES } from "./tokenize.js";
import { getTypedElementById, isNumber } from "./util.js";

/** 
 * @typedef {import("./tokenize.js").UnaryOpToken} UnaryOpToken
 * @typedef {import("./tokenize.js").BinOpToken} BinOpToken
 */

/** @returns {BinOp} */
function random_bin_op() {
    /** @type {import("./tokenize.js").BinOpToken} */
    let op = choose(
        "+", "-", "*", "/",
        "%", "<<", ">>",
        "&", "^", "|",
        "&", "^", "|");
    return new BinOp(op);
}

/** @returns {UnaryOp} */
function random_un_op() {
    return new UnaryOp(choose("-", "~"));
}


/** @returns {Value} */
function random_value() {
    /** @type {string | number } */
    // @ts-ignore
    let value = choose(Math.floor(Math.random() * 256), ...allowed_generator_values());
    return new Value(value);
}

/** @returns {UnaryOpExpr | Value} */
function random_un_op_expr() {
    let value = random_value();
    if (Math.random() < 0.25) {
        let op = random_un_op();
        return new UnaryOpExpr(value, op);
    }
    return value;
}

/**
 * @param {number} max_depth
 * @returns {BinOpExpr}
 */
function random_binop_expr(max_depth) {
    for (let i = 0; i < 5; i++) {
        let bin_op = generate_binop_expr(max_depth);

        if (avoid_ub() && bin_op.check_ub()) {
            continue;
        } else {
            return bin_op;
        }
    }
    // Give up after 5 failed attempts to avoid UB.
    console.log("Couldn't prevent UB!");
    return generate_binop_expr(max_depth);

    /** @param {number} max_depth */
    function generate_binop_expr(max_depth) {
        let op = random_bin_op();
        if (max_depth == 0) {
            let left = random_value();
            let right = random_value();
            return new BinOpExpr(left, op, right);
        } else {
            /** @type { Expr } */
            let left = random_un_op_expr();
            if (Math.random() > 0.5) {
                left = random_binop_expr(max_depth - 1);
            }

            /** @type { Expr } */
            let right = random_un_op_expr();
            if (Math.random() > 0.5) {
                right = random_binop_expr(max_depth - 1);
            }

            return new BinOpExpr(left, op, right);
        }
    }
}

/**
 * Generates a random bytebeat.
 * @returns {string}
 */
export function random_bytebeat() {
    let depth_limit = getTypedElementById(HTMLInputElement, "randomize-depth-limit");
    let max_depth = parseInt(depth_limit.value);
    let expr = random_binop_expr(max_depth);
    return expr.toString("pretty");
}

/**
 * Mutate the passed bytebeat.
 * @param {string} bytebeat
 * @returns {string}
 */
export function mutate_bytebeat(bytebeat) {
    let mutate_ops = getTypedElementById(HTMLInputElement, "mutate-enable-ops").checked;
    let mutate_values = getTypedElementById(HTMLInputElement, "mutate-enable-values").checked;

    let program = Program.parse(bytebeat);
    if (program instanceof Error) {
        return bytebeat;
    }

    let expr = mutate(program.expr, mutate_values, mutate_ops);
    return new Program(program.statements, expr).toString("pretty")

    /**
     * @param {Expr} expr
     * @param {boolean} mutate_values
     * @param {boolean} mutate_ops
     * @returns {Expr}
     */
    function mutate(expr, mutate_values, mutate_ops) {
        if (expr instanceof Value) {
            if (mutate_values && Math.random() < 0.25) {
                return random_value();
            } else {
                return expr;
            }
        } else if (expr instanceof BinOpExpr) {
            let left = mutate(expr.left, mutate_values, mutate_ops);
            let right = mutate(expr.right, mutate_values, mutate_ops);;
            let op = expr.op;
            if (mutate_ops && Math.random() < 0.25) {
                op = random_bin_op();
            }
            return new BinOpExpr(left, op, right);
        } else if (expr instanceof UnaryOpExpr) {
            let value = mutate(expr.value, mutate_values, mutate_ops);
            let op = expr.op;
            if (mutate_ops && Math.random() < 0.25) {
                op = random_un_op();
            }
            return new UnaryOpExpr(value, op);
        }

        return expr;
    }
}

/** @returns {boolean} */
function avoid_ub() {
    return getTypedElementById(HTMLInputElement, "randomize-avoid-ub").checked;
}

/** @returns {string[]} */
function allowed_generator_values() {
    let values = [];
    for (const variable of INTEGER_VARIABLES) {
        let checkbox = getTypedElementById(HTMLInputElement, `randomize-enable-${variable}`);
        if (checkbox.checked) {
            values.push(variable);
        }
    }
    return values;
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
