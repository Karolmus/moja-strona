import {
  create, parseDependencies, addDependencies, subtractDependencies,
  multiplyDependencies, divideDependencies, powDependencies,
  unaryMinusDependencies, unaryPlusDependencies, sqrtDependencies,
  cbrtDependencies, nthRootDependencies
} from 'mathjs/number';

const math = create({
  parseDependencies, addDependencies, subtractDependencies,
  multiplyDependencies, divideDependencies, powDependencies,
  unaryMinusDependencies, unaryPlusDependencies, sqrtDependencies,
  cbrtDependencies, nthRootDependencies
});
const functions = {sqrt: 1, cbrt: 1, nthRoot: 2};
const operators = new Set(['+', '-', '*', '/', '^']);

function normalize(value) {
  let text = String(value).trim();
  if (!text || text.length > 200) throw new Error('Invalid expression length');
  text = text.replace(/,/g, '.').replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/');
  text = text.replace(/²/g, '^2').replace(/³/g, '^3');
  text = text.replace(/√\s*(\d+(?:\.\d+)?)/g, 'sqrt($1)')
    .replace(/∛\s*(\d+(?:\.\d+)?)/g, 'cbrt($1)')
    .replace(/√/g, 'sqrt').replace(/∛/g, 'cbrt')
    .replace(/\b(?:root|nthroot)\s*\(/gi, 'nthRoot(').replace(/;/g, ',');
  const mixed = text.match(/^(-?)(\d+)\s+(\d+)\s*\/\s*(\d+)$/);
  if (mixed) text = `${mixed[1]}(${mixed[2]}+${mixed[3]}/${mixed[4]})`;
  return text;
}

function parse(value) {
  const node = math.parse(normalize(value));
  let count = 0;
  // Only scalar arithmetic is allowed, never assignments, accessors or user functions.
  function visit(node, depth = 0) {
    if (++count > 80 || depth > 16) throw new Error('Expression too complex');
    if (node.isConstantNode && typeof node.value === 'number' && Number.isFinite(node.value)) return;
    if (node.isParenthesisNode) return visit(node.content, depth + 1);
    if (node.isOperatorNode && operators.has(node.op)) {
      node.args.forEach(child => visit(child, depth + 1));
      return;
    }
    if (node.isFunctionNode && Object.hasOwn(functions, node.name) && node.args.length === functions[node.name]) {
      node.args.forEach(child => visit(child, depth + 1));
      return;
    }
    throw new Error('Unsupported expression');
  }
  visit(node);
  return node;
}

export function evaluate(value) {
  const result = parse(value).compile().evaluate();
  if (typeof result !== 'number' || !Number.isFinite(result)) throw new Error('Non-real or non-finite result');
  return result;
}

export function equivalent(value, expected) {
  try {
    const actual = evaluate(value);
    const target = evaluate(expected);
    return Math.abs(actual - target) <= 1e-10 * Math.max(1, Math.abs(target));
  } catch {
    return false;
  }
}

export function isValid(value) {
  try {evaluate(value); return true;} catch {return false;}
}

export function preview(value) {
  const root = parse(value);
  evaluate(value);
  // MathML is generated only from validated numeric nodes, not user-supplied markup.
  function render(node) {
    if (node.isConstantNode) return `<mn>${node.value}</mn>`;
    if (node.isParenthesisNode) return `<mrow><mo>(</mo>${render(node.content)}<mo>)</mo></mrow>`;
    const args = node.args.map(render);
    if (node.isFunctionNode) {
      if (node.name === 'sqrt') return `<msqrt>${args[0]}</msqrt>`;
      return `<mroot>${args[0]}${node.name === 'cbrt' ? '<mn>3</mn>' : args[1]}</mroot>`;
    }
    if (node.op === '/') return `<mfrac>${args[0]}${args[1]}</mfrac>`;
    if (node.op === '^') return `<msup>${args[0]}${args[1]}</msup>`;
    const sign = node.op === '*' ? '&#183;' : node.op === '-' ? '&#8722;' : node.op;
    if (args.length === 1) return `<mrow><mo>${sign}</mo>${args[0]}</mrow>`;
    return `<mrow>${args.join(`<mo>${sign}</mo>`)}</mrow>`;
  }
  return `<math xmlns="http://www.w3.org/1998/Math/MathML">${render(root)}</math>`;
}
