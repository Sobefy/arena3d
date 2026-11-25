// Display colours per price tier (the data has names and prices, not colours).
// Every seat is blue moulded plastic; tiers are shades of that blue, a little lighter in the upper bowl. The Vice City palette carries the rest of the venue.
import type { TierId } from './types';

export const PALETTE = {
  deepViolet: '#3B146B', purple: '#7B208F', magenta: '#C9349B', coralPink: '#F36A78', coral: '#F87572', orange: '#FF9B55', warmYellow: '#FFB458',
  darkBlue: '#0C1238', // added for contrast: structure, sold seats, the page
};

export const TIER_COLORS: Record<TierId, string> = {
  P1: '#4F86EE',   // Floor Front (concert set-up)
  P1B: '#4578DA',  // Floor Rear
  P2: '#4A8FF7',   // Lower Center
  P3: '#4384EA',   // Lower Corner
  P4: '#3D79DC',   // Lower Side-Stage
  P5: '#62A3FF',   // Upper Center
  P6: '#5897F4',   // Upper Corner
  P7: '#4F8BE8',   // Upper Side-Stage
  X: '#141B40',    // Closed
};

export const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
