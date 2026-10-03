
/* ============================================================
   The glass (§4). Raw WebGL1, one fullscreen triangle, scissored.
   Every phase is integrated in JS; the GLSL never multiplies
   a time value by a state value.
   ============================================================ */
var VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
var FS = [
'#ifdef GL_FRAGMENT_PRECISION_HIGH',
'precision highp float;',
'#else',
'precision mediump float;',
'#endif',
'uniform vec4 uG;   /* cx, cy, r (px), breath */',
'uniform vec4 uL;   /* energy, voice, glow, irid */',
'uniform vec4 uB;   /* birth, rim hardness, specular, haptic */',
'uniform vec4 uPh;  /* twist, twistOsc, flow, drift */',
'uniform vec4 uPh2; /* rot, iridPh, dither seed, listen iridescence */',
'uniform vec4 uD;   /* swirl, sep, braid front, exposure */',
'uniform vec4 uNA; uniform vec4 uNR; uniform vec4 uNC; /* node: angle, radius, glow, direction */',
'uniform vec4 uCur; /* flowA, flowR, cio rotation, reduced-motion bands */',
'uniform vec4 uFl;  /* filament radius, alpha, angle, flood front */',
'uniform vec4 uV;   /* verdict rgb, flood amount */',
'uniform vec4 uVC;  /* core rgb, scrim */',
'uniform vec4 uSh;  /* shock radius, alpha, bottom bulge, pull */',
'uniform vec4 uShC; /* shock rgb, ripple amp */',
'uniform vec4 uRp;  /* ripple angle, ripple phase, emit angle, emit extrusion */',
'uniform vec4 uTi;  /* tint rgb, tint amount (rim/halo) */',
'uniform vec4 uNb;  /* neighbour tint rgb, amount (right sector) */',
'uniform vec4 uXA; uniform vec4 uXB; /* companion: offset x, offset y, side, alpha */',
'uniform vec4 uCo;  /* silhouette, depth, amount, emit width */',
'uniform vec4 uCb;  /* companion backdrop rgb, tint wash */',
'uniform vec4 uLt;  /* light parallax x, y, spark angle, spark amount */',
'uniform vec4 uAm;  /* ambient rgb, pearl merge */',
'uniform vec4 uQ;   /* quality tier: fbm octaves (4 or 3), dispersion on, -, - */',
'uniform sampler2D uTA; uniform sampler2D uTB;',
'float hash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
'float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);',
'  return mix(mix(mix(hash(i),hash(i+vec3(1.0,0.0,0.0)),f.x), mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),',
'             mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x), mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y), f.z); }',
'float fbm(vec3 p){ float s = 0.0; float a = 0.5;',
'  for(int i=0;i<4;i++){',
'    if (float(i) >= uQ.x){ s += a*(1.0 - exp2(float(i) - 4.0)); break; }   /* a skipped octave adds its mean: the tier change never shifts brightness */',
'    s += a*noise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; }',
'  return s; }',
'float fbm2(vec3 p){ return 0.5*noise(p) + 0.25*noise(p*2.03 + vec3(1.7,9.2,3.1)) + 0.125; }',
'vec3 irid(float x){ x = fract(x);',
'  vec3 c1 = vec3(0.30,0.42,1.00); vec3 c2 = vec3(0.60,0.36,1.00); vec3 c3 = vec3(1.00,0.43,0.78); vec3 c4 = vec3(0.36,0.88,1.00);',
'  vec3 c = mix(c1, c2, smoothstep(0.0,0.25,x)); c = mix(c, c3, smoothstep(0.25,0.5,x)); c = mix(c, c4, smoothstep(0.5,0.75,x)); c = mix(c, c1, smoothstep(0.75,1.0,x));',
'  return mix(c, vec3(dot(c, vec3(0.299,0.587,0.114))), 0.2); }',
'mat2 rot(float a){ float c = cos(a); float s = sin(a); return mat2(c,-s,s,c); }',
'float iso(float v, float w){ return 1.0 - smoothstep(0.0, w, abs(v-0.5)); }',
'float adiff(float a, float b){ float d = a - b; return atan(sin(d), cos(d)); }',
'float gs(float x){ return exp(-x*x); }',
'float h2(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }',
'vec3 node(vec4 N, vec2 pp, float rr, float ang, vec3 c){',
'  vec2 pos = N.y*vec2(cos(N.x), sin(N.x)); vec2 dv = pp - pos;',
'  float head = exp(-dot(dv,dv)*900.0);',
'  float dr = rr - N.y; float db = adiff(N.x, ang)*N.w;',
'  float tr = step(0.0, db)*(1.0 - smoothstep(0.45, 0.6, db))*exp(-dr*dr*400.0)*exp(-db*6.0);',
'  return c*(head*1.5 + tr*0.65)*N.z; }',
'vec4 comp(sampler2D T, vec4 X, vec2 q, float z, float bias){',
'  vec2 uv = (q - X.xy)/max(X.z, 0.01); uv = vec2(0.5 + uv.x, 0.5 - uv.y);',
'  float inb = step(0.0, uv.x)*step(uv.x, 1.0)*step(0.0, uv.y)*step(uv.y, 1.0);',
'  vec2 cd = normalize(q + vec2(1e-4))*0.006*(1.0 - z);',
'  vec4 c = texture2D(T, clamp(uv, 0.0, 1.0), bias);',
'  if (uQ.y > 0.5){ c.r = texture2D(T, clamp(uv + cd, 0.0, 1.0), bias).r; c.b = texture2D(T, clamp(uv - cd, 0.0, 1.0), bias).b; }',
'  c.a *= inb*X.w; return c; }',
'vec3 unTone(vec3 c){ return -log(1.0 - min(c, vec3(0.955)))/1.3; }',
'void main(){',
'  vec2 p = (gl_FragCoord.xy - uG.xy)/uG.z;',
'  float rho = length(p); float ang = atan(p.y, p.x);',
'  float sb = max(0.0, -sin(ang));',
'  float e = 1.0 + 0.009*uG.w + 0.015*uB.w;',
'  e += uSh.z*sb*sb*sb;',
'  float da = adiff(ang, uRp.x);',
'  e += uShC.w*exp(-abs(da)*0.44)*sin(8.0*da - uRp.y);',
'  float de = adiff(ang, uRp.z)/max(uCo.w, 0.05);',
'  e += uRp.w*exp(-de*de);',
'  e += uSh.w*sb*sb*sb*sb;',
'  float d = rho/e;',
'  if (d > 1.8){ gl_FragColor = vec4(0.0); return; }',
'  float aa = 1.4/uG.z;',
'  float dith = (h2(gl_FragCoord.xy + fract(uPh2.z)*61.0) - 0.5)/255.0;',
'  float fl = uV.w*smoothstep(0.0, 1.0, uFl.w);',
'  vec3 hc = mix(irid(ang*0.159 + uPh2.y*3.0), uV.rgb, fl);',
'  hc = mix(hc, uTi.rgb, uTi.w);',
'  float hal = exp(-max(d - 1.0, 0.0)*4.0)*min(0.35, 0.20 + 0.05*uG.w + 0.25*uL.y)*uL.z;',
'  hal *= 1.0 - smoothstep(1.45, 1.8, d);',
'  hal = max(hal + dith, 0.0);',
'  vec4 outside = vec4(hc*hal, hal);',
'  if (d > 1.0 + aa){ gl_FragColor = outside; return; }',
'  vec2 pp = p/e; float r2 = min(dot(pp,pp), 1.0); float rr = sqrt(r2); float z = sqrt(1.0 - r2);',
'  float tw = uD.x*((1.3 - rr)*0.8*sin(uPh.y) + uPh.x);',
'  vec2 q = rot(tw)*pp;',
'  vec3 n = vec3(q*(1.0 + 0.45*(1.0 - z)), z*0.9);',
'  n.xz = rot(uPh2.x)*n.xz;',
'  float f1 = fbm(n*1.3 + vec3(0.0, 0.0, uPh.w));',
'  float f2 = fbm(n*2.2 + vec3(f1*2.4, f1*1.2, uPh.w*0.64));',
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
'  col += vec3(0.36,0.88,1.0)*uPh2.w*0.35*dens*(1.0 - smoothstep(-0.9, 0.15, pp.y));',
'  col += vec3(1.0,0.97,0.92)*0.6*(1.0 - uB.x)*step(0.001, uB.x)*gs((rr - uB.x*1.1)/0.05);',
'  vec3 m = n*1.7;',
'  if (uD.x > 0.002){',
'    float sep = uD.y;',
'    float sA = fbm2(m*0.9 + vec3(0.0, -uCur.x, 0.0) + vec3(3.1,1.7,0.4)*sep);',
'    float sR = fbm(m*1.25 + vec3(uCur.y, uCur.y*0.4, 0.0) + vec3(-2.3,4.1,1.9)*sep);',
'    vec2 dir = normalize(pp + vec2(1e-4));',
'    float hA = mix(1.0, smoothstep(-0.55, 0.85, dot(dir, vec2(-0.7, 0.7))), sep);',
'    float hR = mix(1.0, smoothstep(-0.55, 0.85, dot(dir, vec2(0.7, 0.7))), sep);',
'    vec3 nc = n; nc.xz = rot(uCur.z)*nc.xz;',
'    float by = -0.35*sep + 0.07*sin(nc.x*3.0 + nc.z*2.0);',
'    float sC = fbm2(nc*1.6 + vec3(0.0, 0.0, uCur.z*0.5));',
'    float bC = gs((pp.y - by - (sC - 0.5)*0.22)/0.06)*(0.35 + 0.65*smoothstep(0.35, 0.7, sC));',
'    float hC = mix(1.0, 1.0 - smoothstep(0.2, 0.9, pp.y), sep);',
'    float vis = smoothstep(0.0, 0.35, sep);',
'    vec3 cc = vec3(0.247,0.878,0.710)*(iso(sA, 0.045) + 0.28*iso(sA, 0.16))*hA*vis',
'            + vec3(1.0,0.353,0.373)*(iso(sR, 0.028) + 0.30*iso(sR, 0.12))*hR*vis',
'            + vec3(0.965,0.725,0.306)*(bC*0.6 + 0.12*gs((pp.y - by)/0.22))*hC*vis;',
'    vec3 bands = vec3(0.247,0.878,0.710)*smoothstep(0.3,0.9,dot(dir,vec2(-0.87,0.5))) + vec3(1.0,0.353,0.373)*smoothstep(0.3,0.9,dot(dir,vec2(0.87,0.5))) + vec3(0.965,0.725,0.306)*smoothstep(0.3,0.9,-dir.y);',
'    cc = mix(cc, bands*0.35*bm, uCur.w);',
'    float sM = fbm2(m + vec3(uCur.x*0.5, 0.0, uCur.y*0.2));',
'    cc += vec3(0.91,0.87,0.82)*(iso(sM, 0.05) + 0.25*iso(sM, 0.18))*uAm.w;',
'    col = mix(col, col*0.45, uD.x*0.5);',
'    col += cc*uD.x*(0.85 + 0.8*uL.x);',
'    col += node(uNA, pp, rr, ang, vec3(0.247,0.878,0.710)) + node(uNR, pp, rr, ang, vec3(1.0,0.353,0.373)) + node(uNC, pp, rr, ang, vec3(0.965,0.725,0.306));',
'  }',
'  float fm = (1.0 - smoothstep(uFl.w - 0.12, uFl.w, rr))*uV.w;',
'  if (uD.z > 0.002){',
'    float sB = fbm2(m*1.1 + vec3(uPh.z*0.5, -uPh.z*0.3, 0.0));',
'    float br = iso(sB, 0.05) + 0.3*iso(sB, 0.18);',
'    float bk = (1.0 - smoothstep(uD.z - 0.12, uD.z, rr))*(1.0 - fm);',
'    col = mix(col, col*0.5, bk*0.6);',
'    col += vec3(0.91,0.87,0.82)*br*bk*0.42*(0.8 + 0.6*uL.x);',
'    col += vec3(0.91,0.87,0.82)*0.5*gs((rr - uD.z)/0.03)*smoothstep(0.03, 0.15, uD.z)*(1.0 - smoothstep(0.9, 1.1, uD.z));',
'  }',
'  if (uFl.y > 0.002){',
'    float fil = gs((rr - uFl.x)/0.012);',
'    float fa = 0.35 + 0.65*pow(0.5 + 0.5*cos(adiff(ang, uFl.z)), 6.0);',
'    col += vec3(0.965,0.725,0.306)*fil*fa*uFl.y*1.3;',
'  }',
'  col = mix(col, uV.rgb*(0.16 + dens*0.72) + col*0.22, 0.62*fm);',
'  col += uV.rgb*0.45*gs((rr - uFl.w)/0.035)*uV.w*smoothstep(0.03, 0.15, uFl.w)*(1.0 - smoothstep(0.85, 1.1, uFl.w));',
'  col = mix(col, uVC.rgb, uVC.w*(1.0 - smoothstep(0.52, 0.93, rr)));   /* the core scrim of the core loop: verdict word >= 12:1 (§7.26) */',
'  float fr = pow(1.0 - z, 2.4);',
'  if (uCo.z > 0.002){',
'    float dep = uCo.y; float sil = uCo.x;',
'    float lens = 1.0/(1.0 + 0.35*(1.0 - z));',
'    vec2 qq = pp*lens + n.xy*0.03*dep;',
'    float bias = 3.0*dep;',
'    col = mix(col, uCb.rgb*0.9, 0.9*uCo.z*(1.0 - sil)*(1.0 - smoothstep(0.55, 0.85, rr))*max(uXA.w, uXB.w));',
'    vec4 ta = comp(uTA, uXA, qq, z, bias); vec4 tb = comp(uTB, uXB, qq, z, bias);',
'    float k = uCo.z*(1.0 - fr);',
'    vec2 fa2 = (qq - uXA.xy - vec2(0.0, -uXA.z*0.40))/(uXA.z*vec2(0.30, 0.05));',
'    col += vec3(1.0,0.97,0.92)*0.12*exp(-dot(fa2,fa2))*uXA.w*(1.0 - sil)*uCo.z;',
'    col = mix(col, unTone(ta.rgb), ta.a*k*(1.0 - sil));',
'    col = mix(col, unTone(tb.rgb), tb.a*k*(1.0 - sil));',
'    float la = dot(ta.rgb, vec3(0.299,0.587,0.114)); float lb = dot(tb.rgb, vec3(0.299,0.587,0.114));',
'    col += vec3(1.0,0.953,0.886)*(ta.a*(0.25 + 0.75*smoothstep(0.05, 0.6, la)) + tb.a*(0.25 + 0.75*smoothstep(0.05, 0.6, lb)))*k*sil;',
'  }',
'  vec3 rimC = mix(vec3(0.80,0.85,1.0), mix(uV.rgb, vec3(1.0), 0.3), fl*0.7);',
'  rimC = mix(rimC, uTi.rgb, uTi.w);',
'  float rh = uB.y*(1.0 + 0.08*uB.w);',
'  float frT = pow(1.0 - z, 8.0);',
'  col += rimC*(frT*1.8 + fr*0.06)*rh;',
'  col += rimC*0.14*gs((rr - 0.93)*40.0)*rh;',
'  float ia = ang*0.159 + uPh2.y*3.0;',
'  if (uQ.y > 0.5){ col.r += fr*0.10*irid(ia + 0.02).r*rh; col.b += fr*0.10*irid(ia - 0.02).b*rh; }',
'  col += irid(ia)*pow(1.0 - z, 7.0)*0.7*(1.0 - 0.6*fl)*rh;',
'  col += uNb.rgb*fr*0.45*uNb.w*(1.0 - smoothstep(0.35, 0.55, abs(adiff(ang, 0.0))));',
'  vec2 ruv = pp + n.xy*0.06;',
'  col += uAm.rgb*0.08*(1.0 - smoothstep(0.2, 1.3, length(ruv - vec2(0.0, 0.1))));',
'  col += vec3(1.0)*uLt.w*gs(adiff(ang, uLt.z)/0.03)*smoothstep(0.93, 1.0, rr);',
'  vec2 L = vec2(-0.36, 0.46) + uLt.xy; vec2 hp = pp - L; float hd = dot(hp,hp);',
'  vec2 hq = pp + 0.85*L;',
'  float spc = exp(-hd*420.0)*0.9*(1.0 + 0.4*uL.y) + exp(-hd*28.0)*0.25 + exp(-dot(hq,hq)*900.0)*0.25;',
'  col += vec3(1.0)*spc*uB.z;',
'  float cr = (rr - 0.82)*9.0;',
'  col += mix(ir, uV.rgb, fl)*exp(-cr*cr)*(1.0 - smoothstep(-0.95, -0.15, pp.y))*0.5*bm;',
'  col += uShC.rgb*uSh.y*gs((rr - uSh.x)/0.025);',
'  col = 1.0 - exp(-col*1.3*(1.0 + uD.w));',
'  col *= mix(0.70 + 0.30*z, 1.0, frT*clamp(rh, 0.0, 1.0));',
'  col += dith;',
'  float edge = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);',
'  gl_FragColor = mix(outside, vec4(col, 1.0), edge);',
'}'
].join('\n');

