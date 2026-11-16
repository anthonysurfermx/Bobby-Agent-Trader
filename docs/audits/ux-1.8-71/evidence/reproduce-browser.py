#!/usr/bin/env python3
# Audit-only reproduction; shipping source and existing tests stay unchanged.
import json,pathlib,re,subprocess,tempfile
root=pathlib.Path.cwd()
if not (root/'ios/Bobby/Nucleo/build.py').exists():
 raise SystemExit('Run from the repository root.')
out=pathlib.Path(tempfile.mkdtemp(prefix='bobby71-ui-',dir='/private/tmp'))
subprocess.run(['python3',str(root/'ios/Bobby/Nucleo/build.py'),'--output',str(out)],check=True)
f=json.loads((root/'ios/Bobby/Nucleo/fixtures/native/companion-explanation-fact.json').read_text())
reply={'status':'companion','requestId':f['requestId'],'text':f['reply']['text'],'gist':f['reply']['text'].split('. ')[0]+'.','followUp':f['reply']['followUp'],'fact':f['fact']}
for page in ['app','onboarding']:
 s=(out/(page+'.html')).read_text()
 if page=='app':
  extra='''// Audit harness only: source files are unchanged. Offline native-shaped fixtures.
var AUDIT_CALL=BR.call;
BR.call=function(method,params){
 if(method==='ask'&&QS.auditCompanion==='1'){
  var reply=AUDIT_REPLY;
  if(QS.auditError==='1')reply={status:'companion_error',requestId:'6f8948bc-8488-487e-9301-8e90c73cde08',code:'unavailable',retryable:true};
  if(QS.auditOffer==='1')reply=Object.assign({},reply,{readOffer:{token:'audit-token',label:'Leer Bitcoin',levelLabel:'Rápido',costLine:'Usa una lectura',costShort:'una lectura'}});
  return Promise.resolve(JSON.parse(JSON.stringify(reply)));
 }
 if(method==='speak'&&QS.auditCompanion==='1')return Promise.resolve({status:'unavailable'});
 return AUDIT_CALL(method,params).then(function(result){if(method==='session'){result.textScale=+(QS.auditScale||1);result.exampleIndex=+(QS.auditExample||0);}return result;});
};
W.AUDIT={step:function(sec){return W.nucleo.step(sec);},state:function(){return W.nucleo.state();}};
'''.replace('AUDIT_REPLY',json.dumps(reply,ensure_ascii=False))
 else:
  extra='''// Audit harness only: source files are unchanged. Session fields supplied by native on iPhone.
var AUDIT_CALL=BR.call;
BR.call=function(method,params){return AUDIT_CALL(method,params).then(function(result){if(method==='session'){result.textScale=+(Q.auditScale||1);result.exampleIndex=+(Q.auditExample||0);if(Q.auditRisk==='1')result.consentPreview=true;}return result;});};
SCRIPTS['audit-first-question']=[SCRIPTS['chip-run'][0]];
window.AUDIT={step:function(sec){return window.nucleo.seek(window.nucleo.time()+sec);},state:function(){return window.nucleo.state();}};
'''
 s=s.replace('/* ---- '+page+'/99-boot.js ---- */',extra+'\n/* ---- '+page+'/99-boot.js ---- */')
 (out/('audit-'+page+'.html')).write_text(s)
(out/'audit.html').write_text('<!doctype html><meta charset="utf-8"><title>Offline Bobby 71 audit harness</title><style>html,body{margin:0;background:#161616;color:#ddd;font:12px system-ui}iframe{border:0;display:block}#controls{height:48px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}button{min-height:36px}#state{white-space:pre}</style><iframe id="phone" title="Bobby offline UI"></iframe><div id="controls"><button id="step1">Step 1s</button><button id="step10">Step 10s</button><button id="step180">Step 180s</button><button id="example">Ask fixture</button><button id="restore">Restore fixture</button><button id="recenter">Reset scroll</button><span id="state"></span></div><script>const q=new URLSearchParams(location.search),p=document.getElementById(\'phone\');p.width=q.get(\'width\')||375;p.height=q.get(\'height\')||667;p.src=\'audit-\'+(q.get(\'page\')||\'app\')+\'.html?\'+q.toString();for(const s of [1,10,180])document.getElementById(\'step\'+s).onclick=async()=>{await p.contentWindow.AUDIT.step(s);document.getElementById(\'state\').textContent=p.contentWindow.AUDIT.state()};document.getElementById(\'example\').onclick=()=>p.contentWindow.nucleo.type(q.get(\'long\')?\'a\'.repeat(1201):(q.get(\'question\')||\'¿Qué son los CETES?\'));document.getElementById(\'recenter\').onclick=()=>{p.contentWindow.document.getElementById(\'stage\').scrollTop=0;};document.getElementById(\'restore\').onclick=()=>p.contentWindow.nucleo.restore(\'nvda\');</script>')
source=(root/'ios/Bobby/Nucleo/src/app/55-read.js').read_text(); template=(root/'ios/Bobby/Nucleo/src/app/template.html').read_text(); translations=(root/'ios/Bobby/Nucleo/src/shared/20-read-model.js').read_text()
chart=re.search(r'<svg\s+id="chart"[\s\S]*?</svg>',template).group()
qa=(root/'scripts/qa/test-ios17-support-subtitle.mjs').read_text(); pre=qa.split('await page.addScriptTag({ content: `',1)[1].split('${source.slice(start, end)}',1)[0]; helper=qa.split('${source.slice(start, end)}',1)[1].split('` });',1)[0]
render=source[source.index('var CH = null'):source.index('function lutAt(')]
body='''var q=new URLSearchParams(location.search), language=q.get('lang')||'de', direction=q.get('direction')||'below';var subtitle=NucleoReadModel.t(language,'chart.'+direction+'Support');var measurement=window.drawSupport(subtitle,direction);document.getElementById('measurement').textContent=JSON.stringify({language:language,direction:direction,measurement:measurement},null,2);'''
html='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline shipping chart regression</title><style>html,body{margin:0;background:#0B0A09;color:#ddd}#stage{position:relative;width:390px;height:844px;overflow:hidden}#chart{position:absolute;left:0;top:0}#measurement{max-width:390px;overflow-wrap:anywhere;white-space:pre-wrap}</style><div id="stage">'+chart+'</div><pre id="measurement"></pre><script>'+translations+'</script><script>'+pre+render+helper+body+'</script>'
(out/'support.html').write_text(html)
print('Support harness uses renderer and SVG extracted exactly as existing QA script.')

print('AUDIT_OUTPUT='+str(out))
print('Serve on loopback: python3 -m http.server 4718 --bind 127.0.0.1 --directory '+str(out))
