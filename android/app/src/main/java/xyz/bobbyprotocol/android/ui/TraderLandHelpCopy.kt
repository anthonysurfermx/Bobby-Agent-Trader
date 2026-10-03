package xyz.bobbyprotocol.android.ui

import xyz.bobbyprotocol.android.data.BobbyLocales

internal data class TraderLandHelpText(
    val action: String,
    val title: String,
    val steps: List<String>,
    val controls: String,
    val done: String,
)

/** Instructions describe Android's native controls, without unlocking a practice island. */
internal object TraderLandHelpCopy {
    fun forLanguage(language: String, accountIsland: Boolean): TraderLandHelpText = when (BobbyLocales.language(language)) {
        "es" -> TraderLandHelpText(
            "Cómo jugar", "Cómo crece tu isla",
            listOf(
                "Con una cuenta Bobby, guarda una lectura completa de la mesa para plantar una semilla, hasta 3 al día.",
                "La paciencia decide la pieza: revisa la semilla después de 24 h para una pieza 1×1, de 3 días para un edificio 2×1 o de 7 días para un monumento 2×2. Solo puedes extender su horizonte antes de que abra la revisión.",
                "Revisa la tesis al terminar su horizonte para que florezca, diga lo que diga el mercado. Respetar un NO OPERAR florece al instante. Las piezas se repiten: siempre hay una siguiente.",
                if (accountIsland) "Tu isla crece a medida que la llenas: 8×8, 10×10, 12×12 y 16×16. El Núcleo de Aura despierta cuando hay 5 piezas; usa los controles de la isla para moverlo."
                else "Inicia sesión para construir y hacer crecer tu propia isla. Las islas públicas y el ejemplo de Satoshi se visitan sin modificarlas; sus piezas no pasan a tu colección.",
                if (accountIsland) "Construye con las piezas de tu colección, ponle nombre a tu isla y publícala cuando quieras unirte al archipiélago. Visitar otras islas nunca da XP."
                else "Explora Vecinos o escribe un código de isla para visitarla. El ejemplo de Satoshi forma parte de la app. Las visitas nunca dan XP.",
            ),
            if (accountIsland) "Elige una pieza de la colección para construirla o moverla, selecciona una casilla libre y confirma la posición. «Volver a la colección» guarda una pieza colocada."
            else "Puedes explorar las islas públicas y el ejemplo sin iniciar sesión. Inicia sesión para abrir tu propia isla y construir con tus piezas ganadas.",
            "Listo",
        )
        "fr" -> TraderLandHelpText(
            "Comment jouer", "Comment ton île grandit",
            listOf(
                "Avec un compte Bobby, enregistre une analyse terminée pour planter une graine, jusqu’à 3 par jour.",
                "La patience détermine la pièce : révise la graine après 24 h pour une pièce 1×1, 3 jours pour un bâtiment 2×1 ou 7 jours pour un monument 2×2. Tu peux prolonger son horizon uniquement avant l’ouverture de la révision.",
                "Révise la thèse à la fin de son horizon pour la faire fleurir, quel que soit le marché. Respecter un NE PAS TRADER la fait fleurir immédiatement. Les pièces reviennent : il y en a toujours une suivante.",
                if (accountIsland) "Ton île grandit à mesure que tu la remplis : 8×8, 10×10, 12×12 et 16×16. Le Noyau d’Aura se réveille quand 5 pièces sont placées ; utilise les commandes de l’île pour le déplacer."
                else "Connecte-toi pour construire et agrandir ta propre île. Tu peux visiter les îles publiques et l’exemple de Satoshi sans les modifier ; leurs pièces ne rejoignent pas ta collection.",
                if (accountIsland) "Construis avec les pièces de ta collection, nomme ton île et publie-la quand tu veux rejoindre l’archipel. Visiter d’autres îles ne donne jamais d’XP."
                else "Explore les voisins ou saisis un code d’île pour la visiter. L’exemple de Satoshi fait partie de l’app. Les visites ne donnent jamais d’XP.",
            ),
            if (accountIsland) "Choisis une pièce de ta collection pour la construire ou la déplacer, sélectionne une case libre et confirme la position. Le retour à la collection range une pièce déjà placée."
            else "Tu peux explorer les îles publiques et l’exemple sans te connecter. Connecte-toi pour ouvrir ta propre île et construire avec les pièces que tu as gagnées.",
            "Terminé",
        )
        "pt" -> TraderLandHelpText(
            "Como jogar", "Como cresce a tua ilha",
            listOf(
                "Com uma conta Bobby, guarda uma análise concluída para plantar uma semente, até 3 por dia.",
                "A paciência decide a peça: revê a semente após 24 h para uma peça 1×1, 3 dias para um edifício 2×1 ou 7 dias para um monumento 2×2. Só podes prolongar o horizonte antes de abrir a revisão.",
                "Revê a tese no fim do horizonte para a fazer florescer, seja qual for o mercado. Respeitar um NÃO OPERAR fá-la florescer de imediato. As peças repetem-se: há sempre uma próxima.",
                if (accountIsland) "A tua ilha cresce à medida que a preenches: 8×8, 10×10, 12×12 e 16×16. O Núcleo de Aura acorda quando há 5 peças colocadas; usa os controlos da ilha para o mover."
                else "Inicia sessão para construir e fazer crescer a tua própria ilha. Podes visitar as ilhas públicas e o exemplo de Satoshi sem os modificar; as peças deles não passam para a tua coleção.",
                if (accountIsland) "Constrói com as peças da tua coleção, dá um nome à tua ilha e publica-a quando quiseres juntar-te ao arquipélago. Visitar outras ilhas nunca dá XP."
                else "Explora os vizinhos ou escreve um código de ilha para a visitar. O exemplo de Satoshi faz parte da app. As visitas nunca dão XP.",
            ),
            if (accountIsland) "Escolhe uma peça da coleção para construir ou mover, seleciona uma casa livre e confirma a posição. Voltar à coleção guarda uma peça já colocada."
            else "Podes explorar as ilhas públicas e o exemplo sem iniciar sessão. Inicia sessão para abrir a tua própria ilha e construir com as peças que ganhaste.",
            "Feito",
        )
        "it" -> TraderLandHelpText(
            "Come si gioca", "Come cresce la tua isola",
            listOf(
                "Con un account Bobby, salva un’analisi completata per piantare un seme, fino a 3 al giorno.",
                "La pazienza decide il pezzo: rivedi il seme dopo 24 h per un pezzo 1×1, 3 giorni per un edificio 2×1 o 7 giorni per un monumento 2×2. Puoi prolungare l’orizzonte solo prima che si apra la revisione.",
                "Rivedi la tesi alla fine dell’orizzonte per farla fiorire, qualunque cosa dica il mercato. Rispettare un NON OPERARE la fa fiorire subito. I pezzi si ripetono: ce n’è sempre un altro.",
                if (accountIsland) "La tua isola cresce man mano che la riempi: 8×8, 10×10, 12×12 e 16×16. Il Nucleo di Aura si risveglia quando ci sono 5 pezzi posizionati; usa i comandi dell’isola per spostarlo."
                else "Accedi per costruire e far crescere la tua isola. Puoi visitare le isole pubbliche e l’esempio di Satoshi senza modificarli; i loro pezzi non entrano nella tua collezione.",
                if (accountIsland) "Costruisci con i pezzi della tua collezione, dai un nome all’isola e pubblicala quando vuoi unirti all’arcipelago. Visitare altre isole non dà mai XP."
                else "Esplora i vicini o inserisci un codice per visitare un’isola. L’esempio di Satoshi fa parte dell’app. Le visite non danno mai XP.",
            ),
            if (accountIsland) "Scegli un pezzo della collezione da costruire o spostare, seleziona una casella libera e conferma la posizione. Tornare alla collezione ripone un pezzo già posizionato."
            else "Puoi esplorare le isole pubbliche e l’esempio senza accedere. Accedi per aprire la tua isola e costruire con i pezzi guadagnati.",
            "Fatto",
        )
        "de" -> TraderLandHelpText(
            "So spielst du", "Wie deine Insel wächst",
            listOf(
                "Mit einem Bobby-Konto kannst du eine abgeschlossene Analyse speichern und so einen Samen pflanzen, bis zu 3 pro Tag.",
                "Geduld entscheidet über das Bauteil: Prüfe den Samen nach 24 h für ein 1×1-Bauteil, nach 3 Tagen für ein 2×1-Gebäude oder nach 7 Tagen für ein 2×2-Wahrzeichen. Du kannst den Horizont nur verlängern, bevor die Prüfung beginnt.",
                "Prüfe die These am Ende ihres Horizonts, damit sie aufblüht, unabhängig vom Markt. Ein respektiertes NICHT HANDELN lässt sie sofort aufblühen. Bauteile wiederholen sich: Es gibt immer ein nächstes.",
                if (accountIsland) "Deine Insel wächst, wenn du sie füllst: 8×8, 10×10, 12×12 und 16×16. Der Aura-Kern erwacht, sobald 5 Bauteile stehen. Du kannst ihn über die Inselsteuerung verschieben."
                else "Melde dich an, um deine eigene Insel aufzubauen und zu vergrößern. Öffentliche Inseln und das Satoshi-Beispiel kannst du besuchen, aber nicht verändern. Ihre Bauteile gehen nicht in deine Sammlung über.",
                if (accountIsland) "Baue mit den Bauteilen deiner Sammlung, benenne deine Insel und veröffentliche sie, wenn du dem Archipel beitreten möchtest. Besuche anderer Inseln geben niemals XP."
                else "Erkunde die Nachbarn oder gib einen Inselcode ein, um eine Insel zu besuchen. Das Satoshi-Beispiel gehört zur App. Besuche geben niemals XP.",
            ),
            if (accountIsland) "Wähle ein Bauteil aus der Sammlung zum Bauen oder Verschieben, wähle ein freies Feld und bestätige die Position. Zurück zur Sammlung verstaut ein bereits platziertes Bauteil."
            else "Du kannst öffentliche Inseln und das Beispiel ohne Anmeldung erkunden. Melde dich an, um deine eigene Insel zu öffnen und mit verdienten Bauteilen zu bauen.",
            "Fertig",
        )
        else -> TraderLandHelpText(
            "How to play", "How your island grows",
            listOf(
                "With a Bobby account, save a completed desk read to plant a seed, up to 3 a day.",
                "Patience decides the piece: review a seed after 24 h for a 1×1 piece, 3 days for a 2×1 building or 7 days for a 2×2 landmark. You can extend its horizon only before its review opens.",
                "Review the thesis when its horizon ends to make it bloom, whatever the market says. Respecting a NO TRADE blooms right away. Pieces repeat: there is always a next one.",
                if (accountIsland) "Your island grows as you fill it: 8×8, 10×10, 12×12 and 16×16. The Aura Core wakes once 5 pieces stand; use the island controls to move it."
                else "Sign in to build and grow your own island. Public islands and the Satoshi example are read-only visits; their pieces do not enter your collection.",
                if (accountIsland) "Build with pieces from your collection, name your island and publish it when you want to join the archipelago. Visiting other islands never gives XP."
                else "Explore Neighbors or enter an island code to visit. The Satoshi example is part of the app. Visits never give XP.",
            ),
            if (accountIsland) "Choose a collection piece to build or move, select a free square and confirm its position. Return to collection stores a placed piece."
            else "You can explore public islands and the example without signing in. Sign in to open your own island and build with your earned pieces.",
            "Done",
        )
    }
}
