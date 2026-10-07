import json, pathlib, datetime, hashlib
out=pathlib.Path('/private/tmp/bobby-ios17-remediation-20261004/store-localizations')
source=pathlib.Path('/Users/mrrobot/Documents/Documentos - MacBook Pro F Society/Codex/2026-10-02/pa/outputs/build-57/app-store/metadata.json')
o=json.loads(source.read_text())
promos={
'en-US':'Three AI agents compare opportunities, risks and evidence. Explore stocks and crypto in six languages, with charts and sources to inform your own decision.',
'es-MX':'Tres agentes de IA debaten oportunidades, riesgos y evidencia. Explora acciones y cripto en seis idiomas, con gráficas y fuentes para decidir por tu cuenta.',
'de-DE':'Drei KI-Agenten prüfen Chancen, Risiken und Belege. Entdecke Aktien und Krypto in sechs Sprachen, mit Charts und Quellen für deine eigene Entscheidung.',
'fr-FR':'Trois agents IA confrontent opportunités, risques et conclusions. Explore les actions et la crypto en six langues, avec graphiques et sources pour décider.',
'it':'Tre agenti IA confrontano opportunità, rischi e sintesi. Esplora azioni e crypto in sei lingue, con grafici e fonti per ragionare prima di agire.',
'pt-PT':'Três agentes de IA comparam oportunidades, riscos e conclusões. Explora ações e cripto em seis idiomas, com gráficos e fontes para decidires.'}
privacy={
'en-US':'YOUR CHOICE ABOUT AI\nExternal AI processing of your analysis requires your permission. You can review the notice and withdraw permission from Profile. Optional dictation uses Apple speech recognition. When an on-device model is unavailable, Apple’s speech service is used only with your separate consent. You can always type instead. Optional narration can be muted.',
'es-MX':'TÚ ELIGES SOBRE LA IA\nEl procesamiento externo de tu análisis con IA requiere tu permiso. Puedes revisar el aviso y retirar el permiso desde Perfil. El dictado opcional usa reconocimiento de voz de Apple. Si no hay un modelo disponible en el dispositivo, el servicio de voz de Apple se usa solo con tu consentimiento por separado. Siempre puedes escribir. La narración opcional se puede silenciar.',
'de-DE':'DU ENTSCHEIDEST ÜBER KI\nDie externe KI-Verarbeitung deiner Analyse erfordert deine Zustimmung. Lies den Hinweis und widerrufe deine Zustimmung im Profil. Die optionale Diktierfunktion nutzt Apples Spracherkennung. Ist kein Modell auf dem Gerät verfügbar, wird Apples Sprachdienst nur mit deiner gesonderten Zustimmung verwendet. Du kannst jederzeit tippen. Die optionale Sprachausgabe lässt sich stummschalten.',
'fr-FR':'TU DÉCIDES POUR L’IA\nLe traitement externe de ton analyse par IA nécessite ton autorisation. Consulte l’avis et retire ton autorisation depuis le Profil. La dictée facultative utilise la reconnaissance vocale Apple. Si aucun modèle local n’est disponible, le service vocal Apple est utilisé uniquement avec ton consentement distinct. Tu peux toujours écrire. La narration facultative peut être coupée.',
'it':'SEI TU A DECIDERE SULL’IA\nL’elaborazione esterna della tua analisi con IA richiede il tuo consenso. Puoi leggere l’avviso e revocare il consenso dal Profilo. La dettatura facoltativa usa il riconoscimento vocale Apple. Se sul dispositivo non è disponibile un modello locale, il servizio vocale Apple viene usato solo con il tuo consenso separato. Puoi sempre scrivere. La narrazione facoltativa può essere disattivata.',
'pt-PT':'TU DECIDES SOBRE A IA\nO processamento externo da tua análise com IA exige a tua autorização. Podes consultar o aviso e retirar a autorização no Perfil. O ditado opcional usa reconhecimento de voz da Apple. Se não houver um modelo disponível no dispositivo, o serviço de voz da Apple só é usado com o teu consentimento separado. Podes sempre escrever. A narração opcional pode ser silenciada.'}
intro_replacements={
'en-US':('optional on-device dictation','optional dictation on compatible devices'),
'es-MX':('dictado opcional en el dispositivo','dictado opcional en dispositivos compatibles'),
'de-DE':('optionalem Diktieren auf dem Gerät','optionalem Diktieren auf kompatiblen Geräten'),
'fr-FR':('la dictée facultative sur l’appareil','la dictée facultative sur les appareils compatibles'),
'it':('la dettatura facoltativa sul dispositivo','la dettatura facoltativa sui dispositivi compatibili'),
'pt-PT':('ditado opcional no dispositivo','ditado opcional em dispositivos compatíveis')}
weekly={
'en-US':'The optional weekly briefing is limited to eligible active paid Pro accounts and requires separate permissions. Availability and scheduling appear in Profile.',
'es-MX':'El resumen semanal opcional se limita a cuentas Pro de pago activas y elegibles y requiere permisos por separado. La disponibilidad y el horario aparecen en Perfil.',
'de-DE':'Der optionale Wochenüberblick ist auf berechtigte aktive, bezahlte Pro-Konten beschränkt und erfordert gesonderte Zustimmungen. Verfügbarkeit und Zeitplan erscheinen im Profil.',
'fr-FR':'Le résumé hebdomadaire facultatif est réservé aux comptes Pro payants actifs et éligibles, avec des autorisations distinctes. La disponibilité et le calendrier figurent dans le Profil.',
'it':'Il riepilogo settimanale facoltativo è riservato agli account Pro a pagamento attivi e idonei e richiede autorizzazioni separate. Disponibilità e calendario sono nel Profilo.',
'pt-PT':'O resumo semanal opcional está limitado a contas Pro pagas, ativas e elegíveis e exige autorizações separadas. A disponibilidade e o horário aparecem no Perfil.'}
new={
'en-US':'Bobby 1.7 brings a six-language experience: English, Spanish, French, Portuguese, Italian and German. Explore supported regional stocks with their original symbols and quote currencies. Charts now show the actual data interval and clearer support and resistance labels. We improved language switching, analysis handling and optional dictation consent. Your AI permissions, usage limits and account controls remain available in Profile.',
'es-MX':'Bobby 1.7 ofrece una experiencia en seis idiomas: español, inglés, francés, portugués, italiano y alemán. Explora acciones regionales compatibles con sus símbolos y monedas originales. Las gráficas muestran el intervalo real de los datos y etiquetas más claras de soporte y resistencia. Mejoramos el cambio de idioma, el manejo de los análisis y el consentimiento del dictado opcional. Tus permisos de IA, límites de uso y controles de cuenta siguen disponibles en Perfil.',
'de-DE':'Bobby 1.7 bietet ein Erlebnis in sechs Sprachen: Deutsch, Englisch, Spanisch, Französisch, Portugiesisch und Italienisch. Entdecke unterstützte regionale Aktien mit ihren ursprünglichen Symbolen und Kurswährungen. Charts zeigen das tatsächliche Datenintervall sowie klarere Unterstützungs- und Widerstandsmarkierungen. Sprachwechsel, Analyseverarbeitung und die Zustimmung zur optionalen Diktierfunktion wurden verbessert. KI-Zustimmungen, Nutzungslimits und Kontoeinstellungen findest du weiterhin im Profil.',
'fr-FR':'Bobby 1.7 propose une expérience en six langues : français, anglais, espagnol, portugais, italien et allemand. Explore les actions régionales prises en charge avec leurs symboles et devises d’origine. Les graphiques affichent l’intervalle réel des données et des repères de support et de résistance plus lisibles. Le changement de langue, le traitement des analyses et le consentement à la dictée facultative sont améliorés. Tes autorisations d’IA, limites d’utilisation et contrôles de compte restent dans le Profil.',
'it':'Bobby 1.7 offre un’esperienza in sei lingue: italiano, inglese, spagnolo, francese, portoghese e tedesco. Esplora le azioni regionali supportate con simboli e valute originali. I grafici mostrano l’intervallo effettivo dei dati e indicazioni di supporto e resistenza più leggibili. Abbiamo migliorato il cambio di lingua, la gestione delle analisi e il consenso alla dettatura facoltativa. Consenso all’IA, limiti di utilizzo e controlli dell’account restano nel Profilo.',
'pt-PT':'O Bobby 1.7 oferece uma experiência em seis idiomas: português, inglês, espanhol, francês, italiano e alemão. Explora ações regionais disponíveis com os símbolos e moedas originais. Os gráficos mostram o intervalo real dos dados e indicações mais legíveis de suporte e resistência. Melhorámos a mudança de idioma, o tratamento das análises e o consentimento do ditado opcional. As autorizações de IA, os limites de utilização e os controlos da conta continuam no Perfil.'}
locales={}; validations={}
for locale,old in o['locales'].items():
    entry={k:old[k] for k in ['name','subtitle','description','keywords','supportURL','privacyPolicyURL','screenshotLocale']}
    paragraphs=entry['description'].split('\n\n')
    marker=privacy[locale].split('\n')[0]
    matches=[i for i,p in enumerate(paragraphs) if p.startswith(marker+'\n')]
    assert len(matches)==1,(locale,matches)
    paragraphs[matches[0]]=privacy[locale]
    entry['description']='\n\n'.join(paragraphs)
    before,after=intro_replacements[locale]
    assert before in entry['description'],locale
    entry['description']=entry['description'].replace(before,after)
    # Append eligibility information before the legal terms, without suggesting delivery to guests or gifts.
    parts=entry['description'].rsplit('\n\n',1)
    entry['description']=parts[0]+'\n\n'+weekly[locale]+'\n\n'+parts[1]
    entry['promotionalText']=promos[locale]; entry['whatsNew']=new[locale]
    limits={'name':30,'subtitle':30,'description':4000,'promotionalText':170,'whatsNew':4000,'keywords':100}
    validations[locale]={}
    for field,limit in limits.items():
        value=entry[field]; utf16=len(value.encode('utf-16-le'))//2; utf8=len(value.encode())
        measure=utf8 if field=='keywords' else utf16
        assert measure<=limit,(locale,field,measure,limit)
        validations[locale][field]={'characters':len(value),'utf16Units':utf16,'utf8Bytes':utf8,'limit':limit,'pass':True}
    locales[locale]=entry
    folder=out/locale; folder.mkdir(exist_ok=True)
    for field,value in entry.items():
        if field!='screenshotLocale': (folder/(field+'.txt')).write_text(value+'\n')
