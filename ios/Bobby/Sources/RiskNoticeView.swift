// First-launch risk notice. Nothing in Bobby is investment advice, and the
// human has to say so themselves before the squad appears: four statements,
// each acknowledged by hand, then one button. No swipe-to-dismiss, no
// "skip". Re-readable any time from the desk menu.
import SwiftUI

enum RiskNotice {
    /// Bump when the wording changes materially; users re-acknowledge.
    static let currentVersion = 5

    // Bodies expand in the scroll view so every recipient remains readable.
    // Shared by RiskNoticeView and the Núcleo risk beat (`riskNotice()`), so the
    // words the human agrees to are the same on both screens.
    static func statements(spanish: Bool) -> [(title: String, body: String)] {
        [
            (L.t("Allow AI processing of my questions.", "Permito que la IA procese mis preguntas.", spanish: spanish),
             L.t("Bobby sends your question and market data to OpenAI or Anthropic, depending on the analysis level. With voice on, reply text goes to OpenAI or Microsoft for speech. Dictation audio stays on your iPhone. Avoid personal or account details. You can withdraw AI consent here at any time.", "Bobby envía tu pregunta y datos de mercado a OpenAI o Anthropic, según el nivel de análisis. Con voz activa, el texto de respuesta va a OpenAI o Microsoft para narrarlo. El audio del dictado permanece en tu iPhone. Evita datos personales o de cuentas. Puedes retirar aquí el consentimiento de IA cuando quieras.", spanish: spanish)),
            (L.t("Not investment advice.", "No es asesoría de inversión.", spanish: spanish),
             L.t("Verdicts, levels and stops are educational analysis made by software, not recommendations for you.",
                 "Veredictos, niveles y stops son análisis educativo hecho por un programa, no recomendaciones para ti.", spanish: spanish)),
            (L.t("Bobby never touches your money.", "Bobby nunca toca tu dinero.", spanish: spanish),
             L.t("It doesn't connect wallets, move funds, execute trades or hold your keys.",
                 "No conecta wallets, no mueve fondos, no ejecuta operaciones y no guarda tus llaves.", spanish: spanish)),
            (L.t("You can lose money. You decide.", "Puedes perder dinero. Tú decides.", spanish: spanish),
             L.t("Data can be late or wrong. If you need advice, talk to a licensed professional.",
                 "Los datos pueden llegar tarde o mal. Si necesitas asesoría, acude a un profesional autorizado.", spanish: spanish)),
        ]
    }
}

struct RiskNoticeView: View {
    @ObservedObject var profile: AgentProfile
    /// Read-only mode from the menu: same text, a close button instead of the gate.
    var readOnly = false
    var onClose: (() -> Void)? = nil
    var onWithdraw: (() -> Void)? = nil

    @State private var checks: [Bool] = [false, false, false, false]
    @State private var confirmsWithdrawal = false

    private var statements: [(title: String, body: String)] { RiskNotice.statements(spanish: L.isSpanish) }

    private var allChecked: Bool { checks.allSatisfy { $0 } }
    /// Read-only shows the statements as agreed only once they really were (the Núcleo onboarding can
    /// open the notice before any consent): otherwise neutral marks and no "acknowledged" value.
    private var agreed: Bool { readOnly && profile.acceptedRiskNotice }

    private func mark(_ index: Int) -> (symbol: String, tint: Color) {
        if readOnly { return agreed ? ("checkmark.circle.fill", Theme.orbCyan) : ("info.circle", Theme.muted) }
        return checks[index] ? ("checkmark.circle.fill", Theme.orbCyan) : ("circle", Theme.muted)
    }

    private func value(_ index: Int) -> String {
        if readOnly { return agreed ? L.t("acknowledged", "aceptado") : "" }
        return checks[index] ? L.t("acknowledged", "aceptado") : L.t("not acknowledged", "sin aceptar")
    }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    HStack(spacing: 8) {
                        Circle().fill(Theme.orbCyan).frame(width: 7, height: 7).shadow(color: Theme.orbCyan, radius: 7)
                        Text(L.t("BOBBY // BEFORE WE START", "BOBBY // ANTES DE EMPEZAR"))
                            .font(.mono(11, .bold))
                            .kerning(1.9)
                            .foregroundStyle(Theme.text.opacity(0.78))
                    }
                    Spacer()
                    if readOnly {
                        Button { onClose?() } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundStyle(Theme.text.opacity(0.7))
                                .frame(width: 44, height: 44)
                                .background(Theme.card)
                                .clipShape(Circle())
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 14)

                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        Text(L.t("Read this once. It matters.", "Léelo una vez. Importa."))
                            .font(.system(size: 28, weight: .light))
                            .foregroundStyle(Theme.text)
                        Text(L.t("Bobby is here to make you think, not to tell you what to do with your money.",
                                 "Bobby está para hacerte pensar, no para decirte qué hacer con tu dinero."))
                            .font(.rounded(15, .medium))
                            .foregroundStyle(Theme.text.opacity(0.75))

