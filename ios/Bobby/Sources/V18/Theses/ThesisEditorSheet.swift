// Write or edit a thesis (1.8). The person's own words about one asset: why they are looking at
// it, what worries them, what would change their mind, and for how long. Bobby may prefill a
// draft from a read, clearly labelled; nothing is stored until the person taps Save.
// The route opens it through `V18Focus`: a thesis id (edit) or the request id of a read (draft).
import SwiftUI

struct ThesisEditorSheet: View {
    @ObservedObject var session: NucleoSession
    let onClose: () -> Void
    @StateObject private var model: ThesisEditorModel

    init(session: NucleoSession, onClose: @escaping () -> Void) {
        self.session = session
        self.onClose = onClose
        // Evaluated once, when the sheet appears: the hand-off is consumed here and nowhere else.
        _model = StateObject(wrappedValue: ThesisEditorModel(
            source: ThesisEditorModel.open(thesisId: V18Focus.takeThesisId(), draftRequestId: V18Focus.takeDraftRequestId(),
                                           owner: session.desk.thesisOwner,
                                           readSummary: { session.desk.readSummary(requestId: $0) }),
            owner: { [weak session] in session?.desk.thesisOwner }))
    }

    var body: some View {
        ThesisEditorView(model: model,
                         onSaved: { _ in onClose() },
                         onOpenExisting: { id in
                             V18Focus.thesisId = id
                             session.switchSheet(to: .theses)
                         },
                         onClose: onClose)
            // Another account (or none) now: these words were being written for the previous one.
            .onReceive(NotificationCenter.default.publisher(for: AccountSession.didChange)) { _ in onClose() }
    }
}

/// The editor itself, on a model: the sheet above and the review fixtures both show this.
/// V18-DESIGN.md, "Thesis editor": one question and one generous field; the two optional
/// questions unfold; the time frame is one row; where it is kept is one line above Save.
struct ThesisEditorView: View {
    @ObservedObject var model: ThesisEditorModel
    let onSaved: (SavedThesis) -> Void
    let onOpenExisting: (String) -> Void
    let onClose: () -> Void

    private enum Field: Hashable { case hypothesis, worry, changeMind }
    @FocusState private var focus: Field?
    @State private var asksToDiscard = false
    @State private var showsMore = false
    @State private var showsDetails = false

    /// The X: words that are not saved are never dropped without asking once.
    private func close() {
        if model.hasUnsavedWords { focus = nil; asksToDiscard = true } else { onClose() }
    }

    var body: some View {
        screen
            // A pull on the sheet cannot throw the words away either; the X asks.
            .interactiveDismissDisabled(model.hasUnsavedWords)
            .confirmationDialog(L.t("Discard your text?", "¿Descartar tu texto?"), isPresented: $asksToDiscard, titleVisibility: .visible) {
                Button(L.t("Discard", "Descartar"), role: .destructive) { onClose() }
                Button(L.t("Keep writing", "Seguir escribiendo"), role: .cancel) {}
            }
            // Words that are already there are never folded away.
            .onAppear { showsMore = !model.worry.isEmpty || !model.changeMind.isEmpty }
            .sheet(isPresented: $showsDetails) {
                QuietSheet(title: L.t("Details", "Detalles"), closeId: "thesis-editor-details-close", onClose: { showsDetails = false }) {
                    VStack(alignment: .leading, spacing: 12) {
                        if let price = model.startingPrice {
                            QuietRow(label: L.t("Starting price", "Precio inicial"), value: ThesisCopy.price(price), hairline: false,
                                     id: "thesis-editor-asset")
                        }
                        QuietNote(text: ThesisCopy.localOnly, id: "thesis-editor-local-only")
                    }
                    .padding(.top, 12)
                }
                .presentationDetents([.medium])
                .presentationDragIndicator(.visible)
                .presentationBackground(Theme.nucleoSurface)
            }
    }

    private var title: String {
        let base = model.isNew ? L.t("Your thesis", "Tu tesis") : L.t("Edit thesis", "Editar tesis")
        return model.symbol.map { base + " · " + $0 } ?? base
    }

