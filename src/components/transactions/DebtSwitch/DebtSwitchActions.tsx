import {
  ApproveDelegationType,
  gasLimitRecommendations,
  ProtocolAction,
} from '@aave/contract-helpers';
import { SignatureLike } from '@ethersproject/bytes';
import { Trans } from '@lingui/macro';
import { BoxProps } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { parseUnits } from 'ethers/lib/utils';
import { useCallback, useEffect, useState } from 'react';
import { MOCK_SIGNED_HASH } from 'src/helpers/useTransactionHandler';
import { ComputedReserveData } from 'src/hooks/app-data-provider/useAppDataProvider';
import { calculateSignedAmount, SwapTransactionParams } from 'src/hooks/paraswap/common';
import { useModalContext } from 'src/hooks/useModal';
import { useWeb3Context } from 'src/libs/hooks/useWeb3Context';
import { useRootStore } from 'src/store/root';
import { ApprovalMethod } from 'src/store/walletSlice';
import { getErrorTextFromError, TxAction } from 'src/ui-config/errorMapping';
import { queryKeysFactory } from 'src/ui-config/queries';
import { useShallow } from 'zustand/shallow';

import { TxActionsWrapper } from '../TxActionsWrapper';
import { APPROVE_DELEGATION_GAS_LIMIT, checkRequiresApproval } from '../utils';

interface DebtSwitchBaseProps extends BoxProps {
  amountToSwap: string;
  amountToReceive: string;
  poolReserve: ComputedReserveData;
  targetReserve: ComputedReserveData;
  isWrongNetwork: boolean;
  customGasPrice?: string;
  symbol?: string;
  blocked?: boolean;
  isMaxSelected: boolean;
  loading?: boolean;
  signatureParams?: SignedParams;
}

export interface DebtSwitchActionProps extends DebtSwitchBaseProps {
  augustus: string;
  txCalldata: string;
}

interface SignedParams {
  signature: SignatureLike;
  deadline: string;
  amount: string;
}

