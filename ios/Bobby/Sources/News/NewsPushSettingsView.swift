import SwiftUI

enum NewsPushCopy {
    enum Key { case title, consent, signedOut, unavailable, failed }
    static func allowNotifications(language: String = L.language) -> String {
        ["en": "Allow notifications", "es": "Permitir notificaciones", "fr": "Autoriser les notifications",
         "it": "Consenti notifiche", "de": "Benachrichtigungen erlauben", "pt": "Permitir notificações"][language] ?? "Allow notifications"
    }
    static func text(_ key: Key, language: String = L.language, locale: String = L.localeIdentifier) -> String {
        let copy: [String: [String]] = [
            "en": ["Bobby news", "Notify me about new languages and app updates. These optional promotional notifications can be turned off here at any time.", "Sign in with Apple in your profile to choose Bobby news notifications.", "Your choice is saved. News notifications are not available yet.", "Bobby could not save your notification choice. Try again."],
            "es": ["Novedades de Bobby", "Avísame de nuevos idiomas y novedades de la app. Estas notificaciones promocionales son opcionales y puedes desactivarlas aquí en cualquier momento.", "Inicia sesión con Apple en tu perfil para elegir las notificaciones de novedades de Bobby.", "Tu elección está guardada. Las notificaciones de novedades aún no están disponibles.", "Bobby no pudo guardar tu elección de notificaciones. Inténtalo de nuevo."],
            "fr": ["Actualités de Bobby", "Préviens-moi des nouvelles langues et des nouveautés de l’app. Ces notifications promotionnelles sont facultatives et tu peux les désactiver ici à tout moment.", "Connecte-toi avec Apple dans ton profil pour choisir les notifications d’actualités de Bobby.", "Ton choix est enregistré. Les notifications d’actualités ne sont pas encore disponibles.", "Bobby n’a pas pu enregistrer ton choix de notifications. Réessaie."],
            "it": ["Novità di Bobby", "Avvisami delle nuove lingue e delle novità dell’app. Queste notifiche promozionali sono facoltative e puoi disattivarle qui in qualsiasi momento.", "Accedi con Apple nel profilo per scegliere le notifiche sulle novità di Bobby.", "La tua scelta è salvata. Le notifiche sulle novità non sono ancora disponibili.", "Bobby non ha potuto salvare la tua scelta sulle notifiche. Riprova."],
            "de": ["Neuigkeiten von Bobby", "Informiere mich über neue Sprachen und App-Neuigkeiten. Diese Werbebenachrichtigungen sind freiwillig und können hier jederzeit deaktiviert werden.", "Melde dich im Profil mit Apple an, um Benachrichtigungen zu Neuigkeiten von Bobby auszuwählen.", "Deine Auswahl ist gespeichert. Benachrichtigungen zu Neuigkeiten sind noch nicht verfügbar.", "Bobby konnte deine Benachrichtigungseinstellung nicht speichern. Versuche es erneut."],
            "pt": ["Novidades do Bobby", "Avisa-me sobre novos idiomas e novidades da app. Estas notificações promocionais são opcionais e podes desativá-las aqui a qualquer momento.", "Inicia sessão com a Apple no teu perfil para escolher as notificações de novidades do Bobby.", "A tua escolha está guardada. As notificações de novidades ainda não estão disponíveis.", "O Bobby não conseguiu guardar a tua escolha de notificações. Tenta novamente."],
            "pt-BR": ["Novidades do Bobby", "Avise-me sobre novos idiomas e novidades do app. Estas notificações promocionais são opcionais e você pode desativá-las aqui a qualquer momento.", "Entre com a Apple no seu perfil para escolher as notificações de novidades do Bobby.", "Sua escolha foi salva. As notificações de novidades ainda não estão disponíveis.", "O Bobby não conseguiu salvar sua escolha de notificações. Tente novamente."]
        ]
        let index: Int
        switch key { case .title: index = 0; case .consent: index = 1; case .signedOut: index = 2; case .unavailable: index = 3; case .failed: index = 4 }
        return (copy[language == "pt" && locale == "pt-BR" ? "pt-BR" : language] ?? copy["en"]!)[index]
    }
}

struct NewsPushSettingsView: View {
    let riskAccepted: Bool
    var center: NewsPushCenter = .shared
    let onClose: () -> Void
    @ObservedObject private var account = AccountSession.shared
    @AppStorage(L.preferenceKey) private var languageSelection = "system"

