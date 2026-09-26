// Candidate idle glass materials, expressed as exact GLSL substring patches.
// v2  -> the FS in nucleo-v2.html        onb -> the FS in .src-onb/p2.js
// Each [before, after] must match its source exactly once (build.mjs enforces it),
// and every "before" block must exist verbatim (as quoted JS lines) in the source file.

const J = (a) => a.join('\n');

/* ---------------- nucleo-v2.html: baseline blocks ---------------- */
const V2_INT = J([
  '  vec3 ir = irid(f2*1.4 + 0.08*sin(ang) + uIridPh);',
  '  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2));',
  '  vec3 col = vec3(0.012) + ir*dens*(0.62 + 0.55*uEnergy)*uIrid + ir*0.12*(0.6 + 0.4*z);',
]);
const V2_WASH = '  col = mix(col, uTint*(0.10 + 0.55*dens), uTintWash);';
const V2_RIM = J([
  '  col += rimC*fr*0.75*(1.0 + uRimBoost);',
  '  col += rimC*0.18*exp(-sq((rr - 0.9)*14.0));',
]);
const V2_FIN = '  col *= 0.70 + 0.30*z;';

/* shared by A, B, C: the glass itself */
const V2_WASH_BODY = '  col = mix(col, uTint*(0.10 + 0.55*dens), uTintWash*body);';
const V2_RIM_THIN = J([
  '  float frT = pow(1.0 - z, 8.0);',
  '  col += rimC*(frT*1.8 + fr*0.06)*(1.0 + uRimBoost);',
  '  col += rimC*0.14*exp(-sq((rr - 0.93)*40.0));',
]);
const V2_FIN_GLASS = '  col *= mix(0.70 + 0.30*z, 1.0, frT);';
const GLASS_V2 = [[V2_WASH, V2_WASH_BODY], [V2_RIM, V2_RIM_THIN], [V2_FIN, V2_FIN_GLASS]];

/* ---------------- .src-onb/p2.js: baseline blocks ---------------- */
const ONB_INT = J([
  '  vec3 ir = irid(f2*1.4 + 0.08*sin(ang)*smoothstep(0.0, 0.35, rr) + uPh2.y);',
  '  ir = mix(ir, uTi.rgb, uCb.w);',
  '  float bf = uB.x*1.4;',
  '  float bm = 1.0 - smoothstep(bf - 0.35, bf - 0.05, rr);',
  '  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2))*bm;',
  '  vec3 col = vec3(0.012) + ir*dens*(0.62 + 0.55*uL.x)*uL.w + ir*0.12*(0.6 + 0.4*z)*bm*mix(0.5, 1.0, uL.w);',
]);
const ONB_RIM = J([
  '  col += rimC*fr*0.75*rh;',
  '  col += rimC*0.18*gs((rr - 0.9)*14.0)*rh;',
]);
const ONB_FIN = '  col *= 0.70 + 0.30*z;';

