package com.rork.ivxholdings.di

import com.rork.ivxholdings.data.remote.IVXApiService
import com.rork.ivxholdings.data.repository.IVXRepository
import com.rork.ivxholdings.ui.viewmodel.AIEngineeringViewModel
import com.rork.ivxholdings.ui.viewmodel.AgentsViewModel
import com.rork.ivxholdings.ui.viewmodel.AnalyticsViewModel
import com.rork.ivxholdings.ui.viewmodel.AuthViewModel
import com.rork.ivxholdings.ui.viewmodel.BuyersViewModel
import com.rork.ivxholdings.ui.viewmodel.ChatViewModel
import com.rork.ivxholdings.ui.viewmodel.DealsViewModel
import com.rork.ivxholdings.ui.viewmodel.FeedViewModel
import com.rork.ivxholdings.ui.viewmodel.HealthViewModel
import com.rork.ivxholdings.ui.viewmodel.InvestorsViewModel
import com.rork.ivxholdings.ui.viewmodel.MembersViewModel
import com.rork.ivxholdings.ui.viewmodel.OwnerDashboardViewModel
import com.rork.ivxholdings.ui.viewmodel.ProfileViewModel
import com.rork.ivxholdings.ui.viewmodel.PropertiesViewModel
import com.rork.ivxholdings.ui.viewmodel.ReelsViewModel
import com.rork.ivxholdings.ui.viewmodel.RevenueViewModel
import com.rork.ivxholdings.ui.viewmodel.VercelExitViewModel
import org.koin.androidx.viewmodel.dsl.viewModel
import org.koin.dsl.module

val appModule = module {
    single { IVXApiService() }
    single { IVXRepository(get()) }
    viewModel { AuthViewModel(get()) }
    viewModel { VercelExitViewModel(get()) }
    viewModel { AgentsViewModel(get()) }
    viewModel { ChatViewModel(get()) }
    viewModel { HealthViewModel(get()) }
    viewModel { FeedViewModel(get()) }
    viewModel { PropertiesViewModel(get()) }
    viewModel { DealsViewModel(get()) }
    viewModel { ReelsViewModel(get()) }
    viewModel { InvestorsViewModel(get()) }
    viewModel { BuyersViewModel(get()) }
    viewModel { RevenueViewModel(get()) }
    viewModel { AnalyticsViewModel(get()) }
    viewModel { MembersViewModel(get()) }
    viewModel { ProfileViewModel(get()) }
    viewModel { OwnerDashboardViewModel(get()) }
    viewModel { AIEngineeringViewModel(get()) }
}
