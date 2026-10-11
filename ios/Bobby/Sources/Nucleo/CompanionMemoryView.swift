import SwiftUI

struct CompanionConsentView: View {
    @ObservedObject var store: CompanionContextStore
    let finished: (Bool) -> Void
    @State private var attempted = false
    @State private var contentHeight: CGFloat = 480
    @State private var bottomHeight: CGFloat = 170
    @State private var detent: PresentationDetent = .height(674)
    var body: some View {
        let words = CompanionCopy.consent
        VStack(spacing: 0) {
            if words.count == 7 {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        Text(words[0]).quietFont(28, .light, relativeTo: .title).tracking(-0.98).quietWraps()
                            .accessibilityAddTraits(.isHeader).accessibilityIdentifier("companion-consent-title")
                        ForEach(1..<4) { index in
                            HStack(alignment: .top, spacing: 12) {
                                Circle().fill(Color(red:185/255,green:173/255,blue:235/255)).frame(width: 5,height: 5).padding(.top, 9).accessibilityHidden(true)
                                Text(words[index]).quietFont(16).lineSpacing(4).quietWraps()
                            }
                        }
                    }.padding(24)
                    .background(GeometryReader { g in Color.clear.preference(key: ConsentContentHeight.self, value: g.size.height) })
                }.scrollIndicators(.hidden)
                    .mask(VStack(spacing:0) { Color.black; LinearGradient(colors:[.black,.clear],startPoint:.top,endPoint:.bottom).frame(height:24) })
                VStack(spacing: 8) {
                    Rectangle().fill(Theme.cream.opacity(0.08)).frame(height: 1)
                    if attempted && store.storageError { Text(CompanionCopy.text("notSaved")).quietFont(13).quietWraps().accessibilityIdentifier("companion-consent-error") }
                    QuietSecondaryPair(first: words[4], second: words[5], firstID: "companion-consent-yes", secondID: "companion-consent-no") { yes in
                        attempted = true; store.choose(yes)
                        if !yes || store.accepted { finished(yes) }
                    }
                    QuietTextLink(title: words[6], id: "companion-consent-details", destination: CompanionCopy.privacyURL)
                }.padding(.horizontal,24).padding(.bottom,12)
                    .background(GeometryReader { g in Color.clear.preference(key: ConsentBottomHeight.self, value: g.size.height) })
            }
        }.foregroundStyle(Theme.cream).background(QuietMemorySurface())
            .environment(\.colorScheme,.dark)
            .onPreferenceChange(ConsentContentHeight.self) { contentHeight = $0; detent = .height(contentHeight + bottomHeight + 24) }
            .onPreferenceChange(ConsentBottomHeight.self) { bottomHeight = $0; detent = .height(contentHeight + bottomHeight + 24) }
            .presentationDetents([.height(contentHeight + bottomHeight + 24), .large], selection: $detent)
            .presentationDragIndicator(.visible).presentationCornerRadius(34)
    }
}
private struct ConsentContentHeight: PreferenceKey {
    static let defaultValue: CGFloat = 480
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}
private struct ConsentBottomHeight: PreferenceKey {
    static let defaultValue: CGFloat = 170
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) { value = nextValue() }
}

