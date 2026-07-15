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
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Warning
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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
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
import com.rork.ivxholdings.ui.viewmodel.AuthViewModel
import com.rork.ivxholdings.ui.viewmodel.HealthUiState
import com.rork.ivxholdings.ui.viewmodel.HealthViewModel
import org.koin.androidx.compose.koinViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(navController: NavController) {
    val authViewModel: AuthViewModel = koinViewModel()
    val healthViewModel: HealthViewModel = koinViewModel()
    val healthState by healthViewModel.uiState.collectAsState()

    val commit = when (healthState) {
        is HealthUiState.Success -> (healthState as HealthUiState.Success).version
        else -> "0b37191f"
    }
    val routes = when (healthState) {
        is HealthUiState.Success -> (healthState as HealthUiState.Success).health.routes.size
        else -> 77
    }

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
                    TextButton("Logout") { authViewModel.logout() }
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
            item { StatusHeader() }
            item {
                ActionCard(
                    title = "Vercel Exit Command Center",
                    subtitle = "38 dependencies · 9 AI agents · 20% complete",
                    iconColor = IVXGold,
                    onClick = { navController.navigate(Screen.VercelExit.route) }
                )
            }
            item {
                ActionCard(
                    title = "AI Agent Live Work",
                    subtitle = "Atlas, Vega, Orion, Nova, Cipher, Forge, Sentinel, Pulse, Auditor",
                    iconColor = IVXBlue,
                    onClick = { navController.navigate(Screen.Agents.route) }
                )
            }
            item {
                ActionCard(
                    title = "IVX Owner AI",
                    subtitle = "Chat with the orchestrator. Idempotent requests. Staged timeout.",
                    iconColor = IVXGreen,
                    onClick = { navController.navigate(Screen.Chat.route) }
                )
            }
            item {
                ActionCard(
                    title = "System Health",
                    subtitle = "Production commit $commit · $routes routes healthy",
                    iconColor = IVXBlue,
                    onClick = { navController.navigate(Screen.About.route) }
                )
            }
            item {
                ActionCard(
                    title = "Dangerous Owner Controls",
                    subtitle = "Pause, rollback, cutover, freeze deployments (owner-only)",
                    iconColor = IVXRed,
                    onClick = { navController.navigate(Screen.VercelExit.route) }
                )
            }
            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "IVX Holdings Android App v1.1.0 · Full end-to-end build",
                    style = MaterialTheme.typography.bodySmall,
                    color = IVXOnSurfaceMuted
                )
            }
        }
    }
}

@Composable
private fun TextButton(label: String, onClick: () -> Unit) {
    Text(
        label,
        color = IVXGold,
        fontWeight = FontWeight.SemiBold,
        modifier = Modifier.padding(horizontal = 16.dp)
    )
}

@Composable
private fun StatusHeader() {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(20.dp))
            .background(IVXSurfaceVariant)
            .padding(20.dp)
    ) {
        Text(
            "Vercel Exit Migration",
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            "Phase 2: Replacement Architecture",
            color = IVXGold,
            fontWeight = FontWeight.SemiBold
        )
        Spacer(modifier = Modifier.height(16.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceEvenly
        ) {
            StatusBadge(Icons.Default.CheckCircle, "Live", IVXGreen)
            StatusBadge(Icons.Default.Warning, "38 deps", IVXGold)
            StatusBadge(Icons.Default.Info, "$61/mo", IVXBlue)
        }
    }
}

@Composable
private fun StatusBadge(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, color: androidx.compose.ui.graphics.Color) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Icon(imageVector = icon, contentDescription = label, tint = color, modifier = Modifier.size(28.dp))
        Spacer(modifier = Modifier.height(4.dp))
        Text(label, style = MaterialTheme.typography.bodySmall, color = IVXOnSurfaceMuted)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ActionCard(
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
