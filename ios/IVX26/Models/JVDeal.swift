import Foundation

/// Investment deal row from `jv_deals` (Supabase). Note: `propertyValue` is a
/// camelCase column in the production schema; the rest are snake_case.
nonisolated struct JVDeal: Codable, Identifiable, Hashable {
    let id: String
    let title: String?
    let projectName: String?
    let city: String?
    let state: String?
    let country: String?
    let status: String?
    let currency: String?
    let expectedRoi: Double?
    let estimatedValue: Double?
    let propertyValue: Double?
    let totalInvestment: Double?
    let minInvestment: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case projectName = "project_name"
        case city
        case state
        case country
        case status
        case currency
        case expectedRoi = "expected_roi"
        case estimatedValue = "estimated_value"
        case propertyValue
        case totalInvestment = "total_investment"
        case minInvestment = "min_investment"
    }

    var displayTitle: String {
        let name = (title ?? projectName ?? "").trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? "Investment Project" : name
    }

    var displayLocation: String? {
        let parts = [city, state, country].compactMap { $0?.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty }
        return parts.isEmpty ? nil : parts.joined(separator: ", ")
    }

    /// Canonical investment card math (same rules as landing + backend):
    /// salePrice = estimated_value || propertyValue || total_investment.
    var salePrice: Double? {
        for value in [estimatedValue, propertyValue, totalInvestment] {
            if let value, value > 0 { return value }
        }
        return nil
    }

    var minimumInvestment: Double {
        if let minInvestment, minInvestment > 0 { return minInvestment }
        return 50
    }

    var minimumOwnershipPercent: Double? {
        guard let salePrice, salePrice > 0 else { return nil }
        return (minimumInvestment / salePrice) * 100
    }
}

/// Comment row from `reel_comments`.
nonisolated struct ReelComment: Codable, Identifiable, Hashable {
    let id: String
    let reelId: String
    let authorName: String
    let body: String
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case reelId = "reel_id"
        case authorName = "author_name"
        case body
        case createdAt = "created_at"
    }
}
