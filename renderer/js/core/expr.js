// Tiny, safe math-expression compiler (no eval). Used for DH fields, robot
// parameters (L1, L2, ...) and custom 4x4 matrix entries.
//
//   compile("L1*cos(q) + 0.05")  ->  (scope) => number
//
// Grammar: + - * / ^ (right assoc), unary +/-, parentheses, numbers
// (1, 1.5, 2e-3), identifiers, function calls.

const FUNCS = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan, atan2: Math.atan2,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, abs: Math.abs, exp: Math.exp, log: Math.log, ln: Math.log,
  min: Math.min, max: Math.max, sign: Math.sign, floor: Math.floor, ceil: Math.ceil,
  hypot: Math.hypot,
  deg: (x) => (x * 180) / Math.PI,
  rad: (x) => (x * Math.PI) / 180,
  sind: (x) => Math.sin((x * Math.PI) / 180),
  cosd: (x) => Math.cos((x * Math.PI) / 180),
};

const CONSTS = { pi: Math.PI, PI: Math.PI, e: Math.E };

export const FUNCTION_NAMES = Object.keys(FUNCS);

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
      if (!m) throw new Error(`Bad number at ${i}`);
      tokens.push({ t: 'num', v: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
      tokens.push({ t: 'id', v: m[0] });
      i += m[0].length;
      continue;
    }
    if (ch === '*' && src[i + 1] === '*') { tokens.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^(),'.includes(ch)) { tokens.push({ t: 'op', v: ch }); i++; continue; }
    throw new Error(`Unexpected "${ch}"`);
  }
  return tokens;
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const isOp = (v) => peek() && peek().t === 'op' && peek().v === v;
  const expect = (v) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`);
    pos++;
  };

  function expr() {
    let node = term();
    while (isOp('+') || isOp('-')) {
      const op = tokens[pos++].v;
      node = { k: 'bin', op, a: node, b: term() };
    }
    return node;
  }
  function term() {
    let node = unary();
    while (isOp('*') || isOp('/')) {
      const op = tokens[pos++].v;
      node = { k: 'bin', op, a: node, b: unary() };
    }
    return node;
  }
  function unary() {
    if (isOp('-')) { pos++; return { k: 'neg', a: unary() }; }
    if (isOp('+')) { pos++; return unary(); }
    return power();
  }
  function power() {
    const base = atom();
    if (isOp('^')) { pos++; return { k: 'bin', op: '^', a: base, b: unary() }; }
    return base;
  }
  function atom() {
    const tok = tokens[pos++];
    if (!tok) throw new Error('Unexpected end');
    if (tok.t === 'num') return { k: 'num', v: tok.v };
    if (tok.t === 'id') {
      if (isOp('(')) {
        pos++;
        const args = [];
        if (!isOp(')')) {
          args.push(expr());
          while (isOp(',')) { pos++; args.push(expr()); }
        }
        expect(')');
        if (!FUNCS[tok.v]) throw new Error(`Unknown function ${tok.v}()`);
        return { k: 'call', f: tok.v, args };
      }
      return { k: 'var', v: tok.v };
    }
    if (tok.t === 'op' && tok.v === '(') {
      const node = expr();
      expect(')');
      return node;
    }
    throw new Error(`Unexpected "${tok.v}"`);
  }

  const root = expr();
  if (pos < tokens.length) throw new Error(`Unexpected "${tokens[pos].v}"`);
  return root;
}

function build(node) {
  switch (node.k) {
    case 'num': { const v = node.v; return () => v; }
    case 'var': {
      const name = node.v;
      if (name in CONSTS) { const v = CONSTS[name]; return () => v; }
      return (s) => {
        const v = s[name];
        if (typeof v !== 'number') throw new Error(`Unknown variable ${name}`);
        return v;
      };
    }
    case 'neg': { const a = build(node.a); return (s) => -a(s); }
    case 'call': {
      const f = FUNCS[node.f], args = node.args.map(build);
      return (s) => f(...args.map((a) => a(s)));
    }
    case 'bin': {
      const a = build(node.a), b = build(node.b);
      switch (node.op) {
        case '+': return (s) => a(s) + b(s);
        case '-': return (s) => a(s) - b(s);
        case '*': return (s) => a(s) * b(s);
        case '/': return (s) => a(s) / b(s);
        case '^': return (s) => Math.pow(a(s), b(s));
      }
    }
  }
  throw new Error('bad node');
}

function collectVars(node, out) {
  if (node.k === 'var' && !(node.v in CONSTS)) out.add(node.v);
  if (node.a) collectVars(node.a, out);
  if (node.b) collectVars(node.b, out);
  if (node.args) node.args.forEach((n) => collectVars(n, out));
  return out;
}

const cache = new Map();

// Returns { fn, vars } — throws with a readable message on syntax errors.
export function compile(src) {
  const key = String(src ?? '').trim() || '0';
  if (cache.has(key)) return cache.get(key);
  const ast = parse(tokenize(key));
  const out = { fn: build(ast), vars: [...collectVars(ast, new Set())] };
  cache.set(key, out);
  return out;
}

export function evaluate(src, scope = {}) {
  if (typeof src === 'number') return src;
  return compile(src).fn(scope);
}

// Like evaluate, but never throws: returns { value, error }.
export function tryEvaluate(src, scope = {}) {
  try {
    const value = evaluate(src, scope);
    if (!Number.isFinite(value)) return { value: NaN, error: 'Result is not a finite number' };
    return { value, error: null };
  } catch (e) {
    return { value: NaN, error: e.message };
  }
}
