import SwiftUI

/// The same remembered voice choice on every surface that can speak.
struct AvatarVoiceToggle: View {
    @ObservedObject var voice: NeuralVoice
    var accessibilityID = "avatar-voice-toggle"

    var body: some View {
        Button {
            voice.isMuted.toggle()
            UIImpactFeedbackGenerator(style: .light).impactOccurred()
        } label: {
            Image(systemName: voice.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(voice.isMuted ? Theme.muted : Theme.accentSoft)
                .frame(width: 32, height: 32)
                .background(Circle().fill(Theme.card))
                .overlay(Circle().stroke(Theme.stroke, lineWidth: 1))
                .frame(minWidth: 44, minHeight: 44)
                .contentShape(Rectangle())
        }
        .accessibilityIdentifier(accessibilityID)
        .accessibilityLabel(voice.isMuted ? L.t("Enable avatar voice", "Activar voz del avatar") : L.t("Mute avatar voice", "Silenciar voz del avatar"))
        .accessibilityValue(voice.isMuted ? L.t("Muted", "Silenciada") : L.t("On", "Activada"))
        .accessibilityHint(L.t("Your choice is saved on this device.", "Tu elección se guarda en este dispositivo."))
    }
}
