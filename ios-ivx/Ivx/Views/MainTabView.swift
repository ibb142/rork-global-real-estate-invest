import SwiftUI

/// Main Tab View — shown after successful owner authentication.
struct MainTabView: View {
    @Environment(AuthViewModel.self) private var authVM
    @State private var selectedTab: Int = 0
    let session: OwnerSession

    var body: some View {
        TabView(selection: $selectedTab) {
            DashboardView(session: session)
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

            OwnerProfileView()
                .tabItem {
                    Label("Profile", systemImage: "person.crop.circle.fill")
                }
                .tag(3)
        }
        .tint(Color(red: 0.35, green: 0.35, blue: 0.85))
    }
}

// MARK: - Dashboard

struct DashboardView: View {
    let session: OwnerSession

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    welcomeCard
                    statsGrid
                    quickActions
                    platformStatusCard
                }
                .padding(.horizontal)
                .padding(.vertical)
            }
            .navigationTitle("IVX")
            .toolbarColorScheme(.dark, for: .navigationBar)
        }
    }

    private var welcomeCard: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("Welcome back")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Text(session.displayName)
                .font(.title2)
                .fontWeight(.bold)
            if let email = session.email {
                Text(email)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            HStack(spacing: 6) {
                Circle().fill(.green).frame(width: 6, height: 6)
                Text(session.role == "owner" ? "Owner Access" : "Authenticated")
                    .font(.caption2)
                    .foregroundStyle(.green)
            }
            .padding(.top, 4)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
    }

    private var statsGrid: some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(title: "Properties", value: "24", icon: "building.2")
            StatCard(title: "Investors", value: "1.2K", icon: "person.2")
            StatCard(title: "AUM", value: "$450M", icon: "chart.bar")
            StatCard(title: "Returns", value: "14.2%", icon: "arrow.up.right")
        }
    }

    private var quickActions: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Quick Actions")
                .font(.headline)
            VStack(spacing: 10) {
                actionRow(icon: "doc.text.fill", title: "View Deals", destination: "properties")
                actionRow(icon: "chart.line.uptrend.xyaxis", title: "Investor Dashboard", destination: "invest")
                actionRow(icon: "globe", title: "Open Full Platform", link: "https://ivxholding.com")
            }
        }
    }

    private func actionRow(icon: String, title: String, destination: String? = nil, link: String? = nil) -> some View {
        Group {
            if let link, let url = URL(string: link) {
                Link(destination: url) {
                    actionContent(icon: icon, title: title)
                }
            } else {
                Button {
                    // Navigate within app
                } label: {
                    actionContent(icon: icon, title: title)
                }
            }
        }
    }

    private func actionContent(icon: String, title: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.indigo)
                .frame(width: 28)
            Text(title)
                .foregroundStyle(.primary)
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 12))
    }

    private var platformStatusCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: "server.rack")
                    .foregroundStyle(.indigo)
                Text("Platform Status")
                    .font(.headline)
            }
            HStack(spacing: 6) {
                Circle().fill(.green).frame(width: 8, height: 8)
                Text("API: api.ivxholding.com")
                    .font(.caption)
                Spacer()
                Text("Live")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundStyle(.green)
            }
            HStack(spacing: 6) {
                Circle().fill(.green).frame(width: 8, height: 8)
                Text("Chat: chat.ivxholding.com")
                    .font(.caption)
                Spacer()
                Text("Live")
                    .font(.caption2)
                    .fontWeight(.medium)
                    .foregroundStyle(.green)
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
    }
}

// MARK: - Stat Card

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

// MARK: - Properties

struct PropertiesView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    ForEach(sampleProperties, id: \.id) { property in
                        PropertyCard(property: property)
                    }
                }
                .padding(.horizontal)
                .padding(.vertical)
            }
            .navigationTitle("Properties")
        }
    }

    struct PropertyItem: Identifiable {
        let id = UUID()
        let name: String
        let location: String
        let irr: String
        let status: String
    }

    private var sampleProperties: [PropertyItem] {
        [
            PropertyItem(name: "Casa Rosario", location: "Buenos Aires, AR", irr: "12.5%", status: "Active"),
            PropertyItem(name: "Luxury Multi-Family", location: "Miami, FL", irr: "14.2%", status: "Open"),
            PropertyItem(name: "Downtown Tower", location: "Mexico City, MX", irr: "11.8%", status: "Active"),
            PropertyItem(name: "Beachfront Villa", location: "Lisbon, PT", irr: "13.5%", status: "Open"),
        ]
    }
}

