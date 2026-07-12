//
//  InvestView.swift
//  Ivx
//
//  Mirrors the Android Invest tab (expo/app/(tabs)/invest/index.tsx):
//  "Investment Opportunities" for lenders & investors, the "Up to 22%"
//  annual returns banner, and the live published deals list.
//

import SwiftUI

struct InvestView: View {
    @State private var dealsModel = JVDealsViewModel()
    @State private var selectedDeal: JVDeal?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("IVXHOLDINGS")
                            .font(.caption)
                            .fontWeight(.heavy)
                            .foregroundStyle(Color.ivxGold)
                        Text("Investment Opportunities")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundStyle(.white)
                        Text("For lenders & investors")
                            .font(.subheadline)
                            .foregroundStyle(Color.ivxTextSecondary)
                    }
                    .padding(.horizontal)

                    returnsBanner

                    opportunitiesSection

                    Link(destination: URL(string: "https://chat.ivxholding.com/investor")!) {
                        Text("View All JV Agreements")
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
            .navigationDestination(item: $selectedDeal) { deal in
                JVDealDetailView(deal: deal)
            }
        }
    }

    /// Mirrors Android's "Annual Returns — Up to 22%" banner.
    private var returnsBanner: some View {
        HStack(spacing: 14) {
            Image(systemName: "chart.line.uptrend.xyaxis")
                .font(.title2)
                .foregroundStyle(.black)
                .frame(width: 46, height: 46)
                .background(Color.black.opacity(0.15))
                .clipShape(.rect(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 2) {
                Text("Annual Returns")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.black.opacity(0.75))
                Text("Up to 22%")
                    .font(.title)
                    .fontWeight(.heavy)
                    .foregroundStyle(.black)
            }
            Spacer()
        }
        .padding()
        .background(
            LinearGradient(colors: [.ivxGold, .ivxGoldDark], startPoint: .topLeading, endPoint: .bottomTrailing)
        )
        .clipShape(.rect(cornerRadius: 14))
        .padding(.horizontal)
    }

    private var opportunitiesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            IVXSectionHeader(title: "Explore")

            if dealsModel.isLoading && dealsModel.deals.isEmpty {
                HStack {
                    ProgressView().tint(.ivxGold)
                    Text("Syncing live deals...")
                        .font(.subheadline)
                        .foregroundStyle(Color.ivxTextSecondary)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 30)
            } else if dealsModel.deals.isEmpty {
                VStack(spacing: 10) {
                    Text("No opportunities live right now")
                        .font(.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(.white)
                    Button {
                        Task { await dealsModel.load() }
                    } label: {
                        Text("Refresh")
                            .font(.subheadline)
                            .fontWeight(.bold)
                            .foregroundStyle(.black)
                            .padding(.horizontal, 24)
                            .padding(.vertical, 8)
                            .background(Color.ivxGold)
                            .clipShape(.rect(cornerRadius: 8))
                    }
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 30)
            } else {
                VStack(spacing: 12) {
                    ForEach(dealsModel.deals) { deal in
                        JVDealCard(deal: deal) {
                            selectedDeal = deal
                        }
                    }
                }
                .padding(.horizontal)
            }
        }
    }
}

#Preview {
    InvestView()
}
