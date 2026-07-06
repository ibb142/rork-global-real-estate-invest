import { describe, expect, test } from 'bun:test';
import { handleLandingPaymentCreateRequest } from './api/ivx-landing-payment-sync';

describe('IVX Landing Payment Sync API — real transactions require investor auth', () => {
  test('rejects unauthenticated landing payment request', async () => {
    const request = new Request('https://api.ivxholding.com/api/ivx/payments/landing-intent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dealId: 'deal-test-001',
        dealTitle: 'Casa Test',
        investmentType: 'JV Direct Investment',
        amount: 5000,
        paymentMethod: 'wire',
        investorEmail: 'investor+test@ivxholding.com',
        investorName: 'Test Investor',
        termsAccepted: true,
        source: 'landing_page_test',
      }),
    });

    const response = await handleLandingPaymentCreateRequest(request);
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toContain('authenticated');
  });
});
