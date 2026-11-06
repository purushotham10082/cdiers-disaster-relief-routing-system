// Tiny schema validator: whitelists fields, coerces types, sanitises strings.
const clean = (s, max) => String(s).replace(/[<>]/g, '').trim().slice(0, max);
function validate(body, schema, { partial = false } = {}) {
  const out = {}, errors = [];
  body = body && typeof body === 'object' ? body : {};
  for (const [k, r] of Object.entries(schema)) {
    let v = body[k];
    if (v === undefined || v === null || v === '') {
      if (r.required && !partial) errors.push(`${k} is required`);
      else if (r.default !== undefined && !partial) out[k] = r.default;
      continue;
    }
    if (r.type === 'number') {
      v = Number(v);
      if (!Number.isFinite(v)) { errors.push(`${k} must be a number`); continue; }
      if (r.min !== undefined && v < r.min) { errors.push(`${k} must be >= ${r.min}`); continue; }
      if (r.max !== undefined && v > r.max) { errors.push(`${k} must be <= ${r.max}`); continue; }
    } else if (r.type === 'boolean') {
      v = v === true || v === 'true';
    } else if (r.type === 'enum') {
      if (!r.values.includes(v)) { errors.push(`${k} must be one of: ${r.values.join(', ')}`); continue; }
    } else if (r.type === 'array') {
      if (!Array.isArray(v)) { errors.push(`${k} must be a list`); continue; }
      v = v.slice(0, 20).map((x) => clean(x, 60));
    } else {
      v = clean(v, r.max || 500);
      if (r.required && !v) { errors.push(`${k} is required`); continue; }
    }
    out[k] = v;
  }
  return { ok: errors.length === 0, errors, data: out };
}
module.exports = { validate };
