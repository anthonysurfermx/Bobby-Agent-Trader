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
struct ThesisEditorView: View {
    @ObservedObject var model: ThesisEditorModel
    let onSaved: (SavedThesis) -> Void
    let onOpenExisting: (String) -> Void
    let onClose: () -> Void

    private enum Field: Hashable { case hypothesis, worry, changeMind }
    @FocusState private var focus: Field?

    var body: some View {
        ThesisScreen(title: L.t("Thesis", "Tesis"), closeId: "thesis-editor-close", onClose: onClose, bottom: bottomBar) {
            switch (model.source, model.problem) {
            case (.missing, _), (_, .notFound?):
                missing
            case (_, .stale?):
                message(L.t("Your account changed. Open your theses again to keep writing.",
                            "Tu cuenta cambió. Abre tus tesis otra vez para seguir escribiendo."), id: "thesis-editor-stale")
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
        ThesisTitle(text: model.isNew ? L.t("Write your thesis", "Escribe tu tesis") : L.t("Edit your thesis", "Edita tu tesis"))
        asset
        if model.draftedByBobby {
            ThesisNote(text: L.t("Bobby’s draft from today’s read. Make it say what you think.",
                                 "Borrador de Bobby a partir de la lectura de hoy. Haz que diga lo que tú piensas."))
                .padding(.top, 16)
                .accessibilityIdentifier("thesis-editor-draft-note")
        }
        field(L.t("Why I am looking at this", "Por qué lo estoy mirando"), text: $model.hypothesis, optional: false,
              field: .hypothesis, id: "thesis-editor-why")
        if model.problem == .emptyHypothesis {
            Text(L.t("Write why you are looking at this.", "Escribe por qué lo estás mirando."))
                .thesisFont(13, .medium, relativeTo: .footnote).foregroundStyle(Theme.cream).thesisWraps()
                .padding(.top, 6)
                .accessibilityIdentifier("thesis-editor-empty")
        }
        field(L.t("What worries me", "Lo que me preocupa"), text: $model.worry, optional: true,
              field: .worry, id: "thesis-editor-worry")
        field(L.t("What would change my mind", "Lo que me haría cambiar de opinión"), text: $model.changeMind, optional: true,
              field: .changeMind, id: "thesis-editor-change-mind")
        horizon
    }

    @ViewBuilder private var asset: some View {
        if let symbol = model.symbol {
            VStack(alignment: .leading, spacing: 3) {
                Text(ThesisCopy.title(symbol: symbol, name: model.name ?? symbol))
                    .thesisFont(14, .medium, design: .monospaced).foregroundStyle(Theme.cream).thesisWraps()
                if let price = model.startingPrice {
                    Text(L.t("Starting point: \(ThesisCopy.price(price))", "Punto de partida: \(ThesisCopy.price(price))"))
                        .thesisFont(12.5, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).thesisWraps()
                }
            }
            .padding(.top, 8)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("thesis-editor-asset")
        }
    }

    private func field(_ label: String, text: Binding<String>, optional: Bool, field: Field, id: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                ThesisLabel(text: label)
                if optional {
                    Text(L.t("Optional", "Opcional")).thesisFont(11, relativeTo: .caption).foregroundStyle(Theme.warmDim)
                }
                Spacer(minLength: 0)
            }
            TextField("", text: text, prompt: Text(L.t("In your own words", "Con tus palabras")).foregroundStyle(Theme.warmDim), axis: .vertical)
                .lineLimit(2...10)
                .thesisFont(15)
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
            Text("\(text.wrappedValue.count)/\(ThesisBook.textLimit)")
                .thesisFont(10.5, design: .monospaced, relativeTo: .caption2).foregroundStyle(Theme.warmDim)
                .frame(maxWidth: .infinity, alignment: .trailing)
                .padding(.top, 4)
                .accessibilityLabel(L.t("\(text.wrappedValue.count) of \(ThesisBook.textLimit) characters",
                                        "\(text.wrappedValue.count) de \(ThesisBook.textLimit) caracteres"))
        }
    }

