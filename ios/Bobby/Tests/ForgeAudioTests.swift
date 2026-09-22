import AVFoundation
import UIKit
import XCTest
@testable import Bobby

final class ForgeAudioTests: XCTestCase {
    @MainActor func testMachineHumChargesAndFinishesInAPlaybackSession() throws {
        let audio = ForgeAudio()
        defer { audio.stop() }
        XCTAssertTrue(audio.startHum())
        XCTAssertTrue(audio.isHumming)
        XCTAssertEqual(AVAudioSession.sharedInstance().category, .playback)
        XCTAssertTrue(AVAudioSession.sharedInstance().categoryOptions.contains(.mixWithOthers))
        for quarter in 1...4 { XCTAssertTrue(audio.charge(quarter)) }
        XCTAssertTrue(audio.isPlayingCue)
        XCTAssertTrue(audio.auraMax())
        XCTAssertFalse(audio.isHumming, "The machine ends when the aura is ready")
        XCTAssertTrue(audio.isPlayingCue)
        audio.stop()
        XCTAssertFalse(audio.isHumming)
        XCTAssertFalse(audio.isPlayingCue)
    }

    @MainActor func testLeavingOrBackgroundingStopsTheMachineAndItCanResume() {
        let audio = ForgeAudio()
        defer { audio.stop() }
        XCTAssertTrue(audio.startHum())
        XCTAssertTrue(audio.charge(1))
        audio.stop()
        audio.stop()
        XCTAssertFalse(audio.isHumming)
        XCTAssertFalse(audio.isPlayingCue)
        XCTAssertTrue(audio.startHum())
        XCTAssertTrue(audio.isHumming)
    }

    @MainActor func testEveryMachineEffectDecodesAndProducesAudibleSamples() async throws {
        for name in ["sfx_forge_hum", "sfx_forge_charge_1", "sfx_forge_charge_2", "sfx_forge_charge_3", "sfx_forge_charge_4", "sfx_aura_max"] {
            let data = try XCTUnwrap(NSDataAsset(name: name)?.data, name)
            let player = try AVAudioPlayer(data: data, fileTypeHint: "wav")
            player.isMeteringEnabled = true
            XCTAssertTrue(player.play(), name)
            var peak: Float = -160
            for _ in 0..<15 {
                try await Task.sleep(for: .milliseconds(30))
                player.updateMeters()
                peak = max(peak, player.peakPower(forChannel: 0))
            }
            player.stop()
            XCTAssertGreaterThan(peak, -45, name)
        }
    }
}
