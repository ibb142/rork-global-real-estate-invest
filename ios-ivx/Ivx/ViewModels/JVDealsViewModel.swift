//
//  JVDealsViewModel.swift
//  Ivx
//
//  Loads the same live published deals the Android app shows.
//

import Foundation
import Observation

@Observable
final class JVDealsViewModel {
    var deals: [JVDeal] = []
    var isLoading = false
    var errorMessage: String?

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        errorMessage = nil
        do {
            deals = try await JVDealsService.fetchPublishedDeals()
        } catch {
            errorMessage = error.localizedDescription
            print("[JVDeals] fetch failed: \(error.localizedDescription)")
        }
        isLoading = false
    }
}
