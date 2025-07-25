import { RequestedTokens, tokenSet } from 'cypress/support/helpers/token.helper';

import assets from '../../../fixtures/assets.json';
import { skipState } from '../../../support/steps/common';
import { configEnvWithTenderlyAvalancheFork } from '../../../support/steps/configuration.steps';
import { claimReward, withdraw } from '../../../support/steps/main.steps';
import { rewardIsNotAvailable } from '../../../support/steps/verification.steps';

const tokensToRequest: RequestedTokens = {
  aAVAXAvalancheV3: 1000,
};

const testData = {
  withdraw: {
    asset: assets.avalancheMarket.AVAX,
    isCollateral: true,
    amount: 2000,
    hasApproval: false,
  },
  claimReward: {
    asset: assets.avalancheMarket.WAVAX,
  },
};

describe('REWARD, AVALANCHE V3 MARKET, INTEGRATION SPEC', () => {
  const skipTestState = skipState(false);
  configEnvWithTenderlyAvalancheFork({
    market: 'fork_proto_avalanche_v3',
    v3: true,
    tokens: tokenSet(tokensToRequest),
  });
  claimReward(testData.claimReward, skipTestState, true);
  withdraw(testData.withdraw, skipTestState, true);
  claimReward(testData.claimReward, skipTestState, true);
  rewardIsNotAvailable(skipTestState);
});
