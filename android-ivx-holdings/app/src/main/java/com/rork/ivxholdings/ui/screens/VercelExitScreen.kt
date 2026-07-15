package com.rork.ivxholdings.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
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
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Lock
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.rork.ivxholdings.ui.theme.IVXBlue
import com.rork.ivxholdings.ui.theme.IVXDark
import com.rork.ivxholdings.ui.theme.IVXGold
import com.rork.ivxholdings.ui.theme.IVXGreen
import com.rork.ivxholdings.ui.theme.IVXOnSurface
import com.rork.ivxholdings.ui.theme.IVXOnSurfaceMuted
import com.rork.ivxholdings.ui.theme.IVXRed
import com.rork.ivxholdings.ui.theme.IVXSurfaceVariant

private data class Dependency(
    val id: String,
    val name: String,
    val type: String,
    val risk: String,
    val replacement: String
)

private val dependencies = listOf(
    Dependency("VD-001", "ai-gateway.vercel.sh runtime", "AI Gateway", "Critical", "IVX AI Gateway"),
    Dependency("VD-002", "Vercel AI Gateway stream endpoint", "AI Gateway", "Critical", "IVX AI Gateway /stream"),
    Dependency("VD-003", "OpenAI SDK via Vercel", "SDK", "High", "Direct OpenAI SDK"),
    Dependency("VD-004", "NEXT_PUBLIC_ env vars", "Environment", "Medium", "Native Config.kt"),
    Dependency("VD-005", "Vercel deployment docs", "Documentation", "Low", "Render docs"),
    Dependency("VD-006", "Vercel KV secret", "Secret", "High", "Redis Cloud"),
    Dependency("VD-007", "Vercel AI SDK import", "SDK", "Critical", "Custom AI runtime"),
    Dependency("VD-008", "Vercel API route handler", "API Route", "Medium", "Hono backend")
)

private val agents = listOf(
    "Atlas (1) - Migration Architect",
    "Vega (2) - AI Gateway",
    "Orion (3) - Backend API",
    "Nova (4) - Mobile/Web",
    "Cipher (5) - Database/Supabase",
    "Forge (6) - DevOps",
    "Sentinel (7) - Security",
    "Pulse (8) - QA",
    "Auditor (9) - Code Review/Cutover"
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VercelExitScreen(navController: NavController) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Vercel Exit Command Center") },
                navigationIcon = {
                    IconButton(onClick = { navController.popBackStack() }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back", tint = IVXOnSurface)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = IVXDark)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item { SummaryCard() }
            item { AgentsCard() }
            item { CostCard() }
            item {
                Text(
                    "Dependency Inventory (${dependencies.size})",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            items(dependencies) { dep ->
                DependencyRow(dep)
            }
            item {
                Spacer(modifier = Modifier.height(24.dp))
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(12.dp))
                        .background(IVXRed.copy(alpha = 0.15f))
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(Icons.Default.Lock, contentDescription = null, tint = IVXRed, modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(12.dp))
                    Column {
                        Text("Owner-only controls", fontWeight = FontWeight.SemiBold)
                        Text("Dangerous operations require server-side MFA confirmation.", style = MaterialTheme.typography.bodySmall, color = IVXOnSurfaceMuted)
                    }
                }
            }
        }
    }
}

@Composable
private fun SummaryCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = IVXSurfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Migration Status", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(12.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Metric("Deps", "38")
                Metric("Removed", "0")
                Metric("Complete", "20%")
                Metric("Phase", "2")
            }
            Spacer(modifier = Modifier.height(12.dp))
            Text("Traffic: 100% Vercel → 0% IVX", color = IVXRed, fontWeight = FontWeight.SemiBold)
            Text("Target: Vercel-zero infrastructure", color = IVXOnSurfaceMuted, style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Composable
private fun Metric(label: String, value: String) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(value, style = MaterialTheme.typography.titleLarge, color = IVXGold, fontWeight = FontWeight.Bold)
        Text(label, style = MaterialTheme.typography.bodySmall, color = IVXOnSurfaceMuted)
    }
}

@Composable
private fun AgentsCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = IVXSurfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("9 AI Agents", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            agents.forEach { agent ->
                Text(agent, style = MaterialTheme.typography.bodySmall, color = IVXOnSurfaceMuted)
            }
        }
    }
}

@Composable
private fun CostCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = IVXSurfaceVariant)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Cost Comparison", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Before:", color = IVXOnSurfaceMuted)
                Text("$349/mo", color = IVXRed, fontWeight = FontWeight.Bold)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("After:", color = IVXOnSurfaceMuted)
                Text("$288/mo", color = IVXGreen, fontWeight = FontWeight.Bold)
            }
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("Savings:", color = IVXOnSurfaceMuted)
                Text("$61/mo", color = IVXGold, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun DependencyRow(dep: Dependency) {
    val riskColor = when (dep.risk) {
        "Critical" -> IVXRed
        "High" -> IVXGold
        "Medium" -> IVXBlue
        else -> IVXGreen
    }
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = IVXSurfaceVariant)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (dep.risk == "Critical") Icons.Default.Warning else Icons.Default.CheckCircle,
                contentDescription = null,
                tint = riskColor,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text("${dep.id} · ${dep.name}", fontWeight = FontWeight.SemiBold, style = MaterialTheme.typography.bodyMedium)
                Text("Type: ${dep.type} · Risk: ${dep.risk}", style = MaterialTheme.typography.bodySmall, color = IVXOnSurfaceMuted)
                Text("Replacement: ${dep.replacement}", style = MaterialTheme.typography.bodySmall, color = IVXGreen)
            }
        }
    }
}
