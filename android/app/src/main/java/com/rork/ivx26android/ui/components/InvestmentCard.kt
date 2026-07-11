package com.rork.ivx26android.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.rork.ivx26android.models.JVDeal
import com.rork.ivx26android.services.IVXBackend
import com.rork.ivx26android.ui.theme.IVXGold
import java.util.Locale

/**
 * Investment card shown on project-linked reels: real deal data only —
 * ROI, minimum investment, minimum ownership %, status, View Deal + Invest Now.
 */
@Composable
fun InvestmentCard(deal: JVDeal, modifier: Modifier = Modifier) {
    val uriHandler = LocalUriHandler.current
    val dealUrl = "${IVXBackend.LANDING_BASE}/?project=${deal.id}#projects"

    Column(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(14.dp))
            .background(Color.Black.copy(alpha = 0.55f))
            .border(1.dp, IVXGold.copy(alpha = 0.45f), RoundedCornerShape(14.dp))
            .padding(12.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.Top) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = deal.displayTitle,
                    color = Color.White,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                deal.displayLocation?.let { location ->
                    Text(
                        text = location,
                        color = Color.White.copy(alpha = 0.7f),
                        fontSize = 11.sp,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
            val status = deal.status?.trim().orEmpty()
            if (status.isNotEmpty()) {
                Text(
                    text = status.uppercase(Locale.US),
                    color = IVXGold,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Black,
                    modifier = Modifier
                        .border(1.dp, IVXGold.copy(alpha = 0.6f), CircleShape)
                        .padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
        }

        Row(verticalAlignment = Alignment.CenterVertically) {
            Metric(label = "ROI", value = deal.expectedRoi?.let { "${trimmed(it)}%" } ?: "—", modifier = Modifier.weight(1f))
            MetricDivider()
            Metric(label = "MIN INVEST", value = currency(deal.minimumInvestment), modifier = Modifier.weight(1f))
            MetricDivider()
            Metric(label = "MIN OWNERSHIP", value = deal.minimumOwnershipPercent?.let { percent(it) } ?: "—", modifier = Modifier.weight(1f))
        }

        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(
                onClick = { uriHandler.openUri(dealUrl) },
                modifier = Modifier.weight(1f),
                shape = CircleShape,
                border = androidx.compose.foundation.BorderStroke(1.2.dp, IVXGold),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = IVXGold),
            ) {
                Text("View Deal", fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
            Button(
                onClick = { uriHandler.openUri(dealUrl) },
                modifier = Modifier.weight(1f),
                shape = CircleShape,
                colors = ButtonDefaults.buttonColors(containerColor = IVXGold, contentColor = Color.Black),
            ) {
                Text("Invest Now", fontSize = 13.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun Metric(label: String, value: String, modifier: Modifier = Modifier) {
    Column(modifier = modifier, horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = value,
            color = IVXGold,
            fontSize = 13.sp,
            fontWeight = FontWeight.Bold,
            maxLines = 1,
        )
        Text(
            text = label,
            color = Color.White.copy(alpha = 0.6f),
            fontSize = 8.sp,
            fontWeight = FontWeight.SemiBold,
            letterSpacing = 0.5.sp,
        )
    }
}

@Composable
private fun MetricDivider() {
    Box(
        modifier = Modifier
            .width(1.dp)
            .height(26.dp)
            .background(Color.White.copy(alpha = 0.15f))
    )
}

private fun trimmed(value: Double): String =
    if (value % 1.0 == 0.0) String.format(Locale.US, "%.0f", value)
    else String.format(Locale.US, "%.1f", value)

private fun percent(value: Double): String = when {
    value >= 1 -> String.format(Locale.US, "%.1f%%", value)
    value >= 0.01 -> String.format(Locale.US, "%.2f%%", value)
    else -> String.format(Locale.US, "%.4f%%", value)
}

private fun currency(value: Double): String = when {
    value >= 1_000_000 -> "$${trimmed(value / 1_000_000)}M"
    value >= 1_000 -> "$${trimmed(value / 1_000)}K"
    else -> "$${trimmed(value)}"
}
