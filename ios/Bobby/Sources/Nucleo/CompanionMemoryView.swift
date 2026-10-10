import SwiftUI

struct CompanionConsentView: View {
    @ObservedObject var store: CompanionContextStore
    let finished: (Bool) -> Void
    var body: some View {
        let words = CompanionCopy.consent
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                if words.count == 7 {
                    Text(words[0]).font(.system(size: 26, weight: .light, design: .rounded))
                        .accessibilityAddTraits(.isHeader).accessibilityIdentifier("companion-consent-title")
                    ForEach(1..<4) { index in
                        Text(words[index]).font(.system(size: 16)).fixedSize(horizontal: false, vertical: true)
                    }
                    Button(words[4]) {
                        store.choose(true)
                        if store.accepted { finished(true) }
                    }
                    .buttonStyle(.borderedProminent).tint(Theme.cream).foregroundStyle(Theme.bg)
                    .accessibilityIdentifier("companion-consent-yes")
                    Button(words[5]) {
                        store.choose(false)
                        if store.decided { finished(false) }
                    }
                    .accessibilityIdentifier("companion-consent-no")
                    Link(words[6], destination: L.site("privacy"))
                        .accessibilityIdentifier("companion-consent-details")
                    if store.storageError { Text(CompanionCopy.text("storageError")).font(.footnote) }
                }
            }
            .foregroundStyle(Theme.cream).padding(24)
        }
        .background(Theme.nucleoSurface.ignoresSafeArea())
        .interactiveDismissDisabled()
    }
}

struct CompanionNotesView: View {
    @ObservedObject var store: CompanionContextStore
    let questionsAvailable: () -> Bool
    let onClose: () -> Void
    @State private var showingConsent = false
    @State private var correcting: CompanionQuestion?
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
                    if yes { showingConsent = true } else { store.choose(false) }
                })).accessibilityIdentifier("companion-memory-toggle")
                Text(CompanionCopy.text("retention")).font(.footnote).foregroundStyle(Theme.warmMuted)
                    .fixedSize(horizontal: false, vertical: true)
                if store.state.notes.isEmpty { Text(CompanionCopy.text("empty")).foregroundStyle(Theme.warmMuted) }
                ForEach(store.state.notes) { note in
                    if let question = CompanionCatalog.question(note.field), let label = question.label(note.value) {
                        VStack(alignment: .leading, spacing: 10) {
                            Text(question.title).font(.system(size: 14)).foregroundStyle(Theme.warmMuted).fixedSize(horizontal: false, vertical: true)
                            Text(label).font(.system(size: 18)).fixedSize(horizontal: false, vertical: true)
                                .accessibilityIdentifier("companion-note-\(note.field)")
                            Text(CompanionCopy.text(note.source)).font(.footnote).foregroundStyle(Theme.warmMuted)
                            Text(CompanionCopy.text("expires") + " · " + note.expiresAt.formatted(.dateTime.locale(L.locale).day().month().year()))
                                .font(.footnote).foregroundStyle(Theme.warmMuted)
                            HStack(spacing: 20) {
                                if questionsAvailable() {
                                    Button(CompanionCopy.text("correct")) { correcting = question }
                                        .accessibilityIdentifier("companion-correct-\(note.field)")
                                }
                                Button(CompanionCopy.text("delete"), role: .destructive) { store.delete(note.field) }
                                    .accessibilityIdentifier("companion-delete-\(note.field)")
                            }.frame(minHeight: 44)
                            Divider()
                        }
                    }
                }
                if !store.state.notes.isEmpty {
                    Button(CompanionCopy.text("deleteAll"), role: .destructive) { store.deleteAll() }
                        .frame(minHeight: 44).accessibilityIdentifier("companion-delete-all")
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
