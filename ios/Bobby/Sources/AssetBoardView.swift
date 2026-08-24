// THE BOARD — the whole tradable universe Bobby can analyze, grouped by
// class and ranked by real 24h volume server-side. Search on top reaches
// every listed asset (fuzzy + spoken names resolved by the backend); tapping
// any row asks the desk about it immediately.
import SwiftUI

struct AssetBoardView: View {
    @ObservedObject var vm: BobbyViewModel
    @Environment(\.dismiss) private var dismiss

    @State private var sections: [(title: String, assets: [BobbyAPI.BoardAsset])] = []
    @State private var totalBases = 0
    @State private var loading = true
    @State private var loadFailed = false
    @State private var query = ""
    @State private var hits: [BobbyAPI.AssetHit] = []
    @State private var searchTask: Task<Void, Never>?

    var body: some View {
        ZStack {
            Theme.bg.ignoresSafeArea()
            VStack(spacing: 0) {
                header
                searchField
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 6, pinnedViews: [.sectionHeaders]) {
                        if !query.trimmingCharacters(in: .whitespaces).isEmpty {
                            searchResults
                        } else if loading {
                            ProgressView().tint(Theme.accent)
                                .frame(maxWidth: .infinity)
                                .padding(.top, 60)
                        } else if loadFailed || sections.isEmpty {
                            boardError
                        } else {
                            boardSections
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, 24)
                }
            }
        }
        .task { await loadBoard() }
    }

    private func loadBoard() async {
        loading = true
        loadFailed = false
        let board = await BobbyAPI.browseBoard()
        sections = board.sections
        totalBases = board.totalBases
        loadFailed = board.sections.isEmpty
        loading = false
    }

    /// The board can fail without taking search down with it — say so,
    /// and offer a retry instead of an unexplained void.
    private var boardError: some View {
        VStack(spacing: 12) {
            Image(systemName: "wifi.exclamationmark")
                .font(.system(size: 22, weight: .bold))
                .foregroundStyle(Theme.muted)
            Text(L.t("The board did not load.", "El tablero no cargó."))
                .font(.rounded(14, .semibold))
                .foregroundStyle(Theme.text)
            Text(L.t("Search up top still works — try a name or ticker.",
                     "La búsqueda de arriba sí funciona — prueba un nombre o ticker."))
                .font(.rounded(12, .medium))
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
            Button {
                Task { await loadBoard() }
            } label: {
                Text(L.t("RETRY", "REINTENTAR"))
                    .font(.mono(11, .bold))
                    .kerning(1.4)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 10)
                    .background(Theme.accent)
                    .clipShape(Capsule())
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 48)
    }

    private var header: some View {
        HStack {
            HStack(spacing: 8) {
                Circle().fill(Theme.accent).frame(width: 7, height: 7).shadow(color: Theme.accent, radius: 7)
                VStack(alignment: .leading, spacing: 2) {
                    Text(L.t("BOBBY // THE BOARD", "BOBBY // EL TABLERO"))
                        .font(.mono(11, .bold))
                        .kerning(1.9)
                        .foregroundStyle(Theme.text.opacity(0.78))
                    // Honest copy: the lists below are the TOP by volume;
                    // the search reaches every listed base.
                    Text(totalBases > 0
                         ? L.t("TOP BY 24H VOLUME · SEARCH REACHES ALL \(totalBases)",
                               "TOP POR VOLUMEN 24H · LA BÚSQUEDA LLEGA A LOS \(totalBases)")
                         : L.t("TOP BY 24H VOLUME", "TOP POR VOLUMEN 24H"))
                        .font(.mono(8, .medium))
                        .kerning(1)
                        .foregroundStyle(Theme.muted)
                }
            }
            Spacer()
            Button { dismiss() } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(Theme.muted)
                    .frame(width: 30, height: 30)
                    .background(Circle().fill(Theme.card))
            }
            .accessibilityIdentifier("board-close")
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 10)
    }

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(Theme.muted)
            TextField(L.t("Search 600+ assets — name or ticker", "Busca 600+ activos — nombre o ticker"), text: $query)
                .font(.rounded(14, .medium))
                .foregroundStyle(Theme.text)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)
                .accessibilityIdentifier("board-search")
                .onChange(of: query) { runSearch() }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
        .background(Theme.panel)
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))
        .padding(.horizontal, 16)
        .padding(.bottom, 10)
    }

    private func runSearch() {
        searchTask?.cancel()
        let q = query.trimmingCharacters(in: .whitespaces)
        guard q.count >= 2 else { hits = []; return }
        searchTask = Task {
            try? await Task.sleep(nanoseconds: 200_000_000)
            guard !Task.isCancelled else { return }
            let found = await BobbyAPI.searchAssets(q, limit: 12)
            if !Task.isCancelled { hits = found }
        }
    }

    @ViewBuilder private var searchResults: some View {
        if hits.isEmpty {
            Text(L.t("Nothing yet — keep typing or say it your way; Bobby resolves typos.",
                     "Nada aún — sigue escribiendo o dilo a tu manera; Bobby resuelve typos."))
                .font(.rounded(12, .medium))
                .foregroundStyle(Theme.muted)
                .padding(.top, 24)
                .frame(maxWidth: .infinity)
        } else {
            ForEach(hits) { hit in
                assetRow(symbol: hit.symbol, name: hit.name, last: nil)
            }
        }
    }

    private var boardSections: some View {
        ForEach(sections, id: \.title) { section in
            Section {
                ForEach(section.assets) { asset in
                    assetRow(symbol: asset.symbol, name: asset.name, last: asset.last)
                }
            } header: {
                HStack {
                    Text(section.title)
                        .font(.mono(9, .bold))
                        .kerning(1.8)
                        .foregroundStyle(Theme.accentSoft)
                    Spacer()
                    Text("\(section.assets.count)")
                        .font(.mono(9, .medium))
                        .foregroundStyle(Theme.muted)
                }
                .padding(.vertical, 8)
                .background(Theme.bg)
            }
        }
    }

    private func assetRow(symbol: String, name: String, last: Double?) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            dismiss()
            vm.ask(symbol)
        } label: {
            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(symbol)
                        .font(.mono(13, .bold))
                        .foregroundStyle(Theme.text)
                    if name != symbol {
                        Text(name)
                            .font(.rounded(11, .medium))
                            .foregroundStyle(Theme.muted)
                            .lineLimit(1)
                    }
                }
                Spacer()
                if let last {
                    Text(BobbyAnswer.money(last))
                        .font(.mono(12, .semibold))
                        .foregroundStyle(Theme.text.opacity(0.75))
                }
                Image(systemName: "arrow.up.right")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Theme.accentSoft)
            }
            .padding(.horizontal, 13)
            .padding(.vertical, 11)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.stroke, lineWidth: 1))
        }
    }
}
