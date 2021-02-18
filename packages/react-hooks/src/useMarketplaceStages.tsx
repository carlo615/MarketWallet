// Copyright 2017-2021 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SubmittableExtrinsic } from '@polkadot/api/promise/types';

import { useMachine } from '@xstate/react';
import BN from 'bn.js';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { StatusContext } from '@polkadot/react-components/Status';
import { useApi, useBalance, useCollections, useNftContract } from '@polkadot/react-hooks';

import marketplaceStateMachine from './stateMachine';

type UserActionType = 'BUY' | 'CANCEL' | 'SALE' | 'REVERT_UNUSED_MONEY' | 'UPDATE_TOKEN_STATE';

export interface MarketplaceStagesInterface {
  cancelSale: () => void;
  deposited: number | undefined;
  error: string | null;
  sendCurrentUserAction: (action: UserActionType) => void;
  setPrice: (price: string) => void;
  tokenInfo: any;
  tokenContractInfo: { price: string; owner: string } | undefined;
  tokenPriceForSale: number | undefined;
  transferStep: number;
  readyToAskPrice: boolean;
  setTokenPriceForSale: (price: number) => void;
  submitTokenPrice: () => void;
}

// 0 == user owns token, no offers placed
// 1 == user pressed Trade button
// 2 == token sent to vault, waiting for deposit (ownership cannot be determined)
// 3 == deposit ready, user can place ask
// 4 == Ask placed, user can cancel
// 5 == Someone else owns token, no offers placed
// 6 == Token is for sale, can buy
// 7 == User pressed buy button, should deposit KSM
// 8 == User deposited KSM, waiting to register
// 9 == KSM deposited, Can sign buy transaction

// type saleStage = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10';

