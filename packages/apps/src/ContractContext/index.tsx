// Copyright 2017-2021 @polkadot/react-api authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import envConfig from '@polkadot/apps-config/envConfig';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import marketplaceAbi from '@polkadot/react-hooks/abi/marketPlaceAbi.json';
import { formatKsmBalance } from '@polkadot/react-hooks/useKusamaApi';
import { TokenAskType } from '@polkadot/react-hooks/useNftContract';
import { subToEth } from '@polkadot/react-hooks/utils';
import { evmToAddress } from '@polkadot/util-crypto';

import ContractContext from './ContractContext';

const { contractAddress, minPrice, uniqueSubstrateApiRpc } = envConfig;

export type MarketplaceAbiMethods = {
  addAsk: (price: string, currencyCode: string, address: string, tokenId: string) => {
    encodeABI: () => any;
  },
  balanceKSM: (ethAddress: string) => {
    call: () => Promise<string>;
  };
  buyKSM: (collectionAddress: string, tokenId: string, buyer: string, receiver: string) => {
    encodeABI: () => any;
  };
  cancelAsk: (collectionId: string, tokenId: string) => {
    encodeABI: () => any;
  };
  depositKSM: (price: number) => {
    encodeABI: () => any;
  },
  getOrder: (collectionId: string, tokenId: string) => {
    call: () => Promise<TokenAskType>;
  };
  getOrdersLen: () => {
    call: () => Promise<number>;
  },
  orders: (orderNumber: number) => {
    call: () => Promise<TokenAskType>;
  },
  setEscrow: (escrow: string) => {
    encodeABI: () => any;
  },
  // (amount: string, currencyCode: string, address: string) => any;
  withdraw: (amount: string, currencyCode: string, address: string) => {
    encodeABI: () => any;
  };
}

interface Props {
  account?: string;
  children: React.ReactNode;
}

function Contracts ({ account, children }: Props): React.ReactElement<Props> | null {
  const [matcherContractInstance, setMatcherContractInstance] = useState<Contract | null>(null);
  const [evmCollectionInstance, setEvmCollectionInstance] = useState<Contract | null>(null);
  const [deposited, setDeposited] = useState<BN>();
  const [web3Instance, setWeb3Instance] = useState<Web3>();
  const [ethAccount, setEthAccount] = useState<string>();
  const abiRef = useRef<Contract>();

  const getUserDeposit = useCallback(async (): Promise<BN | null> => {
    try {
      if (ethAccount && matcherContractInstance) {
        const result = await (matcherContractInstance.methods as MarketplaceAbiMethods).balanceKSM(ethAccount).call();

        if (result) {
          const deposit = new BN(result);

          Number(formatKsmBalance(deposit)) > minPrice ? localStorage.setItem('deposit', JSON.stringify(result)) : localStorage.removeItem('deposit');

          setDeposited(deposit);

          return deposit;
        }
      }

      return null;
    } catch (e) {
      console.log('getUserDeposit Error: ', e);

      return null;
    }
  }, [ethAccount, matcherContractInstance, setDeposited]);

  const value = useMemo(() => ({
    account,
    deposited,
    ethAccount,
    evmCollectionInstance,
    getUserDeposit,
    matcherContractInstance,
    setEvmCollectionInstance,
    setMatcherContractInstance,
    setWeb3Instance,
    web3Instance
  }), [account, ethAccount, matcherContractInstance, deposited, evmCollectionInstance, getUserDeposit, web3Instance]);

  useEffect(() => {
    if (account) {
      setEthAccount(subToEth(account).toLowerCase());
    }
  }, [account]);

  const initAbi = useCallback(() => {
    if (account && ethAccount && !abiRef.current) {
      const provider = new Web3.providers.HttpProvider(uniqueSubstrateApiRpc);
      // const web3 = new Web3(window.ethereum);
      const web3 = new Web3(provider);
      console.log('mySubEthAddress', evmToAddress(ethAccount, 42, 'blake2'));

      try {
        // await window.ethereum.enable();

        setWeb3Instance(web3);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const newContractInstance: Contract = new web3.eth.Contract(marketplaceAbi as any, contractAddress, {
          from: ethAccount
        });

        setMatcherContractInstance(newContractInstance);

        abiRef.current = newContractInstance;

        console.log('newContractInstance', newContractInstance);
      } catch (e) {
        // User has denied account access to DApp...
      }
    }
  }, [account, ethAccount]);

  useEffect(() => {
    void initAbi();
  }, [initAbi]);

  return (
    <ContractContext.Provider value={value}>
      {children}
    </ContractContext.Provider>
  );
}

export default React.memo(Contracts);