    private var screen: some View {
        QuietSheet(title: title, closeId: "thesis-editor-close", onClose: close,
                   onInfo: showsWords ? { focus = nil; showsDetails = true } : nil, bottom: bottomBar) {
            switch (model.source, model.problem) {
            case (.missing, _), (_, .notFound?):
                missing
            case (_, .stale?):
                message(L.t("Account changed. Reopen your theses.", "Cuenta cambiada. Abre tus tesis de nuevo."), id: "thesis-editor-stale")
            case let (_, .alreadyActive(id)?):
                exists(id)
            case (_, .limitReached?):
                limit
            default:
                words
            }
        }
    }

    private var showsWords: Bool {
        guard model.source != .missing else { return false }
        switch model.problem {
        case nil, .emptyHypothesis?: return true
        default: return false
        }
    }

    // MARK: The words

    @ViewBuilder private var words: some View {
        if model.draftedByBobby {
            // Said before saving: these first words are Bobby's, and the person's to change.
            QuietNote(text: L.t("Bobby draft · editable", "Borrador de Bobby · editable"), id: "thesis-editor-draft-note")
                .padding(.top, 12)
        }
        field(L.t("Why this asset?", "¿Por qué este activo?"), text: $model.hypothesis, field: .hypothesis, id: "thesis-editor-why", top: 16)
        if model.problem == .emptyHypothesis {
            QuietNote(text: L.t("Write why this asset interests you.", "Escribe por qué te interesa este activo."), id: "thesis-editor-empty")
                .padding(.top, 6)
        }
        Button {
            withAnimation(.easeOut(duration: 0.2)) { showsMore.toggle() }
        } label: {
            HStack(spacing: 8) {
                Text(showsMore ? L.t("Optional", "Opcional") : L.t("Add detail", "Añadir detalle"))
                    .quietFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted)
                Image(systemName: showsMore ? "chevron.up" : "chevron.down").font(.system(size: 10, weight: .semibold))
                    .foregroundStyle(Theme.warmDim).accessibilityHidden(true)
                Spacer(minLength: 0)
            }
            .frame(minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .padding(.top, 6)
        .accessibilityValue(showsMore ? L.t("Expanded", "Abierto") : L.t("Collapsed", "Cerrado"))
        .accessibilityIdentifier("thesis-editor-more")
        if showsMore {
            field(L.t("What worries you?", "¿Qué te preocupa?"), text: $model.worry, field: .worry, id: "thesis-editor-worry", top: 2)
            field(L.t("What changes your mind?", "¿Qué te haría cambiar?"), text: $model.changeMind, field: .changeMind,
                  id: "thesis-editor-change-mind", top: 12)
        }
        horizon
    }

    private func field(_ label: String, text: Binding<String>, field: Field, id: String, top: CGFloat) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(label).quietFont(14, relativeTo: .callout).foregroundStyle(Theme.warmMuted)
            TextField("", text: text, prompt: Text(L.t("Your words", "Tus palabras")).foregroundStyle(Theme.warmDim), axis: .vertical)
                .lineLimit(field == .hypothesis ? 3...10 : 1...8)
                .quietFont(16)
                .foregroundStyle(Theme.cream)
                .tint(Theme.orbViolet)
                .focused($focus, equals: field)
                .submitLabel(.done)
                .padding(.horizontal, 14).padding(.vertical, 12)
                .frame(minHeight: 44)
                .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(Theme.warmFill))
                .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.nucleoStroke, lineWidth: focus == field ? 1 : 0))
                .accessibilityLabel(label)
                .accessibilityIdentifier(id)
            // The limit shows only when it is near, and only for the field being written.
            if focus == field, text.wrappedValue.count > ThesisBook.textLimit - 80 {
                Text("\(text.wrappedValue.count)/\(ThesisBook.textLimit)")
                    .quietFont(11, relativeTo: .caption2).monospacedDigit().foregroundStyle(Theme.warmDim)
                    .frame(maxWidth: .infinity, alignment: .trailing)
                    .accessibilityLabel(L.t("\(text.wrappedValue.count) of \(ThesisBook.textLimit) characters",
                                            "\(text.wrappedValue.count) de \(ThesisBook.textLimit) caracteres"))
            }
        }
        .padding(.top, top)
    }

    /// One row. No value is chosen for the person; picking the current one again clears it.
    private var horizon: some View {
        Menu {
            ForEach(ThesisHorizon.allCases, id: \.self) { option in
                Button {
                    model.horizon = model.horizon == option ? nil : option
                } label: {
                    if model.horizon == option { Label(ThesisCopy.horizon(option), systemImage: "checkmark") } else { Text(ThesisCopy.horizon(option)) }
                }
                .accessibilityIdentifier("thesis-editor-horizon-\(option.rawValue)")
            }
            if model.horizon != nil {
                Button(L.t("Not set", "Sin definir")) { model.horizon = nil }
            }
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Text(L.t("Time frame", "Plazo")).quietFont(16).foregroundStyle(Theme.cream)
                Spacer(minLength: 12)
                Text(model.horizon.map { ThesisCopy.horizon($0) } ?? L.t("Not set", "Sin definir"))
                    .quietFont(16).foregroundStyle(Theme.warmMuted)
                Image(systemName: "chevron.up.chevron.down").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.warmDim)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 52)
            .contentShape(Rectangle())
        }
        .padding(.top, 8)
        .accessibilityIdentifier("thesis-editor-horizon")
    }

    // MARK: Save

    private var bottomBar: AnyView? {
        guard showsWords else { return nil }
        return AnyView(VStack(alignment: .leading, spacing: 10) {
            QuietNote(text: L.t("Only on this iPhone.", "Solo en este iPhone."), id: "thesis-editor-scope")
            QuietPrimary(title: L.t("Save", "Guardar"), id: "thesis-editor-save") { save(model.save()) }
        })
    }

    private func save(_ outcome: ThesisEditorModel.Outcome) {
        switch outcome {
        case let .created(thesis), let .edited(thesis):
            focus = nil
            onSaved(thesis)
        case .blocked(.emptyHypothesis):
            focus = .hypothesis
        case .blocked:
            focus = nil
        }
    }

    // MARK: The states that are not the words

    @ViewBuilder private var missing: some View {
        message(model.problem == .notFound
                ? L.t("This thesis is unavailable in this account.", "Esta tesis no está disponible en esta cuenta.")
                : L.t("Ask about an asset first.", "Pregunta por un activo primero."), id: "thesis-editor-missing")
    }

    @ViewBuilder private func message(_ text: String, id: String) -> some View {
        Text(text).quietFont(16).foregroundStyle(Theme.cream).lineSpacing(3).quietWraps()
            .padding(.top, 22)
            .accessibilityIdentifier(id)
        QuietChip(title: L.t("Close", "Cerrar"), id: "thesis-editor-done", action: onClose).padding(.top, 16)
    }

    @ViewBuilder private func exists(_ id: String) -> some View {
        Text(L.t("You already have a thesis for \(model.symbol ?? "").", "Ya tienes una tesis de \(model.symbol ?? "")."))
            .quietFont(16).foregroundStyle(Theme.cream).lineSpacing(3).quietWraps()
            .padding(.top, 22)
            .accessibilityIdentifier("thesis-editor-exists")
        QuietPrimary(title: L.t("Open it", "Ábrela"), id: "thesis-editor-open-existing") { onOpenExisting(id) }
            .padding(.top, 18)
    }

    @ViewBuilder private var limit: some View {
        Text(L.t("3 active theses. Archive one first.", "3 tesis activas. Archiva una primero."))
            .quietFont(16).foregroundStyle(Theme.cream).lineSpacing(3).quietWraps()
            .padding(.top, 22).padding(.bottom, 8)
            .accessibilityIdentifier("thesis-editor-limit")
        ForEach(model.active) { thesis in
            VStack(spacing: 0) {
                HStack(spacing: 12) {
                    Text(thesis.symbol).quietFont(16).foregroundStyle(Theme.cream)
                    Spacer(minLength: 8)
                    QuietLink(title: L.t("Archive", "Archivar"), id: "thesis-editor-archive-\(thesis.symbol)") {
                        save(model.archiveAndSave(thesis.id))
                    }
                    .accessibilityLabel(L.t("Archive \(thesis.symbol)", "Archivar \(thesis.symbol)"))
                }
                .frame(minHeight: 52)
                Rectangle().fill(Theme.warmHair).frame(height: 1)
            }
        }
        QuietChip(title: L.t("Back to my words", "Volver a mis palabras"), id: "thesis-editor-back") { model.backToWords() }
            .padding(.top, 18)
    }
}
