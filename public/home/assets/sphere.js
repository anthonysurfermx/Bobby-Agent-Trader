/* Bobby Núcleo glass — shader copied verbatim from nucleo-v2 (iOS 1.5 build 40). */
(function(){
'use strict';
var VS = 'attribute vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
var FS = [
'#ifdef GL_FRAGMENT_PRECISION_HIGH',
'precision highp float;',
'#else',
'precision mediump float;',
'#endif',
'uniform vec2 uC; uniform float uR;',
'uniform float uBreath; uniform float uGlobal; uniform vec2 uLean; uniform vec3 uRipple; uniform vec3 uEmit[4]; uniform vec2 uPull;',
'uniform float uEnergy; uniform float uVoice; uniform float uGlow; uniform float uIrid; uniform float uListenIr;',
'uniform float uTwist; uniform float uTwistOsc; uniform float uFlow; uniform float uDrift; uniform float uRot; uniform float uIridPh; uniform float uCioRot;',
'uniform float uSwirlAmt; uniform vec3 uNodes[3]; uniform vec3 uNodeDir; uniform float uSep; uniform float uBraid; uniform vec3 uFil;',
'uniform float uFlood; uniform vec3 uV; uniform float uScrim; uniform vec3 uVCore; uniform vec2 uShock; uniform vec3 uShockC; uniform float uExposure;',
'uniform vec3 uTint; uniform float uTintAmt; uniform float uTintWash; uniform vec4 uNeighL; uniform vec4 uNeighR;',
'uniform sampler2D uComp; uniform float uCompMode; uniform float uCompDepth; uniform float uCompAmt; uniform vec3 uCompBg; uniform vec4 uCompXf;',
'uniform vec2 uLight; uniform vec3 uAmb; uniform vec2 uSpark; uniform float uRimBoost; uniform float uSeed; uniform float uStatic;',
'uniform float uOct; uniform float uDisp;',
'float hash(vec3 p){ p = fract(p*0.3183099 + vec3(0.1,0.2,0.3)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
'float hash2(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }',
'float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);',
'  return mix(mix(mix(hash(i),hash(i+vec3(1.0,0.0,0.0)),f.x), mix(hash(i+vec3(0.0,1.0,0.0)),hash(i+vec3(1.0,1.0,0.0)),f.x),f.y),',
'             mix(mix(hash(i+vec3(0.0,0.0,1.0)),hash(i+vec3(1.0,0.0,1.0)),f.x), mix(hash(i+vec3(0.0,1.0,1.0)),hash(i+vec3(1.0,1.0,1.0)),f.x),f.y), f.z); }',
   /* quality tier: uOct octaves (4, or 3 under thermal pressure); the skipped octaves add their mean, so levels hold */
'float fbm(vec3 p){ float s = 0.0; float a = 0.5; for (int i = 0; i < 4; i++){ if (float(i) >= uOct) break; s += a*noise(p); p = p*2.03 + vec3(1.7,9.2,3.1); a *= 0.5; } return s + 0.5*(2.0*a - 0.0625); }',
'vec3 irid(float x){ x = fract(x);',
'  vec3 c1 = vec3(0.30,0.42,1.00); vec3 c2 = vec3(0.60,0.36,1.00); vec3 c3 = vec3(1.00,0.43,0.78); vec3 c4 = vec3(0.36,0.88,1.00);',
'  vec3 c = mix(c1, c2, smoothstep(0.0,0.25,x)); c = mix(c, c3, smoothstep(0.25,0.5,x)); c = mix(c, c4, smoothstep(0.5,0.75,x)); c = mix(c, c1, smoothstep(0.75,1.0,x));',
'  return mix(vec3(dot(c, vec3(0.299,0.587,0.114))), c, 0.8); }',
'mat2 rot(float a){ float c = cos(a); float s = sin(a); return mat2(c,-s,s,c); }',
'float iso(float v, float w){ return 1.0 - smoothstep(0.0, w, abs(v-0.5)); }',
'float adiff(float a, float b){ float d = a - b; return atan(sin(d), cos(d)); }',
'float sq(float x){ return x*x; }',
'void main(){',
'  vec2 p = (gl_FragCoord.xy - uC)/uR;',
'  float rho = length(p);',
'  if (rho > 1.95){ gl_FragColor = vec4(0.0); return; }',
'  float ang = atan(p.y, p.x + 1e-6);',
'  float sa = p.y/max(rho, 1e-4);',
   /* silhouette: rigid at rest, locally elastic only where something is exchanged */
'  float loc = uLean.y*pow(max(0.0,-sa),3.0);',
'  float dR = adiff(ang, uRipple.x);',
'  loc += uRipple.y*exp(-abs(dR)*0.44)*sin(8.0*abs(dR) - uRipple.z);',
'  for (int i = 0; i < 4; i++){ float de = adiff(ang, uEmit[i].x)/max(uEmit[i].z, 0.01); loc += uEmit[i].y*exp(-de*de); }',
'  loc += uPull.y*pow(max(0.0,-sa),4.0);',
'  float edge = 1.0 + 0.009*uBreath + uGlobal + loc;',
'  float d = rho/edge;',
'  float aa = 1.5/uR;',
'  float dith = (hash2(gl_FragCoord.xy + fract(uSeed)*61.0) - 0.5)/255.0;',
   /* halo */
'  vec3 hc = mix(irid(ang*0.159 + uIridPh), uV, uFlood);',
'  hc = mix(hc, uTint, uTintAmt);',
'  float hk = min(0.35, 0.20 + 0.05*uBreath + 0.25*uVoice)*uGlow;',
'  float halo = exp(-max(d-1.0,0.0)*4.0)*hk*(1.0 - smoothstep(1.5, 1.8, d));',
'  halo = max(0.0, halo + dith*2.0);',
'  vec4 outside = vec4(hc*halo, halo);',
'  if (d > 1.0 + aa){ gl_FragColor = outside; return; }',
'  vec2 pp = p/edge;',
'  float r2 = min(dot(pp,pp), 1.0);',
'  float z = sqrt(1.0 - r2);',
'  float rr = sqrt(r2);',
   /* interior */
'  float tw = (1.0 - uStatic)*(uSwirlAmt*(1.3 - rr)*2.4*sin(uTwistOsc) + uTwist);',
'  vec2 q = rot(tw)*pp;',
'  vec3 n = vec3(q*(1.0 + 0.45*(1.0 - z)), z*0.9);',
'  n.xz = rot(uRot)*n.xz;',
'  float f1 = fbm(n*1.3 + vec3(0.0, 0.0, uDrift));',
'  float f2 = fbm(n*2.2 + vec3(f1*2.4, f1*1.2, uDrift*0.64));',
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
'  col += vec3(0.36,0.88,1.0)*uListenIr*0.35*dens*smoothstep(0.15,-0.85,pp.y);',
'  col = mix(col, uTint*(0.10 + 0.55*dens), uTintWash*body);',
   /* the debate: three currents, three nodes, one braid */
'  if (uSwirlAmt > 0.002 || uBraid > 0.002){',
'    vec3 m = n*1.7;',
'    vec3 cm = vec3(uFlow*0.30, uFlow*0.10, 0.0);',
'    float sp = uSep;',
'    float sA = fbm(m*mix(0.66,0.78,sp) + cm + sp*(vec3(3.1,1.7,0.4) + vec3(0.0,-0.8,0.25)*uFlow));',
'    float sR = fbm(m*mix(0.66,1.35,sp) + cm + sp*(vec3(-2.3,4.1,1.9) + vec3(1.1,0.45,-0.9)*uFlow));',
'    float sC = fbm(m*mix(0.66,0.9,sp) + cm + sp*(vec3(0.7,-3.3,2.6) + vec3(uCioRot,0.0,0.0)));',
'    vec3 cA = vec3(0.247,0.878,0.710); vec3 cR = vec3(1.0,0.353,0.373); vec3 cC = vec3(0.965,0.725,0.306);',
'    vec2 hA0 = pp - vec2(-0.45,0.40); vec2 hR0 = pp - vec2(0.45,0.40);',
'    float hA = mix(1.0, exp(-dot(hA0,hA0)*2.4), sp);',
'    float hR = mix(1.0, exp(-dot(hR0,hR0)*2.4), sp);',
'    float yC = pp.y + 0.35 + 0.16*(sC - 0.5);',
'    float bandC = 1.0 - smoothstep(0.0, 0.07, abs(yC));',
'    float glowC = 1.0 - smoothstep(0.0, 0.22, abs(yC));',
'    float wA = mix(0.04, 0.045, sp); float wR = mix(0.04, 0.028, sp);',
'    vec3 cur = cA*(iso(sA,wA) + 0.28*iso(sA,0.16))*hA',
'             + cR*(iso(sR,wR) + 0.28*iso(sR,0.13))*hR',
'             + cC*mix(iso(sC,0.04) + 0.28*iso(sC,0.16), bandC*0.72 + glowC*0.16, sp);',
'    if (uStatic > 0.5){',
'      float a0 = adiff(ang, 2.44); float a1 = adiff(ang, 0.70); float a2 = adiff(ang, -1.57);',
'      cur = (cA*exp(-a0*a0*4.0) + cR*exp(-a1*a1*4.0) + cC*exp(-a2*a2*4.0))*0.9*smoothstep(0.15,0.9,rr);',
'    }',
'    float bm = uBraid > 0.002 ? 1.0 - smoothstep(uBraid - 0.10, uBraid, rr) : 0.0;',
'    col += cur*uSwirlAmt*(0.85 + 0.6*uEnergy)*(1.0 - bm)*mix(0.5, 1.0, sp);',
'    for (int i = 0; i < 3; i++){',
'      float g = uNodes[i].z;',
'      if (g > 0.002){',
'        vec2 np = uNodes[i].y*vec2(cos(uNodes[i].x), sin(uNodes[i].x));',
'        vec2 dd = pp - np;',
'        float head = exp(-dot(dd,dd)*520.0) + 0.8*exp(-dot(dd,dd)*2600.0);',
'        float drn = rr - uNodes[i].y;',
'        float beh = adiff(ang, uNodes[i].x)*uNodeDir[i];',
'        float trail = exp(-drn*drn*400.0)*exp(-max(beh,0.0)*6.0)*step(0.0,beh)*(1.0 - smoothstep(0.45,0.6,beh))*smoothstep(0.03,0.14,uNodes[i].y);',
'        vec3 nc = i == 0 ? cA : (i == 1 ? cR : cC);',
'        col += (nc*(head*1.9 + trail*0.75) + vec3(1.0)*exp(-dot(dd,dd)*5200.0)*0.9)*g;',
'      }',
'    }',
'    if (uBraid > 0.002){',
'      vec3 pr = vec3(0.910,0.875,0.816);',
'      vec3 bc = pr*(iso(sA,0.020) + 0.55*iso(sA + 0.085,0.012) + 0.55*iso(sA - 0.085,0.012)) + pr*0.10*iso(sA,0.14);',
'      col = mix(col, col*0.5 + bc*(0.65 + 0.5*uEnergy) + pr*0.035*dens, bm);',
'      col += pr*exp(-sq((rr - uBraid)/0.035))*0.55*(1.0 - smoothstep(0.95, 1.1, uBraid));',
'    }',
'  }',
   /* the amber filament: the tease of the verdict */
'  if (uFil.y > 0.002){',
'    float fr0 = exp(-sq((rr - uFil.x)/0.012));',
'    float beh = mod(uFil.z - ang, 6.2831853);',
'    col += vec3(0.965,0.725,0.306)*fr0*(0.30 + 0.70*exp(-beh*1.1))*uFil.y*1.4;',
'  }',
   /* the verdict flood */
'  if (uFlood > 0.002){',
'    float fm = 1.0 - smoothstep(uFlood - 0.12, uFlood, rr);',
'    vec3 vIn = uV*(0.05 + 0.42*dens*(0.7 + 0.3*z)) + uV*iso(f2, 0.035)*0.30 + col*0.18;',
'    col = mix(col, vIn, fm);',
'    col += uV*exp(-sq((rr - uFlood)/0.04))*0.5*(1.0 - smoothstep(0.95, 1.1, uFlood));',
'  }',
'  col = mix(col, uVCore, uScrim*(1.0 - smoothstep(0.52, 0.93, rr)));',
'  float fr = pow(1.0 - z, 2.4);',
   /* the companion lives inside, drawn before rim and specular so the highlight passes over it */
'  if (uCompMode > 0.5 && uCompXf.w > 0.002){',
'    float side = uCompXf.z;',
'    vec2 cp = pp - vec2(uCompXf.x, uCompXf.y);',
'    float lens = 1.0/(1.0 + 0.35*(1.0 - z));',
'    float sc = mix(1.0, 0.92, uCompDepth);',
'    vec2 uv = vec2(0.5 + cp.x/side*lens/sc, 0.5 - cp.y/side*lens/sc) + n.xy*0.03*uCompDepth;',
'    float bias = 3.0*uCompDepth;',
'    vec4 tx = texture2D(uComp, uv, bias);',
'    float inb = step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0);',
'    float amt = uCompAmt*uCompXf.w;',
'    if (uCompMode < 1.5){',
'      float l = dot(tx.rgb, vec3(0.299,0.587,0.114));',
      /* she occludes what is behind her, so the braid veins stop scribbling across her face */
'      col *= 1.0 - min(0.7, 0.95*tx.a*inb*amt*(1.0 - fr));',
'      col += vec3(1.0,0.953,0.886)*tx.a*inb*(0.25 + 0.75*smoothstep(0.05,0.6,l))*amt*(1.0 - fr);',
'    } else {',
'      float pr = length(cp)/(side*0.62);',
'      col = mix(col, uCompBg, 0.9*amt*(1.0 - smoothstep(0.55, 0.85, pr)));',
'      float cs = 0.006*(1.0 - z);',
'      vec3 tc = tx.rgb;',
'      if (uDisp > 0.5){ tc.r = texture2D(uComp, uv + vec2(cs, 0.0), bias).r; tc.b = texture2D(uComp, uv - vec2(cs, 0.0), bias).b; }',
'      tc = -log(max(vec3(0.001), 1.0 - min(tc, vec3(0.97))))/1.3;',
'      col = mix(col, tc, tx.a*inb*amt*(1.0 - fr));',
'      vec2 fc = cp - vec2(0.0, -0.43*side/1.5);',
'      col += vec3(1.0,0.97,0.9)*0.12*amt*exp(-(fc.x*fc.x*14.0 + fc.y*fc.y*160.0));',
'    }',
'  }',
   /* glass: rim, back-face rim, dispersion, iridescent edge, neighbour sectors */
'  vec3 rimC = mix(vec3(0.80,0.85,1.0), mix(uV, vec3(1.0), 0.3), uFlood*0.7);',
'  rimC = mix(rimC, uTint, uTintAmt);',
'  float frT = pow(1.0 - z, 8.0);',
'  col += rimC*(frT*1.8 + fr*0.06)*(1.0 + uRimBoost);',
'  col += rimC*0.14*exp(-sq((rr - 0.93)*40.0));',
'  float ia = ang*0.159 + uIridPh;',
'  if (uDisp > 0.5){ col.r += fr*0.10*irid(ia + 0.02).r; col.b += fr*0.10*irid(ia - 0.02).b; }',
'  col += irid(ia)*pow(1.0 - z, 7.0)*0.7*(1.0 - 0.6*uFlood);',
'  float wl = 1.0 - smoothstep(0.30, 0.55, abs(adiff(ang, 3.14159265)));',
'  float wr = 1.0 - smoothstep(0.30, 0.55, abs(adiff(ang, 0.0)));',
'  col += uNeighL.rgb*fr*0.45*uNeighL.a*wl + uNeighR.rgb*fr*0.45*uNeighR.a*wr;',
'  col += vec3(1.0,0.97,0.92)*uSpark.y*exp(-sq(adiff(ang, uSpark.x)/0.035))*smoothstep(0.93, 1.0, rr);',
'  col += uAmb*0.08*(0.5 + 0.5*smoothstep(0.3, 1.0, rr));',
   /* fixed light: turning a face moves the contents, never the light */
'  vec2 L = vec2(-0.36, 0.46) + uLight;',
'  vec2 h1 = pp - L; float d1 = dot(h1, h1);',
'  col += vec3(1.0)*exp(-d1*420.0)*0.9*(1.0 + 0.4*uVoice);',
'  col += vec3(1.0)*exp(-d1*28.0)*0.25;',
'  vec2 h2 = pp + 0.85*L; col += vec3(1.0)*exp(-dot(h2,h2)*900.0)*0.25;',
'  float cr = (rr - 0.82)*9.0;',
'  float cau = exp(-cr*cr)*(1.0 - smoothstep(-0.95, -0.15, pp.y));',
'  col += mix(ir, uV, uFlood)*cau*0.5;',
'  col += uShockC*uShock.y*exp(-sq((rr - uShock.x)/0.035));',
'  col = 1.0 - exp(-col*1.3*(1.0 + uExposure));',
'  col *= mix(0.70 + 0.30*z, 1.0, frT);',
'  col += dith;',
'  float e = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);',
'  gl_FragColor = mix(outside, vec4(col, 1.0), e);',
'}'
].join('\n');

/* ---------------------------------------------------------------------------
   BobbySphere — the Núcleo glass from iOS 1.5, as a drop-in web component.
   Usage: const s = BobbySphere.mount(canvasEl, { scale: 1, mode: 'idle' });
          s.set('debate')  |  s.set('verdict', 'wait'|'ready'|'pass')  |  s.set('listen')  |  s.set('idle')
          s.tint('#A7BFE8', .3)   // companion rim tint
   The canvas is sized from its CSS box. The halo reaches ~1.9R, so leave room.
   --------------------------------------------------------------------------- */
function hex(h){ h = h.replace('#',''); return [parseInt(h.substr(0,2),16)/255, parseInt(h.substr(2,2),16)/255, parseInt(h.substr(4,2),16)/255]; }
function invTone(c){ return c.map(function(v){ return -Math.log(1 - Math.min(v, 0.97)) / 1.3; }); }
var COL = { alpha: hex('#3FE0B5'), red: hex('#FF5A5F'), cio: hex('#F6B94E'), pearl: hex('#E8DFD0'),
  ambIdle: hex('#15121C'), core: { wait: invTone(hex('#2A1C08')), ready: invTone(hex('#082A20')), pass: invTone(hex('#2A0C0E')) } };
var VCOL = { wait: COL.cio, ready: COL.alpha, pass: COL.red };
var UNAMES = ['uC','uR','uBreath','uGlobal','uLean','uRipple','uEmit','uPull','uEnergy','uVoice','uGlow','uIrid','uListenIr','uTwist','uTwistOsc','uFlow','uDrift','uRot','uIridPh','uCioRot',
  'uSwirlAmt','uNodes','uNodeDir','uSep','uBraid','uFil','uFlood','uV','uScrim','uVCore','uShock','uShockC','uExposure','uTint','uTintAmt','uTintWash','uNeighL','uNeighR',
  'uComp','uCompMode','uCompDepth','uCompAmt','uCompBg','uCompXf','uLight','uAmb','uSpark','uRimBoost','uSeed','uStatic','uOct','uDisp'];
function breathAt(ph){ var PI = Math.PI, t = ph * 4.8;
  if (t < 1.9) return -Math.cos(PI * t / 1.9); if (t < 2.15) return 1;
  if (t < 4.5){ var u = (t - 2.15) / 2.35, c = u < 0.5 ? 4*u*u*u : 1 - Math.pow(-2*u + 2, 3) / 2; return 1 - 2*c; } return -1; }
var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

function mount(cv, opts){
  opts = opts || {};
  var scale = opts.scale || 1;
  var gl = cv.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl){ cv.style.background = 'radial-gradient(circle, #6a5acd55, transparent 60%)'; return { set: function(){}, tint: function(){} }; }
  function mk(t, src){ var s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s)); return s; }
  var prog = gl.createProgram(); gl.attachShader(prog, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog); gl.useProgram(prog);
  var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  var al = gl.getAttribLocation(prog, 'a'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
  var L = {}; UNAMES.forEach(function(n){ L[n] = gl.getUniformLocation(prog, n); });
  var tex = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0,0,0,0])); gl.uniform1i(L.uComp, 0);
  gl.clearColor(0,0,0,0);

  // targets + current (simple exponential springs)
  var T = { energy: .35, swirl: 0, glow: .35, irid: 1, listen: 0, wflow: .18, braid: 0, flood: 0, scrim: 0, tintAmt: 0, nodes: 0, filA: 0 };
  var X = {}; for (var k in T) X[k] = T[k];
  var V = COL.cio, VC = COL.core.wait, TINT = [0,0,0];
  var P = { twist: 0, twistOsc: 0, flow: 0, drift: 0, rot: 0, iridPh: Math.random(), cio: 0, fil: 0, bph: 0, phi: 0 };
  var light = { x: 0, y: 0, tx: 0, ty: 0 };
  var dpr = Math.min(window.devicePixelRatio || 1, opts.dpr || 1.75);
  /* layout size, not the transformed box: a page may scale/move the canvas with CSS without reallocating the buffer */
  function size(){ var w = Math.max(1, Math.round((cv.clientWidth || 1) * dpr)), h = Math.max(1, Math.round((cv.clientHeight || 1) * dpr)); if (cv.width !== w || cv.height !== h){ cv.width = w; cv.height = h; } }
  window.addEventListener('resize', size); size();
  window.addEventListener('pointermove', function(e){ var r = cv.getBoundingClientRect(); light.tx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width/2)) / (r.width))); light.ty = Math.max(-1, Math.min(1, -(e.clientY - (r.top + r.height/2)) / (r.height))); }, { passive: true });
  var visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(function(es){ visible = es[0].isIntersecting; if (visible) req(); }, { rootMargin: '120px' }).observe(cv);
  var last = performance.now(), raf = 0, t0 = last;
  function req(){ if (!raf) raf = requestAnimationFrame(frame); }
  var emit = new Float32Array(12), nodes = new Float32Array(9), neigh = new Float32Array(4), cxf = new Float32Array(4);
  var TETHER = [-140 * Math.PI/180, -40 * Math.PI/180, 90 * Math.PI/180];
  function frame(now){
    raf = 0; if (!visible) return;
    var h = Math.min(0.05, (now - last) / 1000); last = now; var clk = (now - t0) / 1000;
    var k = 1 - Math.exp(-h / 0.45); for (var n in T) X[n] += (T[n] - X[n]) * k;
    var sh = RM ? 0 : 1;
    P.twist = (P.twist + h*sh*0.5*X.swirl) % 6.2832; P.twistOsc = (P.twistOsc + h*sh*0.8) % 6.2832; P.flow += h*sh*X.wflow;
    P.drift += h*sh*0.11; P.rot = (P.rot + h*sh*0.05) % 6.2832; P.iridPh = (P.iridPh + h*sh*0.012) % 1; P.cio = (P.cio + h*sh*0.2) % 6.2832; P.fil = (P.fil + h*sh*0.5) % 6.2832;
    P.bph = (P.bph + h*sh/4.8) % 1; P.phi += h*sh*0.9;
    light.x += (light.tx - light.x) * 0.06; light.y += (light.ty - light.y) * 0.06;
    size();
    var w = cv.width, hh = cv.height, R = Math.min(w, hh) / 2 / 1.9 * scale;
    for (var i = 0; i < 3; i++){
      var orbit = i === 0 ? -Math.PI/2 + P.phi : (i === 1 ? -Math.PI/2 - P.phi : Math.PI/2 + 0.38 * Math.sin(0.6 * clk));
      var e = X.nodes, a = TETHER[i] + (orbit - TETHER[i]) * e;
      nodes[i*3] = -a; nodes[i*3+1] = 0.98 + ((i === 2 ? 0.72 : 0.55) - 0.98) * e; nodes[i*3+2] = e;
    }
    gl.viewport(0, 0, w, hh); gl.clear(gl.COLOR_BUFFER_BIT);
    var breath = breathAt(P.bph);
    gl.uniform2f(L.uC, w/2, hh/2); gl.uniform1f(L.uR, R);
    gl.uniform1f(L.uBreath, breath); gl.uniform1f(L.uGlobal, 0); gl.uniform2f(L.uLean, 0, 0); gl.uniform3f(L.uRipple, -Math.PI/2, 0, 0);
    gl.uniform3fv(L.uEmit, emit); gl.uniform2f(L.uPull, 0, 0);
    gl.uniform1f(L.uEnergy, X.energy); gl.uniform1f(L.uVoice, X.listen * (0.5 + 0.5 * Math.sin(clk * 7.3) * Math.sin(clk * 2.1))); gl.uniform1f(L.uGlow, X.glow);
    gl.uniform1f(L.uIrid, X.irid); gl.uniform1f(L.uListenIr, X.listen);
    gl.uniform1f(L.uTwist, P.twist); gl.uniform1f(L.uTwistOsc, P.twistOsc); gl.uniform1f(L.uFlow, P.flow); gl.uniform1f(L.uDrift, P.drift);
    gl.uniform1f(L.uRot, P.rot); gl.uniform1f(L.uIridPh, P.iridPh); gl.uniform1f(L.uCioRot, P.cio);
    gl.uniform1f(L.uSwirlAmt, X.swirl); gl.uniform3fv(L.uNodes, nodes); gl.uniform3f(L.uNodeDir, 1, -1, 1);
    gl.uniform1f(L.uSep, 1); gl.uniform1f(L.uBraid, X.braid); gl.uniform3f(L.uFil, 0.8, X.filA, P.fil);
    gl.uniform1f(L.uFlood, X.flood); gl.uniform3f(L.uV, V[0], V[1], V[2]);
    gl.uniform1f(L.uScrim, X.scrim); gl.uniform3f(L.uVCore, VC[0], VC[1], VC[2]);
    gl.uniform2f(L.uShock, 0, 0); gl.uniform3f(L.uShockC, 1, 1, 1); gl.uniform1f(L.uExposure, 0);
    gl.uniform3f(L.uTint, TINT[0], TINT[1], TINT[2]); gl.uniform1f(L.uTintAmt, X.tintAmt); gl.uniform1f(L.uTintWash, X.tintAmt * 0.3);
    gl.uniform4f(L.uNeighL, 0,0,0,0); gl.uniform4f(L.uNeighR, 0,0,0,0);
    gl.uniform1f(L.uCompMode, 0); gl.uniform1f(L.uCompDepth, 0); gl.uniform1f(L.uCompAmt, 0); gl.uniform3f(L.uCompBg, 0,0,0); gl.uniform4fv(L.uCompXf, cxf);
    gl.uniform2f(L.uLight, light.x * 0.5, light.y * 0.5); gl.uniform3f(L.uAmb, COL.ambIdle[0], COL.ambIdle[1], COL.ambIdle[2]); gl.uniform2f(L.uSpark, 0, 0);
    gl.uniform1f(L.uRimBoost, 0); gl.uniform1f(L.uSeed, (clk * 7.31) % 1); gl.uniform1f(L.uStatic, RM ? 1 : 0);
    gl.uniform1f(L.uOct, 4); gl.uniform1f(L.uDisp, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!RM) req();
  }
  req();
  var api = {
    set: function(mode, verdict){
      var base = { energy: .35, swirl: 0, glow: .35, irid: 1, listen: 0, wflow: .18, braid: 0, flood: 0, scrim: 0, nodes: 0, filA: 0 };
      if (mode === 'listen'){ base.listen = 1; base.energy = .55; base.glow = .5; }
      if (mode === 'debate'){ base.swirl = 1; base.irid = .35; base.energy = .9; base.wflow = .5; base.nodes = 1; base.filA = .6; }
      if (mode === 'verdict'){ var v = verdict || 'wait'; V = VCOL[v]; VC = COL.core[v]; base.flood = 1; base.braid = .6; base.scrim = .55; base.irid = .15; base.energy = .5; base.glow = .6; }
      for (var q in base) T[q] = base[q]; if (RM) req();
      return api;
    },
    radius: function(){ var r = cv.getBoundingClientRect(); return Math.min(r.width, r.height) / 2 / 1.9 * scale; },
    tint: function(hexc, amt){ TINT = hex(hexc); T.tintAmt = Math.min(0.35, amt == null ? .3 : amt); return api; }
  };
  if (opts.mode) api.set(opts.mode, opts.verdict);
  return api;
}
window.BobbySphere = { mount: mount };
})();