var cv = $('gl'), gl = null, glCtx = null, prog = null, loc = {}, KPX = 1;   /* gl: the live context, null while lost */
/* quality tiers (iPhone: DPR 3 screens, thermal limits). Cheapest last: resolution first, then detail. */
var DEV_DPR = window.devicePixelRatio || 1, QT = [];
[1.75, 1.5, 1.25, 1.0].forEach(function(d){ var e = Math.min(DEV_DPR, d); if (!QT.length || QT[QT.length - 1].dpr > e + 1e-3) QT.push({ dpr:e, oct:4, disp:1 }); });
(function(){ var lo = QT[QT.length - 1].dpr; QT.push({ dpr:lo, oct:3, disp:1 }, { dpr:lo, oct:3, disp:0 }); })();
var QPIN = Q.q != null && Q.q !== '' ? clamp(parseInt(Q.q, 10) || 0, 0, QT.length - 1) : null;
var QI = QPIN != null ? QPIN : 0, DPR = QT[QI].dpr;
var UN = ['uG','uL','uB','uPh','uPh2','uD','uNA','uNR','uNC','uCur','uFl','uV','uVC','uSh','uShC','uRp','uTi','uNb','uXA','uXB','uCo','uCb','uLt','uAm','uQ','uTA','uTB'];
try { glCtx = cv.getContext('webgl', { alpha:true, premultipliedAlpha:true, antialias:false, preserveDrawingBuffer:false }) || cv.getContext('experimental-webgl'); } catch(e){ glCtx = null; }
function mkSh(type, src){ var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)){ try { console.warn(gl.getShaderInfoLog(s)); } catch(e){} return null; } return s; }
/* (re)build the program, the full-screen triangle and the uniform table on glCtx (at boot and after a context restore);
   gl stays null unless all of it worked, so every draw path falls back to the 2D sphere */
