//
//  IVXTimeService.swift
//  Ivx
//
//  IVX Enterprise Time Service — iOS
//
//  Single source of truth for all timestamp operations in the iOS app.
//  Shared across all IVX platforms (Expo, iOS, backend).
//
//  PRINCIPLES:
//   - Store ALL timestamps in UTC (ISO 8601 with "Z" suffix)
//   - Never store local device times in the database
//   - Convert UTC → local timezone only when displaying data
//   - Automatically support Daylight Saving Time via IANA timezone database
//

import Foundation

// MARK: - Types

/// IANA timezone identifier (e.g., "America/New_York")
public typealias IanaTimezone = String

/// UTC offset in minutes (e.g., -300 for UTC-5, +330 for UTC+5:30)
public typealias UtcOffsetMinutes = Int

/// Display preference for time
public enum TimeDisplayMode: String, CaseIterable, Codable {
    case utc
    case local
    case server
    case owner
    case user
    case property
    case custom
}

/// 12/24 hour clock preference
public enum HourPreference: String, CaseIterable, Codable {
    case h12 = "12h"
    case h24 = "24h"
}

/// Full timezone profile stored on the user's profile record
public struct TimezoneProfile: Codable, Equatable {
    public var timezone: IanaTimezone
    public var utcOffset: UtcOffsetMinutes
    public var country: String?
    public var region: String?
    public var locale: String
    public var hourPreference: HourPreference
    public var lastTimezoneUpdate: String

    private enum CodingKeys: String, CodingKey {
        case timezone
        case utcOffset = "utc_offset"
        case country
        case region
        case locale
        case hourPreference = "hour_preference"
        case lastTimezoneUpdate = "last_timezone_update"
    }

    public init(
        timezone: IanaTimezone,
        utcOffset: UtcOffsetMinutes,
        country: String? = nil,
        region: String? = nil,
        locale: String = "en-US",
        hourPreference: HourPreference = .h12,
        lastTimezoneUpdate: String = IVXTimeService.nowUtc()
    ) {
        self.timezone = timezone
        self.utcOffset = utcOffset
        self.country = country
        self.region = region
        self.locale = locale
        self.hourPreference = hourPreference
        self.lastTimezoneUpdate = lastTimezoneUpdate
    }
}

/// Result of timezone detection from the device
public struct DetectedTimezone: Codable {
    public let timezone: IanaTimezone
    public let utcOffset: UtcOffsetMinutes
    public let country: String?
    public let region: String?
    public let locale: String
    public let hourPreference: HourPreference
    public let source: String
    public let detectedAt: String

    private enum CodingKeys: String, CodingKey {
        case timezone
        case utcOffset = "utc_offset"
        case country
        case region
        case locale
        case hourPreference = "hour_preference"
        case source
        case detectedAt = "detected_at"
    }
}

/// A timestamp rendered for display in a specific timezone
public struct FormattedTimestamp: Codable {
    public let utc: String
    public let local: String
    public let timezone: IanaTimezone
    public let offset: String
    public let offsetMinutes: UtcOffsetMinutes
    public let isDst: Bool
    public let device: String?
    public let formattedDate: String
    public let formattedTime: String
    public let formattedFull: String

    private enum CodingKeys: String, CodingKey {
        case utc
        case local
        case timezone
        case offset
        case offsetMinutes = "offset_minutes"
        case isDst = "is_dst"
        case device
        case formattedDate = "formatted_date"
        case formattedTime = "formatted_time"
        case formattedFull = "formatted_full"
    }
}

/// Audit log entry with timezone metadata
public struct AuditTimezoneEntry: Codable {
    public let utc: String
    public let localTime: String
    public let timezone: IanaTimezone
    public let offset: String
    public let device: String?

    private enum CodingKeys: String, CodingKey {
        case utc
        case localTime = "local_time"
        case timezone
        case offset
        case device
    }
}

// MARK: - Supported Test Cities

public struct TestCity: Codable, Equatable {
    public let city: String
    public let timezone: IanaTimezone
    public let country: String
}

