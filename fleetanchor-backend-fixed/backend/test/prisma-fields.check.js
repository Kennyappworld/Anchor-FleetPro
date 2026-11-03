// Static check: every field/relation name used in prisma.<model>.<op>({...})
// must exist in prisma/schema.prisma. Catches typos like `jobRequest` vs `job`
// before they reach production. CI installs the two helper packages:
//   npm i --no-save espree@9 @prisma/prisma-schema-wasm@5.10.0-34.5a9203d0590c951969e85a7d07215503f4672eb9
//   node test/prisma-fields.check.js
const fs = require('fs');
const path = require('path');
const espree = require('espree');
const wasm = require('@prisma/prisma-schema-wasm');
const ROOT = path.resolve(__dirname, '..');
const dmmf = JSON.parse(wasm.get_dmmf(JSON.stringify({ prismaSchema: fs.readFileSync(path.join(ROOT, 'prisma/schema.prisma'), 'utf8') })));
const M = {};
for (const m of dmmf.datamodel.models) M[m.name] = Object.fromEntries(m.fields.map((f) => [f.name, f.type]));
const modelByAccessor = Object.fromEntries(Object.keys(M).map(n => [n[0].toLowerCase() + n.slice(1), n]));
const OPS = new Set(['some', 'every', 'none', 'is', 'isNot', 'select', 'include', 'where', 'orderBy', 'take', 'skip', 'distinct', 'cursor', 'connect', 'create', 'connectOrCreate', 'disconnect', 'set', 'update', 'upsert', 'delete', 'deleteMany', 'updateMany', 'createMany', 'data', '_sum', '_avg', '_min', '_max', 'by', 'having']);
const LOGIC = new Set(['AND', 'OR', 'NOT']);
const issues = [];

function keyName(p) {
  if (p.type !== 'Property' || p.computed) return null;
  return p.key.type === 'Identifier' ? p.key.name : (typeof p.key.value === 'string' ? p.key.value : null);
}

function checkObj(model, node, file, ctx) {
  if (!node) return;
  if (node.type === 'ArrayExpression') return node.elements.forEach(e => checkObj(model, e, file, ctx));
  if (node.type !== 'ObjectExpression') return;
  for (const p of node.properties) {
    const k = keyName(p);
    if (!k) continue;
    if (LOGIC.has(k)) { checkObj(model, p.value, file, ctx); continue; }
    if (k === '_count') {
      if (p.value.type === 'ObjectExpression') for (const q of p.value.properties) if (keyName(q) === 'select') checkObj(model, q.value, file, '_count');
      continue;
    }
    if (OPS.has(k) && ctx !== 'fields') { checkObj(model, p.value, file, k); continue; }
    const fields = M[model];
    if (!(k in fields) && k.split('_').every(x => x in fields)) continue; // compound unique key
    if (!(k in fields)) {
      issues.push(`${file}:${p.loc.start.line}  ${model} has no field "${k}"`);
      continue;
    }
    const t = fields[k];
    if (M[t] && p.value.type === 'ObjectExpression') checkObj(t, p.value, file, 'rel');
  }
}

function walk(node, file) {
  if (!node || typeof node.type !== 'string') return;
  if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression') {
    const obj = node.callee.object;
    if (obj.type === 'MemberExpression' && obj.object.type === 'Identifier' && obj.object.name === 'prisma' && !obj.computed) {
      const model = modelByAccessor[obj.property.name];
      if (!model && !obj.property.name.startsWith('$')) issues.push(`${file}:${node.loc.start.line}  no model "${obj.property.name}"`);
      if (model && node.arguments[0]) checkObj(model, node.arguments[0], file, 'top');
    }
  }
  for (const key of Object.keys(node)) {
    if (key === 'parent') continue;
    const v = node[key];
    if (Array.isArray(v)) v.forEach(c => c && typeof c.type === 'string' && walk(c, file));
    else if (v && typeof v.type === 'string') walk(v, file);
  }
}

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? files(path.join(dir, d.name)) : d.name.endsWith('.js') ? [path.join(dir, d.name)] : []);
}

const SRC = path.join(ROOT, 'src');
for (const f of files(SRC)) {
  const ast = espree.parse(fs.readFileSync(f, 'utf8'), { ecmaVersion: 2022, loc: true });
  walk(ast, path.relative(SRC, f));
}
console.log(issues.join('\n') || 'All Prisma queries match the schema.');
process.exit(issues.length ? 1 : 0);
