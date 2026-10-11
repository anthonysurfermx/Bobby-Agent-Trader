#!/usr/bin/env python3
"""Pair the build-time gesture, primer and microphone purpose copy (G1)."""
from pathlib import Path
import json,re,sys
root=Path(__file__).resolve().parents[1]; mode=sys.argv[1] if len(sys.argv)>1 else 'tap'
assert mode in ('tap','hold')
path=root/'Nucleo/talk-mode.json'; config=json.loads(path.read_text()); config['TALK_MODE']=mode
copy=json.loads((root/'Nucleo/talk-copy.json').read_text())
for lang,values in copy['purpose'].items():
 p=root/f'Sources/{lang}.lproj/InfoPlist.strings'; s=p.read_text(); s=re.sub(r'"NSMicrophoneUsageDescription"\s*=\s*".*?";',lambda m:'"NSMicrophoneUsageDescription" = '+json.dumps(values[mode],ensure_ascii=False)+';',s); p.write_text(s)
 for page in ('app','onboarding'):
  p=root/f'Nucleo/src/{page}/40-strings.js'; s=p.read_text(); start=re.search(r'\b'+lang+r':\s*\{',s).end(); match=re.search(r'([\x22\x27])perm.title\1\s*:\s*(?:\x22(?:\\.|[^\x22])*\x22|\x27(?:\\.|[^\x27])*\x27)',s[start:]); assert match
  a=start+match.start(); b=start+match.end(); s=s[:a]+'"perm.title": '+json.dumps(copy['primer'][lang][mode],ensure_ascii=False)+s[b:]; p.write_text(s)
p=root/'project.yml'; s=p.read_text(); s=re.sub(r'(NSMicrophoneUsageDescription: ).*',lambda m:m[1]+json.dumps(copy['purpose']['en'][mode],ensure_ascii=False),s); p.write_text(s)
path.write_text(json.dumps(config,indent=2)+'\n')
p=root/'Sources/Nucleo/NucleoTalkMode.swift'; p.write_text('// Generated only by scripts/talk-mode.py. G1 remains an owner release gate.\nenum NucleoTalkMode { static let tap = '+str(mode=='tap').lower()+' }\n')
print('TALK_MODE='+mode+'; purpose and primer paired in six languages')
