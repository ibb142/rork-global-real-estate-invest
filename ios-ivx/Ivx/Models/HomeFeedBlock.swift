//
//  HomeFeedBlock.swift
//  Ivx
//
//  Mirrors the investor-first home feed
//  (GET https://api.ivxholding.com/api/ivx/video-platform/home-feed) — the
//  SINGLE source of truth for the home layout on landing page, Android and
//  iOS: Featured Deal 1–3 → 1 Featured Project Video → Deal 4–6 → repeat.
//

import Foundation

/// Canonical deal payload inside the investor-first home feed.
nonisolated struct HomeFeedDeal: Identifiable, Decodable {
    let id: String
    let name: String?
    let city: String?
    let phase: String?
    let status: String?
    let dealType: String?
    let investmentAmount: Double?
    let expectedRoi: String?
    let minInvestment: Double?
    let progressPercent: Double?
    let photoUrl: String?
    let url: String?
    let isFeatured: Bool?
    let priority: Int?
    let displayOrder: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case city
        case phase
        case status
        case dealType = "deal_type"
        case investmentAmount = "investment_amount"
        case expectedRoi = "expected_roi"
        case minInvestment = "min_investment"
        case progressPercent = "progress_percent"
        case photoUrl = "photo_url"
        case url
        case isFeatured = "is_featured"
        case priority
        case displayOrder = "display_order"
    }
}

/// One block of the investor-first home layout: a deal card or a featured project video.
nonisolated struct HomeFeedBlock: Identifiable, Decodable {
    let position: Int
    let type: String
    let deal: HomeFeedDeal?
    let video: FeedVideo?

    var id: String {
        if let deal { return "deal-\(deal.id)" }
        if let video { return "video-\(video.id)" }
        return "block-\(position)"
    }

    var isVideo: Bool { type == "video" && video != nil }
    var isDeal: Bool { type == "deal" && deal != nil }
}

nonisolated struct HomeFeedResponse: Decodable {
    let pattern: String?
    let ordering: String?
    let blocks: [HomeFeedBlock]
    let dealCount: Int?
    let videoCount: Int?

    enum CodingKeys: String, CodingKey {
        case pattern
        case ordering
        case blocks
        case dealCount = "deal_count"
        case videoCount = "video_count"
    }
}
