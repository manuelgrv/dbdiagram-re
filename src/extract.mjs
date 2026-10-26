import { loadAcorn, loadTypeScript } from './environment.mjs';

let acorn;
function expression(source, start) {
  acorn ??= loadAcorn();
  const node = acorn.parseExpressionAt(source, start, { ecmaVersion: 'latest', sourceType: 'module' });
  return node.type === 'SequenceExpression' ? node.expressions[0] : node;
}
export function enclosingClass(source, marker) {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error(`Class marker missing: ${marker}`);
  const before = source.slice(0, at);
  const matches = [...before.matchAll(/(?:var |,)([A-Za-z_$][\w$]*)=class\b/g)];
  const found = matches.at(-1);
  if (!found) throw new Error(`No class for ${marker}`);
  const start = found.index + found[0].indexOf('=') + 1;
  const node = expression(source, start);
  if (node.end <= at) throw new Error(`Marker is outside recovered class: ${marker}`);
  return { symbol: found[1], kind: 'class', start, end: node.end, node, code: source.slice(start, node.end) };
}
export function functionByName(source, name) {
  const re = new RegExp('(?:async )?function ' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\(');
  const match = re.exec(source);
  if (!match) throw new Error(`Function missing: ${name}`);
  const node = expression(source, match.index);
  return { symbol: name, kind: 'function', start: match.index, end: node.end, node, code: source.slice(match.index, node.end) };
}
export function objectBySymbol(source, symbol) {
  const re = new RegExp('(?:var |,)' + symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=');
  const found = re.exec(source);
  if (!found) throw new Error(`Object missing: ${symbol}`);
  const start = found.index + found[0].length;
  const node = expression(source, start);
  return { symbol, kind: 'object', start, end: node.end, node, code: source.slice(start, node.end) };
}
export function walk(node, fn) {
  const stack = [node];
  while (stack.length) {
    const item = stack.pop();
    if (!item || typeof item.type !== 'string') continue;
    fn(item);
    for (const value of Object.values(item)) {
      if (Array.isArray(value)) {
        for (let i=value.length-1; i>=0; i--) if (value[i]?.type) stack.push(value[i]);
      } else if (value?.type) stack.push(value);
    }
  }
}
export function literals(node) {
  const out=[];
  walk(node, n => {
    if (n.type === 'Literal' && typeof n.value === 'string') out.push(n.value);
    if (n.type === 'TemplateLiteral' && n.expressions.length === 0) out.push(n.quasis[0].value.cooked);
  });
  return [...new Set(out)];
}
export function staticValue(node) {
  if (node.type === 'Literal') return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '!') return !staticValue(node.argument);
  if (node.type === 'ObjectExpression') return Object.fromEntries(node.properties.map(p => {
    if (p.type !== 'Property' || p.computed) throw new Error('Non-static object property');
    return [p.key.name ?? p.key.value, staticValue(p.value)];
  }));
  throw new Error(`Unsupported static value ${node.type}`);
}
export function assignments(source, node, propertyName) {
  const values=[];
  walk(node, n => {
    if (n.type === 'AssignmentExpression' && n.left.type === 'MemberExpression' && (n.left.property.name ?? n.left.property.value) === propertyName) values.push(source.slice(n.right.start,n.right.end));
  });
  return [...new Set(values)];
}
const recoveredCache = new WeakMap();
export function recoverHost(bundle) {
  if (recoveredCache.has(bundle)) return recoveredCache.get(bundle);
  const source=bundle.host;
  const parser = enclosingClass(source, 'static parseDBMLToJSONv2(');
  const feature = enclosingClass(source, 'static RETRY_MS=');
  const layout = enclosingClass(source, 'DEBOUNCE_MS=');
  const preview = enclosingClass(source, 'async resolveCustomTextEditor(');
  const diagnostics = enclosingClass(source, 'notifiedProFeatures=new Set');
  const auth = enclosingClass(source, 'static SESSIONS_SECRET_KEY=');
  const loopback = enclosingClass(source, 'static LOGIN_TIMEOUT_MS=');
  const proCall=feature.code.match(/setAndEmitProFeaturesToggle\(\)\{this.cachedFeatureToggles=\{\.\.\.([\w$]+)\}/);
  const freeCall=feature.code.match(/setAndEmitFreeFeaturesToggle\(\)\{this.cachedFeatureToggles=\{\.\.\.([\w$]+)\}/);
  if (!proCall || !freeCall) throw new Error('Feature-object discovery failed; bundle may have changed');
  const pro=objectBySymbol(source,proCall[1]), free=objectBySymbol(source,freeCall[1]);
  const loadMethod=layout.node.body.body.find(m=>m.key?.name==='loadState');
  let decoderName;
  walk(loadMethod,n=>{if(n.type==='CallExpression'&&n.callee.type==='Identifier'&&n.arguments.length===1)decoderName=n.callee.name;});
  if (!decoderName) throw new Error('Layout decoder discovery failed');
  const decode=functionByName(source,decoderName);
  const bootstrap=source.match(/activate:\(\)=>(([\w$]+))/);
  const sections={ parser, feature, layout, preview, diagnostics, auth, loopback, pro, free, decode };
  if (bootstrap) sections.activation=functionByName(source,bootstrap[1]);
  const bridgeMatch=source.slice(parser.end).match(/function ([\w$]+)\(e\)\{try\{let s=[\w$]+\.parse\(e,"dbmlv2"\)/);
  if (bridgeMatch) sections.parserBridge=functionByName(source,bridgeMatch[1]);
  recoveredCache.set(bundle,sections);
  return sections;
}
export function pretty(code) {
  const ts=loadTypeScript();
  if (!ts) return code;
  const file=ts.createSourceFile('recovered.js', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  return ts.createPrinter({newLine:ts.NewLineKind.LineFeed}).printFile(file);
}
