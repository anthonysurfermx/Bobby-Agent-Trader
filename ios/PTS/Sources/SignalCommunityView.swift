import SwiftUI

/// Likes (with who liked), saves and comments for one signal. Everything shown
/// comes from the shared pts_* RPCs; nothing is seeded.
struct SignalCommunityView: View {
    let signal: SignalListItem
    @StateObject private var community: SignalCommunity
    @ObservedObject private var saved = SavedSignals.shared
    @State private var draft = ""
    @State private var askingName = false
    @State private var nameDraft = ""
    @State private var pending: Pending?
    @State private var showLikes = false
    @FocusState private var composing: Bool

    private enum Pending { case like, comment(String) }

    init(signal: SignalListItem) {
        self.signal = signal
        _community = StateObject(wrappedValue: SignalCommunity(signalID: signal.id))
    }

    private var feed: SignalFeed? { community.feed }
    private var isSaved: Bool { saved.contains(signal.id) }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Comunidad").font(.headline).accessibilityAddTraits(.isHeader)
            HStack(spacing: 8) {
                action(feed?.liked == true ? "heart.fill" : "heart", "\(feed?.likeCount ?? 0)", active: feed?.liked == true) { run(.like) }
                    .accessibilityLabel(feed?.liked == true ? "Quitar me gusta. \(feed?.likeCount ?? 0) me gusta" : "Me gusta. \(feed?.likeCount ?? 0) me gusta")
                    .accessibilityIdentifier("community-like")
                action(isSaved ? "bookmark.fill" : "bookmark", isSaved ? "Guardada" : "Guardar", active: isSaved) { saved.toggle(signal.id) }
                    .accessibilityIdentifier("community-save")
                action("bubble.left", "\(feed?.comments.count ?? 0)", active: false) { composing = true }
                    .accessibilityLabel("\(feed?.comments.count ?? 0) comentarios. Escribir comentario")
                    .accessibilityIdentifier("community-comments")
            }
            likedBy
            if let message = community.error {
                HStack {
                    Text(message).font(.footnote).foregroundStyle(.orange)
                    Spacer()
                    Button("Reintentar") { Task { await community.load() } }.font(.footnote.weight(.semibold))
                }.accessibilityIdentifier("community-error")
            }
            comments
            composer
        }
        .padding(18)
        .background(.white.opacity(0.03), in: RoundedRectangle(cornerRadius: 22))
        .overlay(RoundedRectangle(cornerRadius: 22).stroke(.white.opacity(0.07)))
        // Poll while visible so likes and comments from other phones appear live.
        .task {
            while !Task.isCancelled {
                await community.load()
                try? await Task.sleep(for: .seconds(8))
            }
        }
        .alert("¿Cómo te llamas?", isPresented: $askingName) {
            TextField("Tu nombre", text: $nameDraft).textInputAutocapitalization(.words)
            Button("Continuar") {
                let name = nameDraft.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !name.isEmpty else { pending = nil; return }
                PTSMember.name = name
                if let next = pending { pending = nil; run(next) }
            }
            Button("Cancelar", role: .cancel) { pending = nil }
        } message: {
            Text("Tu nombre aparece junto a tus me gusta y comentarios.")
        }
        .sheet(isPresented: $showLikes) { likesSheet }
    }

    @ViewBuilder private var likedBy: some View {
        let likes = feed?.likes ?? []
        if likes.isEmpty {
            Text(feed == nil ? "Cargando comunidad…" : "Sé la primera persona en darle me gusta.")
                .font(.footnote).foregroundStyle(Theme.secondary)
                .accessibilityIdentifier("community-liked-by")
        } else {
            Button { showLikes = true } label: {
                HStack(spacing: 8) {
                    HStack(spacing: -8) {
                        ForEach(likes.prefix(3)) { like in initials(like.name, size: 24) }
                    }
                    Text(likedByText(likes)).font(.footnote).foregroundStyle(Theme.secondary).multilineTextAlignment(.leading)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.secondary)
                }.frame(minHeight: 44)
            }.buttonStyle(.plain).accessibilityIdentifier("community-liked-by")
        }
    }

    private func likedByText(_ likes: [SignalFeed.Like]) -> String {
        let names = likes.prefix(2).map(\.name)
        let rest = (feed?.likeCount ?? likes.count) - names.count
        let listed = names.joined(separator: " y ")
        return rest > 0 ? "Les gustó a \(names.joined(separator: ", ")) y \(rest) más" : "Le gustó a \(listed)"
    }

    @ViewBuilder private var comments: some View {
        let items = feed?.comments ?? []
        if feed != nil && items.isEmpty {
            Text("Aún no hay comentarios. Abre la conversación sobre \(signal.symbol).")
                .font(.footnote).foregroundStyle(Theme.secondary)
        }
        ForEach(items) { comment in
            HStack(alignment: .top, spacing: 10) {
                initials(comment.name, size: 30)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(comment.name).font(.subheadline.weight(.semibold))
                        Text(PTSCommunityAPI.relative(comment.at)).font(.caption).foregroundStyle(Theme.secondary)
                        Spacer(minLength: 0)
                        if comment.mine {
                            Button { Task { await community.delete(comment.id) } } label: {
                                Image(systemName: "trash").font(.caption).foregroundStyle(Theme.secondary).frame(width: 32, height: 32)
                            }
                            .buttonStyle(.plain).accessibilityLabel("Borrar mi comentario").accessibilityIdentifier("community-delete")
                        }
                    }
                    Text(comment.body).font(.subheadline).fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("community-comment")
        }
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .bottom) {
                TextField("Comenta esta señal…", text: $draft, axis: .vertical)
                    .lineLimit(1...4).focused($composing)
                    .accessibilityIdentifier("community-draft")
                Button { run(.comment(draft)) } label: {
                    Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(Theme.accent)
                }
                .disabled(community.busy || draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .accessibilityLabel("Publicar comentario").accessibilityIdentifier("community-send")
            }
            .padding(12).background(.white.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
            Text(PTSMember.name.map { "Comentas como \($0) · visible para la comunidad PTS" } ?? "Visible para la comunidad PTS · te pediremos tu nombre")
                .font(.caption2).foregroundStyle(Theme.secondary)
        }
    }

    private var likesSheet: some View {
        NavigationStack {
            List(feed?.likes ?? []) { like in
                HStack(spacing: 12) {
                    initials(like.name, size: 34)
                    Text(like.name).font(.body)
                    Spacer()
                    Text(PTSCommunityAPI.relative(like.at)).font(.caption).foregroundStyle(Theme.secondary)
                }.listRowBackground(Color.white.opacity(0.03))
            }
            .scrollContentBackground(.hidden).background(Theme.bg)
            .navigationTitle("Les gustó \(signal.symbol)").navigationBarTitleDisplayMode(.inline)
            .toolbar { Button("Listo") { showLikes = false } }
        }
        .tint(Theme.accent)
        .presentationDetents([.medium, .large])
    }

    private func run(_ action: Pending) {
        guard let name = PTSMember.name else {
            pending = action; nameDraft = ""; askingName = true
            return
        }
        switch action {
        case .like:
            Task { await community.toggleLike(as: name) }
        case .comment(let text):
            Task {
                if await community.comment(text, as: name) { draft = ""; composing = false }
            }
        }
    }

    private func action(_ icon: String, _ title: String, active: Bool, perform: @escaping () -> Void) -> some View {
        Button(action: perform) {
            Label(title, systemImage: icon)
                .font(.subheadline.weight(.semibold)).monospacedDigit()
                .foregroundStyle(active ? Theme.accentSoft : .white)
                .padding(.horizontal, 14).frame(minHeight: 44)
                .background(active ? Theme.accent.opacity(0.16) : .white.opacity(0.05), in: Capsule())
                .overlay(Capsule().stroke(active ? Theme.accent.opacity(0.4) : .white.opacity(0.08)))
                .contentTransition(.numericText())
        }
        .buttonStyle(.plain)
        .disabled(community.busy)
        .sensoryFeedback(.impact(weight: .light), trigger: active)
    }

    private func initials(_ name: String, size: CGFloat) -> some View {
        let letters = name.split(separator: " ").prefix(2).compactMap(\.first).map(String.init).joined().uppercased()
        return Text(letters.isEmpty ? "?" : letters)
            .font(.system(size: size * 0.4, weight: .semibold))
            .foregroundStyle(Theme.bg)
            .frame(width: size, height: size)
            .background(Theme.accent, in: Circle())
            .overlay(Circle().stroke(Theme.bg, lineWidth: 1.5))
            .accessibilityHidden(true)
    }
}
