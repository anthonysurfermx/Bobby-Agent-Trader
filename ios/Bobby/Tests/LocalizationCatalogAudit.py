import pathlib,re,json
root=pathlib.Path(__file__).resolve().parents[3]
def quoted(s,i):
 if i>=len(s) or s[i]!='"': return None
 i+=1; out=''; n=0
 while i<len(s):
  if s[i]=='"': return out,i+1
  if s.startswith('\\(',i):
   j=i+2; depth=1
   while j<len(s) and depth:
    if s[j]=='"':
     q=quoted(s,j)
     if q: j=q[1];continue
    if s[j]=='(': depth+=1
    elif s[j]==')':depth-=1
    j+=1
   out+='{'+str(n)+'}';n+=1;i=j;continue
  if s.startswith('\\u{',i):
   j=s.index('}',i+3);out+=chr(int(s[i+3:j],16));i=j+1;continue
  if s[i]=='\\' and i+1<len(s):
   escapes={'n':'\n','t':'\t','r':'\r','"':'"','\\':'\\'}
   out+=escapes.get(s[i+1],s[i+1]);i+=2;continue
  out+=s[i];i+=1
 return None
keys={}
for p in (root/'ios/Bobby/Sources').rglob('*.swift'):
 for m in re.finditer(r'L\.t\(\s*',p.read_text()):
  s=p.read_text(); q=quoted(s,m.end())
  if q:
   key,end=q;j=end
   while j<len(s) and s[j] in ' ,\n\t':j+=1
   es=quoted(s,j)
   keys.setdefault(key,{'en':key,'es':es[0] if es else '', 'files':[]})['files'].append(str(p.relative_to(root)))
# Runtime dictionaries: tool names/lore and generated land names.
p=root/'ios/Bobby/Sources/CompanionTools.swift';s=p.read_text()
for line in s.splitlines():
 if re.search(r'^\s*t\([123],',line):
  values=[];i=0
  while i<len(line):
   if line[i]=='"':q=quoted(line,i);values.append(q[0]);i=q[1]
   else:i+=1
  if len(values)>=5:
   for en,es in [(values[1],values[2]),(values[3],values[4])]:keys.setdefault(en,{'en':en,'es':es,'files':[str(p.relative_to(root))]})
catalog={}
for row in (root/'ios/Bobby/Sources/NativeTranslations.swift').read_text().splitlines():
 match=re.search(r'^\s*result\[("(?:\\.|[^"\\])*")\] = \[(.*)\]$',row)
 if match:catalog[json.loads(match[1])]=json.loads('{'+match[2]+'}')
assert catalog, 'Catalog must exist'

missing=sorted(set(keys)-set(catalog))
for key in missing:print('MISSING:',key)
assert not missing, f'{len(missing)} native source keys missing'
for key,translations in catalog.items():
 assert set(translations)=={'fr','pt','it','de'},key
 expected=set(re.findall(r'\{\d+\}',key))
 for lang,translation in translations.items():
  assert translation.strip(),(key,lang)
  assert set(re.findall(r'\{\d+\}',translation))==expected,(key,lang)
print(f'PASS: {len(keys)} unique native source keys, {len(catalog)} catalog rows, four translations with matching placeholders')
