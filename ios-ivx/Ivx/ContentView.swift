//
//  ContentView.swift
//  Ivx
//
//  Created by Rork on June 30, 2026.
//

import SwiftUI

struct ContentView: View {
    @State private var selectedTab = 0

    var body: some View {
        TabView(selection: $selectedTab) {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house.fill")
                }
                .tag(0)

            PropertiesView()
                .tabItem {
                    Label("Properties", systemImage: "building.2.fill")
                }
                .tag(1)

            InvestorView()
                .tabItem {
                    Label("Invest", systemImage: "chart.line.uptrend.xyaxis")
                }
                .tag(2)

            ProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.fill")
                }
                .tag(3)
        }
        .tint(.indigo)
    }
}

struct HomeView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Header
                    VStack(alignment: .leading, spacing: 4) {
                        Text("IVX Holdings")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                        Text("Institutional Real Estate Investment Platform")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.horizontal)

                    // Featured property card
                    Color(.secondarySystemBackground)
                        .frame(height: 200)
                        .overlay(alignment: .bottomLeading) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text("Featured Property")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(.white.opacity(0.8))
                                Text("Luxury Multi-Family Portfolio")
                                    .font(.title3)
                                    .fontWeight(.bold)
                                    .foregroundStyle(.white)
                                Text("12.5% Target IRR")
                                    .font(.subheadline)
                                    .foregroundStyle(.white.opacity(0.9))
                            }
                            .padding()
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(
                                LinearGradient(
                                    colors: [.clear, .black.opacity(0.7)],
                                    startPoint: .top,
                                    endPoint: .bottom
                                )
                            )
                        }
                        .clipShape(.rect(cornerRadius: 16))
                        .padding(.horizontal)

                    // Quick stats
                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        StatCard(title: "Properties", value: "24", icon: "building.2")
                        StatCard(title: "Investors", value: "1.2K", icon: "person.2")
                        StatCard(title: "AUM", value: "$450M", icon: "chart.bar")
                        StatCard(title: "Returns", value: "14.2%", icon: "arrow.up.right")
                    }
                    .padding(.horizontal)

                    // Open in web button
                    Link(destination: URL(string: "https://ivxholding.com")!) {
                        Label("Open Full Platform", systemImage: "safari")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.indigo)
                    .padding(.horizontal)
                }
                .padding(.vertical)
            }
            .navigationTitle("IVX")
            .background(Color(.systemGroupedBackground))
        }
    }
}

struct StatCard: View {
    let title: String
    let value: String
    let icon: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(.indigo)
            Text(value)
                .font(.title2)
                .fontWeight(.bold)
            Text(title)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 12))
    }
}

struct PropertiesView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "building.2.fill")
                    .font(.system(size: 48))
                    .foregroundStyle(.indigo)
                Text("Investment Properties")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("Browse our curated portfolio of institutional-grade real estate assets.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Link(destination: URL(string: "https://ivxholding.com/properties")!) {
                    Label("View Properties", systemImage: "arrow.forward")
                        .font(.headline)
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Properties")
        }
    }
}

struct InvestorView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "chart.line.uptrend.xyaxis")
                    .font(.system(size: 48))
                    .foregroundStyle(.indigo)
                Text("Investor Dashboard")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("Track your portfolio performance, distributions, and new opportunities.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Link(destination: URL(string: "https://chat.ivxholding.com/investor")!) {
                    Label("Open Dashboard", systemImage: "arrow.forward")
                        .font(.headline)
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Invest")
        }
    }
}

struct ProfileView: View {
    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                Image(systemName: "person.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(.indigo)
                Text("Member Access")
                    .font(.title2)
                    .fontWeight(.bold)
                Text("Sign in to access your investor portal, deal room, and AI-powered insights.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
                Link(destination: URL(string: "https://chat.ivxholding.com")!) {
                    Label("Sign In", systemImage: "person.badge.key")
                        .font(.headline)
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemGroupedBackground))
            .navigationTitle("Profile")
        }
    }
}

#Preview {
    ContentView()
}
