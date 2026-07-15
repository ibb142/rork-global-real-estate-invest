package com.rork.ivxholdings.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.BarChart
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.rork.ivxholdings.ui.navigation.Screen
import com.rork.ivxholdings.ui.theme.IVXBlue
import com.rork.ivxholdings.ui.theme.IVXDark
import com.rork.ivxholdings.ui.theme.IVXGold
import com.rork.ivxholdings.ui.theme.IVXGreen
import com.rork.ivxholdings.ui.theme.IVXOnSurface
import com.rork.ivxholdings.ui.theme.IVXOnSurfaceMuted
import com.rork.ivxholdings.ui.theme.IVXRed
import com.rork.ivxholdings.ui.theme.IVXSurfaceVariant
import com.rork.ivxholdings.util.AppConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(navController: NavController) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .size(36.dp)
                                .clip(CircleShape)
                                .background(IVXGold),
                            contentAlignment = Alignment.Center
                        ) {
                            Text(
                                "IV",
                                color = IVXDark,
                                fontWeight = FontWeight.Bold,
                                style = MaterialTheme.typography.titleMedium
                            )
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Text("IVX Holdings")
                    }
                },
                actions = {
                    Text(
                        "v${AppConfig.APP_VERSION}",
                        color = IVXOnSurfaceMuted,
                        style = MaterialTheme.typography.bodySmall,
                        modifier = Modifier.padding(horizontal = 16.dp)
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = IVXDark,
                    titleContentColor = IVXOnSurface
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { HeroCard() }
            item {
                Text(
                    "Explore",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = IVXOnSurface
                )
                Spacer(modifier = Modifier.height(8.dp))
            }
            item {
                ActionCard(
                    title = "Properties",
                    subtitle = "Browse tokenized real estate",
                    iconColor = IVXGreen,
                    onClick = { navController.navigate(Screen.Properties.route) }
                )
            }
            item {
                ActionCard(
                    title = "Deals",
                    subtitle = "Active JV and acquisition opportunities",
                    iconColor = IVXBlue,
                    onClick = { navController.navigate(Screen.Deals.route) }
                )
            }
            item {
                ActionCard(
                    title = "Feed",
                    subtitle = "Latest IVX news and updates",
                    iconColor = IVXGold,
                    onClick = { navController.navigate(Screen.Feed.route) }
                )
            }
            item {
                ActionCard(
                    title = "Reels",
                    subtitle = "Short-form property and market videos",
                    iconColor = IVXRed,
                    onClick = { navController.navigate(Screen.Reels.route) }
                )
            }
            item {
                Text(
                    "Owner / Admin",
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.Bold,
                    color = IVXOnSurface
                )
                Spacer(modifier = Modifier.height(8.dp))
            }
            item {
                ActionCard(
                    title = "Owner Dashboard",
                    subtitle = "Members, investors, buyers, revenue",
                    iconColor = IVXGold,
                    onClick = { navController.navigate(Screen.OwnerDashboard.route) }
                )
            }
            item {
                ActionCard(
                    title = "Vercel Exit Command Center",
                    subtitle = "38 dependencies · 9 AI agents · migration status",
                    iconColor = IVXRed,
                    onClick = { navController.navigate(Screen.VercelExit.route) }
                )
            }
            item {
                ActionCard(
                    title = "AI Engineering Command Center",
                    subtitle = "Atlas, Vega, Orion, Nova, Cipher, Forge, Sentinel, Pulse, Auditor",
                    iconColor = IVXBlue,
                    onClick = { navController.navigate(Screen.AIEngineering.route) }
                )
            }
            item {
                ActionCard(
                    title = "IVX Owner AI",
                    subtitle = "Chat with the orchestrator",
                    iconColor = IVXGreen,
                    onClick = { navController.navigate(Screen.Chat.route) }
                )
            }
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "IVX Holdings Android · ${AppConfig.APP_VERSION} · ${AppConfig.GIT_SHA}",
                    style = MaterialTheme.typography.bodySmall,
                    color = IVXOnSurfaceMuted
                )
            }
        }
    }
}

@Composable
private fun HeroCard() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(IVXSurfaceVariant)
            .padding(20.dp)
    ) {
        Text(
            "Real Estate, Reimagined",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Invest in tokenized properties, track deals, and access owner intelligence — all in one place.",
            color = IVXOnSurfaceMuted,
            style = MaterialTheme.typography.bodyMedium
        )
        Spacer(modifier = Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            StatBadge("$47.2M", "Assets")
            StatBadge("12,400+", "Investors")
            StatBadge("89", "Deals")
        }
    }
}

@Composable
private fun StatBadge(value: String, label: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, fontWeight = FontWeight.Bold, color = IVXGold, style = MaterialTheme.typography.titleMedium)
        Text(label, style = MaterialTheme.typography.bodySmall, color = IVXOnSurfaceMuted)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ActionCard(
    title: String,
    subtitle: String,
    iconColor: androidx.compose.ui.graphics.Color,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = IVXSurfaceVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(CircleShape)
                    .background(iconColor.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = null,
                    tint = iconColor,
                    modifier = Modifier.size(24.dp)
                )
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(title, fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.titleMedium)
                Spacer(modifier = Modifier.height(4.dp))
                Text(subtitle, style = MaterialTheme.typography.bodySmall, color = IVXOnSurfaceMuted)
            }
            IconButton(onClick = onClick) {
                Icon(
                    imageVector = Icons.AutoMirrored.Filled.ArrowForward,
                    contentDescription = "Open",
                    tint = IVXOnSurfaceMuted
                )
            }
        }
    }
}