struct CompanionNotesView: View {
    @ObservedObject var store: CompanionContextStore
    let questionsAvailable: () -> Bool
    var riskAccepted: () -> Bool = { true }
    var initialField: String? = nil
    let onClose: () -> Void
    @Environment(\.scenePhase) private var phase
    @State private var showingConsent = false
    @State private var detail: String?
    @State private var pendingDeletion: NotesDeletion?
    @State private var undone: CompanionContextStore.Note?
    @State private var undoToken = UUID()
    @State private var undoIndex = 0
    private var canRemember: Bool { riskAccepted() && questionsAvailable() }
    private var lavender: Color { Color(red:185/255,green:173/255,blue:235/255) }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                HStack(alignment: .top) {
                    Text(CompanionCopy.text("notesTitle")).quietFont(28, .light, relativeTo: .title).tracking(-0.98).quietWraps()
                        .accessibilityAddTraits(.isHeader).accessibilityIdentifier("companion-notes-title")
                    Spacer(minLength: 8)
                    QuietGlyphButton(systemImage: "xmark", label: CompanionCopy.text("closeNotes"), id: "companion-notes-close", minimumTarget: 48) { forgetUndo(); onClose() }
                }
                HStack(spacing: 12) {
                    Text(CompanionCopy.text("memory")).quietFont(16).quietWraps()
                    Spacer(minLength: 8)
                    Text(CompanionCopy.text(store.accepted ? "on" : "off")).quietFont(13).foregroundStyle(Theme.warmMuted).quietWraps()
                    Toggle(CompanionCopy.text("memory"), isOn: Binding(get: { store.accepted }, set: { yes in
                        forgetUndo(); if yes { showingConsent = true } else { pendingDeletion = .memoryOff }
                    })).labelsHidden().frame(minWidth:51,minHeight:48).contentShape(Rectangle()).tint(Theme.orbViolet).disabled(!canRemember).accessibilityIdentifier("companion-memory-toggle")
                }.frame(minHeight: 50)
                if !canRemember { meta(CompanionCopy.text(riskAccepted() ? "memoryOff" : "needsAI")) }
                meta(CompanionCopy.text("retention"))
                meta(CompanionCopy.text("travel"))
                meta(CompanionCopy.text("deviceNotes"))
                if !store.accepted { meta(CompanionCopy.text("offState")).accessibilityIdentifier("companion-notes-off") }
                else if store.state.notes.isEmpty { meta(CompanionCopy.text("empty")).accessibilityIdentifier("companion-notes-empty") }
                ForEach(visibleRows) { note in
                    if note.field == undone?.field { undoRow }
                    else if let q = CompanionCatalog.question(note.field), let label = q.label(note.value) {
                        Button { forgetUndo(); detail = note.field } label: {
                            VStack(alignment: .leading, spacing: 8) {
                                HStack(alignment: .firstTextBaseline) {
                                    Text(label).quietFont(22, .light, relativeTo: .title2).tracking(-0.77).quietWraps().accessibilityIdentifier("companion-note-\(note.field)")
                                    Spacer(minLength: 10)
                                    Image(systemName: "chevron.right").font(.system(size: 12)).foregroundStyle(Theme.warmMuted).accessibilityHidden(true)
                                }
                                Text(CompanionCopy.text(note.source == "inferred" ? "toConfirm" : note.source)).quietFont(13)
                                    .foregroundStyle(note.source == "inferred" ? lavender : Theme.warmMuted).quietWraps()
                                Rectangle().fill(Theme.cream.opacity(0.08)).frame(height:1)
                            }.padding(.vertical,10).frame(minHeight:48).contentShape(Rectangle())
                        }.buttonStyle(.plain).accessibilityIdentifier("companion-note-row-\(note.field)")
                    }
                }
                if !store.state.notes.isEmpty {
                    QuietDestructive(title: CompanionCopy.text("deleteAll"), id: "companion-delete-all") { forgetUndo(); pendingDeletion = .allNotes }
                }
                if store.storageError { meta(CompanionCopy.text("storageError")) }
            }.padding(24).foregroundStyle(Theme.cream)
        }.scrollIndicators(.hidden).background(QuietMemorySurface()).environment(\.colorScheme,.dark)
            .task { store.opened(); if let initialField, store.state.notes.contains(where: { $0.field == initialField }) { detail = initialField } }
            .onChange(of: phase) { _, value in if value != .active { forgetUndo() } }
            .onDisappear { forgetUndo() }
            .sheet(isPresented: $showingConsent) {
                CompanionConsentView(store: store) { _ in showingConsent = false }.presentationBackground { QuietMemorySurface() }
            }
            .sheet(item: $pendingDeletion) { deletion in
                NotesDeletionSheet(store: store, deletion: deletion) { confirmed in
                    if confirmed {
                        if deletion == .memoryOff { store.choose(false) } else { store.deleteAll() }
                        if store.storageError { return }
                    }
                    pendingDeletion = nil
                }.presentationDetents([.large]).presentationDragIndicator(.visible).presentationCornerRadius(34).presentationBackground { QuietMemorySurface() }
            }
            .sheet(isPresented: Binding(get: { detail != nil }, set: { if !$0 { detail = nil } })) {
                if let detail {
                    let position = store.state.notes.firstIndex { $0.field == detail } ?? 0
                    CompanionNoteDetail(store: store, field: detail, questionsAvailable: questionsAvailable,
                        closed: { self.detail = nil }, deleted: { note in
                            self.detail = nil; undone = note; undoIndex = position; let token = UUID(); undoToken = token
                            if !UIAccessibility.isVoiceOverRunning {
                                Task { @MainActor in
                                    try? await Task.sleep(for: .seconds(5))
                                    if undoToken == token { forgetUndo() }
                                }
                            }
                        }).presentationDetents([.large]).presentationDragIndicator(.visible).presentationCornerRadius(34).presentationBackground { QuietMemorySurface() }
                }
            }
    }
    private var visibleRows: [CompanionContextStore.Note] {
        var rows = store.state.notes
        if let undone, !rows.contains(where: { $0.field == undone.field }) {
            rows.insert(undone, at: min(undoIndex, rows.count))
        }
        return rows
    }
    private var undoRow: some View {
        HStack {
            Text(CompanionCopy.text("noteDeleted")).quietFont(13).quietWraps()
            Spacer()
            QuietTextLink(title: CompanionCopy.text("undo"), id: "companion-note-undo") {
                if let undone, store.restore(undone) { forgetUndo() }
            }
        }.frame(minHeight:48).accessibilityIdentifier("companion-note-deleted")
    }
    private func meta(_ text: String) -> some View { Text(text).quietFont(13).foregroundStyle(Theme.warmMuted).quietWraps() }
    private func forgetUndo() { undone = nil; undoToken = UUID() }
}

