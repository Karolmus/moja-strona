# Math answer bundle

Build from this directory with `npm ci --ignore-scripts` and `npm run build`.
The locked dependencies produce `static/lib/mathjs/answers.min.js`; the website
does not need npm or an external CDN at runtime.

This uses the number-only subset of math.js 15.2.0: parsing, scalar arithmetic,
square roots, cube roots and nth roots. The application validates the AST before
evaluation. Assignments, symbols, property access, arrays and other functions
are not accepted. Expressions are limited to 200 characters, 80 nodes and
16 nested levels. The answer preview uses MathML from the same validated tree.

Official references:
- https://mathjs.org/docs/custom_bundling.html
- https://mathjs.org/docs/expressions/security.html

Licenses are included beside the generated bundle.
