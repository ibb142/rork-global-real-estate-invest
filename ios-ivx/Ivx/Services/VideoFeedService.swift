//
//  VideoFeedService.swift
//  Ivx
//
//  Fetches the production Instagram-style video feed — the SAME endpoint the
//  landing page and Android app use, so all platforms show identical videos.
//

import Foundation

enum VideoFeedServiceError: LocalizedError {
    case badURL
    case httpError(Int)

    var errorDescription: String? {
        switch self {
        case .badURL: return "Invalid video feed URL."
        case .httpError(let code): return "Video feed request failed (HTTP \(code))."
        }
    }
}

struct VideoFeedService {
    private static let apiBase = "https://api.ivxholding.com"

    /// Ranked feed with deal enrichment (property title, price, ROI, deal link).
    static func fetchFeed(limit: Int = 12) async throws -> [FeedVideo] {
        guard let url = URL(string: "\(apiBase)/api/ivx/video-platform/feed?limit=\(limit)") else {
            throw VideoFeedServiceError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw VideoFeedServiceError.httpError(http.statusCode)
        }
        return try JSONDecoder().decode(FeedVideoResponse.self, from: data).videos
    }

    /// Project Reels rail — construction updates, drone footage, and progress
    /// videos only. Served by the same canonical endpoint with ?type=reel so
    /// reels never interrupt the investor deal flow of the main feed.
    static func fetchProjectReels(limit: Int = 24) async throws -> [FeedVideo] {
        guard let url = URL(string: "\(apiBase)/api/ivx/video-platform/feed?limit=\(limit)&type=reel") else {
            throw VideoFeedServiceError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw VideoFeedServiceError.httpError(http.statusCode)
        }
        return try JSONDecoder().decode(FeedVideoResponse.self, from: data).videos
    }

    /// Investor-first HOME feed — canonical block sequence for every platform:
    /// Featured Deal 1–3 → 1 Featured Project Video → Deal 4–6 → repeat.
    static func fetchHomeFeed(limit: Int = 60) async throws -> [HomeFeedBlock] {
        guard let url = URL(string: "\(apiBase)/api/ivx/video-platform/home-feed?limit=\(limit)") else {
            throw VideoFeedServiceError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw VideoFeedServiceError.httpError(http.statusCode)
        }
        return try JSONDecoder().decode(HomeFeedResponse.self, from: data).blocks
    }
}
