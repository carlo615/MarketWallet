// Copyright 2017-2021 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { NftCollectionInterface } from '@polkadot/react-hooks/useCollection';
import type { TokenAskType } from '@polkadot/react-hooks/useNftContract';
import type { TokenDetailsInterface } from '@polkadot/react-hooks/useToken';

import { useMachine } from '@xstate/react';
import BN from 'bn.js';
import { useCallback, useEffect, useMemo, useState } from 'react';

import envConfig from '@polkadot/apps-config/envConfig';
import { useKusamaApi, useNftContract, useToken } from '@polkadot/react-hooks';

import marketplaceStateMachine from './stateMachine';

const { commission, escrowAddress, kusamaDecimals } = envConfig;

type UserActionType = 'ASK_PRICE_FAIL' | 'BUY' | 'CANCEL' | 'SELL' | 'REVERT_UNUSED_MONEY' | 'UPDATE_TOKEN_STATE' | 'OFFER_TRANSACTION_FAIL' | 'SUBMIT_OFFER' | 'OFFER_TRANSACTION_SUCCESS';

export interface MarketplaceStagesInterface {
  cancelStep: boolean;
  deposited: BN | undefined;
  depositor: string | undefined;
  escrowAddress: string;
  error: string | null;
  formatKsmBalance: (value: BN | undefined) => string;
  getFee: (price: BN) => BN;
  getKusamaTransferFee: (recipient: string, value: BN) => Promise<BN | null>;
  kusamaAvailableBalance: BN | undefined;
  sendCurrentUserAction: (action: UserActionType) => void;
  setPrice: (price: BN) => void;
  setReadyToAskPrice: (ready: boolean) => void;
  setTokenPriceForSale: (price: BN) => void;
  setWithdrawAmount: (withdrawAmount: string) => void;
  tokenAsk: TokenAskType | undefined;
  tokenDepositor: string | undefined;
  tokenInfo: TokenDetailsInterface | undefined;
  tokenPriceForSale: BN | undefined;
  transferStep: number;
  readyToAskPrice: boolean;
  withdrawAmount: string;
}
// getApproved(uint256 tokenId) == youAddress

