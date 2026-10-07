import Foundation
import XCTest
@testable import Bobby

/// Reminder dates (1.8): 18:00 on the chosen day in the person's own time zone, never in the past.
/// Fixed calendar and zone, so midnight, month ends and the clock change are pinned.
final class ReminderScheduleTests: XCTestCase {
    private var calendar: Calendar = {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = TimeZone(identifier: "Europe/Madrid")!
        c.locale = Locale(identifier: "en_US_POSIX")
        return c
    }()

    private func at(_ y: Int, _ mo: Int, _ d: Int, _ h: Int = 0, _ mi: Int = 0, _ s: Int = 0) -> Date {
        calendar.date(from: DateComponents(year: y, month: mo, day: d, hour: h, minute: mi, second: s))!
    }

    private func parts(_ date: Date) -> [Int] {
        let c = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        return [c.year!, c.month!, c.day!, c.hour!, c.minute!, c.second!]
    }

    func testPresetsCountWholeDaysFromTodayOnEitherSideOfMidnight() {
        let lateEvening = at(2026, 10, 7, 23, 59, 30)
        XCTAssertEqual(parts(ReminderSchedule.date(for: .threeDays, now: lateEvening, calendar: calendar)), [2026, 10, 10, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .week, now: lateEvening, calendar: calendar)), [2026, 10, 14, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .month, now: lateEvening, calendar: calendar)), [2026, 11, 7, 18, 0, 0])
        let justAfter = at(2026, 10, 8, 0, 0, 30)
        XCTAssertEqual(parts(ReminderSchedule.date(for: .threeDays, now: justAfter, calendar: calendar)), [2026, 10, 11, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .week, now: justAfter, calendar: calendar)), [2026, 10, 15, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .month, now: justAfter, calendar: calendar)), [2026, 11, 8, 18, 0, 0])
    }

    func testAMonthFromAMonthEndIsTheLastDayOfTheNextMonth() {
        XCTAssertEqual(parts(ReminderSchedule.date(for: .month, now: at(2027, 1, 31, 9), calendar: calendar)), [2027, 2, 28, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .month, now: at(2028, 1, 31, 9), calendar: calendar)), [2028, 2, 29, 18, 0, 0],
                       "a leap year")
        XCTAssertEqual(parts(ReminderSchedule.date(for: .month, now: at(2026, 8, 31, 9), calendar: calendar)), [2026, 9, 30, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .month, now: at(2026, 12, 15, 9), calendar: calendar)), [2027, 1, 15, 18, 0, 0])
    }

    func testPresetsCrossMonthAndYearEnds() {
        XCTAssertEqual(parts(ReminderSchedule.date(for: .threeDays, now: at(2026, 12, 30, 22), calendar: calendar)), [2027, 1, 2, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .week, now: at(2026, 12, 28, 8), calendar: calendar)), [2027, 1, 4, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .threeDays, now: at(2027, 2, 27, 8), calendar: calendar)), [2027, 3, 2, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.date(for: .week, now: at(2026, 4, 28, 8), calendar: calendar)), [2026, 5, 5, 18, 0, 0])
    }

    func testEighteenLocalHoldsAcrossTheClockChange() {
        // Madrid leaves summer time on 25 October 2026: a week later is still 18:00 on the wall clock.
        let before = at(2026, 10, 23, 12)
        let fire = ReminderSchedule.date(for: .week, now: before, calendar: calendar)
        XCTAssertEqual(parts(fire), [2026, 10, 30, 18, 0, 0])
        XCTAssertEqual(fire.timeIntervalSince(at(2026, 10, 23, 18)), 7 * 86_400 + 3_600, accuracy: 1, "the night is one hour longer")
    }

    func testAPresetIsAlwaysInTheFuture() {
        for hour in [0, 6, 17, 18, 19, 23] {
            let now = at(2026, 10, 7, hour, 30)
            for preset in ReminderPreset.allCases {
                XCTAssertGreaterThan(ReminderSchedule.date(for: preset, now: now, calendar: calendar).timeIntervalSince(now), 2 * 86_400)
            }
        }
    }

    func testPickADayStartsTomorrowAtEighteen() {
        XCTAssertEqual(parts(ReminderSchedule.defaultPick(now: at(2026, 10, 7, 9), calendar: calendar)), [2026, 10, 8, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.defaultPick(now: at(2026, 10, 31, 23, 59), calendar: calendar)), [2026, 11, 1, 18, 0, 0])
        let range = ReminderSchedule.pickRange(now: at(2026, 10, 7, 9), calendar: calendar)
        XCTAssertGreaterThan(range.lowerBound, at(2026, 10, 7, 9))
        XCTAssertEqual(parts(range.upperBound), [2027, 10, 7, 9, 0, 0])
    }

    func testThePickerStartsOnAWholeMinuteThatCanBeScheduledAsShown() {
        // 12:00:30: the picker shows minutes, so its first choice must be a minute that is kept as shown.
        let now = at(2026, 10, 7, 12, 0, 30)
        let first = ReminderSchedule.pickRange(now: now, calendar: calendar).lowerBound
        XCTAssertEqual(parts(first), [2026, 10, 7, 12, 2, 0], "the first whole minute at least a minute away")
        XCTAssertEqual(ReminderSchedule.normalized(first, now: now, calendar: calendar), first, "what the picker shows is what is set")
        // On the minute exactly, one minute ahead is enough.
        XCTAssertEqual(parts(ReminderSchedule.earliest(now: at(2026, 10, 7, 12), calendar: calendar)), [2026, 10, 7, 12, 1, 0])
        XCTAssertEqual(parts(ReminderSchedule.earliest(now: at(2026, 10, 7, 12, 0, 1), calendar: calendar)), [2026, 10, 7, 12, 2, 0])
        // The last minute of a day rolls into the next one.
        XCTAssertEqual(parts(ReminderSchedule.earliest(now: at(2026, 10, 31, 23, 59, 30), calendar: calendar)), [2026, 11, 1, 0, 1, 0])
        for second in stride(from: 0, through: 59, by: 7) {
            let now = at(2026, 10, 7, 12, 0, second)
            let first = ReminderSchedule.pickRange(now: now, calendar: calendar).lowerBound
            XCTAssertEqual(parts(first)[5], 0, "a whole minute")
            XCTAssertGreaterThanOrEqual(first.timeIntervalSince(now), ReminderSchedule.minimumLead)
            XCTAssertLessThan(first.timeIntervalSince(now), ReminderSchedule.minimumLead + 60)
        }
    }

    func testATimeStillAheadButTooCloseStaysTodayNotTomorrow() {
        // 12:00:30, the person picks today 12:01: thirty seconds ahead is too close to hand to iOS,
        // but it has not passed. The reminder is for today, a minute later, never tomorrow.
        let now = at(2026, 10, 7, 12, 0, 30)
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 1), now: now, calendar: calendar)), [2026, 10, 7, 12, 2, 0])
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 1, 29), now: now, calendar: calendar)), [2026, 10, 7, 12, 2, 0])
        // Far enough: kept as picked.
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 2), now: now, calendar: calendar)), [2026, 10, 7, 12, 2, 0])
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 3), now: now, calendar: calendar)), [2026, 10, 7, 12, 3, 0])
        // A time that did pass today still goes to tomorrow.
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 7, 12, 0), now: now, calendar: calendar)), [2026, 10, 8, 12, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 7, 11, 59), now: now, calendar: calendar)), [2026, 10, 8, 11, 59, 0])
    }

    func testAPickedMomentInTheFutureIsKeptToTheMinute() {
        let now = at(2026, 10, 7, 17)
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 7, 18, 0, 42), now: now, calendar: calendar)), [2026, 10, 7, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 11, 20, 7, 45), now: now, calendar: calendar)), [2026, 11, 20, 7, 45, 0])
    }

    func testATimeThatAlreadyPassedTodayMovesToTheNextDay() {
        let now = at(2026, 10, 7, 19)
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 7, 18), now: now, calendar: calendar)), [2026, 10, 8, 18, 0, 0])
        XCTAssertEqual(parts(ReminderSchedule.normalized(now, now: now, calendar: calendar)), [2026, 10, 8, 19, 0, 0], "now is already the past")
        // The last evening of a month rolls into the next one.
        let monthEnd = at(2026, 10, 31, 23, 30)
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 31, 18), now: monthEnd, calendar: calendar)), [2026, 11, 1, 18, 0, 0])
    }

    func testAPastDayIsNeverScheduledInThePast() {
        let now = at(2026, 10, 7, 19)
        // Yesterday at 20:00 was meant as a time of day: 20:00 has not passed today.
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 10, 6, 20), now: now, calendar: calendar)), [2026, 10, 7, 20, 0, 0])
        // Last week at 10:00: today's 10:00 passed too, so tomorrow.
        XCTAssertEqual(parts(ReminderSchedule.normalized(at(2026, 9, 30, 10), now: now, calendar: calendar)), [2026, 10, 8, 10, 0, 0])
        for offset in stride(from: -400.0 * 86_400, through: 0, by: 37 * 3_600 + 11) {
            let fire = ReminderSchedule.normalized(now.addingTimeInterval(offset), now: now, calendar: calendar)
            XCTAssertGreaterThanOrEqual(fire.timeIntervalSince(now), ReminderSchedule.minimumLead)
            XCTAssertLessThanOrEqual(fire.timeIntervalSince(now), 86_400 + ReminderSchedule.minimumLead + 3_600)
        }
    }

    func testTheSameRulesHoldInAnotherTimeZone() {
        var tokyo = Calendar(identifier: .gregorian)
        tokyo.timeZone = TimeZone(identifier: "Asia/Tokyo")!
        let now = tokyo.date(from: DateComponents(year: 2026, month: 10, day: 7, hour: 23, minute: 50))!
        let fire = ReminderSchedule.date(for: .threeDays, now: now, calendar: tokyo)
        let c = tokyo.dateComponents([.month, .day, .hour], from: fire)
        XCTAssertEqual([c.month!, c.day!, c.hour!], [10, 10, 18])
        // The same instant is still 7 October in Madrid: the person's own zone decides the day.
        XCTAssertEqual(parts(ReminderSchedule.date(for: .threeDays, now: now, calendar: calendar)), [2026, 10, 10, 18, 0, 0])
    }

    func testTheDateReadsAsWeekdayDayMonthAndTime() {
        let fire = at(2026, 10, 16, 18)
        let english = ReminderCopy.when(fire, calendar: calendar, locale: Locale(identifier: "en_GB"))
        XCTAssertTrue(english.contains("Fri"), english)
        XCTAssertTrue(english.contains("16"), english)
        XCTAssertTrue(english.contains("Oct"), english)
        XCTAssertTrue(english.contains("18:00"), english)
        let spanish = ReminderCopy.when(fire, calendar: calendar, locale: Locale(identifier: "es_MX"))
        XCTAssertTrue(spanish.lowercased().contains("vie"), spanish)
        XCTAssertTrue(spanish.contains("16"), spanish)
    }
}
