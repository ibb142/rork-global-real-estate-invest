import Foundation
import Observation

@Observable
final class ReelsViewModel {
    var reels: [Reel] = []
    var dealsByProjectId: [String: JVDeal] = [:]
    var likeCounts: [String: Int] = [:]
    var saveCounts: [String: Int] = [:]
    var commentCounts: [String: Int] = [:]
    var likedIds: Set<String>
    var savedIds: Set<String>
    var selectedCategory: ReelCategory = .all
    var isLoading = false
    var errorMessage: String?

    private let defaults = UserDefaults.standard
    private static let likedKey = "ivx_reel_liked_ids"
    private static let savedKey = "ivx_reel_saved_ids"
    private static let deviceKeyKey = "ivx_reels_device_key"

    /// Stable per-device key so like/save writes are idempotent server-side.
    let deviceKey: String

    init() {
        likedIds = Set(defaults.stringArray(forKey: Self.likedKey) ?? [])
        savedIds = Set(defaults.stringArray(forKey: Self.savedKey) ?? [])
        if let existing = defaults.string(forKey: Self.deviceKeyKey), existing.count >= 8 {
            deviceKey = existing
        } else {
            let fresh = "ios-\(UUID().uuidString.lowercased())"
            defaults.set(fresh, forKey: Self.deviceKeyKey)
            deviceKey = fresh
        }
    }

    var filteredReels: [Reel] {
        reels.filter { selectedCategory.matches($0, savedIds: savedIds) }
    }

    func categoryCount(_ category: ReelCategory) -> Int {
        reels.filter { category.matches($0, savedIds: savedIds) }.count
    }

    func deal(for reel: Reel) -> JVDeal? {
        guard let projectId = reel.projectId else { return nil }
        return dealsByProjectId[projectId]
    }

    func load() async {
        isLoading = true
        errorMessage = nil
        do {
            let fetched = try await ReelsService.fetchReels()
            reels = fetched

            let projectIds = Array(Set(fetched.compactMap(\.projectId)))
            async let dealsTask = ReelsService.fetchDeals(ids: projectIds)
            async let countsTask = ReelsService.fetchSocialCounts()

            let deals = try await dealsTask
            dealsByProjectId = deals.reduce(into: [:]) { $0[$1.id] = $1 }

            let counts = try await countsTask
            likeCounts = counts.likes
            saveCounts = counts.saves
            commentCounts = counts.comments
        } catch {
            errorMessage = error.localizedDescription
            print("[Reels] load failed: \(error.localizedDescription)")
        }
        isLoading = false
    }

    func toggleLike(_ reel: Reel) {
        let nowLiked = !likedIds.contains(reel.id)
        if nowLiked {
            likedIds.insert(reel.id)
            likeCounts[reel.id, default: 0] += 1
        } else {
            likedIds.remove(reel.id)
            likeCounts[reel.id] = max(0, likeCounts[reel.id, default: 1] - 1)
        }
        defaults.set(Array(likedIds), forKey: Self.likedKey)
        let key = deviceKey
        Task.detached(priority: .background) {
            _ = await ReelsService.sendLike(reelId: reel.id, deviceKey: key, liked: nowLiked)
        }
    }

    func toggleSave(_ reel: Reel) {
        let nowSaved = !savedIds.contains(reel.id)
        if nowSaved {
            savedIds.insert(reel.id)
            saveCounts[reel.id, default: 0] += 1
        } else {
            savedIds.remove(reel.id)
            saveCounts[reel.id] = max(0, saveCounts[reel.id, default: 1] - 1)
        }
        defaults.set(Array(savedIds), forKey: Self.savedKey)
        let key = deviceKey
        Task.detached(priority: .background) {
            _ = await ReelsService.sendSave(reelId: reel.id, deviceKey: key, saved: nowSaved)
        }
    }
}
