import { valueToBigNumber } from '@aave/math-utils';
import { MaxUint256 } from '@ethersproject/constants';
import { ArrowDownIcon } from '@heroicons/react/outline';
import { ArrowNarrowRightIcon } from '@heroicons/react/solid';
import { Trans } from '@lingui/macro';
import { Box, ListItemText, ListSubheader, Stack, SvgIcon, Typography } from '@mui/material';
import { BigNumber } from 'bignumber.js';
import React, { useRef, useState } from 'react';
import { PriceImpactTooltip } from 'src/components/infoTooltips/PriceImpactTooltip';
import { FormattedNumber } from 'src/components/primitives/FormattedNumber';
import { TokenIcon } from 'src/components/primitives/TokenIcon';
import { Warning } from 'src/components/primitives/Warning';
import { Asset, AssetInput } from 'src/components/transactions/AssetInput';
import { TxModalDetails } from 'src/components/transactions/FlowCommons/TxModalDetails';
import { maxInputAmountWithSlippage } from 'src/hooks/paraswap/common';
import { useDebtSwitch } from 'src/hooks/paraswap/useDebtSwitch';
import { useModalContext } from 'src/hooks/useModal';
import { useWeb3Context } from 'src/libs/hooks/useWeb3Context';
import { ListSlippageButton } from 'src/modules/dashboard/lists/SlippageList';
import { useRootStore } from 'src/store/root';
import { assetCanBeBorrowedByUser } from 'src/utils/getMaxAmountAvailableToBorrow';

import {
  ComputedUserReserveData,
  ExtendedFormattedUser,
  useAppDataContext,
} from '../../../hooks/app-data-provider/useAppDataProvider';
import { ModalWrapperProps } from '../FlowCommons/ModalWrapper';
import { TxSuccessView } from '../FlowCommons/Success';
import { ParaswapErrorDisplay } from '../Warnings/ParaswapErrorDisplay';
import { DebtSwitchActions } from './DebtSwitchActions';
import { DebtSwitchModalDetails } from './DebtSwitchModalDetails';

export type SupplyProps = {
  underlyingAsset: string;
};

export interface GhoRange {
  qualifiesForDiscount: boolean;
  userBorrowApyAfterMaxSwitch: number;
  ghoApyRange?: [number, number];
  userDiscountTokenBalance: number;
  inputAmount: number;
  targetAmount: number;
  userCurrentBorrowApy: number;
  ghoVariableBorrowApy: number;
  userGhoAvailableToBorrowAtDiscount: number;
  ghoBorrowAPYWithMaxDiscount: number;
  userCurrentBorrowBalance: number;
}

interface SwitchTargetAsset extends Asset {
  variableApy: string;
}

enum ErrorType {
  INSUFFICIENT_LIQUIDITY,
}