    var body: some View {
        NewsPushSettingsContent(riskAccepted: riskAccepted, signedIn: account.isSignedIn, center: center, onClose: onClose)
            .id(languageSelection)
    }
}

private struct NewsPushSettingsContent: View {
    let riskAccepted: Bool
    let signedIn: Bool
    @ObservedObject var center: NewsPushCenter
    let onClose: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                BriefingTopBar(title: NewsPushCopy.text(.title), onClose: onClose)
                Text(NewsPushCopy.text(.consent)).font(.system(size: 14)).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if !signedIn {
                    Text(NewsPushCopy.text(.signedOut)).font(.system(size: 14)).foregroundStyle(Theme.warmMuted)
                } else if !riskAccepted {
                    Text(L.t("Accept the risk notice first: until then Bobby sends nothing to its servers.",
                             "Primero acepta el aviso de riesgo: hasta entonces Bobby no envía nada a sus servidores."))
                        .font(.system(size: 14)).foregroundStyle(Theme.warmMuted)
                } else if center.settings == nil {
                    if center.loading { ProgressView().tint(Theme.cream) }
                    else {
                        Text(NewsPushCopy.text(.failed)).foregroundStyle(Theme.down)
                        Button(L.t("Retry", "Reintentar")) { Task { _ = await center.refresh() } }
                    }
                } else {
                    Toggle(isOn: Binding(get: { center.isOn }, set: { target in Task { _ = await center.setEnabled(target) } })) {
                        HStack {
                            Text(NewsPushCopy.text(.title)).font(.system(size: 16)).foregroundStyle(Theme.cream)
                            if center.pendingEnabled != nil { ProgressView().scaleEffect(0.7) }
                        }
                    }
                    .tint(Theme.orbViolet)
                    .disabled(center.pendingEnabled != nil || (center.settings?.offeredConsentVersion != NewsPushCenter.consentVersion && !center.isOn))
                    .accessibilityIdentifier("news-push-enabled")
                    if center.deliveryBlocked {
                        Text(L.t("Notifications blocked in iOS", "Notificaciones bloqueadas en iOS"))
                            .font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                        Button(L.t("Open Settings", "Abrir Ajustes")) { BriefingsCenter.shared.openSystemSettings() }
                            .accessibilityIdentifier("news-push-open-settings")
                    }
                    if center.settings?.hasCurrentConsent == true && center.permission == .notDetermined {
                        Button(NewsPushCopy.allowNotifications()) {
                            Task { _ = await center.authorizeDelivery() }
                        }
                        .accessibilityIdentifier("news-push-allow-notifications")
                    }
                    if center.settings?.newsEnabled == true && center.settings?.deliveryAvailable == false {
                        Text(NewsPushCopy.text(.unavailable)).font(.system(size: 13)).foregroundStyle(Theme.warmMuted)
                    }
                    if let error = center.lastError {
                        Text(errorText(error))
                            .font(.system(size: 13)).foregroundStyle(Theme.down)
                            .accessibilityIdentifier("news-push-error")
                    }
                }
            }
            .padding(22)
        }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .task {
            guard riskAccepted, signedIn else { return }
            await center.refreshPermission(); _ = await center.refresh()
        }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            Task { await center.refreshPermission(); _ = await center.refresh() }
        }
    }

    private func errorText(_ error: BriefingsError) -> String {
        switch error {
        case .signedOut: return NewsPushCopy.text(.signedOut)
        case .conflict, .unavailable: return error.message
        default: return NewsPushCopy.text(.failed)
        }
    }
}

/// A push opens the language controls; it never changes the choice without a tap on a language.
struct LanguageSettingsView: View {
    let onClose: () -> Void
    @AppStorage(L.preferenceKey) private var selection = "system"
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            BriefingTopBar(title: L.t("Language", "Idioma"), onClose: onClose)
            List {
                languageRow(value: "system", label: L.t("Follow iPhone language", "Usar el idioma del iPhone"))
                ForEach(AppLanguage.allCases, id: \.rawValue) { language in languageRow(value: language.rawValue, label: language.name) }
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
        .padding(22)
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .accessibilityIdentifier("language-settings")
    }
    private func languageRow(value: String, label: String) -> some View {
        Button { L.select(value) } label: {
            HStack { Text(label); Spacer(); if selection == value { Image(systemName: "checkmark") } }
                .foregroundStyle(Theme.cream)
        }
        .listRowBackground(Color.clear)
        .accessibilityIdentifier("language-choice-" + value)
    }
}
