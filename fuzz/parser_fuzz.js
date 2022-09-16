/**
 * @param {Buffer} bytes
 */
function fuzz(bytes) {
    const string = String.fromCodePoint(...bytes)
    const result = Program.parse(string);
}


module.exports = {
    fuzz
};
