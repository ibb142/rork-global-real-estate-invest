//
//  JVDeal.swift
//  Ivx
//
//  Mirrors the Android app's `jv_deals` Supabase rows (expo/lib/jv-storage.ts)
//  so both apps render the exact same live deals — with the full professional
//  detail set (description, partner info, legal terms, fees, photos gallery).
//

import Foundation

/// A published JV deal from the production `jv_deals` table.
nonisolated struct JVDeal: Identifiable, Decodable, Hashable {
    let id: String
    let title: String?
    let projectName: String?
    let type: String?
    let status: String?
    let description: String?
    let minInvestment: Double?
    let expectedRoi: Double?
    let totalInvestment: Double?
    let estimatedValue: Double?
    let profitSplit: String?
    let city: String?
    let state: String?
    let country: String?
    let propertyAddress: String?
    let propertyType: String?
    let lotSize: Double?
    let lotSizeUnit: String?
    let zoning: String?
    let termMonths: Int?
    let distributionFrequency: String?
    let exitStrategy: String?
    let startDate: String?
    let endDate: String?
    let governingLaw: String?
    let disputeResolution: String?
    let managementFee: Double?
    let performanceFee: Double?
    let minimumHoldPeriod: Int?
    let partnerName: String?
    let partnerEmail: String?
    let partnerPhone: String?
    let partnerType: String?
    let photos: [String]?
    let published: Bool?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case projectName = "project_name"
        case type
        case status
        case description
        case minInvestment = "min_investment"
        case expectedRoi = "expected_roi"
        case totalInvestment = "total_investment"
        case estimatedValue = "estimated_value"
        case profitSplit = "profit_split"
        case city
        case state
        case country
        case propertyAddress = "property_address"
        case propertyType = "property_type"
        case lotSize = "lot_size"
        case lotSizeUnit = "lot_size_unit"
        case zoning
        case termMonths = "term_months"
        case distributionFrequency = "distribution_frequency"
        case exitStrategy = "exit_strategy"
        case startDate = "start_date"
        case endDate = "end_date"
        case governingLaw = "governing_law"
        case disputeResolution = "dispute_resolution"
        case managementFee = "management_fee"
        case performanceFee = "performance_fee"
        case minimumHoldPeriod = "minimum_hold_period"
        case partnerName = "partner_name"
        case partnerEmail = "partner_email"
        case partnerPhone = "partner_phone"
        case partnerType = "partner_type"
        case photos
        case published
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try? container.decodeIfPresent(String.self, forKey: .title)
        projectName = try? container.decodeIfPresent(String.self, forKey: .projectName)
        type = try? container.decodeIfPresent(String.self, forKey: .type)
        status = try? container.decodeIfPresent(String.self, forKey: .status)
        description = try? container.decodeIfPresent(String.self, forKey: .description)
        minInvestment = Self.flexibleDouble(container, .minInvestment)
        expectedRoi = Self.flexibleDouble(container, .expectedRoi)
        totalInvestment = Self.flexibleDouble(container, .totalInvestment)
        estimatedValue = Self.flexibleDouble(container, .estimatedValue)
        profitSplit = try? container.decodeIfPresent(String.self, forKey: .profitSplit)
        city = try? container.decodeIfPresent(String.self, forKey: .city)
        state = try? container.decodeIfPresent(String.self, forKey: .state)
        country = try? container.decodeIfPresent(String.self, forKey: .country)
        propertyAddress = try? container.decodeIfPresent(String.self, forKey: .propertyAddress)
        propertyType = try? container.decodeIfPresent(String.self, forKey: .propertyType)
        lotSize = Self.flexibleDouble(container, .lotSize)
        lotSizeUnit = try? container.decodeIfPresent(String.self, forKey: .lotSizeUnit)
        zoning = try? container.decodeIfPresent(String.self, forKey: .zoning)
        termMonths = Self.flexibleInt(container, .termMonths)
        distributionFrequency = try? container.decodeIfPresent(String.self, forKey: .distributionFrequency)
        exitStrategy = try? container.decodeIfPresent(String.self, forKey: .exitStrategy)
        startDate = try? container.decodeIfPresent(String.self, forKey: .startDate)
        endDate = try? container.decodeIfPresent(String.self, forKey: .endDate)
        governingLaw = try? container.decodeIfPresent(String.self, forKey: .governingLaw)
        disputeResolution = try? container.decodeIfPresent(String.self, forKey: .disputeResolution)
        managementFee = Self.flexibleDouble(container, .managementFee)
        performanceFee = Self.flexibleDouble(container, .performanceFee)
        minimumHoldPeriod = Self.flexibleInt(container, .minimumHoldPeriod)
        partnerName = try? container.decodeIfPresent(String.self, forKey: .partnerName)
        partnerEmail = try? container.decodeIfPresent(String.self, forKey: .partnerEmail)
        partnerPhone = try? container.decodeIfPresent(String.self, forKey: .partnerPhone)
        partnerType = try? container.decodeIfPresent(String.self, forKey: .partnerType)
        photos = try? container.decodeIfPresent([String].self, forKey: .photos)
        published = try? container.decodeIfPresent(Bool.self, forKey: .published)
    }

    /// Convenience for callers that only need the first photo.
    var firstPhoto: String? { photos?.first }

    private static func flexibleDouble(_ container: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Double? {
        if let value = try? container.decodeIfPresent(Double.self, forKey: key) { return value }
        if let text = try? container.decodeIfPresent(String.self, forKey: key) { return Double(text) }
        return nil
    }

    private static func flexibleInt(_ container: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Int? {
        if let value = try? container.decodeIfPresent(Int.self, forKey: key) { return value }
        if let text = try? container.decodeIfPresent(String.self, forKey: key) { return Int(text) }
        if let double = try? container.decodeIfPresent(Double.self, forKey: key) { return Int(double) }
        return nil
    }

    /// Display name — Android renders project_name falling back to title.
    var displayName: String {
        let name = (projectName?.isEmpty == false ? projectName : title) ?? "JV Deal"
        return name
    }

    /// "Southwest Ranches, FL" or the raw property address.
    var displayLocation: String? {
        if let city, !city.isEmpty {
            if let state, !state.isEmpty { return "\(city), \(state)" }
            return city
        }
        return propertyAddress
    }

    /// Human label for the deal type badge, matching Android copy.
    var typeLabel: String {
        switch (type ?? "").lowercased() {
        case "profit_sharing": return "Profit Sharing"
        case "development": return "Development"
        case "jv": return "JV Partnership"
        case "debt": return "Debt"
        case "equity_split": return "Equity Split"
        case "hybrid": return "Hybrid"
        case "new_construction": return "New Construction"
        case "existing_complete": return "Existing / Complete"
        case "rehab_construction": return "Rehab / Construction"
        default: return (type ?? "JV").capitalized
        }
    }

    /// Investment option category icons shown on reels and detail.
    /// `tokenized` — fractional/tokenized ownership path.
    /// `jv_deals` — joint venture partnership path.
    /// `buyers` — direct buyer / purchase path.
    var investmentOptions: [InvestmentOption] {
        switch (type ?? "").lowercased() {
        case "jv", "equity_split", "hybrid":
            return [.tokenized, .jvDeals, .buyers]
        case "development", "new_construction", "rehab_construction":
            return [.jvDeals, .tokenized, .buyers]
        case "profit_sharing":
            return [.tokenized, .buyers, .jvDeals]
        default:
            return [.jvDeals, .tokenized, .buyers]
        }
    }

    /// Formatted term string, e.g. "24 months".
    var termLabel: String? {
        guard let months = termMonths, months > 0 else { return nil }
        if months >= 12 {
            let years = months / 12
            let rem = months % 12
            if rem == 0 { return "\(years) year\(years == 1 ? "" : "s")" }
            return "\(years)y \(rem)m"
        }
        return "\(months) months"
    }

    /// Full photo gallery — firstPhoto plus any extras.
    var photoGallery: [String] {
        var seen = Set<String>()
        var result: [String] = []
        if let firstPhoto, seen.insert(firstPhoto).inserted { result.append(firstPhoto) }
        if let photos {
            for photo in photos where seen.insert(photo).inserted { result.append(photo) }
        }
        return result
    }

    // MARK: Hashable — identity-based (used by navigationDestination)

    func hash(into hasher: inout Hasher) {
        hasher.combine(id)
    }

    static func == (lhs: JVDeal, rhs: JVDeal) -> Bool {
        lhs.id == rhs.id
    }
}

/// Investment path icons surfaced on reels and detail screens.
nonisolated enum InvestmentOption: String, CaseIterable, Identifiable {
    case tokenized
    case jvDeals
    case buyers

    var id: String { rawValue }

    var label: String {
        switch self {
        case .tokenized: return "Tokenized"
        case .jvDeals: return "JV Deal"
        case .buyers: return "Buyer"
        }
    }

    var subtitle: String {
        switch self {
        case .tokenized: return "Fractional ownership"
        case .jvDeals: return "JV partnership"
        case .buyers: return "Direct purchase"
        }
    }

    var icon: String {
        switch self {
        case .tokenized: return "circle.hexagongrid.fill"
        case .jvDeals: return "person.2.badge.gearshape.fill"
        case .buyers: return "house.and.flag.fill"
        }
    }

    var tint: ColorProxy {
        switch self {
        case .tokenized: return .gold
        case .jvDeals: return .blue
        case .buyers: return .green
        }
    }
}

import SwiftUI

/// Thin color proxy so the enum stays `nonisolated` (no SwiftUI Color dependency).
nonisolated enum ColorProxy {
    case gold, blue, green

    var color: Color {
        switch self {
        case .gold: return .ivxGold
        case .blue: return .ivxBlue
        case .green: return .ivxGreen
        }
    }
}