export const useMarketplaceStages = (account: string, collectionId: string, tokenId: string): MarketplaceStagesInterface => {
  const { api } = useApi();
  const [state, send] = useMachine(marketplaceStateMachine);
  const [tokenInfo, setTokenInfo] = useState<any | null | undefined>();
  const { getDetailedTokenInfo, getDetailedRefungibleTokenInfo } = useCollections();
  const { abi, contractAddress, contractInstance, decimals, deposited, getDepositor, getTokenAsk, isContractReady, maxGas, value, vaultAddress } = useNftContract(account);
  const { balance } = useBalance(account);
  const [error, setError] = useState<string | null>(null);
  const { queueExtrinsic } = useContext(StatusContext);
  const [readyToAskPrice, setReadyToAskPrice] = useState<boolean>(false);
  const [tokenPriceForSale, setTokenPriceForSale] = useState<number>();
  const [tokenContractInfo, setTokenContractInfo] = useState<{ owner: string, price: string }>();

  const sendCurrentUserAction = useCallback((userAction: UserActionType) => {
    send(userAction);
  }, [send]);

  const getFee = useCallback((price: number): number => {
    if (price <= 0.001) {
      return 0;
    }

    if (price < 0.01) {
      return price + 0.01;
    }

    return price * 0.02;
  }, []);

  const queueTransaction = useCallback((transaction: SubmittableExtrinsic, fail: string, start: string, success: string, update: string) => {
    queueExtrinsic({
      accountId: account && account.toString(),
      extrinsic: transaction,
      isUnsigned: false,
      txFailedCb: () => send(fail),
      txStartCb: () => send(start),
      txSuccessCb: () => send(success),
      txUpdateCb: () => send(update)
    });
  }, [account, queueExtrinsic, send]);

  /** user actions **/
  const sale = useCallback(() => {
    // checkBalance(nft, owner) - is nft on balance/ is balance > fee?
    // deposit nft to contract
    queueTransaction(
      api.tx.nft
        .transfer(contractAddress, collectionId, tokenId, 0),
      'TRANSFER_NFT_TO_CONTRACT_FAIL',
      'deposit nft to contract start',
      'TRANSFER_NFT_TO_CONTRACT_SUCCESS',
      'deposit nft to contract update'
    );
  }, [api.tx.nft, collectionId, queueTransaction, tokenId]);

  const buy = useCallback(() => {
    console.log('buy');

    // send deposit to contract
    // Check if KSM deposit is needed and deposit
    if (!tokenContractInfo) {
      console.error('tokenContractInfo is undefined');

      return;
    }

    if (!deposited) {
      console.error('deposited is undefined');

      return;
    }

    const price = parseFloat(tokenContractInfo.price);
    const depositedNumber = deposited.toNumber();
    const feeFull = getFee(price);
    const feePaid = getFee(depositedNumber);

    if (depositedNumber < price) {
      const fee = feeFull - feePaid;
      const needed = price + fee - depositedNumber;

      if (balance?.free.ltn(needed)) {
        setError(`Your KSM balance is too low: ${balance?.free.toNumber()}. You need at least: ${needed} KSM`);

        return;
      }

      queueTransaction(
        api.tx.balances
          .transfer(vaultAddress, needed),
        'SEND_MONEY_FAIL',
        'transfer start',
        'SEND_MONEY_SUCCESS',
        'transfer update'
      );
    }
    // buyStep3
  }, [api.tx.balances, balance?.free, deposited, getFee, queueTransaction, tokenContractInfo]);

  const checkDepositReady = useCallback(() => {
    setTimeout(() => {
      send('DEPOSIT_SUCCESS');
    }, 1000);
  }, [send]);

  const sentTokenToAccount = useCallback(() => {
    console.log('sentTokenToNewOwner');
    setTimeout(() => {
      send('DEPOSIT_SUCCESS');
    }, 1000);
    // tokenId, newOwner (account)

    if (abi) {
      queueTransaction(
        api.tx.contracts
          .call(contractAddress, value, maxGas, contractInstance?.abi.messages.buy(collectionId, tokenId)),
        'SEND_TOKEN_FAIL',
        'send token to account start',
        'SEND_TOKEN_SUCCESS',
        'send token to account update'
      );
    }
  }, [account, abi, api, queueTransaction]);

  const revertMoney = useCallback(async () => {
    setTimeout(() => {
      send('TRANSFER_NFT_TO_CONTRACT_SUCCESS');
    }, 1000);
    /* При исполнении сделки, нужно посылать только сумму, указанную в withdraw.
    При снятии неиспользованных средств нужно также возмещать комиссию marketplace за вычетом комиссии сети Kusama (0.0027 KSM).
     */

    const expectedCommission = new BN(10).pow(decimals);
    const balance = deposited || new BN(0);
    const balanceToSend = balance.iadd(expectedCommission).integerValue(BN.ROUND_DOWN);

    queueExtrinsic({
      accountId: account && account.toString(),
      extrinsic: api.tx.contracts
        .call(contractAddress, value, maxGas, contractInstance?.abi.messages.withdraw(2, deposited)),
      isUnsigned: false,
      txFailedCb: () => send('TRANSFER_NFT_TO_CONTRACT_FAIL'),
      txStartCb: () => console.log('deposit nft to contract start'),
      txSuccessCb: () => send('TRANSFER_NFT_TO_CONTRACT_SUCCESS'),
      txUpdateCb: () => console.log('deposit nft to contract update')
    });
  }, [deposited, queueExtrinsic, account, api.tx.contracts, value, contractInstance?.abi.messages, send]);

  const registerDeposit = useCallback(async () => {
    const address = await getDepositor(collectionId, tokenId, account);

    console.log('address', address);

    if (address === account) {
      // depositor is me
      send('NFT_DEPOSIT_READY');
    } else {
      send('NFT_DEPOSIT_FAIL');
    }
  }, [account, collectionId, getDepositor, send, tokenId]);

  const getDepositReady = useCallback(async () => {
    setTimeout(() => {
      send('NFT_DEPOSIT_READY');
    }, 1000);
  }, [send]);

  const submitTokenPrice = useCallback(() => {
    /* if (tokenPriceForSale && ((tokenPriceForSale < 0.01) || (tokenPriceForSale > 10000)))`
      Sorry, price should be in the range between 0.01 and 10000 KSM. You have input: ${price}
    `; */
    send('ASK_PRICE_SUCCESS');
  }, [send]);

  const askPrice = useCallback(() => {
    setReadyToAskPrice(true);
  }, [setReadyToAskPrice]);

  const registerSale = useCallback(() => {
    setTimeout(() => {
      send('REGISTER_SALE_SUCCESS');
    }, 1000);
    //  // Transaction #2: Invoke ask method on market contract to set the price
    //     await this.askAsync(punkId, priceBN.toString(), ownerAddress);
    /*queueExtrinsic({
      accountId: account && account.toString(),
      extrinsic: api.tx.contracts
        .call(contractAddress, value, maxGas, contractInstance?.abi.messages.ask(collectionId, tokenId, 2, tokenPriceForSale)),
      isUnsigned: false,
      txFailedCb: () => send('REGISTER_SALE_FAIL'),
      txStartCb: () => console.log('registerSale start'),
      txSuccessCb: () => send('REGISTER_SALE_SUCCESS'),
      txUpdateCb: () => console.log('registerSale update')
    });*/
  }, [account, api, collectionId, tokenId]);

  const cancelSale = useCallback(() => {
    setTimeout(() => {
      send('CANCEL_SALE_SUCCESS');
    }, 1000);
    // cancelAsync(punkId, punk.owner)
    /* queueExtrinsic({
      accountId: account && account.toString(),
      extrinsic: api.tx.contracts
        .call(contractAddress, value, maxGas, contractInstance?.abi.messages.cancel(collectionId, tokenId)),
      isUnsigned: false,
      txFailedCb: () => send('CANCEL_SALE_FAIL'),
      txStartCb: () => console.log('cancelSale start'),
      txSuccessCb: () => send('CANCEL_SALE_SUCCESS'),
      txUpdateCb: () => console.log('cancelSale update')
    }); */
  }, [account, api, collectionId, tokenId]);

  const setPrice = useCallback((price) => {
    setTokenPriceForSale(price);
    setReadyToAskPrice(false);
    send('ASK_PRICE_SUCCESS');
  }, [send]);

  const transferStep = useMemo((): number => {
    switch (state.value) {
      case 'sale':
        return 1;
      case 'registerDeposit':
        return 2;
      case 'getDepositReady':
        return 3;
      case 'askPrice':
        return 4;
      case 'registerSale':
        return 5;
      default:
        return 0;
    }
  }, [state.value]);

  const loadCancelSaleStage = useCallback(async (token) => {
    const isContractOwner = token.Owner === contractAddress;

    if (isContractOwner) {
      const ask = await getTokenAsk(collectionId, tokenId);

      console.log('ask: "', ask);

      if (ask) {
        setTokenContractInfo(ask);
      }
    }
  }, [contractAddress, getTokenAsk, collectionId, tokenId]);

  const loadingTokenInfo = useCallback(async () => {
    // for re-fungible await getDetailedRefungibleTokenInfo(collectionId, tokenId);
    const tokenInfo = await getDetailedTokenInfo(collectionId, tokenId);

    setTokenInfo(tokenInfo);

    await loadCancelSaleStage(tokenInfo);

    await registerDeposit();
  }, [getDetailedTokenInfo, collectionId, tokenId, loadCancelSaleStage, registerDeposit]);

  useEffect(() => {
    void getTokenAsk(collectionId, tokenId);
  }, [getTokenAsk, collectionId, tokenId]);

  useEffect(() => {
    switch (true) {
      // on load - update token state
      case state.matches('loadingTokenInfo'):
        void loadingTokenInfo();
        break;
      case state.matches('buy'):
        void buy();
        break;
      case state.matches('sale'):
        void sale();
        break;
      case state.matches('sentTokenToNewOwner'):
        void sentTokenToAccount();
        break;
      case state.matches('registerDeposit'):
        void registerDeposit();
        break;
      case state.matches('getDepositReady'):
        void getDepositReady();
        break;
      case state.matches('askPrice'):
        void askPrice();
        break;
      case state.matches('registerSale'):
        void registerSale();
        break;
      case state.matches('revertMoney'):
        void revertMoney();
        break;
      case state.matches('checkDepositReady'):
        void checkDepositReady();
        break;
      case state.matches('cancelSale'):
        void cancelSale();
        break;
      default:
        break;
    }
  }, [state.value, loadingTokenInfo]);

  useEffect(() => {
    console.log('isContractReady', isContractReady);

    if (isContractReady) {
      send('UPDATE_TOKEN_STATE');
    }
  }, [send, isContractReady]);

  console.log('state.value', state.value);

  return {
    cancelSale,
    deposited,
    error,
    sendCurrentUserAction,
    setPrice,
    tokenInfo,
    tokenContractInfo,
    tokenPriceForSale,
    transferStep,
    readyToAskPrice,
    setTokenPriceForSale,
    submitTokenPrice
  };
};