review='''Bobby 1.7 (63) is an educational market-analysis app. Alpha Hunter, Red Team and CIO provide three perspectives on a supported stock or crypto asset. The iPhone app does not connect wallets, execute trades or move funds. Market data may be delayed; source timestamps and the actual chart data interval are shown.

Review the app with typed input. A guest can explore the app and use the available guest allowance. Some analysis levels and account features require Sign in with Apple; availability and remaining allowances are shown in the app. Analysis processing by external AI requires the user's permission. The notice can be reviewed and permission withdrawn in Profile.

Optional dictation asks for microphone and Apple Speech permissions. An on-device recognition model is preferred when available. If it is unavailable for the selected app language, Apple's speech service requires a separate native consent before microphone capture. Declining it leaves typed input available. This consent is separate from the analysis AI permission. Optional narration can be muted.

The app supports English, Spanish, French, Portuguese, Italian and German. Language is selected in Profile. Portuguese recognition and narration choose compatible Portugal or Brazil variants from the device's language/region settings; availability depends on Apple speech support on the device.

Bobby Pro is an optional auto-renewing monthly App Store subscription. Pricing is loaded from the current store offering and shown before confirmation; no fixed test price is advertised. Pro includes unlimited Quick readings subject to fair use, 60 Deep analyses and 10 Max analyses every 30 days. Restore Purchases and account/subscription controls are in Profile. Deleting a Bobby account does not itself cancel an Apple subscription.

The optional weekly briefing requires an eligible active paid Pro account and separate permissions. Guest, gifted or trial access does not by itself grant this eligibility. Availability and scheduling are shown in Profile; a report is not represented as delivered until it exists. Public Trader Land content offers reporting and creator blocking; islands are private until published.

Support: https://bobbyprotocol.xyz/support?lang=en
Privacy: https://bobbyprotocol.xyz/privacy?lang=en
Standard Apple EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'''
assert len(review)<=4000
(out/'review-notes-en.txt').write_text(review+'\n')
metadata={'version':'1.7','build':'63','preparedAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceMetadata':str(source),'sourceMetadataSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'locales':locales,'reviewNotes':review,'evidenceScope':'Local editorial copy prepared from approved translated build57 metadata and corrected against current build63 source. Does not prove store save, physical voice/dictation, purchase, weekly delivery, archive/upload or approval.','corrections':['Replace on-device-only/no-audio-upload claims with separate Apple speech-service fallback consent.','Preserve six-language, depth, regional stocks, Pro usage and product scope facts.','Add active paid Pro eligibility for optional weekly briefing; no guest/gift/trial delivery promise.','New promotions and release notes accurately describe chart interval and support-label fixes; no trading or return promises.'],'savedInAppStoreConnect':False}
(out/'metadata-1.7-63.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
(out/'metadata-1.7-63-four-new-locales.json').write_text(json.dumps({**{k:v for k,v in metadata.items() if k!='locales'},'locales':{k:locales[k] for k in ['de-DE','fr-FR','it','pt-PT']}},ensure_ascii=False,indent=2)+'\n')
(out/'metadata-validation.json').write_text(json.dumps({'allPass':True,'locales':validations,'reviewNotesCharacters':len(review),'copiedApprovedNamesAndSubtitles':True,'keywordLimitUsesConservativeUTF8Bytes':True},ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'metadata':str(out/'metadata-1.7-63.json'),'reviewNotesCharacters':len(review),'promoLengths':{k:len(v) for k,v in promos.items()},'descriptionLengths':{k:len(v['description']) for k,v in locales.items()},'allLimitsPass':True},ensure_ascii=False))
