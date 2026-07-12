//
//  MarketView.swift
//  Ivx
//
//  Mirrors the Android Market tab (expo/app/(tabs)/market.tsx):
//  Global Markets header, IPX-RE index, Secondary Market, INDICES / FOREX
//  sections, and the "Open Global Financial Intelligence" CTA.
//

import SwiftUI

struct MarketView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Global Markets")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                        Text("Full Intelligence")
                            .font(.subheadline)
                            .foregroundStyle(Color.ivxTextSecondary)
                    }
                    .padding(.horizontal)

                    ipxCard

                    VStack(alignment: .leading, spacing: 12) {
                        IVXSectionHeader(
                            title: "Secondary Market",
                            actionTitle: "View All",
                            actionURL: URL(string: "https://ivxholding.com/properties")
                        )
                        marketRow(icon: "arrow.left.arrow.right", title: "Trade Property Shares", subtitle: "Buy and sell member shares 24/7")
                            .padding(.horizontal)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        IVXSectionHeader(title: "INDICES")
                        VStack(spacing: 8) {
                            marketRow(icon: "chart.bar.fill", title: "S&P 500", subtitle: "US large-cap equities benchmark")
                            marketRow(icon: "chart.bar.fill", title: "NASDAQ", subtitle: "US tech-weighted composite")
                            marketRow(icon: "chart.bar.fill", title: "DOW JONES", subtitle: "US industrial average")
                        }
                        .padding(.horizontal)
                    }

                    VStack(alignment: .leading, spacing: 12) {
                        IVXSectionHeader(title: "FOREX")
                        VStack(spacing: 8) {
                            marketRow(icon: "dollarsign.arrow.circlepath", title: "EUR / USD", subtitle: "Euro vs US Dollar")
                            marketRow(icon: "dollarsign.arrow.circlepath", title: "GBP / USD", subtitle: "British Pound vs US Dollar")
                        }
                        .padding(.horizontal)
                    }

                    Link(destination: URL(string: "https://ivxholding.com")!) {
                        Label("Open Global Financial Intelligence", systemImage: "globe")
                            .font(.headline)
                            .foregroundStyle(.black)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.ivxGold)
                            .clipShape(.rect(cornerRadius: 12))
                    }
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .background(Color.ivxBackground)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    /// Mirrors the Android IPX-RE hero card.
    private var ipxCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("IPX-RE")
                    .font(.title3)
                    .fontWeight(.heavy)
                    .foregroundStyle(Color.ivxGold)
                Spacer()
                Text("LIVE")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(Color.ivxGreen)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.ivxGreen.opacity(0.12))
                    .clipShape(Capsule())
            }
            Text("IVX Real Estate Index")
                .font(.subheadline)
                .foregroundStyle(Color.ivxTextSecondary)
            Text("Tracks the performance of all IVX property share offerings across the platform.")
                .font(.caption)
                .foregroundStyle(Color.ivxTextTertiary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.ivxGold.opacity(0.35), lineWidth: 1)
        )
        .padding(.horizontal)
    }

    private func marketRow(icon: String, title: String, subtitle: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.body)
                .foregroundStyle(Color.ivxGold)
                .frame(width: 36, height: 36)
                .background(Color.ivxSurface)
                .clipShape(.rect(cornerRadius: 8))
            VStack(alignment: .leading, spacing: 1) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.white)
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(Color.ivxTextSecondary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption)
                .foregroundStyle(Color.ivxTextTertiary)
        }
        .padding(12)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 10))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
    }
}

#Preview {
    MarketView()
}
