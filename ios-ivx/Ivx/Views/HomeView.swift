//
//  HomeView.swift
//  Ivx
//
//  Mirrors the Android home screen (expo/app/(tabs)/(home)/home.tsx):
//  portfolio snapshot, quick invest actions, live JV deals carousel,
//  trust badges, and the IVX HOLDINGS LLC footer.
//

import SwiftUI

struct HomeView: View {
    @State private var dealsModel = JVDealsViewModel()
    @State private var homeFeedModel = HomeFeedViewModel()
    @State private var liveMemberTotal: Int?
    @State private var liveInvestorTotal: Int?
    @State private var showProjectReels = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    portfolioSnapshot
                    quickInvestSection
                    investorFirstFeedSection
                    trustBadges
                    footer
                }
                .padding(.vertical)
            }
            .background(Color.ivxBackground)
            .refreshable {
                await dealsModel.load()
                await homeFeedModel.load()
                await loadLiveStats()
            }
            .task {
                await dealsModel.load()
                await homeFeedModel.load()
                await loadLiveStats()
            }
            .toolbar(.hidden, for: .navigationBar)
            .fullScreenCover(isPresented: $showProjectReels) {
                ProjectReelsView()
            }
        }
    }

    private var header: some View {
        HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("IVXHOLDINGS")
                    .font(.title2)
                    .fontWeight(.heavy)
                    .foregroundStyle(Color.ivxGold)
                Text("Institutional Real Estate Investment")
                    .font(.caption)
                    .foregroundStyle(Color.ivxTextSecondary)
            }
            Spacer()
            HStack(spacing: 10) {
                Button {
                    showProjectReels = true
                } label: {
                    Image(systemName: "film.stack")
                        .font(.title3)
                        .foregroundStyle(Color.ivxGold)
                        .frame(width: 40, height: 40)
                        .background(Color.ivxGold.opacity(0.15))
                        .clipShape(Circle())
                        .overlay(Circle().stroke(Color.ivxGold.opacity(0.3), lineWidth: 1))
                }
                .accessibilityLabel("Project Reels")
                .accessibilityHint("Opens the dedicated Project Reels module — construction updates and drone footage")

                Link(destination: URL(string: "https://ivxholding.com")!) {
                    Image(systemName: "safari")
                        .font(.title3)
                        .foregroundStyle(Color.ivxGold)
                        .frame(width: 40, height: 40)
                        .background(Color.ivxCard)
                        .clipShape(Circle())
                }
            }
        }
        .padding(.horizontal)
    }

    /// Mirrors Android PortfolioSnapshot — "Your Portfolio / All time".
    private var portfolioSnapshot: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Text("Your Portfolio")
                    .font(.headline)
                    .foregroundStyle(.white)
                Spacer()
                Text("All time")
                    .font(.caption)
                    .foregroundStyle(Color.ivxTextTertiary)
            }
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                StatCard(
                    title: "Members",
                    value: liveMemberTotal.map(String.init) ?? "—",
                    icon: "person.3"
                )
                StatCard(
                    title: "Investors",
                    value: liveInvestorTotal.map(String.init) ?? "—",
                    icon: "person.2"
                )
                StatCard(
                    title: "Live Deals",
                    value: dealsModel.deals.isEmpty && dealsModel.isLoading ? "—" : String(dealsModel.deals.count),
                    icon: "building.2"
                )
                StatCard(title: "Annual Returns", value: "Up to 22%", icon: "arrow.up.right")
            }
        }
        .padding(.horizontal)
    }

    /// Mirrors Android QuickInvestSection — "Explore Deals / All Options".
    private var quickInvestSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            IVXSectionHeader(
                title: "Explore Deals",
                actionTitle: "All Options",
                actionURL: URL(string: "https://ivxholding.com/properties")
            )
            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                QuickActionCard(
                    icon: "house.and.flag",
                    title: "Buy Property Shares",
                    subtitle: "Fractional ownership in premium real estate",
                    tint: .ivxGold,
                    url: URL(string: "https://ivxholding.com/properties")!
                )
                QuickActionCard(
                    icon: "person.2.badge.gearshape",
                    title: "JV Partnerships",
                    subtitle: "View JV Deals",
                    tint: .ivxBlue,
                    url: URL(string: "https://chat.ivxholding.com/investor")!
                )
                QuickActionCard(
                    icon: "brain.head.profile",
                    title: "Smart Investing",
                    subtitle: "Get Started",
                    tint: .ivxGreen,
                    url: URL(string: "https://chat.ivxholding.com")!
                )
                QuickActionCard(
                    icon: "chart.line.uptrend.xyaxis",
                    title: "Investor Dashboard",
                    subtitle: "Track performance & distributions",
                    tint: .ivxOrange,
                    url: URL(string: "https://chat.ivxholding.com/investor")!
                )
            }
            .padding(.horizontal)
        }
    }

    /// Investor-first feed — the CANONICAL block sequence from
    /// /api/ivx/video-platform/home-feed (same order as landing + Android):
    /// Featured Deal 1–3 → 1 Featured Project Video → Deal 4–6 → repeat.
    private var investorFirstFeedSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            IVXSectionHeader(
                title: "Featured Deals",
                actionTitle: "See All",
                actionURL: URL(string: "https://ivxholding.com/#deals")
            )
            if homeFeedModel.isLoading && homeFeedModel.blocks.isEmpty {
                HStack {
                    ProgressView()
                        .tint(.ivxGold)
                    Text("Syncing live deals...")
                        .font(.subheadline)
                        .foregroundStyle(Color.ivxTextSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 30)
            } else if homeFeedModel.blocks.isEmpty {
                fallbackDealsList
            } else {
                LazyVStack(spacing: 14) {
                    ForEach(homeFeedModel.blocks) { block in
                        if block.isVideo, let video = block.video {
                            DealVideoCard(video: video)
                        } else if block.isDeal, let deal = block.deal {
                            HomeFeedDealCard(deal: deal)
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }

    /// Offline fallback — local jv_deals list keeps the page alive if the
    /// canonical home feed is unreachable.
    @ViewBuilder
    private var fallbackDealsList: some View {
        if dealsModel.deals.isEmpty {
            VStack(spacing: 6) {
                Text("No deals available yet")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                Text("Check back soon for new opportunities")
                    .font(.caption)
                    .foregroundStyle(Color.ivxTextSecondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 30)
        } else {
            LazyVStack(spacing: 14) {
                ForEach(dealsModel.deals) { deal in
                    JVDealCard(deal: deal)
                }
            }
            .padding(.horizontal)
        }
    }

    /// Mirrors Android InlineTrustBadges.
    private var trustBadges: some View {
        VStack(spacing: 8) {
            TrustBadge(icon: "sparkles", title: "AI Investing", subtitle: "Smart analysis picks the best deals for you")
            TrustBadge(icon: "lock.shield", title: "Secure Escrow", subtitle: "Escrow-protected funds on every investment")
            TrustBadge(icon: "chart.bar.xaxis", title: "Beating Markets", subtitle: "Performance-focused real estate strategies")
            TrustBadge(icon: "bolt.fill", title: "Instant Liquidity", subtitle: "Trade shares 24/7 — no lockup periods")
        }
        .padding(.horizontal)
    }

    private var footer: some View {
        Text("IVX HOLDINGS LLC")
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundStyle(Color.ivxTextTertiary)
            .frame(maxWidth: .infinity)
            .padding(.top, 8)
    }

    private func loadLiveStats() async {
        do {
            let response = try await MembersRegistryService.fetchRegistry()
            liveMemberTotal = response.total ?? response.members.count
            liveInvestorTotal = response.members
                .filter { ($0.memberType ?? "").lowercased() == "investor" }
                .count
        } catch {
            print("[Home] Live stats fetch failed: \(error.localizedDescription)")
        }
    }
}

#Preview {
    HomeView()
}