function glBuild(){
  gl = glCtx; prog = null;
  if (!gl || (gl.isContextLost && gl.isContextLost())){ gl = null; return false; }
  var vsh = mkSh(gl.VERTEX_SHADER, VS), fsh = mkSh(gl.FRAGMENT_SHADER, FS);
  if (vsh && fsh){ prog = gl.createProgram(); gl.attachShader(prog, vsh); gl.attachShader(prog, fsh); gl.linkProgram(prog); if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) prog = null; }
  if (!prog){ gl = null; return false; }
  gl.useProgram(prog);
  var vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var al = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
  loc = {}; UN.forEach(function(n){ loc[n] = gl.getUniformLocation(prog, n); });
  gl.uniform1i(loc.uTA, 0); gl.uniform1i(loc.uTB, 1);
  gl.clearColor(0, 0, 0, 0);
  return true;
}
glBuild();
if (!gl) stage.classList.add('nogl');

/* textures: one 256² mipmapped matte per companion, plus a transparent 1×1 placeholder */
var TEX0 = null;
function blankTex(){ var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([42, 42, 42, 0])); return t; }
function uploadTex(c){
  if (!gl || !c.mid) return;
  var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c.mid);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.generateMipmap(gl.TEXTURE_2D);
  c.tex = t;
}
if (gl){ TEX0 = blankTex(); }
/* WebGL context loss (iOS Safari: app switch, lock screen, memory pressure). Without preventDefault WebKit never gives
   the context back and the sphere stays frozen on its last frame for good. While lost, gl is null and the 2D fallback
   draws; on restore the program, TEX0 and every companion matte are rebuilt on the new context and the canvas re-sized. */
