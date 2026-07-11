package com.rork.ivx26android.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import com.rork.ivx26android.ui.screens.ReelsFeedScreen

@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = "reels"
    ) {
        composable("reels") {
            ReelsFeedScreen()
        }
    }
}
