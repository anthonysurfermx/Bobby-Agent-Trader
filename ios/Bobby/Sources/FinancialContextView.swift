import SwiftUI
import UIKit

/// No history or bearer is sent to ChatGPT. The person chooses and reviews facts before the API write.
struct FinancialContextView: View {
    let onClose: () -> Void
    @ObservedObject private var account = AccountSession.shared
    @StateObject private var center = FinancialContextCenter()
    @State private var input = ""
    @State private var review: [FinancialContextEditor] = []
    @State private var consent = false
    @State private var draftId: String?
    @State private var editingId: String?
    @State private var requestId = UUID().uuidString
    @State private var deleteAll = false
    @State private var copied = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                BriefingTopBar(title: L.t("ChatGPT context", "Contexto de ChatGPT"), onClose: onClose)
                Text(L.t("Bring the facts you choose", "Trae los datos que tú eliges"))
                    .font(.title2).foregroundStyle(Theme.cream)
                Text(L.t("Share selected financial facts from a conversation. Bobby cannot read your full ChatGPT history. Reported facts are dated and unverified; they are not verified bank movements or a suitability assessment.", "Comparte los datos financieros elegidos de una conversación. Bobby no puede leer todo tu historial de ChatGPT. Los datos son declarados, fechados y no verificados; no son movimientos bancarios verificados ni una evaluación de idoneidad."))
                    .font(.subheadline).foregroundStyle(Theme.warmMuted)
                if !account.isSignedIn {
                    Text(FinancialContextError.signedOut.message).foregroundStyle(Theme.warmMuted)
                } else {
                    if let snapshot = center.snapshot { loaded(snapshot) }
                    else if !center.busy {
                        Button(L.t("Load context", "Cargar contexto")) { Task { await center.request() } }
                    }
                    if center.busy { ProgressView().tint(Theme.warmMuted) }
                    if let error = center.error { Text(error).foregroundStyle(Theme.down).font(.footnote) }
                }
            }.padding(22)
        }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .environment(\.colorScheme, .dark)
        .task { if account.isSignedIn { await center.request() } }
        .onReceive(NotificationCenter.default.publisher(for: AccountSession.didChange, object: AccountSession.shared)) { _ in
            input = ""; review = []; consent = false; draftId = nil; editingId = nil; copied = false; deleteAll = false
            requestId = UUID().uuidString; center.reset()
            Task { if account.isSignedIn { await center.request() } }
        }
        .onChange(of: review) { _, _ in consent = false; requestId = UUID().uuidString }
        .confirmationDialog(L.t("Delete all financial context and saved recommendations?", "¿Borrar todo el contexto financiero y las recomendaciones guardadas?"), isPresented: $deleteAll, titleVisibility: .visible) {
            Button(L.t("Delete everything", "Borrar todo"), role: .destructive) {
                Task { if await center.request(method: "DELETE", query: "scope=all") { input = ""; review = []; consent = false; draftId = nil; editingId = nil } }
            }
            Button(L.t("Cancel", "Cancelar"), role: .cancel) {}
        }
        .accessibilityIdentifier("financial-context")
    }

    @ViewBuilder private func loaded(_ state: FinancialContextSnapshot) -> some View {
        Toggle(L.t("Use financial context", "Usar contexto financiero"), isOn: Binding(get: { state.financialMemoryEnabled }, set: { value in
            Task { await center.request(method: "PATCH", body: ["enabled": value]) }
        })).disabled(center.busy).accessibilityIdentifier("financial-context-enabled")
        Text(L.t("Enable this to remember facts you approve and newly delivered recommendations. It stays paused while account memory is paused.", "Actívalo para recordar los datos que apruebes y las recomendaciones nuevas. Se mantiene en pausa si la memoria de la cuenta está en pausa."))
            .font(.footnote).foregroundStyle(Theme.warmMuted)
        if !state.accountMemoryEnabled {
            Text(L.t("Account memory is paused. Resume it in Profile → Memory to use financial context. You can still turn financial context off here.", "La memoria de la cuenta está en pausa. Reanúdala en Perfil → Memoria para usar el contexto financiero. Puedes desactivar el contexto financiero aquí."))
                .font(.footnote).foregroundStyle(Theme.warmMuted)
        }
        Text(state.enabled
             ? L.t("Shared across iOS, Android and web on this Bobby account.", "Compartido entre iOS, Android y web en esta cuenta de Bobby.")
             : L.t("Paused: facts cannot be imported or shared with ChatGPT, and new recommendations are not saved.", "En pausa: no se pueden importar ni compartir datos con ChatGPT y no se guardan recomendaciones nuevas."))
            .font(.footnote).foregroundStyle(Theme.warmMuted)
        Button(copied ? L.t("Prompt copied", "Instrucción copiada") : L.t("1. Copy prompt for ChatGPT", "1. Copiar instrucción para ChatGPT")) {
            UIPasteboard.general.string = FinancialContextCopy.exportPrompt; copied = true
        }.accessibilityIdentifier("financial-context-copy-prompt")
        Text(L.t("Choose the facts in ChatGPT, then paste its JSON here. Full chats, names, credentials and account/card numbers are never needed.", "Elige los datos en ChatGPT y pega su JSON aquí. Nunca hacen falta chats completos, nombres, credenciales ni números de cuentas o tarjetas."))
            .font(.footnote).foregroundStyle(Theme.warmMuted)
        TextEditor(text: $input).frame(minHeight: 120).overlay(RoundedRectangle(cornerRadius: 8).stroke(Theme.warmMuted.opacity(0.3)))
            .accessibilityLabel(L.t("Bobby JSON from ChatGPT", "JSON de Bobby desde ChatGPT"))
            .accessibilityIdentifier("financial-context-json")
        Button(L.t("2. Review pasted facts", "2. Revisar los datos pegados")) {
            do { startReview(try FinancialContextItem.importJSON(input)); input = ""; center.error = nil }
            catch { center.error = FinancialContextError.invalidImport.message }
        }.disabled(center.busy || !state.enabled).accessibilityIdentifier("financial-context-review")
        if !review.isEmpty { reviewSection(enabled: state.enabled).disabled(center.busy) }
        if !state.drafts.isEmpty {
            Text(L.t("Pending from ChatGPT", "Pendientes desde ChatGPT")).font(.headline)
            ForEach(state.drafts) { draft in
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(draft.items.count) " + L.t("facts · expires ", "datos · caduca ") + draft.expiresAt).font(.footnote)
                    Button(L.t("Review draft", "Revisar borrador")) { startReview(draft.items, draft: draft.id) }.disabled(center.busy || !state.enabled)
                    Button(L.t("Discard draft", "Descartar borrador"), role: .destructive) {
                        guard UUID(uuidString: draft.id) != nil else { return }
                        Task {
                            if await center.request(method: "DELETE", query: "draftId=" + draft.id), draftId == draft.id { review = []; draftId = nil; consent = false }
                        }
                    }.disabled(center.busy)
                }
            }
        }
        Text(L.t("Saved facts", "Datos guardados")).font(.headline)
        Text(L.t("Kept until you delete them. Correct anything outdated. Transactions are user reported, never bank verified.", "Se conservan hasta que los borres. Corrige los datos desactualizados. Las transacciones son declaradas por ti, nunca verificadas por un banco."))
            .font(.footnote).foregroundStyle(Theme.warmMuted)
        if state.items.isEmpty { Text(L.t("No saved facts yet.", "Aún no hay datos guardados.")).font(.footnote) }
        ForEach(state.items) { row in
            VStack(alignment: .leading, spacing: 8) {
                Text(row.summary)
                Text([row.category, row.observedAt, row.amount.map { "\($0) \(row.currency ?? "")" }, "ChatGPT · " + L.t("user reported", "declarado por ti"), row.updatedAt].compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(Theme.warmMuted)
                HStack {
                    Button(L.t("Correct", "Corregir")) { startReview([row.item], edit: row.id) }.disabled(center.busy || !state.enabled)
                    Button(L.t("Delete", "Borrar"), role: .destructive) {
                        guard UUID(uuidString: row.id) != nil else { return }
                        Task { await center.request(method: "DELETE", query: "id=" + row.id) }
                    }.disabled(center.busy)
                }
            }.padding(.vertical, 6)
            Divider()
        }
        Text(L.t("Your Bobby recommendations", "Tus recomendaciones de Bobby")).font(.headline)
        Text(L.t("Saved for up to 90 days. Copy only the recommendation you choose into ChatGPT. Each recommendation shows the market data timestamp and when it was saved.", "Guardadas hasta 90 días. Copia en ChatGPT solo la recomendación que elijas. Cada recomendación muestra la fecha de los datos de mercado y cuándo se guardó."))
            .font(.footnote).foregroundStyle(Theme.warmMuted)
        Text(L.t("To save new answers from this iPhone, also enable Profile → Memory → Include iPhone questions.", "Para guardar respuestas nuevas de este iPhone, activa también Perfil → Memoria → Incluir preguntas del iPhone."))
            .font(.footnote).foregroundStyle(Theme.warmMuted)
        if state.recommendations.isEmpty { Text(L.t("No saved recommendations yet. New account analyses appear while context is enabled.", "Aún no hay recomendaciones guardadas. Los análisis nuevos de la cuenta aparecen cuando el contexto está activo.")).font(.footnote) }
        ForEach(state.recommendations) { rec in
            VStack(alignment: .leading, spacing: 6) {
                Text(rec.symbol + " · " + L.t("Market data as of: ", "Datos de mercado al: ") + rec.asOf).font(.caption).foregroundStyle(Theme.warmMuted)
                Text(rec.headline)
                Text(L.t("Saved: ", "Guardada: ") + rec.createdAt).font(.caption).foregroundStyle(Theme.warmMuted)
                Text(L.t("Why: ", "Motivo: ") + rec.why).font(.footnote)
                Text(L.t("Risk: ", "Riesgo: ") + rec.risk).font(.footnote)
                Text(L.t("Watch: ", "Vigila: ") + rec.watch).font(.footnote)
                Text(rec.verdict + " · " + rec.direction).font(.caption).foregroundStyle(Theme.warmMuted)
                HStack {
                    Button(L.t("Copy for ChatGPT", "Copiar para ChatGPT")) { UIPasteboard.general.string = rec.shareText }
                    ShareLink(item: rec.shareText) { Text(L.t("Share", "Compartir")) }
                }.disabled(!state.enabled)
            }.padding(.vertical, 6)
            Divider()
        }
        Button(L.t("Delete all context and recommendations", "Borrar todo el contexto y las recomendaciones"), role: .destructive) { deleteAll = true }.disabled(center.busy)
    }

    private func startReview(_ items: [FinancialContextItem], draft: String? = nil, edit: String? = nil) {
        review = items.map(FinancialContextEditor.init); draftId = draft; editingId = edit; consent = false; requestId = UUID().uuidString
    }
    @ViewBuilder private func reviewSection(enabled: Bool) -> some View {
        Text(L.t("Review each fact", "Revisa cada dato")).font(.headline)
        ForEach($review) { $row in FinancialContextEditorRow(row: $row) }
        Toggle(L.t("I approve these selected facts being saved to my Bobby account and shared when I ask the connected ChatGPT integration.", "Autorizo guardar estos datos seleccionados en mi cuenta de Bobby y compartirlos cuando lo solicite en la integración conectada de ChatGPT."), isOn: $consent)
            .font(.footnote).accessibilityIdentifier("financial-context-consent")
        Button(L.t("3. Save approved facts", "3. Guardar los datos aprobados")) {
            do {
                let items = try review.filter(\.selected).map { try $0.item().body }
                guard !items.isEmpty else { throw FinancialContextError.invalidImport }
                var body: [String: Any]
                let method: String
                if let editingId { body = ["id": editingId, "item": items[0], "consent": true]; method = "PATCH" }
                else {
                    body = ["action": "import", "items": items, "consent": true, "requestId": requestId]; method = "POST"
                    if let draftId { body["draftId"] = draftId }
                }
                Task { if await center.request(method: method, body: body) { review = []; consent = false; draftId = nil; editingId = nil } }
            } catch { center.error = FinancialContextError.invalidImport.message }
        }.disabled(!enabled || center.busy || !consent || !review.contains(where: \.selected))
            .accessibilityIdentifier("financial-context-save")
        Button(L.t("Cancel review", "Cancelar revisión")) { review = []; consent = false; draftId = nil; editingId = nil }
    }
}