if (glCtx){
  cv.addEventListener('webglcontextlost', function(e){ e.preventDefault(); gl = null; stage.classList.add('nogl'); }, false);
  cv.addEventListener('webglcontextrestored', function(){
    if (glBuild()){ TEX0 = blankTex(); ART_LIST.forEach(function(c){ c.tex = null; uploadTex(c); }); sizeGL(); qReset(); stage.classList.remove('nogl'); }
    else stage.classList.add('nogl');
    try { renderAll(); } catch(e){}
  }, false);
}

function sizeGL(){
  KPX = DPR * FIT;
  var w = Math.max(1, Math.round(390 * KPX)), h = Math.max(1, Math.round(844 * KPX));
  if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; }
  KPX = w / 390;
}
var FIT = 1, FIT_W = -1, FIT_H = -1, FIT_X = 0, FIT_Y = 0, fitChk = 0;   /* FIT_W/H: the window size the transform was computed for */
function fit(){
  var w = window.innerWidth, h = window.innerHeight; FIT_W = w; FIT_H = h;
  var s = Math.min(w / 390, h / 844) || 1; FIT = s;
  var x = (w - 390 * s) / 2, y = (h - 844 * s) / 2;
  FIT_X = x; FIT_Y = y;
  stage.style.transform = 'translate(' + x.toFixed(2) + 'px,' + y.toFixed(2) + 'px) scale(' + s + ')';
  stage.classList.toggle('lbx-x', x > 0.5); stage.classList.toggle('lbx-y', y > 0.5);   /* letterbox feather (#lbx) */
  if (gl) sizeGL();
}
/* iOS Safari can run this before its toolbar is laid out (innerHeight 956, then 796 on a Pro Max) and report the change
   only as a visualViewport resize, never a window resize, leaving the stage oversized with the pill under the toolbar.
   Refit on every viewport signal; the loop also re-checks the window size twice a second as a backstop. */
