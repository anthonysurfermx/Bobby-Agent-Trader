// Share my skin — one card, three destinations. Instagram gets a 9:16 story
// card; WhatsApp and X get the 4:5 card with a caption and the link. Every
// path ends in the system share sheet, the one door iOS gives a third-party
// app into those apps with an image attached. Instagram Stories can open
// directly instead, once the project carries a Meta app ID (MetaAppID in
// Info.plist) — Meta requires it for that route.
import LinkPresentation
import SwiftUI
import UIKit

struct SkinShareSheet: View {
    let card: UIImage
    let companion: Companion
    let level: CompanionLevel
    let gear: [CompanionTool]
    let pet: CompanionPet?
    let xp: Int
    @Environment(\.dismiss) private var dismiss
    @State private var outgoing: OutgoingShare?
    /// Drawn once: the desk re-renders this sheet on every voice-level tick.
    @State private var feed: UIImage?

    private var caption: String {
        L.t("My Bobby skin — earned with discipline, never volume. bobbyprotocol.xyz",
            "Mi estilo de Bobby — ganado con disciplina, nunca con volumen. bobbyprotocol.xyz")
    }

    private func render(story: Bool) -> UIImage {
        SkinCard.render(snapshot: card, companion: companion, level: level, gear: gear, pet: pet, xp: xp, story: story)
    }

    var body: some View {
        VStack(spacing: 16) {
            HStack {
                Text(L.t("SHARE MY SKIN", "COMPARTIR MI ESTILO"))
                    .font(.mono(11, .bold)).kerning(2).foregroundStyle(Theme.muted)
                Spacer()
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 13, weight: .bold)).foregroundStyle(Theme.muted)
                        .frame(width: 32, height: 32)
                }
                .accessibilityLabel(L.t("Close", "Cerrar"))
            }

            Group {
                if let feed {
                    Image(uiImage: feed)
                        .resizable()
                        .scaledToFit()
                        .clipShape(RoundedRectangle(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(companion.tint.opacity(0.35), lineWidth: 1))
                        .shadow(color: companion.tint.opacity(0.25), radius: 20)
                        .accessibilityLabel(L.t("Your skin card", "Tu tarjeta de estilo"))
                } else {
                    ProgressView().tint(companion.tint)
                }
            }
            .frame(maxHeight: .infinity)

            HStack(spacing: 10) {
                destination("Instagram", mark: Image(systemName: "camera.fill"),
                            fill: LinearGradient(colors: [Color(red: 0.51, green: 0.23, blue: 0.71), Color(red: 0.99, green: 0.35, blue: 0.27), Color(red: 0.99, green: 0.76, blue: 0.29)],
                                                 startPoint: .topTrailing, endPoint: .bottomLeading)) {
                    shareToInstagram()
                }
                destination("WhatsApp", mark: Image(systemName: "bubble.left.fill"),
                            fill: LinearGradient(colors: [Color(red: 0.15, green: 0.83, blue: 0.40)], startPoint: .top, endPoint: .bottom)) {
                    shareFeed()
                }
                destination("X", mark: Text("𝕏").font(.system(size: 22, weight: .bold)),
                            fill: LinearGradient(colors: [Color.black], startPoint: .top, endPoint: .bottom)) {
                    shareFeed()
                }
            }

            Button {
                shareFeed()
            } label: {
                Label(L.t("More options", "Más opciones"), systemImage: "square.and.arrow.up")
                    .font(.mono(11, .bold)).foregroundStyle(Theme.muted)
            }
        }
        .padding(20)
        .background(Theme.bg.ignoresSafeArea())
        .presentationDetents([.large])
        .onAppear { if feed == nil { feed = render(story: false) } }
        .sheet(item: $outgoing) { share in
            ShareSheet(items: share.items)
                .presentationDetents([.medium, .large])
                .ignoresSafeArea()
        }
    }

    private func destination<Mark: View>(_ name: String, mark: Mark, fill: LinearGradient, action: @escaping () -> Void) -> some View {
        Button {
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
            action()
        } label: {
            VStack(spacing: 8) {
                mark
                    .font(.system(size: 20, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(width: 52, height: 52)
                    .background(Circle().fill(fill))
                    .overlay(Circle().stroke(Color.white.opacity(0.15), lineWidth: 1))
                Text(name).font(.mono(10, .bold)).foregroundStyle(Theme.text)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Theme.card)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.stroke, lineWidth: 1))
        }
        .buttonStyle(.plain)
        .accessibilityLabel(L.t("Share to \(name)", "Compartir en \(name)"))
    }

    /// WhatsApp, X and everything else: the feed card with its caption and link.
    private func shareFeed() {
        guard let feed else { return }
        outgoing = OutgoingShare(items: [SkinShareImage(feed), caption])
    }

    /// Stories straight away when a Meta app ID is configured and Instagram is
    /// installed; otherwise the story-sized card through the share sheet, where
    /// Instagram offers Feed, Stories and Messages.
    private func shareToInstagram() {
        let story = render(story: true)
        if let appID = Bundle.main.object(forInfoDictionaryKey: "MetaAppID") as? String, !appID.isEmpty,
           let url = URL(string: "instagram-stories://share?source_application=\(appID)"),
           UIApplication.shared.canOpenURL(url),
           let png = story.pngData() {
            UIPasteboard.general.setItems([["com.instagram.sharedSticker.backgroundImage": png]],
                                          options: [.expirationDate: Date().addingTimeInterval(300)])
            UIApplication.shared.open(url)
            return
        }
        outgoing = OutgoingShare(items: [SkinShareImage(story)])
    }
}

/// The card as a share item with a real preview: the system sheet shows the
/// card and its title instead of a blank file icon.
final class SkinShareImage: NSObject, UIActivityItemSource {
    private let image: UIImage

    init(_ image: UIImage) { self.image = image }

    func activityViewControllerPlaceholderItem(_ activityViewController: UIActivityViewController) -> Any { image }

    func activityViewController(_ activityViewController: UIActivityViewController, itemForActivityType activityType: UIActivity.ActivityType?) -> Any? { image }

    func activityViewControllerLinkMetadata(_ activityViewController: UIActivityViewController) -> LPLinkMetadata? {
        let metadata = LPLinkMetadata()
        metadata.title = L.t("My Bobby skin", "Mi estilo de Bobby")
        metadata.imageProvider = NSItemProvider(object: image)
        metadata.iconProvider = NSItemProvider(object: image)
        return metadata
    }
}

struct OutgoingShare: Identifiable {
    let id = UUID()
    let items: [Any]
}