struct FinancialContextEditor: Identifiable, Equatable {
    let id = UUID()
    var selected = true
    var category: String
    var summary: String
    var amount: String
    var currency: String
    var observedAt: String
    init(_ item: FinancialContextItem) {
        category = item.category; summary = item.summary; amount = item.amount.map { String($0) } ?? ""
        currency = item.currency ?? ""; observedAt = item.observedAt ?? ""
    }
    func item() throws -> FinancialContextItem {
        var json: [String: Any] = ["category": category, "summary": summary.trimmingCharacters(in: .whitespacesAndNewlines)]
        if !amount.isEmpty {
            guard let number = Double(amount) else { throw FinancialContextError.invalidImport }
            json["amount"] = number
        }
        if !currency.isEmpty { json["currency"] = currency }
        if !observedAt.isEmpty { json["observedAt"] = observedAt }
        return try FinancialContextItem.parse(json)
    }
}
private struct FinancialContextEditorRow: View {
    @Binding var row: FinancialContextEditor
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(L.t("Include this fact", "Incluir este dato"), isOn: $row.selected)
            Picker(L.t("Category", "Categoría"), selection: $row.category) {
                ForEach(FinancialContextItem.categories, id: \.self) { Text($0).tag($0) }
            }
            TextField(L.t("Summary", "Resumen"), text: $row.summary, axis: .vertical)
            TextField(L.t("Amount (optional)", "Importe (opcional)"), text: $row.amount).keyboardType(.decimalPad)
            TextField(L.t("Currency (EUR, USD…)", "Moneda (EUR, USD…)"), text: $row.currency).textInputAutocapitalization(.characters).autocorrectionDisabled()
            TextField(L.t("Date YYYY-MM-DD (optional)", "Fecha AAAA-MM-DD (opcional)"), text: $row.observedAt).autocorrectionDisabled()
        }.textFieldStyle(.roundedBorder).padding(12).background(Theme.warmMuted.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }
}

enum FinancialContextCopy {
    static let exportPrompt = "Prepare only the financial facts I explicitly choose to share with Bobby from this conversation. Ask me which facts if I have not selected them. Do not access or reconstruct my full chat history. Do not include raw messages, names, account/card numbers, passwords, credentials, or anything unrelated to my chosen financial task. Do not infer facts or describe reported transactions as verified. Return only JSON, without markdown, in this format: {\"format\":\"bobby-context-v1\",\"items\":[{\"category\":\"goal\",\"summary\":\"Build an emergency fund\",\"amount\":3000,\"currency\":\"EUR\"}]}. Replace the example with my chosen facts and their real dates; omit unknown amounts, currencies and dates. Allowed categories: goal, income, expense, debt, asset, preference, transaction. Each summary is one line, at most 240 characters; at most 20 items. Amounts are nonnegative numbers and require a three-letter uppercase currency. I will review and approve them in Bobby before saving."
}