function refit(){ if (window.innerWidth !== FIT_W || window.innerHeight !== FIT_H) fit(); }
fit(); window.addEventListener('resize', fit);
window.addEventListener('orientationchange', refit); window.addEventListener('pageshow', refit);
try { if (window.visualViewport) window.visualViewport.addEventListener('resize', refit); } catch(e){}

/* ---------- adaptive quality ----------
   Signal: the rolling median of the frame interval (31 frames), so one hitch never moves it.
   Down: median over budget for 1.5 s (0.75 s when it is 1.5x over) → one tier down (DPR 1.75 → 1.5 → 1.25 → 1.0,
   then 3 fbm octaves, then no dispersion). Up: headroom for the tier's back-off → one tier up.
   Budget: > 20 ms is over, ≤ 17.5 ms is headroom (holding 60 Hz), and 17.5–20 ms is a dead band where neither counter
   runs. Never oscillate, never stuck: the back-off before retrying a tier starts at 5 s and grows ×4 each time that tier
   fails (5, 20, 80 s …), so a GPU-bound phone settles after at most two short retries, while a transient slowdown
   (a notification, a thermal spike) can always climb back.
   Not GPU-bound (a plateau): if the lowest tier is still over budget and a better tier of this descent was just as
   fast (its median ≤ 1.1× the lowest's), cutting pixels bought nothing: rAF is capped (iOS Low Power Mode runs it at
   30 Hz), the main thread is busy, or the frame is vsync-quantised. Then the best such tier comes back and that
   interval becomes the budget (over > 1.2×, headroom ≤ 1.05×) until it lifts (median < 0.75× the cap). A cap is a
   belief, so it is re-tested: one tier down after 20 s, then 80 s, 320 s …; if that tier is faster the cap lifts.
   Never stuck at the bottom: over budget on the lowest tier with no such evidence (it settled there, then the phone
   got capped or hotter), one tier up is re-tried on the same back-off; if it is no slower, it is a plateau (above).
   Samples are ignored for the first 2 s, while hidden, off-screen, frozen, right after a tier change (0.5 s grace) and above 250 ms
   (a stalled or throttled tab is not a GPU signal).
   ?q=<n> pins a tier; ?t=&freeze=1 frames stay on tier 0 (or ?q=). */
