//
//  FeedVideo.swift
//  Ivx
//
//  Mirrors the production video-platform feed
//  (GET https://api.ivxholding.com/api/ivx/video-platform/feed) — the same
//  Instagram-grade feed the landing page and Android app consume.
//

import Foundation

/// JV deal enrichment attached to a feed video (matched via property_id / project_id).
nonisolated struct FeedVideoDeal: Decodable {
    let id: String
    let title: String?
    let price: Double?
    let minInvestment: Double?
    let expectedRoi: String?
    let dealType: String?
    let url: String?

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case price
        case minInvestment = "min_investment"
        case expectedRoi = "expected_roi"
        case dealType = "deal_type"
        case url
    }
}

/// A ready-to-play video from the production feed, with engagement counts and deal info.
nonisolated struct FeedVideo: Identifiable, Decodable {
    let id: String
    let projectId: String?
    let videoUrl: String
    let hlsUrl: String?
    let posterUrl: String?
    let previewBlurUrl: String?
    let playbackStatus: String?
    let thumbnailUrl: String?
    let title: String?
    let durationSec: Double?
    let width: Double?
    let height: Double?
    let orientation: String?
    let isPinned: Bool?
    let likeCount: Int?
    let commentCount: Int?
    let shareCount: Int?
    let saveCount: Int?
    let viewCount: Int?
    let propertyId: String?
    /// Type A "deal" (investor deal video) | Type B "reel" (project/construction reel).
    let videoType: String?
    /// Featured Investor Video — interleaved by the backend every 3 deal videos.
    let isFeatured: Bool?
    let creatorId: String?
    let deal: FeedVideoDeal?

    enum CodingKeys: String, CodingKey {
        case id
        case projectId = "project_id"
        case videoUrl = "video_url"
        case hlsUrl = "hls_url"
        case posterUrl = "poster_url"
        case previewBlurUrl = "preview_blur_url"
        case playbackStatus = "playback_status"
        case thumbnailUrl = "thumbnail_url"
        case title
        case durationSec = "duration_sec"
        case width
        case height
        case orientation = "orientation"
        case isPinned = "is_pinned"
        case likeCount = "like_count"
        case commentCount = "comment_count"
        case shareCount = "share_count"
        case saveCount = "save_count"
        case viewCount = "view_count"
        case propertyId = "property_id"
        case videoType = "video_type"
        case isFeatured = "is_featured"
        case creatorId = "creator_id"
        case deal
    }

    /// Adaptive HLS when the pipeline is ready, otherwise the progressive original.
    var bestPlaybackURL: URL? {
        if let hlsUrl, let url = URL(string: hlsUrl) { return url }
        return URL(string: videoUrl)
    }

    var posterURL: URL? {
        for candidate in [posterUrl, thumbnailUrl, previewBlurUrl] {
            if let candidate, let url = URL(string: candidate) { return url }
        }
        return nil
    }

    /// Media aspect ratio from the probed dimensions (16:9 fallback).
    var aspectRatio: Double {
        guard let width, let height, width > 0, height > 0 else { return 16.0 / 9.0 }
        return width / height
    }
}

nonisolated struct FeedVideoResponse: Decodable {
    let videos: [FeedVideo]
}
