// First-launch risk notice. Nothing in Bobby is investment advice, and the
// human has to say so themselves before the squad appears: three statements,
// each acknowledged by hand, then one button. No swipe-to-dismiss, no
// "skip". Re-readable any time from the desk menu.
import SwiftUI

enum RiskNotice {
    /// Bump when the wording changes materially; users re-acknowledge.
    static let currentVersion = 3
}

struct RiskNoticeView: View {
    @ObservedObject var profile: AgentProfile
    /// Read-only mode from the menu: same text, a close button instead of the gate.
    var readOnly = false
    var onClose: (() -> Void)? = nil

    @State private var checks: [Bool] = [false, false, false, false]

    // Copy rule: every title fits one line and every body at most three,
    // down to a 375 pt screen. Same three commitments, fewer words.
    private var statements: [(title: String, body: String)] {
        [
            (L.t("Allow AI processing of my questions.", "Permito que la IA procese mis preguntas."),
             L.t("Bobby sends your typed question and public market data to OpenAI to generate the analysis. Avoid including personal or financial account details.", "Bobby envía tu pregunta escrita y datos públicos de mercado a OpenAI para generar el análisis. Evita incluir datos personales o de tus cuentas financieras.")),
            (L.t("Not investment advice.", "No es asesoría de inversión."),
             L.t("Verdicts, levels and stops are educational analysis made by software, not recommendations for you.",
                 "Veredictos, niveles y stops son análisis educativo hecho por un programa, no recomendaciones para ti.")),
            (L.t("Bobby never touches your money.", "Bobby nunca toca tu dinero."),
             L.t("It doesn't connect wallets, move funds, execute trades or hold your keys.",
                 "No conecta wallets, no mueve fondos, no ejecuta operaciones y no guarda tus llaves.")),
            (L.t("You can lose money. You decide.", "Puedes perder dinero. Tú decides."),
             L.t("Data can be late or wrong. If you need advice, talk to a licensed professional.",
                 "Los datos pueden llegar tarde o mal. Si necesitas asesoría, acude a un profesional autorizado.")),
        ]
    }

    private var allChecked: Bool { checks.allSatisfy { $0 } }

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                HStack {
                    HStack(spacing: 8) {
                        Circle().fill(Theme.up).frame(width: 7, height: 7).shadow(color: Theme.up, radius: 7)
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
                                .frame(width: 32, height: 32)
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
                            .font(.rounded(26, .bold))
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
                                    Image(systemName: readOnly || checks[index] ? "checkmark.circle.fill" : "circle")
                                        .font(.system(size: 22, weight: .semibold))
                                        .foregroundStyle(readOnly || checks[index] ? Theme.up : Theme.muted)
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
                                .background(checks[index] && !readOnly ? Theme.up.opacity(0.06) : Theme.card)
                                .clipShape(RoundedRectangle(cornerRadius: 12))
                                .overlay(RoundedRectangle(cornerRadius: 12).stroke(checks[index] && !readOnly ? Theme.up.opacity(0.4) : Theme.stroke, lineWidth: 1))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(item.title)
                            .accessibilityValue(checks[index] ? L.t("acknowledged", "aceptado") : L.t("not acknowledged", "sin aceptar"))
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text(L.t("Bobby's public calls are recorded on-chain so anyone can check them. A track record, not a promise.",
                                     "Los veredictos públicos de Bobby quedan on-chain para que cualquiera los revise. Historial, no promesa."))
                                .font(.mono(10, .medium))
                                .foregroundStyle(Theme.muted)
                            Link(destination: URL(string: "https://bobbyprotocol.xyz/privacy")!) {
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
                        .background(allChecked ? Theme.up : Theme.card)
                        .clipShape(RoundedRectangle(cornerRadius: 10))
                        .overlay(RoundedRectangle(cornerRadius: 10).stroke(allChecked ? .clear : Theme.stroke, lineWidth: 1))
                        .shadow(color: allChecked ? Theme.up.opacity(0.3) : .clear, radius: 14, y: 4)
                    }
                    .disabled(!allChecked)
                    .animation(.easeOut(duration: 0.25), value: allChecked)
                    .padding(.horizontal, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 10)
                }
            }
        }
        .interactiveDismissDisabled(!readOnly)
        .onAppear {
            // First launch: parse the starters while the human reads, so the
            // first companion is already on stage when onboarding opens.
            if !readOnly { MascotAssetCache.preload(bobbyCompanions.filter { $0.requiredLevel == 1 }.map(\.id)) }
        }
    }
}