export const useMarketplaceStages = (account: string | undefined, ethAccount: string | undefined, collectionInfo: NftCollectionInterface | undefined, tokenId: string): MarketplaceStagesInterface => {
  const [state, send] = useMachine(marketplaceStateMachine);
  const [withdrawAmount, setWithdrawAmount] = useState<string>('0');
  const [tokenDepositor, setTokenDepositor] = useState<string>();
  const [tokenInfo, setTokenInfo] = useState<TokenDetailsInterface>();
  const { getTokenInfo } = useToken();
  const { addAsk, approveTokenToContract, buyToken, cancelAsk, deposited, depositor, getApproved, getTokenAsk, getUserDeposit, initCollectionAbi, isContractReady, tokenAsk, withdrawKSM } = useNftContract(account);
  const [error, setError] = useState<string | null>(null);
  const [readyToAskPrice, setReadyToAskPrice] = useState<boolean>(false);
  const [tokenPriceForSale, setTokenPriceForSale] = useState<BN>();
  const { formatKsmBalance, getKusamaTransferFee, kusamaAvailableBalance, kusamaTransfer } = useKusamaApi(account);

  console.log('state', state.value);

  const sendCurrentUserAction = useCallback((userAction: UserActionType) => {
    send(userAction);
  }, [send]);

  const loadingTokenInfo = useCallback(async () => {
    if (!collectionInfo) {
      return;
    }

    const info: TokenDetailsInterface = await getTokenInfo(collectionInfo, tokenId);

    setTokenInfo(info);

    const ask = await getTokenAsk(collectionInfo.id, tokenId);

    if (ask?.ownerAddr && ask.flagActive) {
      setTokenDepositor(ask.ownerAddr);
    } else {
      setTokenDepositor(undefined);
    }

    await getUserDeposit();

    // the token is mine
    if (info?.owner?.toString() === escrowAddress) {
      if (!ask || !ask.price || !ask.flagActive) {
        send('WAIT_FOR_DEPOSIT');

        return;
      }
    }

    send('WAIT_FOR_USER_ACTION');
  }, [collectionInfo, getTokenInfo, getUserDeposit, send, getTokenAsk, tokenId]);

  const getFee = useCallback((price: BN): BN => {
    const newPrice = price.mul(new BN(commission)).div(new BN(100));

    console.log('newPrice', newPrice.toString());

    return newPrice;
  }, []);

  /** user actions **/
  const sell = useCallback(async () => {
    // send token to eth mirror
    // approve tokenToContract
    // add ask
    if (collectionInfo) {
      const info: TokenDetailsInterface = await getTokenInfo(collectionInfo, tokenId);

      if (info?.owner?.Substrate === account) {
        send('IS_ON_SUB_ADDRESS');
      } else if (info?.owner?.Ethereum?.toLowerCase() === ethAccount) {
        send('IS_ON_ETH_ADDRESS');
      }
      // normalizeAccountId({ Ethereum: subToEth(seller.address) })
      // sellToken(collectionInfo.id, tokenId, () => console.log('fail!!!'), () => console.log('success!!!'));
      // approveTokenToContract(tokenId, () => console.log('fail!!!'),
      // () => addAsk(collectionInfo.id, tokenId, (10n ** 12n) * 10n, () => console.log('fail!!!'), () => console.log('success!!!')));
    }
  }, [account, collectionInfo, ethAccount, getTokenInfo, send, tokenId]);

  const approveToken = useCallback(async () => {
    if (collectionInfo) {
      const approved = await getApproved(tokenId);

      if (approved) {
        send('ALREADY_APPROVED');
      } else {
        approveTokenToContract(tokenId,
          () => send('SIGN_TRANSACTION_SUCCESS'),
          () => send('SIGN_TRANSACTION_FAIL'));
      }
    }
  }, [approveTokenToContract, collectionInfo, getApproved, send, tokenId]);

  // addAsk(collectionInfo.id, tokenId, (10n ** 12n) * 10n, () => console.log('fail!!!'), () => console.log('success!!!'))

  const waitForNftDeposit = useCallback(async () => {
    if (collectionInfo) {
      const ask = await getTokenAsk(collectionInfo.id, tokenId);

      if (ask?.ownerAddr === ethAccount) {
        send('NFT_DEPOSIT_READY');
      } else if (ask && ask.flagActive) {
        send('NFT_DEPOSIT_OTHER');
      } else {
        setTimeout(() => {
          void waitForNftDeposit();
        }, 5000);
      }
    }
  }, [collectionInfo, ethAccount, getTokenAsk, send, tokenId]);

  const waitForTokenRevert = useCallback(async () => {
    if (collectionInfo && ethAccount && account) {
      const info = await getTokenInfo(collectionInfo, tokenId);

      setTokenInfo(info);

      if (info?.owner?.Substrate === account || info?.owner?.Ethereum === ethAccount) {
        send('TOKEN_REVERT_SUCCESS');
      } else {
        if (info?.owner?.Ethereum?.toLowerCase() === ethAccount) {
          // revert to substratAccount
          console.log('ETH ACCOUNT');
          send('TOKEN_REVERT_SUCCESS');
        } else {
          setTimeout(() => {
            void waitForTokenRevert();
          }, 5000);
        }
      }
    }
  }, [account, ethAccount, collectionInfo, getTokenInfo, send, tokenId]);

  const depositNeeded = useCallback((userDeposit: BN, tokenPrice: BN): BN => {
    const feeFull = getFee(tokenPrice);
    const feePaid = getFee(userDeposit);
    const fee = feeFull.sub(feePaid);

    return tokenPrice.add(fee).sub(userDeposit);
  }, [getFee]);

  const isDepositEnough = useCallback((userDeposit: BN, tokenPrice: BN): boolean => {
    return !depositNeeded(userDeposit, tokenPrice).gtn(0);
  }, [depositNeeded]);

  const buy = useCallback(async () => {
    const userDeposit = await getUserDeposit();

    if (!tokenAsk || !userDeposit) {
      console.error('tokenAsk is undefined');

      send('WAIT_FOR_DEPOSIT');

      return;
    }

    console.log('userDeposit', userDeposit.toString(), 'tokenAsk.price', tokenAsk.price.toString(), 'isDepositEnough', isDepositEnough(userDeposit, tokenAsk.price));

    if (!isDepositEnough(userDeposit, tokenAsk.price)) {
      const needed = depositNeeded(userDeposit, tokenAsk.price);

      if (kusamaAvailableBalance?.lt(needed)) {
        const err = `Your KSM balance is too low: ${formatKsmBalance(kusamaAvailableBalance)} KSM. You need at least: ${formatKsmBalance(needed)} KSM`;

        setError(err);

        return;
      }

      kusamaTransfer(escrowAddress, needed, send, send);
    } else {
      send('WAIT_FOR_DEPOSIT');
    }
  }, [getUserDeposit, tokenAsk, isDepositEnough, send, depositNeeded, kusamaAvailableBalance, kusamaTransfer, formatKsmBalance]);

  const checkDepositReady = useCallback(async () => {
    const userDeposit = await getUserDeposit();

    if (userDeposit && tokenAsk && isDepositEnough(userDeposit, tokenAsk.price)) {
      send('DEPOSIT_SUCCESS');
    } else {
      setTimeout(() => {
        void checkDepositReady();
      }, 5000);
    }
  }, [getUserDeposit, isDepositEnough, send, tokenAsk]);

  const sentTokenToAccount = useCallback(() => {
    if (collectionInfo) {
      console.log('buyToken');

      buyToken(collectionInfo.id, tokenId, () => send('SEND_TOKEN_FAIL'), () => send('SEND_TOKEN_SUCCESS'));
    }
  }, [buyToken, collectionInfo, tokenId, send]);

  const revertMoney = useCallback(() => {
    const amount = parseFloat(withdrawAmount) * Math.pow(10, kusamaDecimals);

    withdrawKSM(amount, () => send('WITHDRAW_FAIL'), () => send('WITHDRAW_SUCCESS'));
  }, [send, withdrawKSM, withdrawAmount]);

  const checkAsk = useCallback(async () => {
    if (collectionInfo) {
      // check if we have ask
      const ask = await getTokenAsk(collectionInfo.id, tokenId);

      if (ask?.ownerAddr === ethAccount) {
        send('ASK_NOT_REGISTERED');
      } else {
        send('ASK_REGISTERED');
      }
    }
  }, [ethAccount, collectionInfo, getTokenAsk, send, tokenId]);

  const addTokenAsk = useCallback(() => {
    if (collectionInfo && tokenPriceForSale) {
      // (10n ** 12n) * 10n
      addAsk(collectionInfo.id, tokenId, tokenPriceForSale,
        () => send('SIGN_TRANSACTION_FAIL'),
        () => send('SIGN_TRANSACTION_SUCCESS'));
    }
  }, [addAsk, collectionInfo, send, tokenPriceForSale, tokenId]);

  const openAskModal = useCallback(() => {
    setReadyToAskPrice(true);
  }, []);

  const cancelSell = useCallback(() => {
    if (collectionInfo) {
      cancelAsk(collectionInfo.id, tokenId, () => send('CANCEL_SELL_FAIL'), () => send('CANCEL_SELL_SUCCESS'));
    }
    /* if (contractInstance && collectionInfo) {
      const extrinsic = contractInstance.tx.cancel({ gasLimit: maxGas, value: 0 }, collectionInfo.id, tokenId);

      queueTransaction(
        extrinsic,
        'CANCEL_SELL_FAIL',
        'cancelSell start',
        'CANCEL_SELL_SUCCESS',
        'cancelSell update'
      );
    } */
  }, [cancelAsk, collectionInfo, send, tokenId]);

  const setPrice = useCallback((price: BN) => {
    setTokenPriceForSale(price);
    setReadyToAskPrice(false);
    send('ASK_FILLED');
  }, [send]);

  const transferStep = useMemo((): number => {
    switch (state.value) {
      case 'sell':
      case 'waitForSignTransfer':
        return 1;
      case 'waitForNftDeposit':
        return 2;
      case 'askPrice':
      case 'registerSale':
        return 3;
      case 'buy':
        return 4;
      case 'checkDepositReady':
        return 5;
      case 'sentTokenToNewOwner':
      case 'waitForSignTokenBuy':
      case 'waitForTokenOwn':
        return 6;
      default:
        return 0;
    }
  }, [state.value]);

  const cancelStep = useMemo((): boolean => {
    return state.matches('cancelSell') || state.matches('waitForTokenRevert');
  }, [state]);

  const updateTokenInfo = useCallback(async () => {
    if (!collectionInfo) {
      return;
    }

    const info: TokenDetailsInterface = await getTokenInfo(collectionInfo, tokenId);

    setTokenInfo(info);
  }, [collectionInfo, getTokenInfo, tokenId]);

  const updateTokenAsk = useCallback(() => {
    if (collectionInfo) {
      void getTokenAsk(collectionInfo.id, tokenId);
    }
  }, [collectionInfo, getTokenAsk, tokenId]);

  useEffect(() => {
    switch (true) {
      // on load - update token state
      case state.matches('loadingTokenInfo'):
        void loadingTokenInfo();
        break;
      case state.matches('sell'):
        void sell();
        break;
      case state.matches('approveToken'):
        void approveToken();
        break;
      case state.matches('checkAsk'):
        void checkAsk();
        break;
      case state.matches('addAsk'):
        void addTokenAsk();
        break;
      case state.matches('openAskModal'):
        void openAskModal();
        break;
      case state.matches('revertMoney'):
        void revertMoney();
        break;
      case state.matches('cancelSell'):
        void cancelSell();
        break;
      case state.matches('waitForTokenRevert'):
      case state.matches('waitForTokenOwn'):
        void waitForTokenRevert();
        break;
      default:
        break;
    }
  }, [addTokenAsk, approveToken, checkAsk, openAskModal, state.value, state, cancelSell, revertMoney, waitForTokenRevert, sentTokenToAccount, sell, loadingTokenInfo]);

  useEffect(() => {
    switch (true) {
      // on load - update token state
      case state.matches('buy'):
        void buy(); // occurs unexpected change of ref (in deps)
        break;
      case state.matches('waitForNftDeposit'):
        void waitForNftDeposit(); // occurs unexpected change of ref (in deps)
        break;
      case state.matches('checkDepositReady'):
        void checkDepositReady(); // occurs unexpected change of ref (in deps)
        break;
      default:
        break;
    }
  }, [state.value, state, buy, waitForNftDeposit, checkDepositReady]);

  useEffect(() => {
    if (isContractReady) {
      send('UPDATE_TOKEN_STATE');
    }
  }, [send, isContractReady]);

  useEffect(() => {
    updateTokenAsk();
  }, [updateTokenAsk]);

  useEffect(() => {
    void updateTokenInfo();
  }, [updateTokenInfo]);

  useEffect(() => {
    if (collectionInfo) {
      initCollectionAbi(collectionInfo.id);
    }
  }, [collectionInfo, initCollectionAbi]);

  return {
    cancelStep,
    deposited,
    depositor,
    error,
    escrowAddress,
    formatKsmBalance,
    getFee,
    getKusamaTransferFee,
    kusamaAvailableBalance,
    readyToAskPrice,
    sendCurrentUserAction,
    setPrice,
    setReadyToAskPrice,
    setTokenPriceForSale,
    setWithdrawAmount,
    tokenAsk,
    tokenDepositor,
    tokenInfo,
    tokenPriceForSale,
    transferStep,
    withdrawAmount
  };
};