struct PropertyCard: View {
    let property: PropertiesView.PropertyItem

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "building.2.fill")
                    .font(.title2)
                    .foregroundStyle(.indigo)
                VStack(alignment: .leading, spacing: 2) {
                    Text(property.name)
                        .font(.headline)
                    Text(property.location)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(property.status)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(property.status == "Active" ? Color.green.opacity(0.15) : Color.blue.opacity(0.15))
                    .foregroundStyle(property.status == "Active" ? .green : .blue)
                    .clipShape(.rect(cornerRadius: 8))
            }
            HStack {
                Label(property.irr, systemImage: "arrow.up.right")
                    .font(.subheadline)
                    .fontWeight(.semibold)
                    .foregroundStyle(.green)
                Spacer()
                Link(destination: URL(string: "https://ivxholding.com/properties")!) {
                    Text("Details")
                        .font(.caption)
                        .fontWeight(.medium)
                }
            }
        }
        .padding()
        .background(Color(.secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
    }
}

// MARK: - Investor

struct InvestorView: View {
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    VStack(spacing: 8) {
                        Image(systemName: "chart.line.uptrend.xyaxis")
                            .font(.system(size: 44))
                            .foregroundStyle(.indigo)
                        Text("Investor Dashboard")
                            .font(.title2)
                            .fontWeight(.bold)
                        Text("Track portfolio performance and new opportunities.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.top, 20)

                    LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                        StatCard(title: "Portfolio Value", value: "$1.2M", icon: "dollarsign.circle")
                        StatCard(title: "Total Return", value: "+14.2%", icon: "arrow.up.right")
                        StatCard(title: "Distributions", value: "$48K", icon: "banknote")
                        StatCard(title: "Active Deals", value: "3", icon: "doc.text")
                    }

                    Link(destination: URL(string: "https://chat.ivxholding.com/investor")!) {
                        HStack {
                            Text("Open Full Dashboard")
                            Image(systemName: "arrow.forward")
                        }
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.indigo)
                        .foregroundStyle(.white)
                        .clipShape(.rect(cornerRadius: 14))
                    }
                    .padding(.horizontal)
                }
                .padding(.horizontal)
            }
            .navigationTitle("Invest")
        }
    }
}

// MARK: - Owner Profile

struct OwnerProfileView: View {
    @Environment(AuthViewModel.self) private var authVM

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 20) {
                    if case .authenticated(let session) = authVM.state {
                        VStack(spacing: 12) {
                            Image(systemName: "person.crop.circle.fill")
                                .font(.system(size: 64))
                                .foregroundStyle(.indigo)

                            Text(session.displayName)
                                .font(.title3)
                                .fontWeight(.bold)

                            if let email = session.email {
                                Text(email)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }

                            HStack(spacing: 12) {
                                badge(text: session.role ?? "user", icon: "shield.fill")
                                badge(text: session.accountType ?? "account", icon: "person.badge.fill")
                            }

                            if let confirmed = session.emailConfirmed, confirmed {
                                Label("Email Verified", systemImage: "checkmark.seal.fill")
                                    .font(.caption)
                                    .foregroundStyle(.green)
                            }
                        }
                        .padding(.top, 20)
                    }

                    VStack(spacing: 1) {
                        Link(destination: URL(string: "https://chat.ivxholding.com")!) {
                            profileRow(icon: "bubble.left.fill", title: "Owner AI Chat")
                        }
                        Link(destination: URL(string: "https://ivxholding.com")!) {
                            profileRow(icon: "globe", title: "Full Platform")
                        }
                        Link(destination: URL(string: "https://api.ivxholding.com/health")!) {
                            profileRow(icon: "server.rack", title: "API Health")
                        }
                    }
                    .background(Color(.secondarySystemGroupedBackground))
                    .clipShape(.rect(cornerRadius: 16))

                    Button(role: .destructive) {
                        authVM.logout()
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "arrow.right.square.fill")
                            Text("Sign Out")
                                .font(.headline)
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Color.red.opacity(0.1))
                        .foregroundStyle(.red)
                        .clipShape(.rect(cornerRadius: 14))
                    }
                }
                .padding(.horizontal)
                .padding(.vertical)
            }
            .navigationTitle("Profile")
        }
    }

    private func badge(text: String, icon: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
            Text(text.capitalized)
        }
        .font(.caption2)
        .fontWeight(.medium)
        .padding(.horizontal, 12)
        .padding(.vertical, 6)
        .background(Color.indigo.opacity(0.12))
        .foregroundStyle(.indigo)
        .clipShape(.rect(cornerRadius: 8))
    }

    private func profileRow(icon: String, title: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .foregroundStyle(.indigo)
                .frame(width: 28)
            Text(title)
                .foregroundStyle(.primary)
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(Color(.secondarySystemGroupedBackground))
    }
}
