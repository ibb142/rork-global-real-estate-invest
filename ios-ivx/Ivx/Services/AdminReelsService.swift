//
//  AdminReelsService.swift
//  Ivx
//
//  Owner admin API for managing project reels — add unlimited videos by URL,
//  list all videos (including hidden/draft), hide/show, set type, delete.
//  No developer required: the owner opens the admin panel, pastes a video URL,
//  and the reel goes live across all platforms instantly.
//

import Foundation

nonisolated struct AdminVideo: Identifiable, Decodable {
    let id: String
    let projectId: String?
    let videoUrl: String
    let hlsUrl: String?
    let posterUrl: String?
    let thumbnailUrl: String?
    let title: String?
    let durationSec: Double?
    let width: Double?
    let height: Double?
    let orientation: String?
    let isApproved: Bool?
    let isPinned: Bool?
    let createdAt: String?
    let videoType: String?
    let isFeatured: Bool?
    let isHidden: Bool?
    let status: String?
    let displayOrder: Double?

    enum CodingKeys: String, CodingKey {
        case id
        case projectId = "project_id"
        case videoUrl = "video_url"
        case hlsUrl = "hls_url"
        case posterUrl = "poster_url"
        case thumbnailUrl = "thumbnail_url"
        case title
        case durationSec = "duration_sec"
        case width
        case height
        case orientation
        case isApproved = "is_approved"
        case isPinned = "is_pinned"
        case createdAt = "created_at"
        case videoType = "video_type"
        case isFeatured = "is_featured"
        case isHidden = "is_hidden"
        case status
        case displayOrder = "display_order"
    }

    var posterURL: URL? {
        for candidate in [posterUrl, thumbnailUrl] {
            if let candidate, let url = URL(string: candidate) { return url }
        }
        return nil
    }

    var bestPlaybackURL: URL? {
        if let hlsUrl, let url = URL(string: hlsUrl) { return url }
        return URL(string: videoUrl)
    }

    var isReel: Bool { videoType == "reel" }
}

nonisolated struct AdminVideosResponse: Decodable {
    let videos: [AdminVideo]
    let count: Int
    let total: Int?
}

nonisolated struct AddReelResponse: Decodable {
    let ok: Bool
    let videoId: String?
    let title: String?
    let videoType: String?
    let videoUrl: String?
    let error: String?
}

enum AdminReelsServiceError: LocalizedError {
    case badURL
    case httpError(Int)
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return "Invalid admin API URL."
        case .httpError(let code): return "Admin request failed (HTTP \(code))."
        case .serverError(let msg): return msg
        }
    }
}

struct AdminReelsService {
    private static let apiBase = "https://api.ivxholding.com"

    /// List all videos for admin management (includes hidden/draft).
    static func fetchAllVideos(type: String? = nil) async throws -> [AdminVideo] {
        var path = "/api/ivx/video-platform/admin/videos"
        if let type { path += "?type=\(type)" }
        guard let url = URL(string: "\(apiBase)\(path)") else {
            throw AdminReelsServiceError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw AdminReelsServiceError.httpError(http.statusCode)
        }
        return try JSONDecoder().decode(AdminVideosResponse.self, from: data).videos
    }

    /// Add a new reel/deal video by URL — no developer needed.
    static func addVideo(
        videoUrl: String,
        title: String,
        videoType: String,
        projectId: String?,
        posterUrl: String?,
        durationSec: Double?
    ) async throws -> AddReelResponse {
        guard let url = URL(string: "\(apiBase)/api/ivx/video-platform/admin/add-reel") else {
            throw AdminReelsServiceError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 20
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "video_url": videoUrl,
            "title": title,
            "video_type": videoType,
        ]
        if let projectId { body["project_id"] = projectId }
        if let posterUrl { body["poster_url"] = posterUrl }
        if let durationSec { body["duration_sec"] = durationSec }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw AdminReelsServiceError.serverError(msg)
        }
        return try JSONDecoder().decode(AddReelResponse.self, from: data)
    }

    /// Update a video: hide/show, change type, set display order, or delete.
    static func updateVideo(videoId: String, action: String, videoType: String? = nil, isHidden: Bool? = nil, isFeatured: Bool? = nil, displayOrder: Int? = nil, title: String? = nil) async throws {
        guard let url = URL(string: "\(apiBase)/api/ivx/video-platform/admin/videos/\(videoId)") else {
            throw AdminReelsServiceError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = ["action": action]
        if let videoType { body["video_type"] = videoType }
        if let isHidden { body["is_hidden"] = isHidden }
        if let isFeatured { body["is_featured"] = isFeatured }
        if let displayOrder { body["display_order"] = displayOrder }
        if let title { body["title"] = title }
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw AdminReelsServiceError.serverError(msg)
        }
    }

    /// Delete a video from the feed.
    static func deleteVideo(videoId: String) async throws {
        try await updateVideo(videoId: videoId, action: "delete")
    }
}
