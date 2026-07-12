//
//  VideoPlatformViewer.swift
//  Ivx
//
//  Stable guest viewer ID for IVX Reels engagement — matches the landing page
//  and Android app so likes, saves, follows and reports are attributed to the
//  same anonymous guest across sessions.
//

import Foundation

struct VideoPlatformViewer {
    private static let key = "ivx_viewer_id"
    private static let defaults = UserDefaults.standard

    static func id() -> String {
        if let existing = defaults.string(forKey: key), !existing.isEmpty {
            return existing
        }
        let id = "guest-\(Int.random(in: 1_000_000...9_999_999))\(Date().timeIntervalSince1970)"
            .data(using: .utf8)!
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "")
            .replacingOccurrences(of: "/", with: "")
            .replacingOccurrences(of: "=", with: "")
            .prefix(16)
        let generated = String(id)
        defaults.set(generated, forKey: key)
        return generated
    }
}
