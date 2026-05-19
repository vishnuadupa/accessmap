import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import SpotCard from '../SpotCard';
import type { ParkingSpot } from '@/types';

// Helper to generate a mock ParkingSpot with default values
const createMockSpot = (overrides: Partial<ParkingSpot> = {}): ParkingSpot => ({
  osm_id: '123',
  osm_type: 'node',
  name: 'Test Spot',
  loc: { type: 'Point', coordinates: [0, 0] },
  wheelchair: 'unknown',
  van_accessible: null,
  capacity_disabled: null,
  check_date_wheelchair: null,
  verified_at: null,
  opening_hours: null,
  parking_type: null,
  maxstay: null,
  capacity_total: null,
  surface: null,
  fee: null,
  covered: null,
  lit: null,
  access: null,
  height: null,
  ramp_wheelchair: null,
  address: null,
  level: null,
  phone: null,
  website: null,
  report_flags: 0,
  ...overrides,
});

describe('SpotCard Component', () => {
  const defaultProps = {
    spot: createMockSpot(),
    selected: false,
    isFavorite: false,
    community: null,
    onSelect: jest.fn(),
    onRoute: jest.fn(),
    onFavorite: jest.fn(),
    onReport: jest.fn(),
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('SpotCard - Base Data Rendering', () => {
    it('renders spot name', () => {
      render(<SpotCard {...defaultProps} />);
      expect(screen.getByText('Test Spot')).toBeInTheDocument();
    });

    it('renders spot address when provided', () => {
      const spot = createMockSpot({ address: '123 Accessible Way' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('123 Accessible Way')).toBeInTheDocument();
    });

    it('does not render address element when address is not provided', () => {
      const { container } = render(<SpotCard {...defaultProps} />);
      const pElements = container.querySelectorAll('p');
      expect(pElements.length).toBe(1);
    });

    describe('distance rendering', () => {
      it('renders distance in meters when < 1000m', () => {
        const spot = createMockSpot({ distance_m: 850 });
        render(<SpotCard {...defaultProps} spot={spot} />);
        expect(screen.getByText('850m')).toBeInTheDocument();
      });

      it('renders distance in kilometers when >= 1000m', () => {
        const spot = createMockSpot({ distance_m: 1200 });
        render(<SpotCard {...defaultProps} spot={spot} />);
        expect(screen.getByText('1.2km')).toBeInTheDocument();
      });
    });
  });

  describe('SpotCard - Badge Rendering', () => {
    it('renders "Ramp ✓" when ramp_wheelchair is true', () => {
      const spot = createMockSpot({ ramp_wheelchair: true });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Ramp ✓')).toBeInTheDocument();
    });

    it('renders "Van Accessible" badge when van_accessible is true', () => {
      const spot = createMockSpot({ van_accessible: true });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('🚐 Van Accessible')).toBeInTheDocument();
    });

    it('renders "Standard accessible" badge when van_accessible is false', () => {
      const spot = createMockSpot({ van_accessible: false });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Standard accessible')).toBeInTheDocument();
    });

    it('renders "♿ Accessible" when wheelchair is "yes"', () => {
      const spot = createMockSpot({ wheelchair: 'yes' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('♿ Accessible')).toBeInTheDocument();
    });

    it('renders "♿ Limited access" when wheelchair is "limited"', () => {
      const spot = createMockSpot({ wheelchair: 'limited' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('♿ Limited access')).toBeInTheDocument();
    });

    it('renders "Underground" with icon', () => {
      const spot = createMockSpot({ parking_type: 'underground' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('🏢 Underground')).toBeInTheDocument();
    });

    it('renders "Surface lot" with icon', () => {
      const spot = createMockSpot({ parking_type: 'surface' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('🅿️ Surface lot')).toBeInTheDocument();
    });

    it('renders "Free" when fee is false', () => {
      const spot = createMockSpot({ fee: false });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Free')).toBeInTheDocument();
    });

    it('renders "Paid" when fee is true', () => {
      const spot = createMockSpot({ fee: true });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Paid')).toBeInTheDocument();
    });

    it('renders "Covered" when covered is true', () => {
      const spot = createMockSpot({ covered: true });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Covered')).toBeInTheDocument();
    });

    it('renders "Lit" when lit is true', () => {
      const spot = createMockSpot({ lit: true });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Lit')).toBeInTheDocument();
    });

    it('renders accessible spaces count for singular', () => {
      const spot = createMockSpot({ capacity_disabled: 1 });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('1 accessible space')).toBeInTheDocument();
    });

    it('renders accessible spaces count for plural', () => {
      const spot = createMockSpot({ capacity_disabled: 3 });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('3 accessible spaces')).toBeInTheDocument();
    });

    it('renders "Level" badge when level is provided', () => {
      const spot = createMockSpot({ level: '-1' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Level -1')).toBeInTheDocument();
    });

    it('renders maxstay and opening_hours', () => {
      const spot = createMockSpot({ maxstay: '2 hours', opening_hours: '24/7' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('⏱ 2 hours')).toBeInTheDocument();
      expect(screen.getByText('· Open 24/7')).toBeInTheDocument();
    });

    it('renders opening_hours properly formatted when not 24/7', () => {
      const spot = createMockSpot({ opening_hours: 'Mo-Fr 08:00-20:00' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('· Mo-Fr 08:00-20:00')).toBeInTheDocument();
    });
  });

  describe('SpotCard - Warnings and Reports', () => {
    it('renders height warning when parking_type is underground and height is provided', () => {
      const spot = createMockSpot({ parking_type: 'underground', height: '2.1m' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('⚠️ Height limit: 2.1m — verify van clearance before entry')).toBeInTheDocument();
    });

    it('does not render height warning when parking_type is not underground', () => {
      const spot = createMockSpot({ parking_type: 'surface', height: '2.1m' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.queryByText(/Height limit/)).not.toBeInTheDocument();
    });

    it('renders warning when report_flags >= 3', () => {
      const spot = createMockSpot({ report_flags: 3 });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('⚠️ Recent accessibility complaints reported')).toBeInTheDocument();
    });

    it('renders community reports when selected and data exists', () => {
      render(<SpotCard {...defaultProps} selected={true} community={{ confirmed_ok: 5, blocked: 2 }} />);
      expect(screen.getByText('Community reports (30 days)')).toBeInTheDocument();
      expect(screen.getByText('Confirmed accessible ×5')).toBeInTheDocument();
      expect(screen.getByText('Reported blocked ×2')).toBeInTheDocument();
    });
  });

  describe('SpotCard - Interactions and Conditional Actions', () => {

    it('stops propagation when clicking on expanded actions block', () => {
      render(<SpotCard {...defaultProps} selected={true} />);
      const actionsBlock = screen.getByText('Directions in Google Maps').parentElement?.parentElement;
      if (actionsBlock) {
        actionsBlock.click();
      }
      expect(defaultProps.onSelect).not.toHaveBeenCalled();
    });


    it('stops propagation when clicking on community reports block', () => {
      render(<SpotCard {...defaultProps} selected={true} community={{ confirmed_ok: 5, blocked: 2 }} />);
      const communityBlock = screen.getByText('Community reports (30 days)').parentElement;
      if (communityBlock) {
        communityBlock.click();
      }
      expect(defaultProps.onSelect).not.toHaveBeenCalled();
    });

    it('calls onSelect when the card is clicked', () => {
      render(<SpotCard {...defaultProps} />);
      screen.getByTestId('spot-card').click();
      expect(defaultProps.onSelect).toHaveBeenCalledTimes(1);
    });

    it('calls onFavorite when the favorite button is clicked', () => {
      render(<SpotCard {...defaultProps} />);
      const buttons = screen.getAllByRole('button');
      buttons[0].click();
      expect(defaultProps.onFavorite).toHaveBeenCalledTimes(1);
    });

    it('calls onReport when "Be first ->" is clicked (No data nudge)', () => {
      render(<SpotCard {...defaultProps} />);
      const reportButton = screen.getByText('Be first →');
      reportButton.click();
      expect(defaultProps.onReport).toHaveBeenCalledTimes(1);
    });

    it('renders expanded actions when selected', () => {
      const fullSpot = createMockSpot({ phone: '123-456-7890', website: 'example.com' });
      render(<SpotCard {...defaultProps} spot={fullSpot} selected={true} />);

      expect(screen.getByText('Call ahead')).toBeInTheDocument();
      expect(screen.getByText('Call ahead')).toHaveAttribute('href', 'tel:123-456-7890');

      expect(screen.getByText('Website')).toBeInTheDocument();
      expect(screen.getByText('Website')).toHaveAttribute('href', 'https://example.com');

      expect(screen.getByText('Directions in Google Maps')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Report' })).toBeInTheDocument();
    });

    it('handles website URL correctly (keeps http if present)', () => {
      const spotHttp = createMockSpot({ website: 'http://example.com' });
      render(<SpotCard {...defaultProps} spot={spotHttp} selected={true} />);
      expect(screen.getByText('Website')).toHaveAttribute('href', 'http://example.com');
    });

    it('calls onRoute when "Directions in Google Maps" is clicked', () => {
      render(<SpotCard {...defaultProps} selected={true} />);
      screen.getByText('Directions in Google Maps').click();
      expect(defaultProps.onRoute).toHaveBeenCalledTimes(1);
    });

    it('calls onReport when expanded "Report" button is clicked', () => {
      render(<SpotCard {...defaultProps} selected={true} />);
      screen.getByRole('button', { name: 'Report' }).click();
      expect(defaultProps.onReport).toHaveBeenCalledTimes(1);
    });

    it('handles mouse enter and leave for route button', () => {
      render(<SpotCard {...defaultProps} selected={true} />);
      const routeButton = screen.getByText('Directions in Google Maps').closest('button');
      if (routeButton) {
        fireEvent.mouseEnter(routeButton);
        expect(routeButton.style.background).toBe('rgb(134, 239, 172)'); // #86efac

        fireEvent.mouseLeave(routeButton);
        expect(routeButton.style.background).toBe('var(--accent)');
      }
    });

    it('handles mouse enter and leave for report button', () => {
      render(<SpotCard {...defaultProps} selected={true} />);
      const reportButton = screen.getByRole('button', { name: 'Report' });
      if (reportButton) {
        fireEvent.mouseEnter(reportButton);
        expect(reportButton.style.borderColor).toBe('rgba(248, 113, 113, 0.4)');

        fireEvent.mouseLeave(reportButton);
        expect(reportButton.style.borderColor).toBe('var(--border)');
      }
    });
  });

  describe('SpotCard - Verification Info Details', () => {
    beforeEach(() => {
      jest.useFakeTimers().setSystemTime(new Date('2024-05-01T00:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('renders < 30 days verified_at string correctly', () => {
      const spot = createMockSpot({ verified_at: new Date('2024-04-15T00:00:00Z') });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Verified 16d ago')).toBeInTheDocument();
    });

    it('renders 30-180 days verified_at string correctly', () => {
      const spot = createMockSpot({ verified_at: new Date('2024-02-15T00:00:00Z') });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Verified 2mo ago')).toBeInTheDocument();
    });

    it('renders > 180 days verified_at string correctly', () => {
      const spot = createMockSpot({ verified_at: new Date('2023-05-01T00:00:00Z') });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Last verified 12mo ago')).toBeInTheDocument();
    });

    it('falls back to check_date_wheelchair for verification date if verified_at is not available', () => {
      const spot = createMockSpot({ check_date_wheelchair: '2024-04-15' });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('Verified 16d ago')).toBeInTheDocument();
    });

    it('renders OSM tagged string correctly when untagged but capacity_disabled > 0', () => {
      const spot = createMockSpot({ capacity_disabled: 2 });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('OSM tagged · unverified')).toBeInTheDocument();
    });

    it('renders OSM tagged string correctly when untagged but van_accessible is true', () => {
      const spot = createMockSpot({ van_accessible: true });
      render(<SpotCard {...defaultProps} spot={spot} />);
      expect(screen.getByText('OSM tagged · unverified')).toBeInTheDocument();
    });
  });
});
