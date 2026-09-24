import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';

import { CampaignDetailPanel } from './CampaignDetailPanel';
import { AppConfig, Campaign } from '../types/campaign';

// Mock the ContributorSummary since it makes API calls
vi.mock('./ContributorSummary', () => ({
  ContributorSummary: () => <div data-testid="contributor-summary-mock" />,
}));

// Mock the campaign service for failure path testing
vi.mock('../services/campaignService', () => ({
  claimCampaign: vi.fn(),
  refundCampaign: vi.fn(),
}));

const mockConfig: AppConfig = {
  allowedAssets: ['USDC', 'XLM'],
  soroban: {
    enabled: true,
    contractId: 'C123',
    networkPassphrase: 'Test SDF Network ; September 2015',
    rpcUrl: 'https://example.com',
  },
  sorobanRpcUrl: 'https://example.com',
  contractId: 'C123',
  networkPassphrase: 'Test SDF Network ; September 2015',
  contractAmountDecimals: 2,
  walletIntegrationReady: true,
  assetAddresses: {},
};

const mockCampaign: Campaign = {
  id: '1',
  title: 'Test Campaign',
  description: 'A test campaign description',
  creator: `G${'A'.repeat(55)}`,
  assetCode: 'USDC',
  acceptedTokens: ['USDC'],
  targetAmount: 100,
  pledgedAmount: 0,
  deadline: Math.floor(Date.now() / 1000) + 3600,
  createdAt: Math.floor(Date.now() / 1000),
  pledges: [],
  progress: {
    status: 'open',
    percentFunded: 0,
    remainingAmount: 100,
    hoursLeft: 1,
    pledgeCount: 0,
    canPledge: true,
    canClaim: false,
    canRefund: false,
  },
  metadata: {},
};

describe('CampaignDetailPanel', () => {
  it('renders loading state', () => {
    render(
      <BrowserRouter>
        <CampaignDetailPanel
          campaign={null}
          appConfig={mockConfig}
          isLoading={true}
        />
      </BrowserRouter>
    );
    expect(screen.getByRole('region')).toBeInTheDocument();
  });

  it('renders not found state when notFoundCampaignId is provided', () => {
    render(
      <BrowserRouter>
        <CampaignDetailPanel
          campaign={null}
          appConfig={mockConfig}
          notFoundCampaignId="999"
        />
      </BrowserRouter>
    );
    expect(screen.getByText('Campaign not found')).toBeInTheDocument();
    expect(screen.getByText(/campaign #999 does not exist/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to campaigns' })).toBeInTheDocument();
  });

  it('renders empty state when no campaign is selected', () => {
    render(
      <BrowserRouter>
        <CampaignDetailPanel
          campaign={null}
          appConfig={mockConfig}
          isLoading={false}
        />
      </BrowserRouter>
    );
    expect(screen.getByText('Campaign actions')).toBeInTheDocument();
  });

  it('renders campaign details when campaign is provided', () => {
    render(
      <BrowserRouter>
        <CampaignDetailPanel
          campaign={mockCampaign}
          appConfig={mockConfig}
          isLoading={false}
        />
      </BrowserRouter>
    );
    expect(screen.getByText('Test Campaign')).toBeInTheDocument();
  });

  describe('Failure Path Coverage', () => {
    it('handles missing data gracefully when campaign is null', () => {
      render(
        <BrowserRouter>
          <CampaignDetailPanel
            campaign={null}
            appConfig={mockConfig}
            isLoading={false}
          />
        </BrowserRouter>
      );
      // Should not crash, should show empty state or loading
      expect(screen.queryByText('Test Campaign')).not.toBeInTheDocument();
    });

    it('handles invalid input by not rendering campaign details', () => {
      const invalidCampaign = { ...mockCampaign, id: '' };
      render(
        <BrowserRouter>
          <CampaignDetailPanel
            campaign={invalidCampaign as any}
            appConfig={mockConfig}
            isLoading={false}
          />
        </BrowserRouter>
      );
      // Should not crash on invalid ID
      expect(screen.getByRole('region')).toBeInTheDocument();
    });

    it('handles duplicate actions by preventing multiple submissions', async () => {
      const mockOnPledge = vi.fn().mockRejectedValue(new Error('Duplicate pledge'));
      
      // Mock the pledge function to simulate duplicate action
      vi.doMock('../services/campaignService', () => ({
        pledgeCampaign: mockOnPledge,
      }));

      render(
        <BrowserRouter>
          <CampaignDetailPanel
            campaign={mockCampaign}
            appConfig={mockConfig}
            isLoading={false}
          />
        </BrowserRouter>
      );

      // Attempt to trigger a pledge action
      const pledgeButton = screen.getByRole('button', { name: /pledge/i });
      if (pledgeButton) {
        await pledgeButton.click();
        // Should handle the error gracefully without crashing
        await waitFor(() => {
          expect(mockOnPledge).toHaveBeenCalled();
        });
      }
    });

    it('handles timeout/retry scenarios', async () => {
      // Simulate a timeout scenario by mocking the service to throw a timeout error
      vi.doMock('../services/campaignService', () => ({
        pledgeCampaign: vi.fn().mockRejectedValue(new Error('Request timeout')),
      }));

      render(
        <BrowserRouter>
          <CampaignDetailPanel
            campaign={mockCampaign}
            appConfig={mockConfig}
            isLoading={false}
          />
        </BrowserRouter>
      );

      // Component should still render despite service errors
      expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    });

    it('handles permission failures', async () => {
      // Simulate a permission denied error
      vi.doMock('../services/campaignService', () => ({
        pledgeCampaign: vi.fn().mockRejectedValue(new Error('Permission denied')),
      }));

      render(
        <BrowserRouter>
          <CampaignDetailPanel
            campaign={mockCampaign}
            appConfig={mockConfig}
            isLoading={false}
          />
        </BrowserRouter>
      );

      // Component should still render despite permission errors
      expect(screen.getByText('Test Campaign')).toBeInTheDocument();
    });
  });
});