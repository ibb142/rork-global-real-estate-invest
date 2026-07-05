//
//  ProjectReelsViewModel.swift
//  Ivx
//
//  Loads the dedicated Project Reels rail — construction updates, drone
//  footage, and progress videos only (GET /api/ivx/video-platform/feed?type=reel).
//  Reels never interrupt the investor deal flow of the main home feed.
//

import Foundation
import Observation

@Observable
final class ProjectReelsViewModel {
    var videos: [FeedVideo] = []
    var isLoading = false
    var errorMessage: String?

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        do {
            videos = try await VideoFeedService.fetchProjectReels()
        } catch {
            errorMessage = error.localizedDescription
            print("[ProjectReels] fetch failed: \(error.localizedDescription)")
        }
        isLoading = false
    }
}
