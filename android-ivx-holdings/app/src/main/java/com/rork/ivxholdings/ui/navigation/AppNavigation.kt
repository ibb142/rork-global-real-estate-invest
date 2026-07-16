package com.rork.ivxholdings.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.rork.ivxholdings.ui.screens.AboutScreen
import com.rork.ivxholdings.ui.screens.AIEngineeringScreen
import com.rork.ivxholdings.ui.screens.AgentsScreen
import com.rork.ivxholdings.ui.screens.AnalyticsScreen
import com.rork.ivxholdings.ui.screens.BuyersScreen
import com.rork.ivxholdings.ui.screens.ChatScreen
import com.rork.ivxholdings.ui.screens.DealsScreen
import com.rork.ivxholdings.ui.screens.FeedScreen
import com.rork.ivxholdings.ui.screens.HomeScreen
import com.rork.ivxholdings.ui.screens.InvestorsScreen
import com.rork.ivxholdings.ui.screens.LoginScreen
import com.rork.ivxholdings.ui.screens.MembersScreen
import com.rork.ivxholdings.ui.screens.OwnerDashboardScreen
import com.rork.ivxholdings.ui.screens.ProfileScreen
import com.rork.ivxholdings.ui.screens.PropertiesScreen
import com.rork.ivxholdings.ui.screens.ReelsScreen
import com.rork.ivxholdings.ui.screens.RevenueScreen
import com.rork.ivxholdings.ui.screens.SettingsScreen
import com.rork.ivxholdings.ui.screens.VercelExitScreen
import com.rork.ivxholdings.ui.theme.IVXDark
import com.rork.ivxholdings.ui.theme.IVXGold
import com.rork.ivxholdings.ui.theme.IVXOnSurface
import com.rork.ivxholdings.ui.theme.IVXOnSurfaceMuted
import com.rork.ivxholdings.ui.theme.IVXSurfaceVariant

private val publicTabs = listOf(
    Screen.Home,
    Screen.Feed,
    Screen.Properties,
    Screen.Deals,
    Screen.Reels,
    Screen.Profile
)

@Composable
fun AppNavigation() {
    val navController = rememberNavController()

    NavHost(
        navController = navController,
        startDestination = Screen.Login.route
    ) {
        composable(Screen.Login.route) {
            LoginScreen(
                onLoginSuccess = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Login.route) { inclusive = true }
                    }
                }
            )
        }
        composable(Screen.Home.route) { MainScaffold(navController) }
        composable(Screen.Feed.route) { MainScaffold(navController, tab = Screen.Feed.route) }
        composable(Screen.Properties.route) { MainScaffold(navController, tab = Screen.Properties.route) }
        composable(Screen.Deals.route) { MainScaffold(navController, tab = Screen.Deals.route) }
        composable(Screen.Reels.route) { MainScaffold(navController, tab = Screen.Reels.route) }
        composable(Screen.Profile.route) { MainScaffold(navController, tab = Screen.Profile.route) }
        composable(Screen.Chat.route) { ChatScreen(navController) }
        composable(Screen.VercelExit.route) { VercelExitScreen(navController) }
        composable(Screen.Agents.route) { AgentsScreen(navController) }
        composable(Screen.AIEngineering.route) { AIEngineeringScreen(navController) }
        composable(Screen.OwnerDashboard.route) { OwnerDashboardScreen(navController) }
        composable(Screen.Investors.route) { InvestorsScreen(navController) }
        composable(Screen.Buyers.route) { BuyersScreen(navController) }
        composable(Screen.Members.route) { MembersScreen(navController) }
        composable(Screen.Revenue.route) { RevenueScreen(navController) }
        composable(Screen.Analytics.route) { AnalyticsScreen(navController) }
        composable(Screen.Settings.route) { SettingsScreen(navController) }
        composable(Screen.About.route) { AboutScreen(navController) }
    }
}

@Composable
private fun MainScaffold(navController: NavHostController, tab: String = Screen.Home.route) {
    Scaffold(
        bottomBar = { IVXBottomNav(navController, tab) }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = tab,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(Screen.Home.route) { HomeScreen(navController) }
            composable(Screen.Feed.route) { FeedScreen(navController) }
            composable(Screen.Properties.route) { PropertiesScreen(navController) }
            composable(Screen.Deals.route) { DealsScreen(navController) }
            composable(Screen.Reels.route) { ReelsScreen(navController) }
            composable(Screen.Profile.route) { ProfileScreen(navController) }
        }
    }
}

@Composable
private fun IVXBottomNav(navController: NavHostController, currentRoute: String) {
    NavigationBar(
        containerColor = IVXDark,
        contentColor = IVXOnSurface
    ) {
        publicTabs.forEach { screen ->
            val selected = currentRoute == screen.route
            NavigationBarItem(
                selected = selected,
                onClick = {
                    navController.navigate(screen.route) {
                        popUpTo(Screen.Home.route) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                icon = { Icon(imageVector = screen.icon, contentDescription = screen.label) },
                label = { Text(screen.label, style = MaterialTheme.typography.labelSmall) },
                colors = NavigationBarItemDefaults.colors(
                    selectedIconColor = IVXGold,
                    selectedTextColor = IVXGold,
                    unselectedIconColor = IVXOnSurfaceMuted,
                    unselectedTextColor = IVXOnSurfaceMuted,
                    indicatorColor = IVXSurfaceVariant
                )
            )
        }
    }
}
