# Fix number formatting with commas across all screens

- Summary

Your app has **60+ screens**. The number formatting issue is that when loading data for editing (like the Edit Deal screen), raw numbers like `2500000` appear instead of `2,500,000`. The app already has formatting utilities — they just aren't applied consistently everywhere.

## What will be fixed

**1. Edit Deal screen (jv-agreement.tsx)**

- When loading a deal for editing, Total Investment now shows with commas (e.g., `2,500,000` instead of `2500000`)
- Expected ROI and other numeric fields will also display properly

**2. JV Invest screen (jv-invest.tsx)**

- Pool remaining amounts, funding targets, and min investment values formatted with commas
- Quick-select dollar amounts display with commas (e.g., `$25,000` not `$25000`)

**3. Investor Prospectus screen (investor-prospectus.tsx)**

- All projection amounts and return calculations formatted with commas

**4. Property Detail screen (property/[id].tsx)**

- Quick invest amount buttons formatted properly
- Add funds amounts formatted

**5. VIP Tiers screen (vip-tiers.tsx)**

- Investment thresholds and progress amounts consistently formatted

**6. Admin screens**

- Transactions, Properties, Investor Profits, Trash Bin, JV Deals — all dollar amounts will use comma formatting
- Account numbers displayed with proper formatting where applicable

**7. Wallet screen (wallet.tsx)**

- All transaction amounts, quick-select buttons, and balance displays confirmed using formatters

**8. Components (QuickBuyModal, TradingModal, WireTransferForm)**

- Account numbers and wire transfer details formatted properly
- All investment amounts use comma formatting

## Approach

- Use the existing `formatAmountInput()` function when setting form values for editing
- Use `formatNumber()` / `formatCurrencyWithDecimals()` for all displayed dollar amounts
- Ensure account numbers like `9876543210` display as `9,876,543,210` where appropriate
- No new libraries needed — using your existing formatters consistently

