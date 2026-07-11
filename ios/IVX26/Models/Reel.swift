import Foundation

/// Canonical reel row from `jv_deal_reels` (Supabase).
/// Every reel is typed (`reelType` + `categoryTags`) and, when investment-linked,
/// carries its immutable `projectId` — never matched by index or title.
nonisolated struct Reel: Codable, Identifiable, Hashable {
    let id: String
    let projectId: String?
    let videoUrl: String
    let thumbnailUrl: String?
    let caption: String?
    let sortOrder: Int?
    let reelType: String
    let categoryTags: [String]
    let buyerId: String?
    let sellerId: String?
    let tokenizedAssetId: String?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case projectId = "project_id"
        case videoUrl = "video_url"
        case thumbnailUrl = "thumbnail_url"
        case caption
        case sortOrder = "sort_order"
        case reelType = "reel_type"
        case categoryTags = "category_tags"
        case buyerId = "buyer_id"
        case sellerId = "seller_id"
        case tokenizedAssetId = "tokenized_asset_id"
        case createdAt = "created_at"
    }

    var isInvestment: Bool {
        projectId != nil || reelType == "investment" || categoryTags.contains("investment")
    }
}

/// Feed categories — mirrors the `ivx_reels_integrity` category definitions.
enum ReelCategory: String, CaseIterable, Identifiable {
    case all = "All"
    case investments = "Investments"
    case buyers = "Buyers"
    case sellers = "Sellers"
    case jvDeals = "JV Deals"
    case tokenized = "Tokenized"
    case construction = "Construction"
    case walkthroughs = "Walkthroughs"
    case opportunities = "Opportunities"
    case saved = "Saved"

    var id: String { rawValue }

    func matches(_ reel: Reel, savedIds: Set<String>) -> Bool {
        switch self {
        case .all:
            return true
        case .investments:
            return reel.isInvestment
        case .buyers:
            return reel.reelType == "buyer" || reel.categoryTags.contains("buyer") || reel.buyerId != nil
        case .sellers:
            return reel.reelType == "seller" || reel.categoryTags.contains("seller") || reel.sellerId != nil
        case .jvDeals:
            return reel.projectId != nil || reel.reelType == "jv" || reel.categoryTags.contains("jv")
        case .tokenized:
            return reel.reelType == "tokenized" || reel.categoryTags.contains("tokenized") || reel.tokenizedAssetId != nil
        case .construction:
            return reel.reelType == "construction" || reel.categoryTags.contains("construction")
        case .walkthroughs:
            return reel.reelType == "walkthrough" || reel.categoryTags.contains("walkthrough")
        case .opportunities:
            return reel.reelType == "opportunity" || reel.categoryTags.contains("opportunity")
        case .saved:
            return savedIds.contains(reel.id)
        }
    }
}
