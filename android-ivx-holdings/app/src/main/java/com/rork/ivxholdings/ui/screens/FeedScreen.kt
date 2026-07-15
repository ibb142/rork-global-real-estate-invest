package com.rork.ivxholdings.ui.screens

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.navigation.NavController
import com.rork.ivxholdings.data.model.FeedItem
import com.rork.ivxholdings.ui.components.CardItem
import com.rork.ivxholdings.ui.components.ListScreen
import com.rork.ivxholdings.ui.theme.IVXGold
import com.rork.ivxholdings.ui.theme.IVXOnSurface
import com.rork.ivxholdings.ui.theme.IVXOnSurfaceMuted
import com.rork.ivxholdings.ui.theme.IVXSurfaceVariant
import com.rork.ivxholdings.ui.viewmodel.FeedViewModel
import org.koin.androidx.compose.koinViewModel

@Composable
fun FeedScreen(navController: NavController) {
    val viewModel: FeedViewModel = koinViewModel()
    val state by viewModel.state.collectAsState()

    ListScreen(
        title = "Feed",
        navController = navController,
        state = state,
        onRefresh = { viewModel.load() },
        emptyText = "No feed items yet."
    ) { item ->
        FeedItemCard(item)
    }

    androidx.compose.runtime.LaunchedEffect(Unit) { viewModel.load() }
}

@Composable
private fun FeedItemCard(item: FeedItem) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = IVXSurfaceVariant),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(
                item.title,
                fontWeight = FontWeight.SemiBold,
                color = IVXOnSurface,
                style = MaterialTheme.typography.titleMedium
            )
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                item.body,
                color = IVXOnSurfaceMuted,
                style = MaterialTheme.typography.bodySmall
            )
            Spacer(modifier = Modifier.height(10.dp))
            Text(
                "${item.category} · ${item.authorName} · ${item.timestamp}",
                color = IVXGold,
                style = MaterialTheme.typography.bodySmall
            )
        }
    }
}
