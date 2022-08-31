import { BinOpExpr, BinOp, Value } from "./parse.js";
import { BUILTIN_VARIABLES } from "./tokenize.js";
import { getTypedElementById, isNumber } from "./util.js";

/** @returns {BinOp} */
function random_op() {
    /** @type {import("./tokenize.js").BinOpToken} */
    let op = choose(
        "+", "-", "*", "/",
        "%", "<<", ">>",
        "&", "^", "|",
        "&", "^", "|");
    return new BinOp(op);
}


/** @returns {Value} */
function random_value() {
    /** @type {string | number } */
    // @ts-ignore
    let value = choose(Math.floor(Math.random() * 256), ...allowed_generator_values());
    return new Value(value);
}

/**
 * @param {number} max_depth
 * @returns {BinOpExpr}
 */
function random_binop(max_depth) {
    for (let i = 0; i < 5; i++) {
        let bin_op = generate_binop(max_depth);

        if (avoid_ub() && bin_op.check_ub()) {
            continue;
        } else {
            return bin_op;
        }
    }
    // Give up after 5 failed attempts to avoid UB.
    console.log("Couldn't prevent UB!");
    return generate_binop(max_depth);

    /** @param {number} max_depth */
    function generate_binop(max_depth) {
        let op = random_op();
        if (max_depth == 0) {
            let left = random_value();
            let right = random_value();
            return new BinOpExpr(left, op, right);
        } else {
            /** @type { Value | BinOpExpr } */
            let left = random_value();
            if (Math.random() > 0.5) {
                left = random_binop(max_depth - 1);
            }

            /** @type { Value | BinOpExpr } */
            let right = random_value();
            if (Math.random() > 0.5) {
                right = random_binop(max_depth - 1);
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
    let expr = random_binop(20);
    return expr.toString();
}

/**
 * Mutate the passed bytebeat.
 * @param {string} bytebeat
 * @returns {string}
 */
export function mutate_bytebeat(bytebeat) {
    let mutate_ops = getTypedElementById(HTMLInputElement, "mutate-enable-ops").checked;
    let mutate_values = getTypedElementById(HTMLInputElement, "mutate-enable-values").checked;

    let match_values = /t|sx|sy|kx|ky|mx|my|[\d]+/g;
    let match_operators = /\+|\-|\*|\/|\^|\&|\||\%|\>\>|\<\</g;

    if (mutate_values) {
        bytebeat = bytebeat.replace(match_values, (match, ...rest) => {
            if (Math.random() < 0.25) {
                return random_value().toString();
            } else {
                return match;
            }
        });
    }

    if (mutate_ops) {
        bytebeat = bytebeat.replace(match_operators, (match, ...rest) => {
            if (Math.random() < 0.25) {
                return random_op().toString();
            } else {
                return match;
            }
        });
    }


    return bytebeat;
}


/** @returns {boolean} */
function avoid_ub() {
    return getTypedElementById(HTMLInputElement, "randomize-avoid-ub").checked;
}

/** @returns {string[]} */
function allowed_generator_values() {
    let values = [];
    for (const variable of BUILTIN_VARIABLES) {
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
