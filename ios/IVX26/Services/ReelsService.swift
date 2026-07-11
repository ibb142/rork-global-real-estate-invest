import Foundation

/// Public client configuration for the canonical IVX reels sources.
/// The Supabase anon key is a public client key (RLS enforces read-only access
/// to published + approved rows); social writes go through the IVX backend.
nonisolated enum IVXBackend {
    static let supabaseUrl = "https://kvclcdjmjghndxsngfzb.supabase.co"
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2Y2xjZGptamdobmR4c25nZnpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTQwMjcsImV4cCI6MjA4ODc3MDAyN30.OLDwa21VHQNs151AD-8k--_HigQ2d-N7yJfFn5UeNPk"
    static let apiBase = "https://ivx-holdings-platform.onrender.com"
    static let landingBase = "https://ivxholding.com"
}

nonisolated enum ReelsServiceError: LocalizedError {
    case badResponse(Int)
    case invalidUrl

    var errorDescription: String? {
        switch self {
        case .badResponse(let code): return "Reels source returned HTTP \(code)."
        case .invalidUrl: return "Invalid reels request URL."
        }
    }
}

/// Read path: direct Supabase REST (public RLS). Write path: IVX backend API.
nonisolated struct ReelsService {
    private static func supabaseRequest(_ path: String) throws -> URLRequest {
        guard let url = URL(string: "\(IVXBackend.supabaseUrl)/rest/v1/\(path)") else {
            throw ReelsServiceError.invalidUrl
        }
        var request = URLRequest(url: url, timeoutInterval: 20)
        request.setValue(IVXBackend.supabaseAnonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(IVXBackend.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        return request
    }

    private static func fetch<T: Decodable>(_ path: String, as type: T.Type) async throws -> T {
        let (data, response) = try await URLSession.shared.data(for: supabaseRequest(path))
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else { throw ReelsServiceError.badResponse(status) }
        return try JSONDecoder().decode(T.self, from: data)
    }

    static func fetchReels() async throws -> [Reel] {
        try await fetch(
            "jv_deal_reels?select=*&published=eq.true&approved=eq.true&order=sort_order.asc,created_at.desc&limit=200",
            as: [Reel].self
        )
    }

    static func fetchDeals(ids: [String]) async throws -> [JVDeal] {
        guard !ids.isEmpty else { return [] }
        let quoted = ids.map { "\"\($0)\"" }.joined(separator: ",")
        let list = "in.(\(quoted))".addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        let select = "id,title,project_name,city,state,country,status,currency,expected_roi,estimated_value,propertyValue,total_investment,min_investment"
        return try await fetch("jv_deals?select=\(select)&id=\(list)", as: [JVDeal].self)
    }

    private nonisolated struct ReelRef: Decodable {
        let reelId: String
        enum CodingKeys: String, CodingKey { case reelId = "reel_id" }
    }

    /// Real persisted social counts — aggregated from actual rows, never faked.
    static func fetchSocialCounts() async throws -> (likes: [String: Int], saves: [String: Int], comments: [String: Int]) {
        async let likeRows = fetch("reel_likes?select=reel_id&limit=5000", as: [ReelRef].self)
        async let saveRows = fetch("reel_saves?select=reel_id&limit=5000", as: [ReelRef].self)
        async let commentRows = fetch("reel_comments?select=reel_id&approved=eq.true&limit=5000", as: [ReelRef].self)
        func tally(_ rows: [ReelRef]) -> [String: Int] {
            rows.reduce(into: [:]) { $0[$1.reelId, default: 0] += 1 }
        }
        return try await (likes: tally(likeRows), saves: tally(saveRows), comments: tally(commentRows))
    }

    static func fetchComments(reelId: String) async throws -> [ReelComment] {
        try await fetch(
            "reel_comments?select=id,reel_id,author_name,body,created_at&reel_id=eq.\(reelId)&approved=eq.true&order=created_at.desc&limit=100",
            as: [ReelComment].self
        )
    }

    // MARK: - Social writes (IVX backend service-role API)

    private static func backendPost(_ path: String, body: [String: String]) async -> Bool {
        guard let url = URL(string: "\(IVXBackend.apiBase)\(path)") else { return false }
        var request = URLRequest(url: url, timeoutInterval: 15)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            return (200..<300).contains(status)
        } catch {
            return false
        }
    }

    static func sendLike(reelId: String, deviceKey: String, liked: Bool) async -> Bool {
        await backendPost("/api/reels/\(reelId)/like", body: ["device_key": deviceKey, "action": liked ? "like" : "unlike"])
    }

    static func sendSave(reelId: String, deviceKey: String, saved: Bool) async -> Bool {
        await backendPost("/api/reels/\(reelId)/save", body: ["device_key": deviceKey, "action": saved ? "save" : "unsave"])
    }

    static func sendComment(reelId: String, deviceKey: String, authorName: String, body: String) async -> Bool {
        await backendPost("/api/reels/\(reelId)/comments", body: ["device_key": deviceKey, "author_name": authorName, "body": body])
    }
}