                        ForEach(Array(statements.enumerated()), id: \.offset) { index, item in
                            Button {
                                guard !readOnly else { return }
                                UIImpactFeedbackGenerator(style: .light).impactOccurred()
                                withAnimation(.spring(duration: 0.3)) { checks[index].toggle() }
                            } label: {
                                HStack(alignment: .top, spacing: 12) {
                                    Image(systemName: mark(index).symbol)
                                        .font(.system(size: 22, weight: .semibold))
                                        .foregroundStyle(mark(index).tint)
                                        .padding(.top, 1)
                                    VStack(alignment: .leading, spacing: 4) {
                                        Text(item.title)
                                            .font(.rounded(15, .bold))
                                            .foregroundStyle(Theme.text)
                                        Text(item.body)
                                            .font(.rounded(13, .medium))
                                            .foregroundStyle(Theme.text.opacity(0.7))
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 0)
                                }
                                .padding(14)
                                .background(checks[index] && !readOnly ? Theme.orbCyan.opacity(0.06) : Theme.card)
                                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(checks[index] && !readOnly ? Theme.orbCyan.opacity(0.4) : Theme.stroke, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(item.title)
                            .accessibilityValue(value(index))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text(L.t("Bobby does not publish your questions.",
                                     "Bobby no publica tus preguntas."))
                                .font(.mono(10, .medium))
                                .foregroundStyle(Theme.muted)
                            Link(destination: L.site("privacy")) {
                                Text(L.t("Privacy Policy", "Aviso de privacidad"))
                                    .font(.mono(10, .medium))
                                    .underline()
                                    .foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    .padding(.horizontal, 18)
                    .padding(.vertical, 18)
                }

                if !readOnly {
                    Button {
                        guard allChecked else { return }
                        UINotificationFeedbackGenerator().notificationOccurred(.success)
                        withAnimation(.spring(duration: 0.45)) { profile.riskNoticeVersion = RiskNotice.currentVersion }
                    } label: {
                        HStack {
                            Text(allChecked
                                 ? L.t("I UNDERSTAND. LET ME IN", "ENTIENDO. DÉJAME ENTRAR")
                                 : L.t("ACKNOWLEDGE ALL FOUR", "ACEPTA LOS CUATRO PUNTOS"))
                                .font(.mono(12, .bold))
                                .kerning(1.7)
                            Spacer()
                            Image(systemName: allChecked ? "arrow.right" : "hand.raised.fill")
                                .font(.system(size: 13, weight: .bold))
                        }
                        .foregroundStyle(allChecked ? .black : Theme.text.opacity(0.55))
                        .padding(.horizontal, 18)
                        .frame(height: 52)
                        .background(allChecked ? Theme.orbCyan : Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(allChecked ? .clear : Theme.stroke, lineWidth: 1))
                        .shadow(color: allChecked ? Theme.orbCyan.opacity(0.3) : .clear, radius: 14, y: 4)
                    }
                    .disabled(!allChecked)
                    .animation(.easeOut(duration: 0.25), value: allChecked)
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 10)
                } else if let onWithdraw, profile.acceptedRiskNotice {
                    // Nothing to withdraw before consent was given.
                    Button(L.t("Withdraw AI consent", "Retirar consentimiento de IA"), role: .destructive) {
                        confirmsWithdrawal = true
                    }
                    .font(.rounded(14, .semibold))
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("risk-withdraw-consent")
                    .padding(.bottom, 10)
                    .confirmationDialog(L.t("Stop AI processing?", "¿Detener el procesamiento de IA?"),
                                        isPresented: $confirmsWithdrawal, titleVisibility: .visible) {
                        Button(L.t("Withdraw consent", "Retirar consentimiento"), role: .destructive) { onWithdraw() }
                        Button(L.t("Cancel", "Cancelar"), role: .cancel) {}
                    } message: {
                        Text(L.t("New analyses and generated speech will stop. You can agree again before asking another question. This does not delete your account or data already sent; use Profile to delete your account.",
                                 "Se detendrán nuevos análisis y la voz generada. Puedes volver a aceptar antes de hacer otra pregunta. Esto no borra tu cuenta ni datos ya enviados; usa Perfil para borrar tu cuenta."))
                    }
                }
            }
        }
        .preferredColorScheme(.dark)
        .interactiveDismissDisabled(!readOnly)
        .onAppear {
            // First launch: parse the starters while the human reads, so the
            // first companion is already on stage when onboarding opens.
            if !readOnly { MascotAssetCache.preload(bobbyCompanions.filter { $0.requiredLevel == 1 }.map(\.id)) }
        }
    }
}
