//
//  JVDeal.swift
//  Ivx
//
//  Mirrors the Android app's `jv_deals` Supabase rows (expo/lib/jv-storage.ts)
//  so both apps render the exact same live deals.
//

import Foundation

/// A published JV deal from the production `jv_deals` table.
nonisolated struct JVDeal: Identifiable, Decodable {
    let id: String
    let title: String?
    let projectName: String?
    let type: String?
    let status: String?
    let minInvestment: Double?
    let expectedRoi: Double?
    let profitSplit: String?
    let city: String?
    let state: String?
    let propertyAddress: String?
    let firstPhoto: String?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case projectName = "project_name"
        case type
        case status
        case minInvestment = "min_investment"
        case expectedRoi = "expected_roi"
        case profitSplit = "profit_split"
        case city
        case state
        case propertyAddress = "property_address"
        case firstPhoto = "first_photo"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        title = try? container.decodeIfPresent(String.self, forKey: .title)
        projectName = try? container.decodeIfPresent(String.self, forKey: .projectName)
        type = try? container.decodeIfPresent(String.self, forKey: .type)
        status = try? container.decodeIfPresent(String.self, forKey: .status)
        minInvestment = Self.flexibleDouble(container, .minInvestment)
        expectedRoi = Self.flexibleDouble(container, .expectedRoi)
        profitSplit = try? container.decodeIfPresent(String.self, forKey: .profitSplit)
        city = try? container.decodeIfPresent(String.self, forKey: .city)
        state = try? container.decodeIfPresent(String.self, forKey: .state)
        propertyAddress = try? container.decodeIfPresent(String.self, forKey: .propertyAddress)
        firstPhoto = try? container.decodeIfPresent(String.self, forKey: .firstPhoto)
    }

    private static func flexibleDouble(_ container: KeyedDecodingContainer<CodingKeys>, _ key: CodingKeys) -> Double? {
        if let value = try? container.decodeIfPresent(Double.self, forKey: key) { return value }
        if let text = try? container.decodeIfPresent(String.self, forKey: key) { return Double(text) }
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
        default: return (type ?? "JV").capitalized
        }
    }
}
