#!/usr/bin/env python3
"""Build a prototype: copy <src>.html to dist/<src>.html with the companion images injected.
Source files keep the literal token __COMPANIONS_JSON__ (never paste base64 into sources).
Usage: python3 inject.py nucleo-v2.html [more.html ...]"""
import json, os, sys
here = os.path.dirname(os.path.abspath(__file__))
data = json.load(open(os.path.join(here, 'companions.json')))
payload = json.dumps(data).replace('</', '<\\/')
for name in sys.argv[1:]:
    src = open(os.path.join(here, name)).read()
    n = src.count('__COMPANIONS_JSON__')
    out = src.replace('__COMPANIONS_JSON__', payload)
    os.makedirs(os.path.join(here, 'dist'), exist_ok=True)
    open(os.path.join(here, 'dist', name), 'w').write(out)
    print(f'{name}: {n} placeholder(s) injected -> dist/{name} ({len(out)} bytes)')