public let supportedTestCities: [TestCity] = [
    TestCity(city: "New York",   timezone: "America/New_York",    country: "US"),
    TestCity(city: "Miami",      timezone: "America/New_York",    country: "US"),
    TestCity(city: "California", timezone: "America/Los_Angeles", country: "US"),
    TestCity(city: "London",     timezone: "Europe/London",       country: "GB"),
    TestCity(city: "Madrid",     timezone: "Europe/Madrid",       country: "ES"),
    TestCity(city: "Dubai",      timezone: "Asia/Dubai",           country: "AE"),
    TestCity(city: "Tokyo",      timezone: "Asia/Tokyo",           country: "JP"),
    TestCity(city: "Sydney",     timezone: "Australia/Sydney",     country: "AU"),
]

// MARK: - IVXTimeService

public enum IVXTimeService {
    /// Default timezone when detection fails
    public static let defaultTimezone: IanaTimezone = "UTC"
    /// Default locale
    public static let defaultLocale = "en-US"

    // MARK: - UTC Operations

    /// Returns the current UTC timestamp as an ISO 8601 string
    public static func nowUtc() -> String {
        return ISO8601DateFormatter().string(from: Date())
    }

    /// Converts any ISO 8601 timestamp to UTC
    public static func toUtc(_ timestamp: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: timestamp) {
            return ISO8601DateFormatter().string(from: date)
        }
        // Try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: timestamp) {
            return ISO8601DateFormatter().string(from: date)
        }
        // Try flexible parsing
        let flexible = DateFormatter()
        flexible.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
        if let date = flexible.date(from: timestamp) {
            return ISO8601DateFormatter().string(from: date)
        }
        return timestamp
    }

    /// Validates that a timestamp string is in UTC
    public static func assertUtc(_ timestamp: String) throws {
        guard timestamp.hasSuffix("Z") || timestamp.hasSuffix("+00:00") else {
            throw NSError(domain: "IVXTimeService", code: 1,
                          userInfo: [NSLocalizedDescriptionKey: "Timestamp is not UTC: \(timestamp)"])
        }
    }

    // MARK: - Offset & DST

    /// Returns the UTC offset in minutes for a given IANA timezone at a specific date
    public static func getUtcOffsetMinutes(_ timezone: IanaTimezone, date: Date = Date()) -> UtcOffsetMinutes {
        guard let tz = TimeZone(identifier: timezone) else { return 0 }
        return tz.secondsFromGMT(for: date) / 60
    }

    /// Returns a human-readable offset string like "+05:30" or "-04:00"
    public static func getOffsetString(_ offsetMinutes: UtcOffsetMinutes) -> String {
        let sign = offsetMinutes >= 0 ? "+" : "-"
        let abs = Swift.abs(offsetMinutes)
        let hours = abs / 60
        let minutes = abs % 60
        return String(format: "%@%02d:%02d", sign, hours, minutes)
    }

    /// Checks if Daylight Saving Time is in effect for a given timezone at a specific date
    public static func isDst(_ timezone: IanaTimezone, date: Date = Date()) -> Bool {
        guard let tz = TimeZone(identifier: timezone) else { return false }
        return tz.isDaylightSavingTime(for: date)
    }

    // MARK: - Formatting

    /// Formats a UTC timestamp into a specific timezone for display
    public static func formatTimestamp(
        _ utcTimestamp: String,
        timezone: IanaTimezone = defaultTimezone,
        locale: String = defaultLocale,
        hourPreference: HourPreference = .h12,
        device: String? = nil
    ) -> FormattedTimestamp {
        let date = parseUtc(utcTimestamp)

        guard let tz = TimeZone(identifier: timezone) else {
            return FormattedTimestamp(
                utc: utcTimestamp, local: utcTimestamp, timezone: timezone,
                offset: "+00:00", offsetMinutes: 0, isDst: false, device: device,
                formattedDate: utcTimestamp, formattedTime: utcTimestamp, formattedFull: utcTimestamp
            )
        }

        let offsetMinutes = getUtcOffsetMinutes(timezone, date: date)
        let offsetStr = getOffsetString(offsetMinutes)
        let dst = isDst(timezone, date: date)

        let loc = Locale(identifier: locale)
        let dateFormatter = DateFormatter()
        dateFormatter.timeZone = tz
        dateFormatter.locale = loc

        // Date format
        dateFormatter.dateFormat = "MMM d, yyyy"
        let formattedDate = dateFormatter.string(from: date)

        // Time format
        dateFormatter.dateFormat = hourPreference == .h12 ? "h:mm a" : "HH:mm"
        let formattedTime = dateFormatter.string(from: date)

        // Full format
        dateFormatter.dateFormat = hourPreference == .h12 ? "MMM d, yyyy 'at' h:mm:ss a zzz" : "MMM d, yyyy 'at' HH:mm:ss zzz"
        let formattedFull = dateFormatter.string(from: date)

        let utcFormatter = ISO8601DateFormatter()
        let utcStr = utcFormatter.string(from: date)

        return FormattedTimestamp(
            utc: utcStr, local: formattedFull, timezone: timezone,
            offset: offsetStr, offsetMinutes: offsetMinutes, isDst: dst, device: device,
            formattedDate: formattedDate, formattedTime: formattedTime, formattedFull: formattedFull
        )
    }

    /// Formats a timestamp for chat display (short time only)
    public static func formatChatTimestamp(
        _ utcTimestamp: String,
        timezone: IanaTimezone = defaultTimezone,
        hourPreference: HourPreference = .h12
    ) -> String {
        return formatTimestamp(utcTimestamp, timezone: timezone, hourPreference: hourPreference).formattedTime
    }

    /// Formats a timestamp for audit log display with full timezone metadata
    public static func formatAuditTimestamp(
        _ utcTimestamp: String,
        timezone: IanaTimezone = defaultTimezone,
        device: String? = nil
    ) -> AuditTimezoneEntry {
        let result = formatTimestamp(utcTimestamp, timezone: timezone)
        return AuditTimezoneEntry(
            utc: result.utc, localTime: result.formattedFull,
            timezone: result.timezone, offset: result.offset, device: device
        )
    }

    /// Converts a UTC timestamp to a specific display mode
    public static func convertForDisplay(
        _ utcTimestamp: String,
        mode: TimeDisplayMode,
        userTimezone: IanaTimezone = defaultTimezone,
        ownerTimezone: IanaTimezone = defaultTimezone,
        propertyTimezone: IanaTimezone? = nil,
        customTimezone: IanaTimezone? = nil,
        locale: String = defaultLocale,
        hourPreference: HourPreference = .h12
    ) -> FormattedTimestamp {
        let targetTimezone: IanaTimezone
        switch mode {
        case .utc, .server: targetTimezone = "UTC"
        case .local, .user: targetTimezone = userTimezone
        case .owner:        targetTimezone = ownerTimezone
        case .property:     targetTimezone = propertyTimezone ?? defaultTimezone
        case .custom:       targetTimezone = customTimezone ?? defaultTimezone
        }
        return formatTimestamp(utcTimestamp, timezone: targetTimezone, locale: locale, hourPreference: hourPreference)
    }

    // MARK: - Validation

    /// Validates that a string is a valid IANA timezone
    public static func isValidTimezone(_ tz: String) -> Bool {
        return TimeZone(identifier: tz) != nil
    }

    // MARK: - Auto-Detection

    /// Auto-detects the device's timezone using native iOS APIs
    public static func detectDeviceTimezone() -> DetectedTimezone {
        let deviceTimezone = TimeZone.current.identifier
        let timezone = isValidTimezone(deviceTimezone) ? deviceTimezone : defaultTimezone
        let offset = getUtcOffsetMinutes(timezone)
        let locale = Locale.current.identifier
        let hourPreference = detectHourPreference(locale)
        let (country, region) = extractCountryFromTimezone(timezone)

        return DetectedTimezone(
            timezone: timezone, utcOffset: offset,
            country: country, region: region,
            locale: locale, hourPreference: hourPreference,
            source: "device", detectedAt: nowUtc()
        )
    }

    /// Detects 12h/24h preference from locale
    public static func detectHourPreference(_ locale: String) -> HourPreference {
        let twentyFourHourLanguages: Set<String> = [
            "de", "fr", "es", "it", "pt", "nl", "sv", "no", "da", "fi",
            "pl", "cs", "sk", "hu", "ro", "bg", "hr", "sl", "lt", "lv", "et",
            "ru", "uk", "tr", "el", "ja", "ko", "zh", "th", "vi",
        ]
        let lang = String(locale.prefix(2)).lowercased()
        return twentyFourHourLanguages.contains(lang) ? .h24 : .h12
    }

    /// Extracts country and region from IANA timezone identifier
    public static func extractCountryFromTimezone(_ timezone: IanaTimezone) -> (country: String?, region: String?) {
        let parts = timezone.split(separator: "/")
        guard parts.count >= 2 else { return (nil, nil) }

        let region = String(parts[0])
        let cityPart = parts.last!.replacingOccurrences(of: "_", with: " ")

        let cityCountryMap: [String: String] = [
            "New York": "US", "Los Angeles": "US", "Chicago": "US", "Denver": "US",
            "Toronto": "CA", "Vancouver": "CA", "Mexico City": "MX",
            "Sao Paulo": "BR", "Buenos Aires": "AR", "Bogota": "CO", "Lima": "PE",
            "London": "GB", "Paris": "FR", "Madrid": "ES", "Berlin": "DE",
            "Moscow": "RU", "Athens": "GR", "Amsterdam": "NL", "Rome": "IT",
            "Dubai": "AE", "Jerusalem": "IL", "Tokyo": "JP", "Seoul": "KR",
            "Shanghai": "CN", "Hong Kong": "HK", "Singapore": "SG",
            "Sydney": "AU", "Melbourne": "AU", "Auckland": "NZ", "Honolulu": "US",
            "Cairo": "EG", "Lagos": "NG", "Johannesburg": "ZA",
            "Kolkata": "IN", "Karachi": "PK", "Bangkok": "TH",
        ]

        let country = cityCountryMap[String(cityPart)] ?? region
        return (country, region)
    }

    /// Returns the current device identifier for audit logs
    public static func getDeviceIdentifier() -> String {
        let model = UIDevice.current.model
        let systemVersion = UIDevice.current.systemVersion
        return "\(model)-iOS\(systemVersion)"
    }

    /// Returns timezones grouped by region for UI selectors
    public static func getTimezonesByRegion() -> [String: [IanaTimezone]] {
        return [
            "Universal": ["UTC"],
            "North America": [
                "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
                "America/Anchorage", "America/Toronto", "America/Mexico_City",
            ],
            "South America": [
                "America/Sao_Paulo", "America/Argentina/Buenos_Aires", "America/Bogota", "America/Lima",
            ],
            "Europe": [
                "Europe/London", "Europe/Paris", "Europe/Madrid", "Europe/Berlin",
                "Europe/Moscow", "Europe/Athens", "Europe/Amsterdam",
            ],
            "Middle East & Africa": [
                "Asia/Dubai", "Asia/Jerusalem", "Africa/Cairo", "Africa/Johannesburg", "Africa/Lagos",
            ],
            "Asia": [
                "Asia/Kolkata", "Asia/Shanghai", "Asia/Tokyo", "Asia/Singapore",
                "Asia/Hong_Kong", "Asia/Seoul", "Asia/Bangkok",
            ],
            "Oceania": [
                "Australia/Sydney", "Australia/Melbourne", "Pacific/Auckland", "Pacific/Honolulu",
            ],
        ]
    }

    // MARK: - Private Helpers

    /// Parses a UTC timestamp string into a Date
    private static func parseUtc(_ timestamp: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: timestamp) { return date }

        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: timestamp) { return date }

        let flexible = DateFormatter()
        flexible.dateFormat = "yyyy-MM-dd'T'HH:mm:ssZ"
        if let date = flexible.date(from: timestamp) { return date }

        flexible.dateFormat = "yyyy-MM-dd'T'HH:mm:ss.SSSZ"
        if let date = flexible.date(from: timestamp) { return date }

        return Date()
    }
}

// MARK: - UIKit import (needed for device model)
import UIKit
