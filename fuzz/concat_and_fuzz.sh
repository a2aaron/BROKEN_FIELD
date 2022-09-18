mv crash-* crashes

echo "Pruning large test cases..."

for filename in corpus/*; do
    if [ -n "$(find "$filename" -prune -size +1000c)" ]; then
        printf '%s is larger than 1000 bytes. pruning...\n' "$filename"
        trash $filename
    fi
done


echo "Creating out.js..."

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
jsfuzz ./out.js --timeout 1 --only-ascii  --versifier seed.txt corpus/ crashes/
