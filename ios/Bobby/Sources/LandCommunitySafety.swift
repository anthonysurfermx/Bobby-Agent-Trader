import SwiftUI

/// One island per creator, with a stable code across renames and republication.
/// Blocking that code hides the creator locally without requiring an account.
@MainActor
final class LandCommunitySafety: ObservableObject {
    @Published private(set) var blocked: [String: String]
    private let defaults: UserDefaults
    private let transport: URLSession
    private let key = "land.blockedCreators.v1"
    private let installation: String

    init(defaults: UserDefaults = .standard, transport: URLSession = .shared) {
        self.defaults = defaults; self.transport = transport
#if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-community-safety-test-reset") { defaults.removeObject(forKey: key) }
#endif
        blocked = defaults.dictionary(forKey: key) as? [String: String] ?? [:]
        installation = defaults.string(forKey: "land.reportInstallation") ?? UUID().uuidString
        defaults.set(installation, forKey: "land.reportInstallation")
    }
    func allows(_ island: PublicIsland) -> Bool { island.isShowcase || blocked[island.code] == nil }
    func block(_ island: PublicIsland) {
        guard !island.isShowcase else { return }
        blocked[island.code] = LandIslandStatus.title(island)
        defaults.set(blocked, forKey: key)
    }
    func unblock(_ code: String) {
        blocked.removeValue(forKey: code); defaults.set(blocked, forKey: key)
    }
    func report(_ island: PublicIsland, reason: String, details: String) async throws {
        guard !island.isShowcase else { throw URLError(.badURL) }
        var request = URLRequest(url: BobbyAPI.base.appendingPathComponent("api/trader-land-report"))
        request.httpMethod = "POST"; request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["code": island.code, "installation": installation, "reason": reason, "details": String(details.prefix(500))])
        let (data, response) = try await transport.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let result = try JSONSerialization.jsonObject(with: data) as? [String: Any], result["ok"] as? Bool == true else { throw URLError(.badServerResponse) }
    }
}

struct LandCommunitySheet: View {
    let island: PublicIsland?
    @ObservedObject var safety: LandCommunitySafety
    @Environment(\.dismiss) private var dismiss
    @State private var reason = "offensive"
    @State private var details = ""
    @State private var sending = false
    @State private var sent = false
    @State private var failed = false
    @State private var confirmBlock = false

    var body: some View {
        NavigationStack {
            Form {
                if let island, !island.isShowcase {
                    Section(LandIslandStatus.title(island)) {
                        Picker(L.t("Reason", "Motivo"), selection: $reason) {
                            Text(L.t("Offensive content", "Contenido ofensivo")).tag("offensive")
                            Text(L.t("Harassment or threats", "Acoso o amenazas")).tag("harassment")
                            Text(L.t("Spam or scam", "Spam o estafa")).tag("spam")
                            Text(L.t("Other concern", "Otro problema")).tag("other")
                        }
                        TextField(L.t("Details (optional; no personal information)", "Detalles (opcional; sin datos personales)"), text: $details, axis: .vertical)
                            .lineLimit(3...5).onChange(of: details) { _, value in details = String(value.prefix(500)) }
                        Button {
                            sending = true; failed = false
                            Task {
                                do { try await safety.report(island, reason: reason, details: details); sent = true }
                                catch { failed = true }
                                sending = false
                            }
                        } label: {
                            Text(sending ? L.t("Sending…", "Enviando…") : sent ? L.t("Report received", "Reporte recibido") : L.t("Send report", "Enviar reporte"))
                        }.disabled(sending || sent).accessibilityIdentifier("land-send-report")
                        if sent { Text(L.t("The report is in Bobby's review queue. You can also block this creator now.", "El reporte está en la cola de revisión de Bobby. También puedes bloquear al creador ahora.")).font(.footnote) }
                        if failed { Text(L.t("Your report was not sent. Try again or contact support.", "No se envió el reporte. Inténtalo de nuevo o contacta a soporte.")).foregroundStyle(.red) }
                        Button(L.t("Block creator", "Bloquear creador"), role: .destructive) { confirmBlock = true }
                            .accessibilityIdentifier("land-block-creator")
                    }
                }
                Section(L.t("Blocked creators on this device", "Creadores bloqueados en este dispositivo")) {
                    if safety.blocked.isEmpty { Text(L.t("No blocked creators", "No hay creadores bloqueados")).foregroundStyle(.secondary) }
                    ForEach(safety.blocked.keys.sorted(), id: \.self) { code in
                        HStack {
                            Text(safety.blocked[code] ?? code)
                            Spacer()
                            Button(L.t("Unblock", "Desbloquear")) { safety.unblock(code) }.accessibilityIdentifier("land-unblock-\(code)")
                        }
                    }
                }
                Section {
                    Text(L.t("Keep island names respectful. Hate, sexual content, threats, scams and harassment are not allowed. Reports are reviewed and abusive creators can lose publishing access.", "Usa nombres respetuosos. No se permite odio, contenido sexual, amenazas, estafas ni acoso. Revisamos los reportes y podemos retirar el acceso a publicar a quienes abusen."))
                        .font(.footnote)
                    Link(L.t("Community rules and support", "Reglas de la comunidad y soporte"), destination: URL(string: "https://bobbyprotocol.xyz/support")!)
                }
            }
            .navigationTitle(L.t("Community safety", "Seguridad de la comunidad"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(L.t("Done", "Listo")) { dismiss() } } }
            .confirmationDialog(L.t("Block this creator?", "¿Bloquear a este creador?"), isPresented: $confirmBlock, titleVisibility: .visible) {
                if let island { Button(L.t("Block creator", "Bloquear creador"), role: .destructive) { safety.block(island); dismiss() }.accessibilityIdentifier("land-confirm-block") }
            } message: { Text(L.t("Their island stays hidden on this device, even if renamed. You can unblock them here.", "Su isla quedará oculta en este dispositivo, aunque cambie de nombre. Puedes desbloquearlo aquí.")) }
        }.preferredColorScheme(.dark)
    }
}
