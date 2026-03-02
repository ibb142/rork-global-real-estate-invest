export const APP_LINKS = {
  appStore: 'https://apps.apple.com/app/ipx-holding/id123456789',
  playStore: 'https://play.google.com/store/apps/details?id=com.ipxholding.app',
  website: 'https://ivxholding.com',
  universalLink: 'https://ivxholding.com/download',
};

export interface ShareableItem {
  id: string;
  number: number;
  title: string;
  description: string;
  type: 'image' | 'video';
  thumbnail: string;
  duration?: string;
  hashtags: string[];
  caption: string;
}

export const SHAREABLE_CONTENT: ShareableItem[] = [
  {
    id: '1',
    number: 1,
    title: 'Investment Opportunity Announcement',
    description: 'Showcase IVXHOLDINGS fractional real estate investment platform',
    type: 'image',
    thumbnail: 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=400&h=400&fit=crop',
    hashtags: ['#RealEstate', '#Investment', '#PassiveIncome', '#IPXHolding'],
    caption: '🏠 Discover the future of real estate investing! Own a piece of premium properties worldwide with fractional ownership. Start building your wealth today! 💰\n\n📲 Download IVXHOLDINGS App: https://ivxholding.com/download',
  },
  {
    id: '2',
    number: 2,
    title: 'Monthly Dividend Success Story',
    description: 'Highlight investor earnings and monthly dividends',
    type: 'image',
    thumbnail: 'https://images.unsplash.com/photo-1579621970563-ebec7560ff3e?w=400&h=400&fit=crop',
    hashtags: ['#Dividends', '#WealthBuilding', '#FinancialFreedom', '#SmartInvesting'],
    caption: '📈 Monthly dividends, premium properties, zero hassle. This is how modern investors build generational wealth. Ready to join? 💎\n\n📲 Download IVXHOLDINGS App: https://ivxholding.com/download',
  },
  {
    id: '3',
    number: 3,
    title: 'Premium Property Showcase',
    description: 'Feature luxury real estate in the portfolio',
    type: 'image',
    thumbnail: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=400&h=400&fit=crop',
    hashtags: ['#LuxuryRealEstate', '#PropertyInvestment', '#PremiumHomes', '#InvestSmart'],
    caption: '🌟 Your gateway to premium real estate is here! Join thousands of smart investors earning passive income from world-class properties. 🚀\n\n📲 Download IVXHOLDINGS App: https://ivxholding.com/download',
  },
  {
    id: '4',
    number: 4,
    title: 'How It Works Explainer',
    description: 'Step-by-step guide to fractional ownership',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=400&h=400&fit=crop',
    duration: '0:45',
    hashtags: ['#HowItWorks', '#FractionalOwnership', '#InvestingMadeEasy', '#Tutorial'],
    caption: '🎬 Real estate investing made simple! No huge capital needed - start with just $100 and watch your portfolio grow. The future is fractional! 📊\n\n📲 Download IVXHOLDINGS App: https://ivxholding.com/download',
  },
  {
    id: '5',
    number: 5,
    title: 'Investor Testimonial',
    description: 'Real success stories from IVXHOLDINGS investors',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1556745757-8d76bdb6984b?w=400&h=400&fit=crop',
    duration: '1:20',
    hashtags: ['#Testimonial', '#InvestorSuccess', '#RealReturns', '#TrustIVXHOLDINGS'],
    caption: '🗣️ "I never thought I could own real estate until I found IVXHOLDINGS. Now I earn passive income every month!" - Happy Investor 💚\n\n📲 Download IVXHOLDINGS App: https://ivxholding.com/download',
  },
  {
    id: '6',
    number: 6,
    title: 'Referral Program Benefits',
    description: 'Earn rewards by inviting friends',
    type: 'image',
    thumbnail: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=400&h=400&fit=crop',
    hashtags: ['#ReferralProgram', '#EarnRewards', '#InviteFriends', '#Bonuses'],
    caption: '🎁 Invite friends, earn rewards! Our referral program gives you bonuses for every friend who joins IVXHOLDINGS. Start sharing today! 🤝\n\n📲 Download IVXHOLDINGS App: https://ivxholding.com/download',
  },
  {
    id: '7',
    number: 7,
    title: 'Market Performance Update',
    description: 'Weekly portfolio performance highlights',
    type: 'image',
    thumbnail: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=400&fit=crop',
    hashtags: ['#MarketUpdate', '#PortfolioGrowth', '#WeeklyReturns', '#InvestmentNews'],
    caption: "📊 This week's performance: +2.3% portfolio growth! Our properties continue to deliver strong returns. Are you invested yet? 📈\n\n📲 Download IVXHOLDINGS App: https://ivxholding.com/download",
  },
  {
    id: '8',
    number: 8,
    title: 'App Download Promo',
    description: 'Encourage app downloads with special offer',
    type: 'video',
    thumbnail: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=400&h=400&fit=crop',
    duration: '0:30',
    hashtags: ['#DownloadNow', '#MobileApp', '#SpecialOffer', '#StartInvesting'],
    caption: '📱 Download the IVXHOLDINGS app today and get $50 bonus on your first investment! Limited time offer.\n\n🍎 iOS: https://apps.apple.com/app/ipx-holding\n🤖 Android: https://play.google.com/store/apps/details?id=com.ipxholding.app\n🌐 Web: https://ivxholding.com 🔥',
  },
];

export const generateExportText = (selected: ShareableItem[]): string => {
  if (selected.length === 0) return '';

  let text = '📱 IVXHOLDINGS HOLDING - SOCIAL MEDIA CONTENT LIBRARY\n';
  text += '═══════════════════════════════════════\n\n';
  text += `Total Items: ${selected.length}\n`;
  text += `Generated: ${new Date().toLocaleDateString()}\n\n`;

  selected.forEach((item) => {
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `#${item.number}. ${item.title}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;
    text += `📋 Type: ${item.type === 'video' ? '🎬 Video' : '🖼️ Image'}${item.duration ? ` (${item.duration})` : ''}\n\n`;
    text += `📝 Description:\n${item.description}\n\n`;
    text += `💬 Caption:\n${item.caption}\n\n`;
    text += `#️⃣ Hashtags:\n${item.hashtags.join(' ')}\n\n`;
  });

  text += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
  text += '🌐 Share on: Instagram, Facebook, TikTok, LinkedIn, YouTube, WhatsApp\n\n';
  text += '📲 DOWNLOAD IVXHOLDINGS APP:\n';
  text += `🍎 App Store: ${APP_LINKS.appStore}\n`;
  text += `🤖 Google Play: ${APP_LINKS.playStore}\n`;
  text += `🌐 Website: ${APP_LINKS.website}\n`;

  return text;
};
