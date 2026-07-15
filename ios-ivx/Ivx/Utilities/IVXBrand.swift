//
//  IVXBrand.swift
//  Ivx
//
//  Canonical IVX brand palette — exact mirror of expo/constants/colors.ts
//  so the iOS and Android apps look identical end to end.
//

import SwiftUI

extension Color {
    /// Creates a color from a 24-bit hex value, e.g. 0xFFD700.
    init(ivxHex hex: UInt32) {
        self.init(
            red: Double((hex >> 16) & 0xFF) / 255.0,
            green: Double((hex >> 8) & 0xFF) / 255.0,
            blue: Double(hex & 0xFF) / 255.0
        )
    }

    // MARK: Brand

    /// primary — #FFD700
    static let ivxGold = Color(ivxHex: 0xFFD700)
    /// primaryDark — #E6C200
    static let ivxGoldDark = Color(ivxHex: 0xE6C200)
    /// primaryLight — #FFF2A3
    static let ivxGoldLight = Color(ivxHex: 0xFFF2A3)

    // MARK: Backgrounds & surfaces

    /// background — #000000
    static let ivxBackground = Color(ivxHex: 0x000000)
    /// backgroundSecondary / surfaceElevated / inputBackground — #1A1A1A
    static let ivxSurface = Color(ivxHex: 0x1A1A1A)
    /// backgroundTertiary — #242424
    static let ivxSurfaceTertiary = Color(ivxHex: 0x242424)
    /// surface / card — #141414
    static let ivxCard = Color(ivxHex: 0x141414)
    /// surfaceLight / border — #2A2A2A
    static let ivxBorder = Color(ivxHex: 0x2A2A2A)

    // MARK: Text

    /// textSecondary / subtitle — #999999
    static let ivxTextSecondary = Color(ivxHex: 0x999999)
    /// textTertiary / muted / tabIconDefault — #666666
    static let ivxTextTertiary = Color(ivxHex: 0x666666)

    // MARK: Semantic (match Android exactly)

    /// success / green — #22C55E
    static let ivxGreen = Color(ivxHex: 0x22C55E)
    /// warning / orange — #F59E0B
    static let ivxOrange = Color(ivxHex: 0xF59E0B)
    /// error / danger — #EF4444
    static let ivxRed = Color(ivxHex: 0xEF4444)
    /// info / blue — #3B82F6
    static let ivxBlue = Color(ivxHex: 0x3B82F6)
}
