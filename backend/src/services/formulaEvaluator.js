// Salary Rule FORMULA computation is evaluated here, never via eval()/Function()
// on the stored formulaOrValue string. Mockup calls this option "Python Code"
// with examples like `result = categories['BASIC']`, but the backend is Node —
// this implements a small, restricted arithmetic grammar instead of literal
// Python or a general-purpose JS sandbox:
//
//   expression := term (('+' | '-') term)*
//   term       := factor (('*' | '/') factor)*
//   factor     := number | identifier | '(' expression ')' | ('+' | '-') factor
//
// Only numeric literals, + - * / (), unary +/-, and bare identifiers resolved
// against the supplied context are supported — no function calls, no property
// access, no assignment. A rule's own code (e.g. "GROSS") and its category
// name are both valid identifiers; anything else raises rather than silently
// evaluating to undefined/NaN, since a silent miscalculation in payroll is
// worse than a loud failure.

const TOKEN_RE = /\s*(?:([0-9]+(?:\.[0-9]+)?)|([A-Za-z_][A-Za-z0-9_]*)|([()+\-*/]))/y;

function tokenize(source) {
  const tokens = [];
  TOKEN_RE.lastIndex = 0;
  let index = 0;

  while (index < source.length) {
    TOKEN_RE.lastIndex = index;
    const match = TOKEN_RE.exec(source);
    if (!match || match[0].length === 0) {
      const remainder = source.slice(index).trim();
      if (remainder.length === 0) break;
      throw new Error(`Unexpected character in formula: "${remainder[0]}"`);
    }

    const [full, number, identifier, symbol] = match;
    if (number !== undefined) tokens.push({ type: "number", value: Number(number) });
    else if (identifier !== undefined) tokens.push({ type: "identifier", value: identifier });
    else if (symbol !== undefined) tokens.push({ type: "symbol", value: symbol });

    index += full.length;
  }

  return tokens;
}

function parse(tokens) {
  let pos = 0;

  function peek() {
    return tokens[pos];
  }

  function consume(expected) {
    const token = tokens[pos];
    if (!token || (expected && token.value !== expected)) {
      throw new Error(
        `Malformed formula: expected "${expected ?? "token"}" but found ` +
          (token ? `"${token.value}"` : "end of input")
      );
    }
    pos += 1;
    return token;
  }

  function parseFactor() {
    const token = peek();
    if (!token) throw new Error("Malformed formula: unexpected end of input");

    if (token.type === "number") {
      consume();
      return { type: "number", value: token.value };
    }
    if (token.type === "identifier") {
      consume();
      return { type: "identifier", value: token.value };
    }
    if (token.type === "symbol" && (token.value === "+" || token.value === "-")) {
      consume();
      return { type: "unary", op: token.value, operand: parseFactor() };
    }
    if (token.type === "symbol" && token.value === "(") {
      consume("(");
      const inner = parseExpression();
      consume(")");
      return inner;
    }
    throw new Error(`Malformed formula: unexpected token "${token.value}"`);
  }

  function parseTerm() {
    let node = parseFactor();
    while (peek() && peek().type === "symbol" && (peek().value === "*" || peek().value === "/")) {
      const op = consume().value;
      node = { type: "binary", op, left: node, right: parseFactor() };
    }
    return node;
  }

  function parseExpression() {
    let node = parseTerm();
    while (peek() && peek().type === "symbol" && (peek().value === "+" || peek().value === "-")) {
      const op = consume().value;
      node = { type: "binary", op, left: node, right: parseTerm() };
    }
    return node;
  }

  const result = parseExpression();
  if (pos !== tokens.length) {
    throw new Error(`Malformed formula: unexpected trailing token "${tokens[pos].value}"`);
  }
  return result;
}

function evaluateNode(node, context) {
  switch (node.type) {
    case "number":
      return node.value;
    case "identifier": {
      if (!Object.prototype.hasOwnProperty.call(context, node.value)) {
        throw new Error(`Formula references unknown value "${node.value}"`);
      }
      return Number(context[node.value]);
    }
    case "unary":
      return node.op === "-" ? -evaluateNode(node.operand, context) : evaluateNode(node.operand, context);
    case "binary": {
      const left = evaluateNode(node.left, context);
      const right = evaluateNode(node.right, context);
      switch (node.op) {
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          if (right === 0) throw new Error("Formula divides by zero");
          return left / right;
        default:
          throw new Error(`Unsupported operator "${node.op}"`);
      }
    }
    default:
      throw new Error(`Unsupported formula node type "${node.type}"`);
  }
}

// context is a plain { CODE: number } map of already-computed rule values in
// this payslip's running context — never the raw employee/contract object, so
// a formula can only ever read numeric totals a prior rule produced.
function evaluateFormula(source, context) {
  const ast = parse(tokenize(source));
  const result = evaluateNode(ast, context);
  if (!Number.isFinite(result)) {
    throw new Error("Formula did not evaluate to a finite number");
  }
  return result;
}

module.exports = { evaluateFormula };
