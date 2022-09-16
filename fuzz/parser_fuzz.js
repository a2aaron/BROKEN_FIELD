/**
 * @param {any} bytes Actually Buffer type
 */
function fuzz(bytes) {
    const string = String.fromCodePoint(...bytes)
    // @ts-ignore
    const result = Program.parse(string);
}


module.exports = {
    fuzz
};
