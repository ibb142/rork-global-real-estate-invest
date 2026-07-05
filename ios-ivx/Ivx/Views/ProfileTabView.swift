//
//  ProfileTabView.swift
//  Ivx
//
//  Mirrors the Android Profile tab (expo/app/(tabs)/profile.tsx):
//  IVX HOLDINGS LLC identity, Business Card, AI & Automation section,
//  and Owner Login.
//

import SwiftUI

struct ProfileTabView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    identityCard

                    section(title: "BUSINESS CARD") {
                        profileRow(icon: "person.crop.rectangle", title: "Business Card", subtitle: "Share your IVX identity", url: "https://ivxholding.com")
                    }

                    section(title: "AI & AUTOMATION") {
                        VStack(spacing: 8) {
                            profileRow(icon: "sparkles", title: "IVX Owner AI", subtitle: "AI replies · Room sync", url: "https://chat.ivxholding.com")
                            profileRow(icon: "gearshape.2", title: "Automation Center", subtitle: "Deploy · GitHub · Proof", url: "https://chat.ivxholding.com")
                            NavigationLink {
                                VariablesView()
                            } label: {
                                HStack(spacing: 12) {
                                    Image(systemName: "key.horizontal.fill")
                                        .font(.body)
                                        .foregroundStyle(Color.ivxGold)
                                        .frame(width: 36, height: 36)
                                        .background(Color.ivxSurface)
                                        .clipShape(.rect(cornerRadius: 8))
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text("Variables / Credentials")
                                            .font(.subheadline)
                                            .fontWeight(.semibold)
                                            .foregroundStyle(.white)
                                        Text("GitHub · Render · Supabase · AWS")
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
                            .buttonStyle(.plain)
                        }
                    }

                    section(title: "ACCOUNT") {
                        VStack(spacing: 8) {
                            profileRow(icon: "person.badge.key", title: "Owner Login", subtitle: "Access the owner dashboard", url: "https://chat.ivxholding.com")
                            profileRow(icon: "safari", title: "Open Full Platform", subtitle: "ivxholding.com", url: "https://ivxholding.com")
                        }
                    }

                    Text("IVX HOLDINGS LLC")
                        .font(.caption2)
                        .fontWeight(.semibold)
                        .foregroundStyle(Color.ivxTextTertiary)
                        .frame(maxWidth: .infinity)
                        .padding(.top, 8)
                }
                .padding(.vertical)
            }
            .background(Color.ivxBackground)
            .toolbar(.hidden, for: .navigationBar)
        }
    }

    private var identityCard: some View {
        VStack(spacing: 10) {
            Image(systemName: "person.circle.fill")
                .font(.system(size: 64))
                .foregroundStyle(Color.ivxGold)
            Text("IVX HOLDINGS LLC")
                .font(.title3)
                .fontWeight(.heavy)
                .foregroundStyle(.white)
            Text("Institutional Real Estate Investment Platform")
                .font(.caption)
                .foregroundStyle(Color.ivxTextSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 24)
        .background(Color.ivxCard)
        .clipShape(.rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(Color.ivxBorder, lineWidth: 1)
        )
        .padding(.horizontal)
    }

    private func section(title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(Color.ivxTextTertiary)
                .padding(.horizontal)
            content()
                .padding(.horizontal)
        }
    }

    private func profileRow(icon: String, title: String, subtitle: String, url: String) -> some View {
        Link(destination: URL(string: url)!) {
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
}

#Preview {
    ProfileTabView()
}
