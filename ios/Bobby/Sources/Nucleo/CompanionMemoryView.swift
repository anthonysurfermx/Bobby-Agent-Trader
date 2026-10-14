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
    let onClose: () -> Void
    @State private var showingConsent = false
    @State private var correcting: CompanionQuestion?
    @State private var pendingDeletion: NotesDeletion?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                HStack(alignment: .top) {
                    Text(CompanionCopy.text("notesTitle"))
                        .font(.system(size: 26, weight: .light, design: .rounded)).fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("companion-notes-title")
                    Spacer(minLength: 8)
                    Button(action: onClose) { Image(systemName: "xmark").frame(width: 44, height: 44) }
                        .accessibilityLabel(CompanionCopy.text("close"))
                }
                Toggle(CompanionCopy.text("memory"), isOn: Binding(get: { store.accepted }, set: { yes in
                    if yes { showingConsent = true } else { pendingDeletion = .memoryOff }
                })).accessibilityIdentifier("companion-memory-toggle")
                Text(CompanionCopy.text("retention")).font(.footnote).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
                Text(CompanionCopy.text("deviceNotes")).font(.footnote).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if store.state.notes.isEmpty { Text(CompanionCopy.text("empty")).foregroundStyle(Theme.warmMuted) }
                ForEach(store.state.notes) { note in
                    if let question = CompanionCatalog.question(note.field), let label = question.label(note.value) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(question.title).font(.system(size: 14)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
                            Text(label).font(.system(size: 18)).fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("companion-note-\(note.field)")
                            Text(CompanionCopy.text(question.needsConfirmation(note.value) ? "inferred" : note.source)).font(.footnote).foregroundStyle(Theme.warmMuted)
                            Text(CompanionCopy.text("expires") + " · " + note.expiresAt.formatted(.dateTime.locale(L.locale).day().month().year()))
                                .font(.footnote).foregroundStyle(Theme.warmMuted)
                            HStack(spacing: 20) {
                                if questionsAvailable() {
                                    Button(CompanionCopy.text("correct")) { correcting = question }
                                        .accessibilityIdentifier("companion-correct-\(note.field)")
                                }
                                Button(CompanionCopy.text("delete"), role: .destructive) { store.delete(note.field) }
                                    .foregroundStyle(Theme.down)
                                    .accessibilityIdentifier("companion-delete-\(note.field)")
                            }.frame(minHeight: 44)
                            Divider()
                        }
                    }
                }
                if !store.state.notes.isEmpty {
                    Button(CompanionCopy.text("deleteAll"), role: .destructive) { pendingDeletion = .allNotes }
                        .foregroundStyle(Theme.down).frame(minHeight: 44).accessibilityIdentifier("companion-delete-all")
                }
                if store.storageError { Text(CompanionCopy.text("storageError")).font(.footnote) }
            }.padding(24).foregroundStyle(Theme.cream)
        }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .task { store.opened() }
        .sheet(isPresented: $showingConsent) {
            CompanionConsentView(store: store) { _ in showingConsent = false }
                .presentationDetents([.large]).presentationBackground(Theme.nucleoSurface)
        }
        .sheet(item: $pendingDeletion) { deletion in
            NotesDeletionSheet(store: store, deletion: deletion) { confirmed in
                if confirmed {
                    if deletion == .memoryOff { store.choose(false) } else { store.deleteAll() }
                    if store.storageError { return }
                }
                pendingDeletion = nil
            }
            .presentationDetents([.medium, .large]).presentationBackground(Theme.nucleoSurface)
        }
        .sheet(item: $correcting) { question in
            CompanionCorrectionView(store: store, question: question) { correcting = nil }
                .presentationDetents([.medium, .large]).presentationBackground(Theme.nucleoSurface)
        }
    }
}

private struct CompanionCorrectionView: View {
    @ObservedObject var store: CompanionContextStore
    let question: CompanionQuestion
    let finished: () -> Void
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                Text(question.title).font(.title3).fixedSize(horizontal: false, vertical: true)
                ForEach(question.options) { option in
                    Button(question.label(option.id) ?? "") {
                        store.answer(question.id, value: option.id, source: "confirmed")
                        if !store.storageError { finished() }
                    }.frame(minHeight: 44).accessibilityIdentifier("companion-correct-option-\(option.id)")
                }
                Button(CompanionCopy.text("skip"), action: finished).frame(minHeight: 44)
                if store.storageError { Text(CompanionCopy.text("storageError")) }
            }.padding(24).foregroundStyle(Theme.cream)
        }.background(Theme.nucleoSurface.ignoresSafeArea())
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
                Text(CompanionCopy.text(off ? "offTitle" : "deleteTitle"))
                    .font(.title2).fixedSize(horizontal: false, vertical: true)
                Text(CompanionCopy.text(off ? "offBody" : "deleteBody"))
                    .fixedSize(horizontal: false, vertical: true)
                QuietDestructive(title: CompanionCopy.text(off ? "offConfirm" : "deleteAll"), id: "companion-delete-confirm") { finished(true) }
                QuietSecondary(title: CompanionCopy.text(off ? "offCancel" : "deleteCancel"), id: "companion-delete-cancel") { finished(false) }
                if store.storageError { Text(CompanionCopy.text("storageError")).font(.footnote) }
            }.foregroundStyle(Theme.cream).padding(24)
        }.background(Theme.nucleoSurface.ignoresSafeArea())
    }
}