    private var horizon: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                ThesisLabel(text: L.t("How long are you looking at this?", "¿Por cuánto tiempo lo estás mirando?"))
                Text(L.t("Optional", "Opcional")).thesisFont(11, relativeTo: .caption).foregroundStyle(Theme.warmDim)
                Spacer(minLength: 0)
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), spacing: 8, alignment: .leading)], alignment: .leading, spacing: 4) {
                ForEach(ThesisHorizon.allCases, id: \.self) { option in
                    let selected = model.horizon == option
                    Button {
                        // The pick is the person's; tapping it again clears it.
                        model.horizon = selected ? nil : option
                    } label: {
                        Text(ThesisCopy.horizon(option)).thesisFont(13, .medium, relativeTo: .footnote)
                            .foregroundStyle(selected ? Theme.bg : Theme.cream)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 12).padding(.vertical, 8)
                            .frame(maxWidth: .infinity, minHeight: 36)
                            .background(Capsule().fill(selected ? Theme.cream : Theme.warmFill))
                            .overlay(Capsule().stroke(Theme.nucleoStroke, lineWidth: selected ? 0 : 1))
                            .frame(minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(selected ? .isSelected : [])
                    .accessibilityIdentifier("thesis-editor-horizon-\(option.rawValue)")
                }
            }
        }
    }

    // MARK: Save

    private var bottomBar: AnyView? {
        guard showsWords else { return nil }
        return AnyView(VStack(alignment: .leading, spacing: 10) {
            Text(ThesisCopy.localOnly)
                .thesisFont(12, relativeTo: .caption).foregroundStyle(Theme.warmMuted).thesisWraps()
                .accessibilityIdentifier("thesis-editor-local-only")
            ThesisButton(title: L.t("Save", "Guardar"), prominent: true, wide: true, id: "thesis-editor-save") { save(model.save()) }
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
        ThesisTitle(text: L.t("Write your thesis", "Escribe tu tesis"))
        Text(model.problem == .notFound
             ? L.t("This thesis is not available in this account.", "Esta tesis no está disponible en esta cuenta.")
             : L.t("Ask Bobby about an asset first, then write your thesis from that read.",
                   "Primero pregúntale a Bobby por un activo y luego escribe tu tesis desde esa lectura."))
            .thesisFont(15).foregroundStyle(Theme.warmMuted).lineSpacing(3).thesisWraps()
            .padding(.top, 14)
            .accessibilityIdentifier("thesis-editor-missing")
        ThesisButton(title: L.t("Close", "Cerrar"), id: "thesis-editor-done", action: onClose).padding(.top, 18)
    }

    @ViewBuilder private func message(_ text: String, id: String) -> some View {
        Text(text).thesisFont(15).foregroundStyle(Theme.cream).lineSpacing(3).thesisWraps()
            .padding(.top, 24)
            .accessibilityIdentifier(id)
        ThesisButton(title: L.t("Close", "Cerrar"), id: "thesis-editor-done", action: onClose).padding(.top, 18)
    }

    @ViewBuilder private func exists(_ id: String) -> some View {
        ThesisTitle(text: L.t("Write your thesis", "Escribe tu tesis"))
        Text(L.t("You already have a thesis on \(model.symbol ?? "").", "Ya tienes una tesis sobre \(model.symbol ?? "")."))
            .thesisFont(15).foregroundStyle(Theme.cream).lineSpacing(3).thesisWraps()
            .padding(.top, 14)
            .accessibilityIdentifier("thesis-editor-exists")
        ThesisButton(title: L.t("Open it", "Ábrela"), prominent: true, id: "thesis-editor-open-existing") { onOpenExisting(id) }
            .padding(.top, 18)
    }

    @ViewBuilder private var limit: some View {
        ThesisTitle(text: L.t("Three at a time", "Tres a la vez"))
        Text(L.t("You have three active theses. Archive one to save this.", "Tienes tres tesis activas. Archiva una para guardar esta."))
            .thesisFont(15).foregroundStyle(Theme.warmMuted).lineSpacing(3).thesisWraps()
            .padding(.top, 10)
            .accessibilityIdentifier("thesis-editor-limit")
        ForEach(model.active) { thesis in
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(ThesisCopy.title(thesis)).thesisFont(14, .medium, design: .monospaced).foregroundStyle(Theme.cream).thesisWraps()
                    Text(thesis.hypothesis).thesisFont(13, relativeTo: .footnote).foregroundStyle(Theme.warmMuted).lineLimit(2)
                }
                Spacer(minLength: 8)
                ThesisLink(title: L.t("Archive", "Archivar"), id: "thesis-editor-archive-\(thesis.symbol)") {
                    save(model.archiveAndSave(thesis.id))
                }
                .accessibilityLabel(L.t("Archive \(thesis.symbol)", "Archivar \(thesis.symbol)"))
            }
            .frame(maxWidth: .infinity, minHeight: 56, alignment: .leading)
            .padding(.vertical, 8)
            .overlay(alignment: .top) { Rectangle().fill(Theme.warmHair).frame(height: 1) }
            .padding(.top, thesis.id == model.active.first?.id ? 16 : 0)
        }
        ThesisButton(title: L.t("Back to my words", "Volver a mis palabras"), id: "thesis-editor-back") { model.backToWords() }
            .padding(.top, 18)
    }
}
