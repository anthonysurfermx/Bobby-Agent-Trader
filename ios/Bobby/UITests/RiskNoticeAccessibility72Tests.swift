import XCTest

/// Inspects the native accessibility elements; fixture transport never contacts production.
final class RiskNoticeAccessibility72Tests: ConversationFixtureCase {
    private let disclosures: [String: [(String, String)]] = [
        "en": [
            ("Allow AI processing of my questions.", "Bobby sends your question and market data to OpenAI or Anthropic, depending on the analysis level. With voice on, reply text goes to OpenAI or Microsoft for speech. Dictation is transcribed on your iPhone when the language is installed; otherwise Apple's speech service transcribes it. Bobby does not store the audio. Avoid personal or account details. You can withdraw AI consent here at any time."),
            ("Not investment advice.", "Verdicts, levels and stops are educational analysis made by software, not recommendations for you."),
            ("Bobby never touches your money.", "It doesn't connect wallets, move funds, execute trades or hold your keys."),
            ("You can lose money. You decide.", "Data can be late or wrong. If you need advice, talk to a licensed professional.")
        ],
        "es": [
            ("Permito que la IA procese mis preguntas.", "Bobby envía tu pregunta y datos de mercado a OpenAI o Anthropic, según el nivel de análisis. Con voz activa, el texto de respuesta va a OpenAI o Microsoft para narrarlo. El dictado se transcribe en tu iPhone si el idioma está instalado; si no, lo transcribe el servicio de voz de Apple. Bobby no guarda el audio. Evita datos personales o de cuentas. Puedes retirar aquí el consentimiento de IA cuando quieras."),
            ("No es asesoría de inversión.", "Veredictos, niveles y stops son análisis educativo hecho por un programa, no recomendaciones para ti."),
            ("Bobby nunca toca tu dinero.", "No conecta wallets, no mueve fondos, no ejecuta operaciones y no guarda tus llaves."),
            ("Puedes perder dinero. Tú decides.", "Los datos pueden llegar tarde o mal. Si necesitas asesoría, acude a un profesional autorizado.")
        ],
        "fr": [
            ("J’autorise le traitement de mes questions par l’IA.", "Bobby transmet ta question et les données de marché à OpenAI ou Anthropic selon le niveau d’analyse. Lorsque la voix est activée, le texte de réponse est envoyé à OpenAI ou Microsoft pour la synthèse vocale. La dictée est transcrite sur ton iPhone si la langue est installée ; sinon, le service de reconnaissance vocale d’Apple la transcrit. Bobby ne conserve pas l’audio. Évite les données personnelles ou de compte. Tu peux retirer ce consentement ici à tout moment."),
            ("Aucun conseil en investissement.", "Les conclusions, niveaux et seuils d’arrêt sont des analyses éducatives produites par un logiciel, sans recommandations personnelles."),
            ("Bobby ne touche jamais à ton argent.", "Il ne connecte pas de portefeuilles, ne déplace pas de fonds, n’exécute pas d’opérations et ne conserve pas tes clés."),
            ("Tu peux perdre de l’argent. Tu décides.", "Les données peuvent être tardives ou incorrectes. Pour un conseil, consulte un professionnel agréé.")
        ],
        "pt": [
            ("Autorizo o processamento das minhas perguntas por IA.", "O Bobby envia a pergunta e os dados de mercado à OpenAI ou Anthropic, conforme o nível de análise. Com voz ativa, o texto da resposta vai para a OpenAI ou Microsoft para gerar voz. O ditado é transcrito no teu iPhone se o idioma estiver instalado; caso contrário, é transcrito pelo serviço de reconhecimento de voz da Apple. O Bobby não guarda o áudio. Evita dados pessoais ou de contas. Podes retirar o consentimento de IA aqui a qualquer momento."),
            ("Não é aconselhamento de investimento.", "Conclusões, níveis e limites de saída são análises educativas feitas por software, não recomendações pessoais."),
            ("O Bobby nunca toca no teu dinheiro.", "Não liga carteiras, não move fundos, não executa operações nem guarda as tuas chaves."),
            ("Podes perder dinheiro. A decisão é tua.", "Os dados podem chegar tarde ou estar errados. Se precisar de aconselhamento, consulte um profissional autorizado.")
        ],
        "it": [
            ("Consento l’elaborazione delle mie domande tramite IA.", "Bobby invia la domanda e i dati di mercato a OpenAI o Anthropic, in base al livello di analisi. Con la voce attiva, il testo della risposta va a OpenAI o Microsoft per la sintesi vocale. La dettatura viene trascritta sull’iPhone se la lingua è installata; altrimenti la trascrive il servizio di riconoscimento vocale di Apple. Bobby non conserva l’audio. Evita dati personali o dell’account. Puoi revocare il consenso all’IA qui in qualsiasi momento."),
            ("Non è consulenza d’investimento.", "Conclusioni, livelli e soglie di uscita sono analisi educative prodotte da software, non raccomandazioni personali."),
            ("Bobby non tocca mai il tuo denaro.", "Non collega portafogli, non sposta fondi, non esegue operazioni e non conserva le tue chiavi."),
            ("Puoi perdere denaro. Decidi tu.", "I dati possono arrivare tardi o essere errati. Per una consulenza, rivolgiti a un professionista abilitato.")
        ],
        "de": [
            ("Ich erlaube die Verarbeitung meiner Fragen durch KI.", "Bobby sendet deine Frage und Marktdaten je nach Analysestufe an OpenAI oder Anthropic. Bei eingeschalteter Stimme geht der Antworttext zur Spracherzeugung an OpenAI oder Microsoft. Diktate werden auf deinem iPhone transkribiert, wenn die Sprache installiert ist; andernfalls transkribiert sie Apples Spracherkennungsdienst. Bobby speichert die Audiodaten nicht. Vermeide persönliche Daten und Kontodaten. Du kannst die KI-Einwilligung hier jederzeit widerrufen."),
            ("Keine Anlageberatung.", "Fazit, Kurswerte und Ausstiegsgrenzen sind von Software erstellte Analysen zu Lernzwecken, keine persönlichen Empfehlungen."),
            ("Bobby greift nie auf dein Geld zu.", "Er verbindet keine Wallets, verschiebt keine Mittel, führt keine Geschäfte aus und verwahrt keine Schlüssel."),
            ("Du kannst Geld verlieren. Du entscheidest.", "Daten können verspätet oder falsch sein. Wenn du Beratung brauchst, wende dich an eine zugelassene Fachperson.")
        ]
    ]
    func testReadOnlyNoticeExposesEveryDisclosureBodyAndAcknowledgement() {
        launch()
        openProfileFromGlass()
        let notice = app.buttons["account-risk"]
        for _ in 0..<8 where !notice.isHittable { app.scrollViews.firstMatch.swipeUp() }
        ready(notice); notice.tap(); ready(app.buttons["risk-close"])
        for (title, body) in disclosures[language]! {
            let statement = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", title)).firstMatch
            XCTAssertTrue(statement.exists, title)
            XCTAssertTrue(statement.label.contains(body), "VoiceOver must receive the full body: " + title)
            XCTAssertNotNil(statement.value, "Keep the acknowledgement value")
        }
        shot("90-risk-notice-accessibility")
    }
}
