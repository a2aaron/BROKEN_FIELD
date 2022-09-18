/**
 * @param {any} bytes Actually Buffer type
 */
function fuzz(bytes) {
    const string = String.fromCodePoint(...bytes)

    if (!/^[\x00-\x7F]*$/.test(string)) {
        return;
    }
    // @ts-ignore
    const result = Program.parse(string);
    // @ts-ignore
    if (result instanceof Program) {
        if (result.type_errors.length == 0) { result.simplify(); }
        result.toString("pretty");
        result.toString("minimal");
    }
}


module.exports = {
    fuzz
};
