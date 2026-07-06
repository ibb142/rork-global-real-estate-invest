//
//  ProjectReelsViewModel.swift
//  Ivx
//
//  Loads the Project Reels rail — synced with the 3 live IVX projects.
//  Fetches deal-type videos from the production feed AND the live jv_deals
//  so each reel is paired with its full project record for the detail view.
//

import Foundation
import Observation

@Observable
final class ProjectReelsViewModel {
    var videos: [FeedVideo] = []
    var deals: [JVDeal] = []
    /// Combined reels — each entry is either a video-backed reel or a
    /// photo-backed project card (so all 3 projects always appear).
    var reels: [ProjectReel] = []
    var isLoading = false
    var errorMessage: String?

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil

        async let videoResult = VideoFeedService.fetchFeed(limit: 24)
        async let dealsResult = try await JVDealsService.fetchPublishedDeals()

        do {
            let fetchedVideos = try await videoResult
            let fetchedDeals = try await dealsResult
            videos = fetchedVideos
            deals = fetchedDeals
            reels = buildReels(videos: fetchedVideos, deals: fetchedDeals)
        } catch {
            // If the video feed fails, still show project reels from deals.
            do {
                let fetchedDeals = try await JVDealsService.fetchPublishedDeals()
                deals = fetchedDeals
                reels = buildReels(videos: [], deals: fetchedDeals)
            } catch let dealError {
                errorMessage = dealError.localizedDescription
                print("[ProjectReels] fetch failed: \(dealError.localizedDescription)")
            }
        }
        isLoading = false
    }

    /// Build the combined reels list: each live project gets a reel, with
    /// video enrichment when a matching feed video exists.
    private func buildReels(videos: [FeedVideo], deals: [JVDeal]) -> [ProjectReel] {
        var reels: [ProjectReel] = []

        for deal in deals {
            // Find videos matching this deal by title/project name keywords.
            let dealVideos = videos.filter { video in
                guard let videoTitle = video.title?.lowercased() else { return false }
                let dealName = deal.displayName.lowercased()
                let projectName = (deal.projectName ?? "").lowercased()
                return videoTitle.contains(dealName) ||
                       (projectName.isNotEmpty && videoTitle.contains(projectName))
            }

            reels.append(ProjectReel(
                id: deal.id,
                deal: deal,
                video: dealVideos.first,
                allVideos: dealVideos
            ))
        }

        // Also include deal videos not matched to any project (standalone reels).
        let matchedVideoIds = Set(reels.flatMap { $0.allVideos.map(\.id) })
        for video in videos where !matchedVideoIds.contains(video.id) {
            reels.append(ProjectReel(
                id: "video-\(video.id)",
                deal: nil,
                video: video,
                allVideos: [video]
            ))
        }

        return reels
    }
}

/// One reel entry — a live project paired with its video (if available).
struct ProjectReel: Identifiable {
    let id: String
    let deal: JVDeal?
    let video: FeedVideo?
    let allVideos: [FeedVideo]

    var hasVideo: Bool { video != nil }
    var hasDeal: Bool { deal != nil }
}

private extension String {
    var isNotEmpty: Bool { !isEmpty }
}
