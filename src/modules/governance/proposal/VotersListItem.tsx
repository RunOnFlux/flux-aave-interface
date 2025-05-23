import { ExternalLinkIcon } from '@heroicons/react/solid';
import { Avatar, Box, SvgIcon, Typography } from '@mui/material';
import { blo } from 'blo';
import { FormattedNumber } from 'src/components/primitives/FormattedNumber';
import { Link } from 'src/components/primitives/Link';
import { ProposalVote } from 'src/hooks/governance/useProposalVotes';
import { useRootStore } from 'src/store/root';
import { GENERAL } from 'src/utils/events';

import { textCenterEllipsis } from '../../../helpers/text-center-ellipsis';
// import type { GovernanceVoter } from './VotersListContainer';

type EnhancedProposalVote = ProposalVote & {
  ensName?: string;
};

type VotersListItemProps = {
  compact: boolean;
  voter: EnhancedProposalVote;
};

export const VotersListItem = ({ compact, voter }: VotersListItemProps): JSX.Element | null => {
  const { voter: address, ensName } = voter;
  const blockieAvatar = blo(address !== '' ? (address as `0x${string}`) : '0x');
  const trackEvent = useRootStore((store) => store.trackEvent);

  // This function helps determine how to display either the address or ENS name, in a way where the list looks good and names are about equal length.
  // This takes into account if the list should be compact or not, and adjusts accordingly to keep items of about equal length.
  const displayName = (name?: string) => {
    if (compact) {
      // Addresses when compact
      if (!name) {
        return textCenterEllipsis(address, 3, 3);
      }
      // ENS names when compact
      const compactName = name.length <= 10 ? name : textCenterEllipsis(name, 4, 3);
      return compactName;
    }
    // Addresses
    if (!name) {
      return textCenterEllipsis(address, 9, 3);
    }
    // ENS names
    return name.length < 16 ? name : textCenterEllipsis(name, 12, 3);
  };

  // Voting power - Adjust decimals based off of large and small values.
  // Decimals increase in precision as values become lower:
  // Four for 0<n<1.
  // Three for 1<=n<10.
  // Two for 10<=n<1000.
  // Zero decimals for 1000<=n<Infinity.
  const displayVotingPower = Number(voter.votingPower);
  const displayVotingPowerDecimals =
    displayVotingPower < 1
      ? 4
      : displayVotingPower < 10
      ? 3
      : displayVotingPower < 1000 || displayVotingPower > 1000000
      ? 2
      : displayVotingPower > 100000
      ? 1
      : 0;

  // Don't show any results that come back with zero or negative voting power
  if (Number(voter.votingPower) <= 0) return null;

  return (
    <Box sx={{ my: 6, '&:first-of-type': { mt: 0 }, '&:last-of-type': { mb: 0 } }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center' }}>
          <Avatar src={blockieAvatar} sx={{ width: 24, height: 24, mr: 2 }} />
          <Link
            href={`https://etherscan.io/address/${address}`}
            onClick={() =>
              trackEvent(GENERAL.EXTERNAL_LINK, { funnel: 'AIP VOTERS', Link: 'Etherscan' })
            }
          >
            <Typography
              variant="subheader1"
              color="primary"
              sx={{ display: 'flex', alignItems: 'center' }}
            >
              {displayName(ensName)}
              <SvgIcon sx={{ width: 14, height: 14, ml: 0.5 }}>
                <ExternalLinkIcon />
              </SvgIcon>
            </Typography>
          </Link>
        </Box>
        <Box
          sx={{
            display: 'flex',
            flexGrow: 1,
            justifyContent: 'space-between',
            alignItems: 'center',
            maxWidth: compact ? 82 : 96,
          }}
        >
          <Typography variant="subheader1" color={voter.support ? 'success.main' : 'error.main'}>
            {voter.support ? 'YAE' : 'NAY'}
          </Typography>
          <FormattedNumber
            variant="subheader1"
            color="primary"
            value={displayVotingPower}
            visibleDecimals={displayVotingPowerDecimals}
            roundDown
          />
        </Box>
      </Box>
    </Box>
  );
};

export default VotersListItem;
