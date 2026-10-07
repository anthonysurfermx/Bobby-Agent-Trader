import pathlib,hashlib,json,datetime,collections,os
out=pathlib.Path('/private/tmp/bobby-ios17-remediation-20261004/store-localizations')
base=pathlib.Path('/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/Codex/2026-10-02/pa/outputs')
pack=base/'build-57/app-store'; manifest=json.loads((pack/'image-manifest.json').read_text())
inventory=json.loads((out/'assets-inventory.json').read_text()); bypath={r['path']:r for r in inventory['images']}
map_locale={'en':'en-US','es':'es-MX','pt':'pt-PT','de':'de-DE','fr':'fr-FR','it':'it'}
subjects={'01':'Brand/orb identity','02':'Question / male portrait','03':'Three-agent debate UI','04':'Saved readings / female portrait','05':'Evidence chart UI','06':'Everyday companion / male portrait','07':'Wait verdict chart UI'}
selected_ids={'01','02','03','04','06'}; rows=[]
for row in manifest['rows']:
    p=pack/row['file']; record=bypath[str(p)]
    assert record['availability']=='local content allocated',str(p)
    sha=hashlib.sha256(p.read_bytes()).hexdigest()
    source56=base/'build-56/app-store'/pathlib.Path(row['file'])
    sha56=hashlib.sha256(source56.read_bytes()).hexdigest()
    assert sha==row['sha256']==row['sourceSha256']==sha56,(str(p),sha)
    assert (record['width'],record['height'])==(1320,2868) and record['mode']=='RGB' and not record['hasAlphaOrTransparency']
    final={'locale':map_locale[row['locale']],'artworkLocale':row['locale'],'position':row['image'],'subject':subjects[row['image']],'path':str(p),'sha256':sha,'bytes':p.stat().st_size,'width':1320,'height':2868,'mode':'RGB','hasAlpha':False,'availability':record['availability'],'packageBuild':'57','identicalApprovedSourceBuild':'56','sourceBuild56Path':str(source56),'sourceBuild56SHA256':sha56,'historicalProvenance':row.get('historicalProvenanceFromBuild56Manifest'),'currentCaptureBuild63':False,'outerCopyLocale':row['locale'],'innerUILocale':('en' if row['locale'] in ['en','es','pt'] else row['locale']),'visualReview':'Six full-set contact boards reviewed; DE/FR05/07 additionally inspected at full1320x2868 resolution.','selectedForCurrentUpload':row['image'] in selected_ids}
    if final['selectedForCurrentUpload']:
        folder=out/'final-artwork'/final['locale']; folder.mkdir(parents=True,exist_ok=True)
        link=folder/p.name
        if link.is_symlink(): assert os.readlink(link)==str(p)
        elif link.exists(): raise AssertionError('Would overwrite existing path: '+str(link))
        else: link.symlink_to(p)
        final['safeUploadPath']=str(link)
        final['selectionReason']='Preserves approved composition and currently supported non-chart feature. Historical illustrative artwork; not fresh build63 capture.'
    else:
        final['selectionReason']='Excluded: artwork chart footer visibly names OKX, but build63 renderer removes OKX/OKB/XLayer provider names at55-read.js276-278. Interval1H and support text are complete; this is a branding/UI discrepancy, not the old interval/truncation bug.'
        final['visibleChartInterval']='1H /1H localized'; final['visibleProvider']='OKX'; final['supportSubtitleComplete']=True
    rows.append(final)
result={'checkedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'candidateDocumentedHEAD':'be3e8b1389294e7d477a77b87e107f044ea3f55e','candidateCodeSameAs':'a135d6e107dee1a9c9f7057532cc2f6d9fc7b6b2','version':'1.7','targetBuild':'63','packSource':str(pack),'packMetadata':str(pack/'metadata.json'),'imageManifest':str(pack/'image-manifest.json'),'totalOriginalImages':len(rows),'selectedImages':sum(r['selectedForCurrentUpload'] for r in rows),'excludedImages':sum(not r['selectedForCurrentUpload'] for r in rows),'selectedOrder':['01','02','03','04','06'],'approvedBytesPreserved':True,'imagesCopiedOrEdited':0,'safePathsAreSymlinks':True,'all42SHA256MatchManifestAndBuild56':True,'all42DimensionsAndModePass':True,'all42AreLocalAllocatedContent':True,'appleSpecification':'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications','scope':'Local artwork integrity, dimensions, provenance and visual review. Historical approved illustrative artwork is not physical or current-build screenshot evidence. No Apple upload/save/approval performed by this asset task.','images':rows}
(out/'final-artwork-manifest.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
for r in inventory['images']:
    path=r['path']
    if '/build-57/' in path:r['originBuildFromPackagePath']='57'
    elif '/build-56/' in path:r['originBuildFromPackagePath']='56'
    elif '/app-store-1.6-54/' in path:r['originBuildFromPackagePath']='54'
    elif '/release-47/' in path:r['originBuildFromPackagePath']='47; underlying editorial UI source40 perREADME'
    elif '/nucleo-editorial-v2/' in path:r['originBuildFromPackagePath']='UI40 / historical illustrative editorial assets perREADME'
    else:r['originBuildFromPackagePath']='unknown; do not infer capture build from mtime'
    if path in {x['path'] for x in rows}:r['isChosenPackage57Image']=True
inventory['availabilityCounts']=dict(collections.Counter(r['availability'] for r in inventory['images']))
inventory['selectedManifest']=str(out/'final-artwork-manifest.json')
(out/'assets-inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'original':len(rows),'selected':result['selectedImages'],'excluded':result['excludedImages'],'allHashesMatch':True,'sourceBytes':sum(r['bytes'] for r in rows),'selectedBytes':sum(r['bytes'] for r in rows if r['selectedForCurrentUpload']),'inventoryCount':len(inventory['images']),'availabilityCounts':inventory['availabilityCounts'],'finalPath':str(out/'final-artwork')},ensure_ascii=False))
