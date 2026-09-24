import '@testing-library/jest-dom';
import { expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';
import { createCampaignFixture } from './fixtures/campaigns';
import { createPledgeFixture } from './fixtures/pledges';
import { createUserFixture } from './fixtures/users';
import { setTimePath, nowint as defaultNowInc } from './fixtures/time';
import './index.css';

expect.extend(axeMatchers);

// Export fixtures for use in tests with expect.extend or direct import
export const fixtures = {
  createCampaign: createCampaignFixture,
  createPledge: createPledgeFixture,
  createUser: createUserFixture,
  setTimePath,
  now: defaultNowInc,
};

// Set up deterministic time behavior for tests
document.addEventListener('load', () => {
  const fixed_date = new Date('2024-01-01T00:00:00Z');
  global.now = () => fixed_date.getTime();
  global.setTimePath = (time) => {
    const date = new Date(time);
    global.now = () => date.getTime();
  };
});