export const DebtSwitchModalContent = ({
  poolReserve,
  userReserve,
  isWrongNetwork,
  user,
}: ModalWrapperProps & { user: ExtendedFormattedUser }) => {
  const { reserves } = useAppDataContext();
  const currentChainId = useRootStore((store) => store.currentChainId);
  const currentNetworkConfig = useRootStore((store) => store.currentNetworkConfig);
  const { currentAccount } = useWeb3Context();
  const { gasLimit, mainTxState, txError, setTxError } = useModalContext();

  let switchTargets = reserves
    .filter(
      (r) =>
        r.underlyingAsset !== poolReserve.underlyingAsset &&
        r.availableLiquidity !== '0' &&
        assetCanBeBorrowedByUser(r, user)
    )
    .map<SwitchTargetAsset>((reserve) => ({
      address: reserve.underlyingAsset,
      symbol: reserve.symbol,
      iconSymbol: reserve.iconSymbol,
      variableApy: reserve.variableBorrowAPY,
      priceInUsd: reserve.priceInUSD,
      decimals: reserve.decimals,
    }));

  switchTargets = [
    ...switchTargets.filter((r) => r.symbol === 'GHO'),
    ...switchTargets.filter((r) => r.symbol !== 'GHO'),
  ];

  // states
  const [_amount, setAmount] = useState('');
  const amountRef = useRef<string>('');
  const [targetReserve, setTargetReserve] = useState<Asset>(switchTargets[0]);
  const [maxSlippage, setMaxSlippage] = useState('0.1');

  const switchTarget = user.userReservesData.find(
    (r) => r.underlyingAsset === targetReserve.address
  ) as ComputedUserReserveData;

  const maxAmountToSwitch = userReserve.variableBorrows;

  const isMaxSelected = _amount === '-1';
  const amount = isMaxSelected ? maxAmountToSwitch : _amount;

  const {
    inputAmount,
    outputAmount,
    outputAmountUSD,
    error,
    loading: routeLoading,
    buildTxFn,
  } = useDebtSwitch({
    chainId: currentNetworkConfig.underlyingChainId || currentChainId,
    userAddress: currentAccount,
    swapOut: { ...poolReserve, amount: amountRef.current },
    swapIn: { ...switchTarget.reserve, amount: '0' },
    max: isMaxSelected,
    skip: mainTxState.loading || false,
    maxSlippage: Number(maxSlippage),
  });

  const loadingSkeleton = routeLoading && outputAmountUSD === '0';

  const handleChange = (value: string) => {
    const maxSelected = value === '-1';
    amountRef.current = maxSelected ? maxAmountToSwitch : value;
    setAmount(value);
    setTxError(undefined);
  };

  let availableBorrowCap = valueToBigNumber(MaxUint256.toString());
  let availableLiquidity: string | number = '0';
  availableBorrowCap =
    switchTarget.reserve.borrowCap === '0'
      ? valueToBigNumber(MaxUint256.toString())
      : valueToBigNumber(Number(switchTarget.reserve.borrowCap)).minus(
          valueToBigNumber(switchTarget.reserve.totalDebt)
        );
  availableLiquidity = switchTarget.reserve.formattedAvailableLiquidity;

  const availableLiquidityOfTargetReserve = BigNumber.max(
    BigNumber.min(availableLiquidity, availableBorrowCap),
    0
  );

  const poolReserveAmountUSD = Number(amount) * Number(poolReserve.priceInUSD);
  const targetReserveAmountUSD = Number(inputAmount) * Number(targetReserve.priceInUsd);

  const priceImpactDifference: number = targetReserveAmountUSD - poolReserveAmountUSD;
  const insufficientCollateral =
    Number(user.availableBorrowsUSD) === 0 ||
    priceImpactDifference > Number(user.availableBorrowsUSD);

  let blockingError: ErrorType | undefined = undefined;
  if (BigNumber(inputAmount).gt(availableLiquidityOfTargetReserve)) {
    blockingError = ErrorType.INSUFFICIENT_LIQUIDITY;
  }

  const BlockingError: React.FC = () => {
    switch (blockingError) {
      case ErrorType.INSUFFICIENT_LIQUIDITY:
        return (
          <Trans>
            There is not enough liquidity for the target asset to perform the switch. Try lowering
            the amount.
          </Trans>
        );
      default:
        return null;
    }
  };

  const maxAmountToReceiveWithSlippage = maxInputAmountWithSlippage(
    inputAmount,
    maxSlippage,
    targetReserve.decimals || 18
  );

  if (mainTxState.success)
    return (
      <TxSuccessView
        customAction={
          <Stack gap={3}>
            <Typography variant="description" color="text.primary">
              <Trans>You&apos;ve successfully swapped borrow position.</Trans>
            </Typography>
            <Stack direction="row" alignItems="center" justifyContent="center" gap={1}>
              <TokenIcon symbol={poolReserve.iconSymbol} sx={{ mx: 1 }} />
              <FormattedNumber value={amountRef.current} compact variant="subheader1" />
              {poolReserve.symbol}
              <SvgIcon color="primary" sx={{ fontSize: '14px', mx: 1 }}>
                <ArrowNarrowRightIcon />
              </SvgIcon>
              <TokenIcon symbol={switchTarget.reserve.iconSymbol} sx={{ mx: 1 }} />
              <FormattedNumber
                value={maxAmountToReceiveWithSlippage}
                compact
                variant="subheader1"
              />
              {switchTarget.reserve.symbol}
            </Stack>
          </Stack>
        }
      />
    );

  return (
    <>
      <AssetInput
        value={amount}
        onChange={handleChange}
        usdValue={poolReserveAmountUSD.toString()}
        symbol={poolReserve.symbol}
        assets={[
          {
            balance: maxAmountToSwitch,
            address: poolReserve.underlyingAsset,
            symbol: poolReserve.symbol,
            iconSymbol: poolReserve.iconSymbol,
          },
        ]}
        maxValue={maxAmountToSwitch}
        inputTitle={<Trans>Borrowed asset amount</Trans>}
        balanceText={
          <React.Fragment>
            <Trans>Borrow balance</Trans>
          </React.Fragment>
        }
        isMaxSelected={isMaxSelected}
      />
      <Box sx={{ padding: '18px', pt: '14px', display: 'flex', justifyContent: 'space-between' }}>
        <SvgIcon sx={{ fontSize: '18px !important' }}>
          <ArrowDownIcon />
        </SvgIcon>

        {/** For debt switch, targetAmountUSD (input) > poolReserveAmountUSD (output) means that more is being borrowed to cover the current borrow balance as exactOut, so this should be treated as positive impact */}
        <PriceImpactTooltip
          loading={loadingSkeleton}
          outputAmountUSD={targetReserveAmountUSD.toString()}
          inputAmountUSD={poolReserveAmountUSD.toString()}
        />
      </Box>
      <AssetInput<SwitchTargetAsset>
        value={inputAmount}
        onSelect={setTargetReserve}
        usdValue={targetReserveAmountUSD.toString()}
        symbol={targetReserve.symbol}
        assets={switchTargets}
        inputTitle={<Trans>Swap to</Trans>}
        balanceText={<Trans>Supply balance</Trans>}
        disableInput
        loading={loadingSkeleton}
        selectOptionHeader={<SelectOptionListHeader />}
        selectOption={(asset) => <SwitchTargetSelectOption asset={asset} />}
      />
      {error && !loadingSkeleton && (
        <Typography variant="helperText" color="error.main">
          {error}
        </Typography>
      )}
      {!error && blockingError !== undefined && (
        <Typography variant="helperText" color="error.main">
          <BlockingError />
        </Typography>
      )}

      <TxModalDetails
        gasLimit={gasLimit}
        slippageSelector={
          <ListSlippageButton
            selectedSlippage={maxSlippage}
            setSlippage={(newMaxSlippage) => {
              setTxError(undefined);
              setMaxSlippage(newMaxSlippage);
            }}
            slippageTooltipHeader={
              <Stack direction="row" gap={2} alignItems="center" justifyContent="space-between">
                <Trans>Maximum amount received</Trans>
                <Stack alignItems="end">
                  <Stack direction="row">
                    <TokenIcon
                      symbol={switchTarget.reserve.iconSymbol}
                      sx={{ mr: 1, fontSize: '14px' }}
                    />
                    <FormattedNumber value={maxAmountToReceiveWithSlippage} variant="secondary12" />
                  </Stack>
                </Stack>
              </Stack>
            }
          />
        }
      >
        <DebtSwitchModalDetails
          switchSource={userReserve}
          switchTarget={switchTarget}
          toAmount={inputAmount}
          fromAmount={amount === '' ? '0' : amount}
          loading={loadingSkeleton}
          sourceBalance={maxAmountToSwitch}
          sourceBorrowAPY={poolReserve.variableBorrowAPY}
          targetBorrowAPY={switchTarget.reserve.variableBorrowAPY}
        />
      </TxModalDetails>

      {txError && <ParaswapErrorDisplay txError={txError} />}

      {insufficientCollateral && (
        <Warning severity="error" sx={{ mt: 4 }}>
          <Typography variant="caption">
            <Trans>
              Insufficient collateral to cover new borrow position. Wallet must have borrowing power
              remaining to perform debt switch.
            </Trans>
          </Typography>
        </Warning>
      )}

      <DebtSwitchActions
        isMaxSelected={isMaxSelected}
        poolReserve={poolReserve}
        amountToSwap={outputAmount}
        amountToReceive={maxAmountToReceiveWithSlippage}
        isWrongNetwork={isWrongNetwork}
        targetReserve={switchTarget.reserve}
        symbol={poolReserve.symbol}
        blocked={blockingError !== undefined || error !== '' || insufficientCollateral}
        loading={routeLoading}
        buildTxFn={buildTxFn}
      />
    </>
  );
};

const SelectOptionListHeader = () => {
  return (
    <ListSubheader sx={(theme) => ({ borderBottom: `1px solid ${theme.palette.divider}`, mt: -1 })}>
      <Stack direction="row" sx={{ py: 4 }} gap={14}>
        <Typography variant="subheader2">
          <Trans>Select an asset</Trans>
        </Typography>
        <Typography variant="subheader2">
          <Trans>Borrow APY</Trans>
        </Typography>
      </Stack>
    </ListSubheader>
  );
};

const SwitchTargetSelectOption = ({ asset }: { asset: SwitchTargetAsset }) => {
  return (
    <>
      <TokenIcon
        aToken={asset.aToken}
        symbol={asset.iconSymbol || asset.symbol}
        sx={{ fontSize: '22px', mr: 1 }}
      />
      <ListItemText sx={{ mr: 6 }}>{asset.symbol}</ListItemText>
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'end' }}>
        <FormattedNumber
          value={asset.variableApy}
          percent
          variant="main14"
          color="text.secondary"
        />
        <Typography variant="helperText" color="text.secondary">
          <Trans>Variable rate</Trans>
        </Typography>
      </Box>
    </>
  );
};
