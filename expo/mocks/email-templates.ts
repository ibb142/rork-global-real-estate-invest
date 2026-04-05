export interface EmailTemplate {
  id: string;
  name: string;
  category: string;
  subject: string;
  body: string;
  description: string;
  iconName: string;
  iconColor: string;
}

export const EMAIL_TEMPLATE_CATEGORIES = [
  'All',
  'Investor',
  'KYC',
  'Deals',
  'Finance',
  'Legal',
  'Marketing',
  'Security',
] as const;

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    id: 'welcome_investor',
    name: 'Welcome Investor',
    category: 'Investor',
    subject: 'Welcome to IVX Holdings — Your Investment Journey Begins',
    body: `Dear [Investor Name],

Welcome to IVX Holdings Ltd. We are thrilled to have you join our exclusive community of global real estate investors.

Your account has been successfully created and you now have access to our premium investment platform. Here is what you can do next:

1. Complete Your KYC Verification
   Visit your profile to submit identification documents. This is required before making any investments.

2. Explore Investment Opportunities
   Browse our curated selection of Joint Venture real estate projects across international markets.

3. Review Your Dashboard
   Your personalized investor dashboard provides real-time portfolio tracking, analytics, and market intelligence.

4. Set Up Two-Factor Authentication
   Protect your account with our enterprise-grade security features.

If you have any questions or need assistance, our dedicated investor relations team is available at investors@ivxholding.com or by phone at +1 (561) 644-3503.

We look forward to building wealth together.

Best regards,

Ivan Perez
Chief Executive Officer
IVX Holdings Ltd.

1001 Brickell Bay Drive, Suite 2700
Miami, FL 33131, United States
https://ivxholding.com`,
    description: 'Welcome email for newly registered investors',
    iconName: 'UserCheck',
    iconColor: '#22C55E',
  },
  {
    id: 'kyc_approved',
    name: 'KYC Approved',
    category: 'KYC',
    subject: 'IVX Holdings — KYC Verification Approved',
    body: `Dear [Investor Name],

Great news! Your KYC (Know Your Customer) verification has been successfully completed and approved.

VERIFICATION STATUS: APPROVED

What this means for you:
- You are now fully verified and eligible to invest in all IVX Holdings opportunities
- You can participate in Joint Venture projects with no restrictions
- You now have full access to all investment opportunities on the platform

Next Steps:
1. Browse available JV investment opportunities in your dashboard
2. Review the current deal pipeline for upcoming projects
3. Set your investment preferences and notification settings

Your verified status is valid and will be reviewed annually as per regulatory requirements.

If you have any questions about your verification or investment options, please contact our KYC team at kyc@ivxholding.com.

Best regards,

KYC Compliance Team
IVX Holdings Ltd.
kyc@ivxholding.com
+1 (561) 644-3503`,
    description: 'Notification when KYC verification is approved',
    iconName: 'Shield',
    iconColor: '#4A90D9',
  },
  {
    id: 'kyc_documents_needed',
    name: 'KYC Documents Required',
    category: 'KYC',
    subject: 'IVX Holdings — Additional Documents Required for Verification',
    body: `Dear [Investor Name],

We are processing your KYC verification and require additional documentation to complete the process.

DOCUMENTS NEEDED:
- [Document Type 1]
- [Document Type 2]

Please submit the required documents through your investor portal at https://ivxholding.com or reply to this email with the documents attached.

Important Notes:
- Documents must be clear, legible, and not expired
- Government-issued photo ID must show full name and date of birth
- Proof of address must be dated within the last 3 months
- All documents are encrypted and stored securely per our privacy policy

Deadline: Please submit within 7 business days to avoid delays in your verification.

If you need assistance or have questions about the requirements, our KYC team is ready to help at kyc@ivxholding.com.

Best regards,

KYC Compliance Team
IVX Holdings Ltd.`,
    description: 'Request for additional KYC documents',
    iconName: 'FileText',
    iconColor: '#FFB800',
  },
  {
    id: 'new_jv_opportunity',
    name: 'New JV Opportunity',
    category: 'Deals',
    subject: 'IVX Holdings — New Joint Venture Investment Opportunity Available',
    body: `Dear [Investor Name],

We are excited to announce a new Joint Venture investment opportunity available to all verified investors.

PROJECT: [Project Name]
LOCATION: [City, State/Country]
TOTAL INVESTMENT: $[Amount]
EXPECTED ROI: [X]% annually
MINIMUM INVESTMENT: $[Amount]
INVESTMENT PERIOD: [X] months

Project Highlights:
- [Key Feature 1]
- [Key Feature 2]
- [Key Feature 3]
- [Key Feature 4]

This opportunity has limited availability and shares are allocated on a first-come, first-served basis.

To review full project details, financial projections, and legal documentation:
https://ivxholding.com

IMPORTANT: This investment opportunity is open to all verified investors. Past performance does not guarantee future results.

For questions or to discuss this opportunity in detail, contact our investor relations team:
- Email: investors@ivxholding.com
- Phone: +1 (561) 644-3503

Best regards,

Ivan Perez
Chief Executive Officer
IVX Holdings Ltd.`,
    description: 'Announce a new JV deal to investors',
    iconName: 'Building2',
    iconColor: '#FFD700',
  },
  {
    id: 'investment_confirmation',
    name: 'Investment Confirmation',
    category: 'Finance',
    subject: 'IVX Holdings — Investment Confirmation Receipt',
    body: `Dear [Investor Name],

This confirms your investment in the following IVX Holdings Joint Venture project:

INVESTMENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Project: [Project Name]
Investment Amount: $[Amount]
Number of Shares: [X]
Share Price: $[Price] per share
Transaction Date: [Date]
Transaction ID: [ID]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your investment has been processed and recorded in your portfolio. You can track the performance of this investment in real-time through your investor dashboard.

What Happens Next:
1. You will receive a detailed investment agreement via email within 24 hours
2. Your portfolio dashboard will be updated to reflect this investment
3. Quarterly performance reports will be sent to your registered email
4. Dividend distributions will follow the schedule outlined in the project terms

Important: Please review and sign the investment agreement when received. Keep this confirmation for your records.

For any questions regarding your investment, please contact:
- Finance: finance@ivxholding.com
- Investor Relations: investors@ivxholding.com
- Phone: +1 (561) 644-3503

Thank you for your trust in IVX Holdings.

Best regards,

Finance Department
IVX Holdings Ltd.`,
    description: 'Confirm an investment transaction',
    iconName: 'DollarSign',
    iconColor: '#22C55E',
  },
  {
    id: 'dividend_payout',
    name: 'Dividend Payout',
    category: 'Finance',
    subject: 'IVX Holdings — Dividend Distribution Processed',
    body: `Dear [Investor Name],

We are pleased to inform you that a dividend distribution has been processed for your IVX Holdings investments.

DIVIDEND DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Project: [Project Name]
Distribution Amount: $[Amount]
Distribution Type: [Quarterly/Annual/Special]
Period: [Q1/Q2/Q3/Q4 Year]
Payment Date: [Date]
Payment Method: [Wire/ACH/Wallet]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The funds have been credited to your IVX Holdings wallet. You can withdraw or reinvest this amount through your investor dashboard.

Year-to-Date Summary:
- Total Distributions: $[Amount]
- Total Return: [X]%
- Next Expected Distribution: [Date]

For tax documentation and statements, visit the Documents section of your dashboard or contact finance@ivxholding.com.

Best regards,

Finance Department
IVX Holdings Ltd.`,
    description: 'Notify investor of dividend payout',
    iconName: 'DollarSign',
    iconColor: '#2ECC71',
  },
  {
    id: 'contract_ready',
    name: 'Contract Ready for Signature',
    category: 'Legal',
    subject: 'IVX Holdings — Investment Agreement Ready for Your Review & Signature',
    body: `Dear [Investor Name],

Your Joint Venture Investment Agreement is ready for review and signature.

AGREEMENT DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Project: [Project Name]
Agreement Type: Joint Venture Investment Agreement
Document ID: [Doc ID]
Generated: [Date]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please review the agreement carefully and sign electronically through your investor portal:
https://ivxholding.com

Key Terms:
- Investment Amount: $[Amount]
- Expected Duration: [X] months
- Projected Returns: [X]% annually
- Exit Terms: [Summary]

IMPORTANT: Please sign the agreement within 5 business days to secure your position. Unsigned agreements may result in share reallocation.

If you have questions about the agreement terms, please contact our legal department:
- Email: legal@ivxholding.com
- Phone: +1 (561) 644-3503

Best regards,

Legal Department
IVX Holdings Ltd.`,
    description: 'Send investment contract for signature',
    iconName: 'FileText',
    iconColor: '#E74C3C',
  },
  {
    id: 'quarterly_report',
    name: 'Quarterly Performance Report',
    category: 'Investor',
    subject: 'IVX Holdings — Q[X] [Year] Portfolio Performance Report',
    body: `Dear [Investor Name],

Your quarterly portfolio performance report for Q[X] [Year] is now available.

PORTFOLIO SUMMARY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Portfolio Value: $[Amount]
Quarter Performance: [+/-X]%
Year-to-Date Return: [X]%
Active Investments: [X]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Highlights This Quarter:
- [Highlight 1]
- [Highlight 2]
- [Highlight 3]

Market Overview:
[Brief market analysis relevant to portfolio holdings]

Upcoming:
- [Upcoming event or opportunity]

Your full detailed report with project-by-project breakdown is available in your investor dashboard at https://ivxholding.com.

For questions about your portfolio performance, contact our investor relations team at investors@ivxholding.com.

Best regards,

Investor Relations
IVX Holdings Ltd.
+1 (561) 644-3503`,
    description: 'Quarterly portfolio performance update',
    iconName: 'BarChart3',
    iconColor: '#4A90D9',
  },
  {
    id: 'security_alert',
    name: 'Security Alert',
    category: 'Security',
    subject: 'IVX Holdings — Security Alert: New Login Detected',
    body: `Dear [Investor Name],

A new login to your IVX Holdings account was detected:

LOGIN DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Date/Time: [Date and Time]
Location: [City, Country]
Device: [Device Info]
IP Address: [IP]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If this was you, no action is needed.

If you did NOT authorize this login:
1. Change your password immediately at https://ivxholding.com/security
2. Enable two-factor authentication if not already active
3. Contact our security team immediately: security@ivxholding.com
4. Call our 24/7 security hotline: +1 (561) 644-3503

Your account security is our top priority. We use bank-grade AES-256 encryption and SOC 2 compliant infrastructure to protect your data.

Best regards,

Security Operations
IVX Holdings Ltd.`,
    description: 'Alert for suspicious or new login activity',
    iconName: 'Shield',
    iconColor: '#FF4D4D',
  },
  {
    id: 'referral_bonus',
    name: 'Referral Bonus',
    category: 'Marketing',
    subject: 'IVX Holdings — Referral Bonus Earned!',
    body: `Dear [Investor Name],

Congratulations! Your referral has successfully registered and verified their account with IVX Holdings.

REFERRAL BONUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Referred Investor: [Name]
Bonus Amount: $[Amount]
Status: Credited to your wallet
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your referral bonus has been credited to your IVX Holdings wallet. You can use it toward new investments or withdraw it.

Keep sharing! Your unique referral link:
https://ivxholding.com/ref/[CODE]

Referral Program Benefits:
- Earn $[X] for each new investor you refer
- Additional bonuses when your referrals make their first investment
- No limit on the number of referrals

Track all your referrals and earnings in your dashboard.

Thank you for spreading the word about IVX Holdings!

Best regards,

Marketing Team
IVX Holdings Ltd.`,
    description: 'Notify investor of referral bonus earned',
    iconName: 'Users',
    iconColor: '#9B59B6',
  },
];
