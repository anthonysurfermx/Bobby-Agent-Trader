// First-launch risk notice. Nothing in Bobby is investment advice, and the
// human has to say so themselves before the squad appears: three statements,
// each acknowledged by hand, then one button. No swipe-to-dismiss, no
// "skip". Re-readable any time from the desk menu.
import SwiftUI

enum RiskNotice {
    /// Bump when the wording changes materially; users re-acknowledge.
    static let currentVersion = 1
}

struct RiskNoticeView: View {
    @ObservedObject var profile: AgentProfile
    /// Read-only mode from the menu: same text, a close button instead of the gate.
    var readOnly = false
    var onClose: (() -> Void)? = nil

    @State private var checks: [Bool] = [false, false, false]

    private var statements: [(title: String, body: String)] {
        [
            (L.t("Not investment advice.", "No es asesoría de inversión."),
             L.t("Everything Bobby says — verdicts, levels, entries, stops, XP — is educational market analysis produced by software. It is not a recommendation to buy, sell or hold anything, and it is not tailored to you.",
                 "Todo lo que dice Bobby (veredictos, niveles, entradas, stops, XP) es análisis educativo generado por software. No es una recomendación de comprar, vender o mantener nada, y no está hecho a tu medida.")),
            (L.t("Bobby never touches your money.", "Bobby nunca toca tu dinero."),
             L.t("The app does not execute trades, does not hold funds or keys, and does not connect to your exchange. Anything you do with a broker or a wallet is your own action, outside this app.",
                 "La app no ejecuta operaciones, no guarda fondos ni llaves y no se conecta a tu exchange. Lo que hagas en un bróker o una wallet es tu propia acción, fuera de esta app.")),
            (L.t("Markets involve risk. You decide.", "Los mercados implican riesgo. Tú decides."),
             L.t("Prices move against you, data can be delayed or wrong, and you can lose money. Only you own your decisions and their results. If you need advice, talk to a licensed professional.",
                 "Los precios se mueven en tu contra, los datos pueden llegar tarde o mal, y puedes perder dinero. Solo tú eres dueño de tus decisiones y de sus resultados. Si necesitas asesoría, acude a un profesional autorizado.")),
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
                        Text(L.t("Bobby is a market-analysis companion built to make you think, not to tell you what to do with your money.",
                                 "Bobby es un compañero de análisis de mercado hecho para hacerte pensar, no para decirte qué hacer con tu dinero."))
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
                            Text(L.t("Data comes from public market sources and can be delayed. Bobby's public calls are recorded on-chain so anyone can check them; that is a track record, not a promise.",
                                     "Los datos vienen de fuentes públicas de mercado y pueden llegar con retraso. Las llamadas públicas de Bobby se registran on-chain para que cualquiera las revise; eso es historial, no promesa."))
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
                                 : L.t("ACKNOWLEDGE ALL THREE", "ACEPTA LOS TRES PUNTOS"))
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
    }
}
