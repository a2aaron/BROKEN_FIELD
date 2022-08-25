/**
 * variable ::= t | sx | sy | mx | my | kx | ky
 * value ::= <number> | <variable>
 * op :: = + | - | * | / | % | << | >> | & | ^ | |
 * expr ::= 
 */

class Value {
    /**
     * @param {string} value
     */
    constructor(value) {
        this.value = value;
    }

    /**
     * @returns {string}
     */
    eval() {
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
     * @param {string} op
     * @param {Value | BinOp} right
     */
    constructor(left, op, right) {
        this.left = left;
        this.op = op;
        this.right = right;
    }

    /**
     * @returns {string}
     */
    eval() {
        return `(${this.left.eval()} ${this.op} ${this.right.eval()})`;
    }

    /**
     * @param {number} max_depth
     * @returns {BinOp}
     */
    static random(max_depth) {
        let op = random_op();
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
 * Generates a random bytebeat.
 * @returns {string}
 */
export function random_bytebeat() {
    let expr = BinOp.random(20);
    return expr.eval();
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
            return Value.random().eval();
        } else {
            return match;
        }
    })

    bytebeat = bytebeat.replace(match_operators, (match, ...rest) => {
        if (Math.random() < 0.25) {
            return random_op();
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

function random_op() {
    return choose(
        "+", "-", "*", "/",
        "%", "<<", ">>",
        "&", "^", "|",
        "&", "^", "|");
}