export const DebtSwitchActions = ({
  amountToSwap,
  amountToReceive,
  isWrongNetwork,
  sx,
  poolReserve,
  targetReserve,
  isMaxSelected,
  loading,
  blocked,
  buildTxFn,
}: DebtSwitchBaseProps & { buildTxFn: () => Promise<SwapTransactionParams> }) => {
  const [
    getCreditDelegationApprovedAmount,
    currentMarketData,
    generateApproveDelegation,
    estimateGasLimit,
    addTransaction,
    debtSwitch,
    walletApprovalMethodPreference,
    generateCreditDelegationSignatureRequest,
  ] = useRootStore(
    useShallow((state) => [
      state.getCreditDelegationApprovedAmount,
      state.currentMarketData,
      state.generateApproveDelegation,
      state.estimateGasLimit,
      state.addTransaction,
      state.debtSwitch,
      state.walletApprovalMethodPreference,
      state.generateCreditDelegationSignatureRequest,
    ])
  );
  const {
    approvalTxState,
    mainTxState,
    loadingTxns,
    setMainTxState,
    setTxError,
    setGasLimit,
    setLoadingTxns,
    setApprovalTxState,
  } = useModalContext();
  const { sendTx, signTxData } = useWeb3Context();
  const queryClient = useQueryClient();
  const [requiresApproval, setRequiresApproval] = useState<boolean>(false);
  const [approvedAmount, setApprovedAmount] = useState<ApproveDelegationType | undefined>();
  const [useSignature, setUseSignature] = useState(false);
  const [signatureParams, setSignatureParams] = useState<SignedParams | undefined>();

  const approvalWithSignatureAvailable = currentMarketData.v3;

  useEffect(() => {
    const preferSignature = walletApprovalMethodPreference === ApprovalMethod.PERMIT;
    setUseSignature(preferSignature);
  }, [walletApprovalMethodPreference]);

  const approval = async () => {
    try {
      if (requiresApproval && approvedAmount) {
        const approveDelegationAmount = calculateSignedAmount(
          amountToReceive,
          targetReserve.decimals,
          0.25
        );
        if (useSignature && approvalWithSignatureAvailable) {
          const deadline = Math.floor(Date.now() / 1000 + 3600).toString();
          const signatureRequest = await generateCreditDelegationSignatureRequest({
            underlyingAsset: targetReserve.variableDebtTokenAddress,
            deadline,
            amount: approveDelegationAmount,
            spender: currentMarketData.addresses.DEBT_SWITCH_ADAPTER ?? '',
          });
          const response = await signTxData(signatureRequest);
          setSignatureParams({ signature: response, deadline, amount: approveDelegationAmount });
          setApprovalTxState({
            txHash: MOCK_SIGNED_HASH,
            loading: false,
            success: true,
          });
        } else {
          let approveDelegationTxData = generateApproveDelegation({
            debtTokenAddress: targetReserve.variableDebtTokenAddress,
            delegatee: currentMarketData.addresses.DEBT_SWITCH_ADAPTER ?? '',
            amount: approveDelegationAmount,
          });
          setApprovalTxState({ ...approvalTxState, loading: true });
          approveDelegationTxData = await estimateGasLimit(approveDelegationTxData);
          const response = await sendTx(approveDelegationTxData);
          await response.wait(1);
          setApprovalTxState({
            txHash: response.hash,
            loading: false,
            success: true,
          });
          addTransaction(response.hash, {
            action: ProtocolAction.approval,
            txState: 'success',
            asset: targetReserve.variableDebtTokenAddress,
            amount: approveDelegationAmount,
            assetName: 'varDebt' + targetReserve.name,
            spender: currentMarketData.addresses.DEBT_SWITCH_ADAPTER,
          });
          setTxError(undefined);
          fetchApprovedAmount(true);
        }
      }
    } catch (error) {
      const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
      setTxError(parsedError);
      if (!approvalTxState.success) {
        setApprovalTxState({
          txHash: undefined,
          loading: false,
        });
      }
    }
  };
  const action = async () => {
    try {
      setMainTxState({ ...mainTxState, loading: true });
      const route = await buildTxFn();
      let debtSwitchTxData = debtSwitch({
        poolReserve,
        targetReserve,
        amountToReceive: parseUnits(amountToReceive, targetReserve.decimals).toString(),
        amountToSwap: parseUnits(amountToSwap, poolReserve.decimals).toString(),
        isMaxSelected,
        txCalldata: route.swapCallData,
        augustus: route.augustus,
        signatureParams,
        isWrongNetwork,
      });
      debtSwitchTxData = await estimateGasLimit(debtSwitchTxData);
      const response = await sendTx(debtSwitchTxData);
      await response.wait(1);
      setMainTxState({
        txHash: response.hash,
        loading: false,
        success: true,
      });
      addTransaction(response.hash, {
        action: 'debtSwitch',
        txState: 'success',
        previousState: `${route.outputAmount} variable ${poolReserve.symbol}`,
        newState: `${route.inputAmount} variable ${targetReserve.symbol}`,
      });

      queryClient.invalidateQueries({ queryKey: queryKeysFactory.pool });
      queryClient.invalidateQueries({ queryKey: queryKeysFactory.gho });
    } catch (error) {
      const parsedError = getErrorTextFromError(error, TxAction.GAS_ESTIMATION, false);
      setTxError(parsedError);
      setMainTxState({
        txHash: undefined,
        loading: false,
      });
    }
  };

  // callback to fetch approved credit delegation amount and determine execution path on dependency updates
  const fetchApprovedAmount = useCallback(
    async (forceApprovalCheck?: boolean) => {
      // Check approved amount on-chain on first load or if an action triggers a re-check such as an approveDelegation being confirmed
      let approval = approvedAmount;
      if (approval === undefined || forceApprovalCheck) {
        setLoadingTxns(true);
        approval = await getCreditDelegationApprovedAmount({
          debtTokenAddress: targetReserve.variableDebtTokenAddress,
          delegatee: currentMarketData.addresses.DEBT_SWITCH_ADAPTER ?? '',
        });
        setApprovedAmount(approval);
      } else {
        setRequiresApproval(false);
        setApprovalTxState({});
      }

      if (approval) {
        const fetchedRequiresApproval = checkRequiresApproval({
          approvedAmount: approval.amount,
          amount: amountToReceive,
          signedAmount: '0',
        });
        setRequiresApproval(fetchedRequiresApproval);
        if (fetchedRequiresApproval) setApprovalTxState({});
      }

      setLoadingTxns(false);
    },
    [
      approvedAmount,
      setLoadingTxns,
      getCreditDelegationApprovedAmount,
      targetReserve.variableDebtTokenAddress,
      currentMarketData.addresses.DEBT_SWITCH_ADAPTER,
      setApprovalTxState,
      amountToReceive,
    ]
  );

  // Run on first load and when the target reserve changes
  useEffect(() => {
    if (amountToSwap === '0') return;

    if (!approvedAmount) {
      fetchApprovedAmount();
    } else if (approvedAmount.debtTokenAddress !== targetReserve.variableDebtTokenAddress) {
      fetchApprovedAmount(true);
    }
  }, [amountToSwap, approvedAmount, fetchApprovedAmount, targetReserve.variableDebtTokenAddress]);

  // Update gas estimation
  useEffect(() => {
    let switchGasLimit = 0;
    switchGasLimit = Number(gasLimitRecommendations[ProtocolAction.borrow].recommended);
    if (requiresApproval && !approvalTxState.success) {
      switchGasLimit += Number(APPROVE_DELEGATION_GAS_LIMIT);
    }
    setGasLimit(switchGasLimit.toString());
  }, [requiresApproval, approvalTxState, setGasLimit]);

  return (
    <TxActionsWrapper
      mainTxState={mainTxState}
      approvalTxState={approvalTxState}
      isWrongNetwork={isWrongNetwork}
      preparingTransactions={loadingTxns}
      handleAction={action}
      requiresAmount
      amount={amountToSwap}
      handleApproval={() => approval()}
      requiresApproval={requiresApproval}
      actionText={<Trans>Swap</Trans>}
      actionInProgressText={<Trans>Swapping</Trans>}
      sx={sx}
      fetchingData={loading}
      errorParams={{
        loading: false,
        disabled: blocked || !approvalTxState?.success,
        content: <Trans>Swap</Trans>,
        handleClick: action,
      }}
      blocked={blocked}
      tryPermit={approvalWithSignatureAvailable}
    />
  );
};
