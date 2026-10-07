import Foundation
import UserNotifications
import XCTest
@testable import Bobby

/// The one thing reminders hand to iOS (1.8): the notification request. Built by a pure function, so
/// every field is pinned here without touching the phone's notification centre: when it fires, what
/// the lock screen shows, and that the tap it produces is one the app reads.
@MainActor
final class ReminderRequestTests: XCTestCase {
    private static let thesisId = "3F2504E0-4F89-41D3-9A0C-0305E82C3301"

    private func calendar(_ zone: String) -> Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: zone)!
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }

    /// 18:00 on the wall clock of `calendar`, `days` from the real today (iOS computes the next
    /// trigger date from the real clock, so the moment has to be ahead of it).
    private func evening(in calendar: Calendar, days: Int, hour: Int = 18, minute: Int = 0) -> Date {
        let day = calendar.date(byAdding: .day, value: days, to: calendar.startOfDay(for: Date()))!
        return calendar.date(bySettingHour: hour, minute: minute, second: 0, of: day)!
    }

    private func notice(fireAt: Date, calendar: Calendar, language: String = "en") -> ReminderNotice {
        let plan = ReminderCenter.plan([PendingReminder(thesisId: Self.thesisId, symbol: "NVDA", fireAt: fireAt)],
                                       calendar: calendar, language: language)
        XCTAssertEqual(plan.count, 1)
        return plan[0]
    }

    func testTheRequestIsOneGenericLineWithTheDefaultSoundAndNoBadge() throws {
        let calendar = calendar("America/Mexico_City")
        let request = notice(fireAt: evening(in: calendar, days: 7), calendar: calendar).request()
        XCTAssertEqual(request.identifier, "v18.thesis.\(Self.thesisId)", "the thesis id as stored")
        XCTAssertEqual(request.content.title, "Bobby")
        XCTAssertEqual(request.content.body, "You asked me to remind you to review a thesis. This is your reminder, not a market alert.")
        XCTAssertEqual(request.content.subtitle, "")
        XCTAssertEqual(request.content.sound, UNNotificationSound.default)
        XCTAssertNil(request.content.badge, "a reminder never puts a number on the icon")
        XCTAssertEqual(request.content.threadIdentifier, ReminderNotice.thread)
        XCTAssertTrue(request.content.attachments.isEmpty)
        XCTAssertEqual(request.content.categoryIdentifier, "", "no actions: a tap opens the review")
        for forbidden in ["NVDA", Self.thesisId] {
            XCTAssertFalse(request.content.title.contains(forbidden))
            XCTAssertFalse(request.content.body.contains(forbidden))
        }
    }

    func testTheRequestSpeaksTheLanguageItWasWrittenIn() {
        let calendar = calendar("Europe/Madrid")
        for code in ["en", "es", "fr", "pt", "it", "de"] {
            let request = notice(fireAt: evening(in: calendar, days: 3), calendar: calendar, language: code).request()
            XCTAssertEqual(request.content.body, ReminderCopy.notificationBody(language: code), code)
            XCTAssertEqual(request.content.title, "Bobby", code)
        }
    }

    func testTheTapIosHandsBackIsOneTheAppReads() throws {
        let calendar = calendar("America/Mexico_City")
        let request = notice(fireAt: evening(in: calendar, days: 7), calendar: calendar).request()
        let info = request.content.userInfo
        XCTAssertEqual(Set(info.keys.compactMap { $0 as? String }), ["kind", "thesisId"], "nothing else travels with the notification")
        XCTAssertEqual(info.count, 2)
        XCTAssertEqual(info["kind"] as? String, "thesis-review")
        XCTAssertEqual(info["thesisId"] as? String, Self.thesisId)
        XCTAssertEqual(ReminderIntent.tap(from: info), ReminderTap(thesisId: Self.thesisId))
        // iOS keeps a request's payload as a property list: it must survive that trip unchanged.
        let data = try PropertyListSerialization.data(fromPropertyList: info, format: .binary, options: 0)
        let back = try XCTUnwrap(PropertyListSerialization.propertyList(from: data, format: nil) as? [AnyHashable: Any])
        XCTAssertEqual(ReminderIntent.tap(from: back), ReminderTap(thesisId: Self.thesisId))
        // A briefing push is told apart by the same payload.
        XCTAssertNil(BriefingIntent.briefId(from: info))
    }

    func testTheTriggerFiresOnceAtTheMomentThePersonChose() throws {
        // Two zones a day apart from each other, so at least one is far from this machine's own.
        for zone in ["Pacific/Kiritimati", "Pacific/Pago_Pago", "America/Mexico_City", "Asia/Kolkata"] {
            let calendar = calendar(zone)
            for (days, hour, minute) in [(1, 18, 0), (3, 18, 0), (7, 18, 0), (31, 18, 0), (40, 9, 30), (200, 23, 59), (364, 0, 1)] {
                let fireAt = evening(in: calendar, days: days, hour: hour, minute: minute)
                let request = notice(fireAt: fireAt, calendar: calendar).request()
                let trigger = try XCTUnwrap(request.trigger as? UNCalendarNotificationTrigger, "\(zone) +\(days)")
                XCTAssertFalse(trigger.repeats, "a reminder fires once")
                XCTAssertEqual(trigger.nextTriggerDate(), fireAt, "\(zone) +\(days) \(hour):\(minute)")
                let parts = trigger.dateComponents
                XCTAssertEqual(parts.timeZone?.identifier, zone, "pinned to the zone the person chose it in")
                XCTAssertEqual(parts.calendar?.identifier, .gregorian)
                XCTAssertNotNil(parts.year, "a full date: never next year's same day")
                XCTAssertEqual([parts.hour, parts.minute, parts.second], [hour, minute, 0])
                XCTAssertEqual(calendar.date(from: parts), fireAt)
            }
        }
    }

    func testTheTriggerHoldsTheWallClockAcrossAClockChange() throws {
        // Whatever the date today, within the next year Madrid changes its clocks twice: 18:00 on
        // every one of the next 370 evenings is still 18:00 there.
        let calendar = calendar("Europe/Madrid")
        for days in stride(from: 1, through: 370, by: 9) {
            let fireAt = evening(in: calendar, days: days)
            let trigger = try XCTUnwrap(notice(fireAt: fireAt, calendar: calendar).request().trigger as? UNCalendarNotificationTrigger)
            let next = try XCTUnwrap(trigger.nextTriggerDate(), "+\(days)")
            XCTAssertEqual(next, fireAt, "+\(days)")
            XCTAssertEqual(calendar.dateComponents([.hour, .minute], from: next), DateComponents(hour: 18, minute: 0), "+\(days)")
        }
    }

    func testAMomentThatPassedIsNeverWhatIosWouldFireOn() throws {
        // Why the centre never hands iOS a moment that passed, and leaves a request alone in its last
        // seconds (ReminderSchedule.handOffMargin): iOS does not answer "never" for it. On the
        // simulator this was written on, three days ago resolved to the first of the next month.
        let calendar = calendar("America/Mexico_City")
        let passed = Date().addingTimeInterval(-3 * 86_400)
        let request = notice(fireAt: passed, calendar: calendar).request()
        let trigger = try XCTUnwrap(request.trigger as? UNCalendarNotificationTrigger)
        if let next = trigger.nextTriggerDate() {
            XCTAssertGreaterThan(next, Date(), "whatever iOS makes of it, it is not the moment the person chose")
        }
        XCTAssertNotEqual(trigger.nextTriggerDate(), passed)
        XCTAssertGreaterThan(ReminderSchedule.handOffMargin, 0)
        XCTAssertLessThan(ReminderSchedule.handOffMargin, ReminderSchedule.minimumLead, "a reminder set a minute ahead is still written")
    }
}
