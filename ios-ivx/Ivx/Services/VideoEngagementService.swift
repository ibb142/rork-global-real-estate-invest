//
//  VideoEngagementService.swift
//  Ivx
//
//  Likes, comments, saves, shares, follow and report — the same endpoints the
//  landing page (ivx-reels.js) and Android app use so all platforms behave
//  identically.
//

import Foundation

nonisolated struct LikeResult: Decodable {
    let liked: Bool?
    let likeCount: Int?

    enum CodingKeys: String, CodingKey {
        case liked
        case likeCount = "like_count"
    }
}

nonisolated struct SaveResult: Decodable {
    let saved: Bool?
    let saveCount: Int?

    enum CodingKeys: String, CodingKey {
        case saved
        case saveCount = "save_count"
    }
}

nonisolated struct ShareResult: Decodable {
    let shareCount: Int?

    enum CodingKeys: String, CodingKey {
        case shareCount = "share_count"
    }
}

nonisolated struct FollowResult: Decodable {
    let following: Bool?
}

nonisolated struct CommentItem: Decodable, Identifiable {
    let id: String
    let body: String?
    let guestName: String?
    let isOwnerReply: Bool?
    let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case body
        case guestName = "guest_name"
        case isOwnerReply = "is_owner_reply"
        case createdAt = "created_at"
    }
}

nonisolated struct CommentsResponse: Decodable {
    let comments: [CommentItem]
    let total: Int?
}

nonisolated struct CommentPostResponse: Decodable {
    let success: Bool?
    let error: String?
}

enum VideoEngagementError: LocalizedError {
    case badURL
    case httpError(Int)
    case serverError(String)

    var errorDescription: String? {
        switch self {
        case .badURL: return "Invalid engagement URL."
        case .httpError(let code): return "Engagement request failed (HTTP \(code))."
        case .serverError(let msg): return msg
        }
    }
}

struct VideoEngagementService {
    private static let apiBase = "https://api.ivxholding.com"

    private static func postJson(path: String, body: [String: Any]) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: "\(apiBase)\(path)") else {
            throw VideoEngagementError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw VideoEngagementError.serverError("Invalid response")
        }
        if !(200...299).contains(http.statusCode) {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw VideoEngagementError.serverError(msg)
        }
        return (data, http)
    }

    static func toggleLike(videoId: String, viewerId: String) async throws -> LikeResult {
        let (data, _) = try await postJson(
            "/api/projects/\(videoId)/like",
            body: ["guest_id": viewerId]
        )
        return try JSONDecoder().decode(LikeResult.self, from: data)
    }

    static func toggleSave(videoId: String, viewerId: String) async throws -> SaveResult {
        let (data, _) = try await postJson(
            "/api/projects/\(videoId)/save",
            body: ["guest_id": viewerId]
        )
        return try JSONDecoder().decode(SaveResult.self, from: data)
    }

    static func trackShare(videoId: String, viewerId: String, type: String) async throws -> ShareResult {
        let (data, _) = try await postJson(
            "/api/projects/\(videoId)/share",
            body: [
                "guest_id": viewerId,
                "share_type": type,
                "share_url": "https://ivxholding.com/?video=\(videoId)"
            ]
        )
        return try JSONDecoder().decode(ShareResult.self, from: data)
    }

    static func toggleFollow(creatorId: String, viewerId: String) async throws -> FollowResult {
        let (data, _) = try await postJson(
            "/api/ivx/video-platform/follow",
            body: [
                "follower_id": viewerId,
                "creator_id": creatorId.isEmpty ? "ivx-owner" : creatorId
            ]
        )
        return try JSONDecoder().decode(FollowResult.self, from: data)
    }

    static func report(videoId: String, reason: String, viewerId: String) async throws {
        _ = try await postJson(
            "/api/ivx/video-platform/videos/\(videoId)/report",
            body: [
                "reporter_id": viewerId,
                "reason": reason
            ]
        )
    }

    static func fetchComments(videoId: String, limit: Int = 50) async throws -> CommentsResponse {
        guard let url = URL(string: "\(apiBase)/api/projects/\(videoId)/comments?limit=\(limit)") else {
            throw VideoEngagementError.badURL
        }
        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.timeoutInterval = 15
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await URLSession.shared.data(for: request)
        if let http = response as? HTTPURLResponse, !(200...299).contains(http.statusCode) {
            throw VideoEngagementError.httpError(http.statusCode)
        }
        return try JSONDecoder().decode(CommentsResponse.self, from: data)
    }

    static func postComment(videoId: String, name: String, body: String) async throws -> CommentPostResponse {
        let (data, _) = try await postJson(
            "/api/projects/\(videoId)/comments",
            body: [
                "guest_name": name,
                "body": body
            ]
        )
        return try JSONDecoder().decode(CommentPostResponse.self, from: data)
    }

    static func trackEvent(type: String, videoId: String, viewerId: String) async throws {
        _ = try await postJson(
            "/api/ivx/video-platform/events",
            body: [
                "events": [
                    [
                        "type": type,
                        "video_id": videoId,
                        "viewer_id": viewerId
                    ]
                ]
            ]
        )
    }
}
