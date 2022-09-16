echo "let document = {};
document.getElementById = /** @returns {HTMLElement}} */ function (/** @type {string} */ id) {
    // @ts-ignore
    return {};
};

document.createElement = /** @returns {HTMLElement}} */ function (/** @type {string} */ tag) {
    // @ts-ignore
    return {};
}
let window = {};" > out.js
cat ../tokenize.js ../parse.js ../ast.js ../util.js >> out.js
sed -i '' '/import/d' out.js
sed -i '' 's/^export //' out.js

cat parser_fuzz.js >> out.js
jsfuzz ./out.js --only-ascii  --versifier corpus/ seed.txt
