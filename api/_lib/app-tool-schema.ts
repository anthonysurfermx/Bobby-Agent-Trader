/** Anthropic's JSON wire subset omits bounds; validate the original contract after parsing. */
const LOCAL_BOUNDS = new Set(['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
  'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems', 'uniqueItems', 'minProperties', 'maxProperties']);
type Schema = Record<string, any>;

export function appToolWireSchema(schema: Schema): Schema {
  const wire: Schema = {};
  for (const [key, value] of Object.entries(schema)) {
    if (LOCAL_BOUNDS.has(key)) continue;
    if (['properties', '$defs', 'definitions'].includes(key) && value && typeof value === 'object') {
      wire[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, appToolWireSchema(child as Schema)]));
    } else if (['anyOf', 'oneOf', 'allOf'].includes(key) && Array.isArray(value)) {
      wire[key] = value.map(appToolWireSchema);
    } else if (['items', 'additionalProperties'].includes(key) && value && typeof value === 'object') {
      wire[key] = appToolWireSchema(value);
    } else wire[key] = value;
  }
  if (schema.type === 'object' || schema.properties) wire.additionalProperties = false;
  return wire;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function appToolInputValid(value: unknown, schema: Schema, root: Schema = schema, depth = 0): boolean {
  if (depth > 32) return false;
  if (schema.$ref) {
    if (typeof schema.$ref !== 'string' || !schema.$ref.startsWith('#/')) return false;
    let target: any = root;
    for (const key of schema.$ref.slice(2).split('/').map((part: string) => part.replace(/~1/g, '/').replace(/~0/g, '~'))) {
      if (!target || !Object.hasOwn(target, key)) return false;
      target = target[key];
    }
    return Boolean(target && typeof target === 'object' && appToolInputValid(value, target, root, depth + 1));
  }
  const valid = (child: Schema, input = value) => appToolInputValid(input, child, root, depth + 1);
  if (schema.anyOf && !schema.anyOf.some((child: Schema) => valid(child))) return false;
  if (schema.oneOf && schema.oneOf.filter((child: Schema) => valid(child)).length !== 1) return false;
  if (schema.allOf && !schema.allOf.every((child: Schema) => valid(child))) return false;
  if (schema.enum && !schema.enum.some((candidate: unknown) => same(value, candidate))) return false;
  if (Object.hasOwn(schema, 'const') && !same(value, schema.const)) return false;
  if (Array.isArray(schema.type)) return schema.type.some((type: string) => valid({ ...schema, type }));
  if (schema.type === 'null') return value === null;
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) return false;
    if (schema.minimum !== undefined && value < schema.minimum) return false;
    if (schema.maximum !== undefined && value > schema.maximum) return false;
    if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) return false;
    if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) return false;
    if (schema.multipleOf !== undefined && Math.abs(value / schema.multipleOf - Math.round(value / schema.multipleOf)) > 1e-9) return false;
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') return false;
    const length = Array.from(value).length;
    if (schema.minLength !== undefined && length < schema.minLength) return false;
    if (schema.maxLength !== undefined && length > schema.maxLength) return false;
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) return false;
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return false;
    if (schema.minItems !== undefined && value.length < schema.minItems) return false;
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return false;
    if (schema.uniqueItems && new Set(value.map(item => JSON.stringify(item))).size !== value.length) return false;
    if (schema.items && !value.every(item => valid(schema.items, item))) return false;
  } else if (schema.type === 'object' || schema.properties) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const object = value as Record<string, unknown>, properties = schema.properties ?? {};
    if ((schema.required ?? []).some((key: string) => !Object.hasOwn(object, key))) return false;
    const keys = Object.keys(object);
    if (schema.minProperties !== undefined && keys.length < schema.minProperties) return false;
    if (schema.maxProperties !== undefined && keys.length > schema.maxProperties) return false;
    for (const key of keys) {
      if (Object.hasOwn(properties, key)) { if (!valid(properties[key], object[key])) return false; }
      else if (schema.additionalProperties === false) return false;
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object' && !valid(schema.additionalProperties, object[key])) return false;
    }
  }
  return true;
}
