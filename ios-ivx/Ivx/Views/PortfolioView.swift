//
//  PortfolioView.swift
//  Ivx
//
//  Mirrors the Android Portfolio tab (expo/app/(tabs)/portfolio.tsx):
//  "Your Portfolio" snapshot, resale listings, macro market context,
//  and the Browse Properties CTA.
//

import SwiftUI

struct PortfolioView: View {
    @State private var dealsModel = JVDealsViewModel()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Your Portfolio")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                        Text("All time")
                            .font(.subheadline)
                            .foregroundStyle(Color.ivxTextSecondary)
                    }
                    .padding(.horizontal)

                    summaryCard

                    VStack(alignment: .leading, spacing: 12) {
                        IVXSectionHeader(title: "Your Resale Listings")
                        VStack(spacing: 6) {
                            Image(systemName: "tag")
                                .font(.title2)
                                .foregroundStyle(Color.ivxTextTertiary)
                            Text("No resale listings yet")
                                .font(.subheadline)
                                .fontWeight(.semibold)
                                .foregroundStyle(.white)
                            Text("Shares you list for resale will appear here")
                                .font(.caption)
                                .foregroundStyle(Color.ivxTextSecondary)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 24)
                        .background(Color.ivxCard)
                        .clipShape(.rect(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Color.ivxBorder, lineWidth: 1)
                        )
                        .padding(.horizontal)
                    }

                    macroContext

                    Link(destination: URL(string: "https://ivxholding.com/properties")!) {
                        Text("Browse Properties")
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
            .refreshable { await dealsModel.load() }
            .task { await dealsModel.load() }
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var summaryCard: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(title: "Invested", value: "$0", icon: "banknote")
            StatCard(title: "Total Return", value: "$0", icon: "arrow.up.right")
            StatCard(title: "Holdings", value: "0", icon: "briefcase")
            StatCard(
                title: "Open Deals",
                value: dealsModel.deals.isEmpty && dealsModel.isLoading ? "—" : String(dealsModel.deals.count),
                icon: "building.2"
            )
        }
        .padding(.horizontal)
    }

    /// Mirrors Android's "Macro Market Context" card.
    private var macroContext: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Macro Market Context", systemImage: "globe.americas")
                .font(.headline)
                .foregroundStyle(.white)
            Text("US residential real estate remains supply-constrained. IVX focuses on value-add and development deals in high-growth Florida markets.")
                .font(.caption)
                .foregroundStyle(Color.ivxTextSecondary)
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
        .padding(.horizontal)
    }
}

#Preview {
    PortfolioView()
}
