import SwiftUI
import SafariServices

// Curated source links for the historical demo; no automatic signal inference.
struct SignalJourney: View {
    @Environment(\.dismiss) private var dismiss
    @State private var video: VideoMoment?
    private let moments = [
        VideoMoment(id: 327, title: "COIN · primer fragmento", time: "05:27", detail: "Momento original del video relacionado con el caso COIN."),
        VideoMoment(id: 929, title: "COIN · segundo fragmento", time: "15:29", detail: "Segundo momento original para revisar directamente en YouTube.")
    ]

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(alignment: .leading, spacing: 26) {
                    HStack {
                        Text("COIN / DANIEL MARÍN").font(.system(size: 10, weight: .semibold)).tracking(2).foregroundStyle(Theme.accent)
                        Spacer()
                        Text("CASO HISTÓRICO").font(.system(size: 8)).foregroundStyle(.gray)
                    }
                    Text("La fuente original.").font(.system(size: 34, weight: .medium)).tracking(-1)
                    Text("Revisa directamente los dos momentos del video donde se menciona COIN.").font(.system(size: 14)).foregroundStyle(.gray).lineSpacing(4)
                    Text(SignalListItem.coin.reportedVerdict).font(.title3).foregroundStyle(.white)
                    Text("Reportado por Daniel · sin verificar · Publicada 18 sep 2026").font(.footnote).foregroundStyle(Theme.secondary).padding(.top, -12)
                    VStack(alignment: .leading, spacing: 0) {
                        ForEach(moments) { moment in
                            Button { video = moment } label: {
                                HStack(alignment: .top, spacing: 14) {
                                    Image(systemName: "play.fill").font(.system(size: 12)).foregroundStyle(Theme.bg).frame(width: 38, height: 38).background(Theme.accent, in: Circle())
                                    VStack(alignment: .leading, spacing: 9) {
                                        Text(moment.title).font(.system(size: 17, weight: .medium)).foregroundStyle(.white)
                                        Text(moment.detail).font(.system(size: 13)).foregroundStyle(.gray).lineSpacing(4)
                                        Text("Abrir en YouTube · \(moment.time)").font(.system(size: 12, weight: .medium)).foregroundStyle(Theme.accent)
                                    }
                                }.padding(18).frame(maxWidth: .infinity, alignment: .leading)
                            }.buttonStyle(.plain).accessibilityIdentifier("video-moment-\(moment.id)")
                            if moment.id == 327 { Divider().overlay(.white.opacity(0.04)).padding(.leading, 70) }
                        }
                    }.background(.white.opacity(0.035), in: RoundedRectangle(cornerRadius: 22))
                    VStack(alignment: .leading, spacing: 9) {
                        Label("Lectura PTS", systemImage: "doc.text").font(.system(size: 14, weight: .medium)).foregroundStyle(Theme.accent)
                        Text("PTS conserva el reporte de Daniel: COIN superó el segundo objetivo. Los niveles se muestran como referencias; la función del contrato de opciones no está documentada.").font(.system(size: 13)).foregroundStyle(.gray).lineSpacing(4)
                    }
                    Text("Fragmentos del mismo video de YouTube · selección editorial basada en subtítulos automáticos.").font(.system(size: 10)).foregroundStyle(.gray)
                }.padding(24)
            }.background(Theme.bg)
                .navigationTitle("Video de YouTube").navigationBarTitleDisplayMode(.inline)
                .toolbar { Button("Listo") { dismiss() } }
                .sheet(item: $video) { moment in SourceVideo(url: moment.url).ignoresSafeArea() }
        }.tint(Theme.accent)
    }
}

private struct VideoMoment: Identifiable {
    let id: Int
    let title: String
    let time: String
    let detail: String
    var url: URL { URL(string: "https://www.youtube.com/watch?v=ZYwei43K1xE&t=\(id)s")! }
}

private struct SourceVideo: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> SFSafariViewController { SFSafariViewController(url: url) }
    func updateUIViewController(_ controller: SFSafariViewController, context: Context) {}
}
