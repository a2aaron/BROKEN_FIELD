echo "let document = {}; document.getElementById = function(/** @type {string} */ id) { return null; }" > out.js
echo "let window = {};" >> out.js
cat ../tokenize.js ../parse.js ../ast.js ../util.js >> out.js
sed -i '' '/import/d' out.js
sed -i '' 's/^export //' out.js

cat parser_fuzz.js >> out.js
jsfuzz ./out.js --only-ascii  --versifier corpus/ seed.txt
