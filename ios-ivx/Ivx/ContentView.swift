//
//  ContentView.swift
//  Ivx
//
//  Root tab layout — exact mirror of the Android app's tab bar
//  (expo/app/(tabs)/_layout.tsx): all 7 tabs visible in the bottom bar
//  (Home, Invest, Market, Portfolio, Chat, Profile, CRM), gold active
//  tint #FFD700, inactive #777777, black bar with #242424 top border,
//  and Chat as the initial tab (Android initialRouteName="chat").
//
//  A custom bar is required because a native SwiftUI TabView collapses
//  tabs 5–7 into a "More" menu, which would not match Android.
//

import SwiftUI

/// The 7 tabs, in the exact order the Android app declares them.
enum IVXTab: Int, CaseIterable, Identifiable {
    case home
    case invest
    case market
    case portfolio
    case chat
    case profile
    case crm

    var id: Int { rawValue }

    var title: String {
        switch self {
        case .home: return "Home"
        case .invest: return "Invest"
        case .market: return "Market"
        case .portfolio: return "Portfolio"
        case .chat: return "Chat"
        case .profile: return "Profile"
        case .crm: return "CRM"
        }
    }

    /// SF Symbol equivalents of the Android lucide icons.
    var icon: String {
        switch self {
        case .home: return "house"
        case .invest: return "chart.line.uptrend.xyaxis"
        case .market: return "chart.bar"
        case .portfolio: return "briefcase"
        case .chat: return "message"
        case .profile: return "person"
        case .crm: return "square.grid.2x2"
        }
    }
}

struct ContentView: View {
    /// Android's Tabs initialRouteName is "chat" — start there too.
    @State private var selectedTab: IVXTab = .chat

    private let inactiveColor = Color(ivxHex: 0x777777)
    private let borderColor = Color(ivxHex: 0x242424)

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .toolbar(.hidden, for: .tabBar)
                .tag(IVXTab.home)

            InvestView()
                .toolbar(.hidden, for: .tabBar)
                .tag(IVXTab.invest)

            MarketView()
                .toolbar(.hidden, for: .tabBar)
                .tag(IVXTab.market)

            PortfolioView()
                .toolbar(.hidden, for: .tabBar)
                .tag(IVXTab.portfolio)

            ChatTabView()
                .toolbar(.hidden, for: .tabBar)
                .tag(IVXTab.chat)

            ProfileTabView()
                .toolbar(.hidden, for: .tabBar)
                .tag(IVXTab.profile)

            MembersView()
                .toolbar(.hidden, for: .tabBar)
                .tag(IVXTab.crm)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            customTabBar
        }
        .preferredColorScheme(.dark)
        .background(Color.ivxBackground)
    }

    /// Bottom bar mirroring Android: black background, 0.5pt #242424 top
    /// border, 10pt semibold labels, gold active / #777777 inactive.
    private var customTabBar: some View {
        HStack(spacing: 0) {
            ForEach(IVXTab.allCases) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    VStack(spacing: 3) {
                        Image(systemName: tab.icon)
                            .font(.system(size: 20, weight: .medium))
                            .frame(height: 24)
                        Text(tab.title)
                            .font(.system(size: 10, weight: .semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    .foregroundStyle(selectedTab == tab ? Color.ivxGold : inactiveColor)
                    .frame(maxWidth: .infinity, minHeight: 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel(tab.title)
                .accessibilityAddTraits(selectedTab == tab ? [.isSelected] : [])
            }
        }
        .padding(.top, 6)
        .padding(.bottom, 2)
        .background(Color.ivxBackground.ignoresSafeArea(edges: .bottom))
        .overlay(alignment: .top) {
            borderColor.frame(height: 0.5)
        }
    }
}

#Preview {
    ContentView()
}