export const VARIANTS = [
  { id: 'v0', name: 'Current', v2: [], onb: [] },
  {
    /* depth only: the same marbled field, faded to clear glass toward the rim, thin rim */
    id: 'A', name: 'Clear shell',
    v2: [
      [V2_INT, J([
        '  vec3 ir = irid(f2*1.4 + 0.08*sin(ang) + uIridPh);',
        '  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2));',
        '  float body = 1.0 - smoothstep(0.50, 0.97, rr);',
        '  vec3 col = (ir*dens*(0.62 + 0.55*uEnergy)*uIrid + ir*0.12*(0.6 + 0.4*z))*mix(0.10, 1.0, body) + uAmb*(1.0 - body) + vec3(0.012);',
      ])],
      ...GLASS_V2,
    ],
    onb: [],
  },
  {
    /* keeps the full-ball fbm, but hue follows light (deep blue -> violet -> pink): no teal/maroon mud */
    id: 'B', name: 'Clean nebula',
    v2: [
      [V2_INT, J([
        '  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2));',
        '  float calm = smoothstep(0.4, 1.0, uIrid);',
        '  float lit = smoothstep(0.30, 0.78, f2);',
        '  vec3 cq = vec3(pp, z) - vec3(-0.30, 0.18, 0.80);',
        '  float cw = exp(-dot(cq, cq)*2.0);',
        '  float body = 1.0 - smoothstep(0.48, 0.97, rr);',
        '  vec3 ir = irid(0.02 + (0.30*lit + 0.20*cw)*calm + 0.04*sin(ang) + 0.05*sin(6.2831853*uIridPh));',
        '  ir = max(mix(vec3(dot(ir, vec3(0.299,0.587,0.114))), ir, 1.45), 0.0);',
        '  vec3 col = ir*(0.30 + 0.60*lit + 0.45*cw)*(0.62 + 0.55*uEnergy)*uIrid*mix(0.06, 1.0, body) + uAmb*(1.0 - body) + vec3(0.012);',
      ])],
      ...GLASS_V2,
    ],
    onb: [],
  },
  {
    /* a deep luminous body under the light + two slow currents; the shell is clear glass */
    id: 'C', name: 'Deep core',
    v2: [
      [V2_INT, J([
        '  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2));',
        '  float calm = smoothstep(0.4, 1.0, uIrid);',
        '  float body = 1.0 - smoothstep(0.50, 0.98, rr);',
        '  vec3 cq = vec3(pp, z) - vec3(-0.30, 0.18, 0.80) - 0.20*vec3(f1 - 0.5, f2 - 0.5, 0.0);',
        '  float core = exp(-dot(cq, cq)*2.0);',
        '  vec3 sn = vec3(q, z); sn.xz = rot(uRot)*sn.xz;',
        '  float w1 = dot(sn, normalize(vec3(0.95, 0.18 + 0.25*sin(uDrift*0.37), 0.30))) + 0.08*(f1 - 0.5);',
        '  float w2 = dot(sn, normalize(vec3(0.45, -0.55, 0.70))) - 0.52 + 0.10*(f1 - 0.5);',
        '  float cur = (exp(-sq(w1/0.011)) + 0.20*exp(-sq(w1/0.06)) + 0.55*exp(-sq(w2/0.022)) + 0.25*exp(-sq(w2/0.08)))*(0.30 + 0.90*smoothstep(0.38, 0.62, f1))*body*calm;',
        '  float fold = smoothstep(0.0, 0.20, w1)*exp(-max(w1, 0.0)*5.0);',
        '  vec3 ir = irid((0.50*core - 0.24*smoothstep(0.0, 0.9, -sn.y)*(1.0 - core))*calm + 0.13*(f2 - 0.5) + 0.04*sin(6.2831853*uIridPh));',
        '  ir = max(mix(vec3(dot(ir, vec3(0.299,0.587,0.114))), ir, 1.45), 0.0);',
        '  vec3 col = ir*(0.60 + 1.05*core + 0.35*fold + 0.45*(smoothstep(0.2, 0.8, f2) - 0.5))*(0.62 + 0.55*uEnergy)*uIrid*mix(0.05, 1.0, body)',
        '           + irid(0.62 + 0.4*core)*cur*0.55 + uAmb*(1.0 - body) + vec3(0.012);',
      ])],
      ...GLASS_V2,
    ],
    onb: [
      [ONB_INT, J([
        '  float bf = uB.x*1.4;',
        '  float bm = 1.0 - smoothstep(bf - 0.35, bf - 0.05, rr);',
        '  float dens = mix(0.18, 1.0, smoothstep(0.22, 0.78, f2))*bm;',
        '  float calm = smoothstep(0.4, 1.0, uL.w);',
        '  float body = mix(1.0, 1.0 - smoothstep(0.50, 0.98, rr), clamp(uB.y, 0.0, 1.0));',
        '  vec3 cq = vec3(pp, z) - vec3(-0.30, 0.18, 0.80) - 0.20*vec3(f1 - 0.5, f2 - 0.5, 0.0);',
        '  float core = exp(-dot(cq, cq)*2.0);',
        '  vec3 sn = vec3(q, z); sn.xz = rot(uPh2.x)*sn.xz;',
        '  float w1 = dot(sn, normalize(vec3(0.95, 0.18 + 0.25*sin(uPh.w*0.37), 0.30))) + 0.08*(f1 - 0.5);',
        '  float w2 = dot(sn, normalize(vec3(0.45, -0.55, 0.70))) - 0.52 + 0.10*(f1 - 0.5);',
        '  float cur = (gs(w1/0.011) + 0.20*gs(w1/0.06) + 0.55*gs(w2/0.022) + 0.25*gs(w2/0.08))*(0.30 + 0.90*smoothstep(0.38, 0.62, f1))*body*calm*bm;',
        '  float fold = smoothstep(0.0, 0.20, w1)*exp(-max(w1, 0.0)*5.0);',
        '  vec3 ir = irid((0.50*core - 0.24*smoothstep(0.0, 0.9, -sn.y)*(1.0 - core))*calm + 0.13*(f2 - 0.5) + 0.04*sin(6.2831853*uPh2.y));',
        '  ir = max(mix(vec3(dot(ir, vec3(0.299,0.587,0.114))), ir, 1.45), 0.0);',
        '  ir = mix(ir, uTi.rgb, uCb.w*body);',
        '  vec3 col = ir*(0.60 + 1.05*core + 0.35*fold + 0.45*(smoothstep(0.2, 0.8, f2) - 0.5))*(0.62 + 0.55*uL.x)*uL.w*mix(0.05, 1.0, body)*bm',
        '           + irid(0.62 + 0.4*core)*cur*0.55 + uAm.rgb*(1.0 - body*bm) + vec3(0.012);',
      ])],
      [ONB_RIM, J([
        '  float frT = pow(1.0 - z, 8.0);',
        '  col += rimC*(frT*1.8 + fr*0.06)*rh;',
        '  col += rimC*0.14*gs((rr - 0.93)*40.0)*rh;',
      ])],
      [ONB_FIN, '  col *= mix(0.70 + 0.30*z, 1.0, frT*clamp(rh, 0.0, 1.0));'],
    ],
  },
];