var QN = 31, qBuf = new Float32Array(QN), qTmp = new Float32Array(QN), qCnt = 0, qHead = 0, qOver = 0, qRoom = 0, qGrace = 2, qFail = [0, 0, 0, 0, 0, 0, 0], qMed = 0;   /* first 2 s ignored: page load (18 mattes are built on the main thread) is not a GPU signal */
var qCap = 0, qTop = -1, qAt = [0, 0, 0, 0, 0, 0, 0], qCalm = 0, qProbeT = 0, qProbeN = 0, qStuck = 0;   /* plateau budget (ms, 0 = none); the tier a
   descent started from (-1 once it has settled); the median each tier was left at; time within budget; cap re-test clock;
   time spent over budget on the lowest tier */
function qReset(){ qCnt = 0; qHead = 0; qOver = 0; qRoom = 0; qCalm = 0; qStuck = 0; qGrace = 0.5; }
function setQuality(i){
  i = clamp(i | 0, 0, QT.length - 1); if (i === QI && DPR === QT[i].dpr) return;
  QI = i; DPR = QT[i].dpr; if (gl) sizeGL(); qReset();
}
function median(buf, n, tmp){   /* insertion sort into a preallocated scratch: no allocation */
  for (var i = 0; i < n; i++){ var v = buf[i], j = i - 1; while (j >= 0 && tmp[j] > v){ tmp[j + 1] = tmp[j]; j--; } tmp[j + 1] = v; }
  return tmp[n >> 1];
}
function qSample(ms, dt){
  if (!gl || QPIN != null) return;
  if (qGrace > 0){ qGrace -= dt; return; }
  if (ms > 250 || ms <= 0) return;
  qBuf[qHead] = ms; qHead = (qHead + 1) % QN; if (qCnt < QN) qCnt++;
  if (qCnt < 15) return;
  var med = qMed = median(qBuf, qCnt, qTmp);
  if (qCap && med < 0.75 * qCap) qCap = 0;                       /* the cap lifted (Low Power Mode off): back to 60 Hz */
  var hi = Math.max(20, 1.2 * qCap), lo = Math.max(17.5, 1.05 * qCap);
  if (med > hi){
    qRoom = 0; qCalm = 0; qOver += dt;
    if (qOver < (med > 1.5 * hi ? 0.75 : 1.5)) return;
    qOver = 0;
    if (QI < QT.length - 1){
      if (qTop < 0) qTop = QI;                                       /* a descent starts here */
      qAt[QI] = med; qFail[QI]++; setQuality(QI + 1);
    } else {                                                          /* lowest tier, still over: was a better tier as fast? */
      var j = qTop < 0 ? QI : qTop; while (j < QI && qAt[j] > 1.1 * med) j++;
      if (j < QI){ qCap = med; for (var i = j; i < qFail.length; i++) qFail[i] = 0; qTop = -1; qProbeT = 0; qProbeN = 0; setQuality(j); }
      else if (QI > 0){                                               /* no evidence yet: look one tier up now and then (back-off) */
        qStuck += med > 1.5 * hi ? 0.75 : 1.5;
        if (qStuck >= 5 * Math.pow(4, Math.max(0, qFail[QI - 1] - 1))){ qStuck = 0; qTop = -1; setQuality(QI - 1); }
      }
    }
  } else {
    qOver = 0; qCalm += dt; if (qCalm >= 1.5) qTop = -1;             /* the descent has settled */
    if (qCap && QI < QT.length - 1){                                  /* re-test the cap one tier down (never counts as a failure) */
      qProbeT += dt; if (qProbeT >= 20 * Math.pow(4, qProbeN)){ qProbeT = 0; qProbeN++; setQuality(QI + 1); return; }
    }
    if (med <= lo && QI > 0){
      qRoom += dt;
      if (qRoom >= 5 * Math.pow(4, Math.max(0, qFail[QI - 1] - 1))){ qTop = -1; setQuality(QI - 1); }
    } else qRoom = 0;
  }
}