private struct CompanionNoteDetail: View {
    @ObservedObject var store: CompanionContextStore
    let field: String
    let questionsAvailable: () -> Bool
    let closed: () -> Void
    let deleted: (CompanionContextStore.Note) -> Void
    @State private var correcting = false
    var body: some View {
        ScrollView {
            if let note = store.state.notes.first(where: { $0.field == field }),
               let question = CompanionCatalog.question(field), let label = question.label(note.value) {
                VStack(alignment: .leading, spacing: 20) {
                    HStack(alignment: .top) {
                        Text(question.title).quietFont(13).foregroundStyle(Theme.warmMuted).quietWraps().accessibilityIdentifier("companion-detail-question")
                        Spacer(minLength: 8)
                        QuietGlyphButton(systemImage: "xmark", label: CompanionCopy.text("closeNotes"), id: "companion-detail-close", minimumTarget: 48, action: closed)
                    }
                    Text(label).quietFont(28, .light, relativeTo: .title).tracking(-0.98).quietWraps().accessibilityIdentifier("companion-detail-value")
                    Text(CompanionCopy.text("detail." + note.source).replacingOccurrences(of: "{date}", with: fullDate(note.expiresAt)))
                        .quietFont(13).foregroundStyle(Theme.warmMuted).quietWraps().accessibilityIdentifier("companion-detail-origin")
                    if correcting {
                        ForEach(question.correctionValues, id: \.self) { value in
                            QuietChoice(title: question.label(value) ?? "", selected: note.value == value, id: "companion-correct-option-\(value)") {
                                if store.correct(field, value: value) { correcting = false }
                            }
                        }
                        QuietSecondary(title: CompanionCopy.text("leave"), id: "companion-correction-leave") { correcting = false }
                    } else {
                        if note.source == "inferred" {
                            QuietPrimary(title: CompanionCopy.text("confirmYes"), id: "companion-note-confirm") { _ = store.confirm(field) }
                        }
                        if questionsAvailable() {
                            QuietSecondary(title: CompanionCopy.text("correct"), id: "companion-correct-\(field)") { correcting = true }
                        }
                        QuietDestructive(title: CompanionCopy.text("delete"), id: "companion-delete-\(field)") {
                            if store.delete(field) { deleted(note) }
                        }
                    }
                    if store.storageError { Text(CompanionCopy.text("storageError")).quietFont(13).quietWraps() }
                }.padding(24).foregroundStyle(Theme.cream)
            }
        }.scrollIndicators(.hidden).background(QuietMemorySurface()).environment(\.colorScheme,.dark)
    }
    private func fullDate(_ date: Date) -> String {
        let formatter = DateFormatter(); formatter.locale = L.locale; formatter.dateStyle = .long
        return formatter.string(from: date)
    }
}

private enum NotesDeletion: String, Identifiable {
    case memoryOff, allNotes
    var id: String { rawValue }
}

private struct NotesDeletionSheet: View {
    @ObservedObject var store: CompanionContextStore
    let deletion: NotesDeletion
    let finished: (Bool) -> Void
    var body: some View {
        let off = deletion == .memoryOff
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                Text(CompanionCopy.text(off ? "offTitle" : "deleteTitle")).quietFont(28, .light, relativeTo: .title).tracking(-0.98).quietWraps()
                Text(CompanionCopy.text(off ? "offBody" : "deleteBody")).quietFont(16).quietWraps()
                QuietDestructive(title: CompanionCopy.text(off ? "offConfirm" : "deleteAll"), id: "companion-delete-confirm") { finished(true) }
                QuietSecondary(title: CompanionCopy.text(off ? "offCancel" : "deleteCancel"), id: "companion-delete-cancel") { finished(false) }
                if store.storageError { Text(CompanionCopy.text("storageError")).quietFont(13).quietWraps() }
            }.foregroundStyle(Theme.cream).padding(24)
        }.background(QuietMemorySurface()).environment(\.colorScheme,.dark)
    }
}
