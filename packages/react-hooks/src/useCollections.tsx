// Copyright 2017-2021 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { NftCollectionInterface } from '@polkadot/react-hooks/useCollection';
import type { ErrorType } from '@polkadot/react-hooks/useFetch';
import type { TokenDetailsInterface } from '@polkadot/react-hooks/useToken';
import type { u32 } from '@polkadot/types';

import BN from 'bn.js';
import { useCallback, useState } from 'react';

import { Filters } from '@polkadot/app-nft-market/containers/NftMarket';
import envConfig from '@polkadot/apps-config/envConfig';
import { useApi, useCollection, useFetch, useIsMountedRef } from '@polkadot/react-hooks';

const { uniqueApi, uniqueCollectionIds } = envConfig;

const apiUrl = process.env.NODE_ENV === 'development' ? '' : uniqueApi;

export type MetadataType = {
  metadata?: string;
}

export interface TokenInterface extends TokenDetailsInterface {
  collectionId: string;
  id: string;
}

export type OfferType = {
  collectionId: number;
  price: BN;
  seller: string;
  tokenId: string;
  metadata: any;
}

export type OffersResponseType = {
  items: OfferType[];
  itemsCount: number;
  page: number;
  pageSize: number;
}

export type HoldType = {
  collectionId: number;
  tokenId: string;
  owner: string;
}

export type HoldResponseType = {
  items: HoldType[];
  itemsCount: number;
  page: number;
  pageSize: number;
}

export type TradeType = {
  buyer?: string;
  collectionId: number;
  metadata: string
  price: string;
  quoteId: number;
  seller: string;
  tradeDate: string; // 2021-03-25T08:50:49.622992
  tokenId: number;
}

export type TradesResponseType = {
  items: TradeType[];
  itemsCount: number;
  page: number;
  pageSize: number;
}

export type CollectionWithTokensCount = { info: NftCollectionInterface, tokenCount: number };

export function useCollections () {
  const { api } = useApi();
  const { fetchData } = useFetch();
  const [error, setError] = useState<ErrorType>();
  const [offers, setOffers] = useState<{ [key: string]: OfferType }>({});
  const [myHold, setMyHold] = useState<{ [key: string]: HoldType[] }>({});
  const [offersLoading, setOffersLoading] = useState<boolean>(false);
  const [holdLoading, setHoldLoading] = useState<boolean>(false);
  const [offersCount, setOffersCount] = useState<number>(0);
  const [trades, setTrades] = useState<TradeType[]>();
  const [tradesCount, setTradesCount] = useState<number>(0);
  const [tradesLoading, setTradesLoading] = useState<boolean>(false);
  const [myTrades, setMyTrades] = useState<TradeType[]>();
  const mountedRef = useIsMountedRef();
  const { getDetailedCollectionInfo } = useCollection();

  const getTokensOfCollection = useCallback(async (collectionId: string, ownerId: string): Promise<string> => {
    if (!api || !collectionId || !ownerId) {
      return [];
    }

    try {
      return await api.rpc.unique.accountTokens(collectionId, { Substrate: ownerId });
    } catch (e) {
      console.log('getTokensOfCollection error', e);
    }

    return [];
  }, [api]);

  /**
   * Return the list of token sale offers
   */
  const getOffers = useCallback((page: number, pageSize: number, filters?: Filters) => {
    try {
      mountedRef.current && setOffersLoading(true);
      let url = `${apiUrl}/Offers?page=${page}&pageSize=${pageSize}`;

      // reset offers before loading first page
      if (page === 1) {
        mountedRef.current && setOffers({});
      }

      if (filters) {
        Object.keys(filters).forEach((filterKey: string) => {
          const currentFilter: string | string[] | number = filters[filterKey];

          if (Array.isArray(currentFilter)) {
            if (filterKey === 'collectionIds') {
              if (!currentFilter?.length) {
                url = `${url}${envConfig.uniqueCollectionIds.map((item: string) => `&collectionId=${item}`).join('')}`;
              } else {
                url = `${url}${currentFilter.map((item: string) => `&collectionId=${item}`).join('')}`;
              }
            } else if (filterKey === 'traitsCount' && currentFilter?.length) {
              url = `${url}${currentFilter.map((item: string) => `&traitsCount=${item}`).join('')}`;
            }
          } else {
            if (currentFilter) {
              url += `&${filterKey}=${currentFilter}`;
            }
          }
        });
      }

      fetchData<OffersResponseType>(url).subscribe((result: OffersResponseType | ErrorType) => {
        if (!mountedRef.current) {
          return;
        }

        setOffersLoading(false);

        if ('error' in result) {
          setError(result);
        } else {
          if (result) {
            setOffersCount(result.itemsCount);

            if (result.itemsCount === 0) {
              setOffers({});
            } else if (result.items.length) {
              setOffers((prevState: {[key: string]: OfferType}) => {
                const newState = { ...prevState };

                result.items.forEach((offer: OfferType) => {
                  if (!newState[`${offer.collectionId}-${offer.tokenId}`]) {
                    newState[`${offer.collectionId}-${offer.tokenId}`] = { ...offer, seller: offer.seller };
                  }
                });

                return newState;
              });
            }
          }
        }

        setOffersLoading(false);
      });
    } catch (e) {
      console.log('getOffers error', e);
      setOffersLoading(false);
    }
  }, [fetchData, mountedRef]);

  /**
   * Return the list of token were hold on the escrow
   */
  const getHoldByMe = useCallback((account: string, page: number, pageSize: number, collectionIds?: string[]) => {
    try {
      let url = `${apiUrl}/OnHold/${account}?page=${page}&pageSize=${pageSize}`;

      if (collectionIds && collectionIds.length) {
        url = `${url}${collectionIds.map((item: string) => `&collectionId=${item}`).join('')}`;
      }

      setHoldLoading(true);
      fetchData<HoldResponseType>(url).subscribe((result: HoldResponseType | ErrorType) => {
        if (!mountedRef.current) {
          return;
        }

        if ('error' in result) {
          setError(result);
          setMyHold({});
        } else {
          if (result?.items.length) {
            const newState: { [key: string]: HoldType[] } = {};

            result.items.forEach((hold: HoldType) => {
              if (!newState[hold.collectionId]) {
                newState[hold.collectionId] = [];
              }

              if (!newState[hold.collectionId].find((holdItem) => holdItem.tokenId === hold.tokenId)) {
                newState[hold.collectionId].push(hold);
              }
            });

            setMyHold(newState);
          } else {
            setMyHold({});
          }
        }

        setHoldLoading(false);
      });
    } catch (e) {
      console.log('getOffers error', e);
      setHoldLoading(false);
    }
  }, [fetchData, mountedRef]);

  /**
   * Return the list of token trades
   */
  const getTrades = useCallback(({ account,
    collectionIds,
    page,
    pageSize,
    sort }: { account?: string, collectionIds?: string[], page: number, pageSize: number, sort?: string}) => {
    try {
      let url = `${apiUrl}/Trades`;

      if (account && account.length) {
        url = `${url}/${account}`;
      }

      url = `${url}?page=${page}&pageSize=${pageSize}`;

      if (collectionIds && collectionIds.length) {
        url = `${url}${collectionIds.map((item: string) => `&collectionId=${item}`).join('')}`;
      }

      if (sort) {
        url = `${url}&sort=${sort}`;
      }

      setTradesLoading(true);
      fetchData<TradesResponseType>(url).subscribe((result: TradesResponseType | ErrorType) => {
        if (!mountedRef.current) {
          return;
        }

        if ('error' in result) {
          setError(result);
        } else {
          if (!account || !account.length) {
            setTrades(result.items);
          } else {
            setMyTrades(result.items);
          }

          setTradesCount(result.itemsCount || 0);
        }

        setTradesLoading(false);
      });
    } catch (e) {
      console.log('getTrades error', e);
      setTradesLoading(false);
    }
  }, [fetchData, mountedRef]);

  const presetTokensCollections = useCallback(async (): Promise<NftCollectionInterface[]> => {
    if (!api) {
      return [];
    }

    try {
      const fullCount = (await api.rpc.unique.collectionStats()) as { created: u32, destroyed: u32 };
      const createdCollectionCount = fullCount.created.toNumber();
      const destroyedCollectionCount = fullCount.destroyed.toNumber();
      const collectionsCount = createdCollectionCount - destroyedCollectionCount;
      const collections: Array<NftCollectionInterface> = [];

      for (let i = 1; i <= collectionsCount; i++) {
        const collectionInf = await getDetailedCollectionInfo(i.toString()) as unknown as NftCollectionInterface;

        if (!mountedRef.current) {
          return [];
        }

        if (collectionInf && collectionInf.owner && collectionInf.owner.toString() !== '5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM') {
          collections.push({ ...collectionInf, id: i.toString() });
        }
      }

      return collections;
    } catch (e) {
      console.log('preset tokens collections error', e);

      return [];
    }
  }, [api, getDetailedCollectionInfo, mountedRef]);

  const presetCollections = useCallback(async (): Promise<NftCollectionInterface[]> => {
    try {
      const collections: Array<NftCollectionInterface> = [];

      if (uniqueCollectionIds && uniqueCollectionIds.length) {
        for (let i = 0; i < uniqueCollectionIds.length; i++) {
          // use only collections that exists in the chain
          const mintCollectionInfo = await getDetailedCollectionInfo(uniqueCollectionIds[i]) as unknown as NftCollectionInterface;

          if (!mountedRef.current) {
            return [];
          }

          if (mintCollectionInfo && mintCollectionInfo.owner && mintCollectionInfo.owner.toString() !== '5C4hrfjw9DjXZTzV3MwzrrAr9P1MJhSrvWGWqi1eSuyUpnhM' && !collections.find((collection) => collection.id === uniqueCollectionIds[i])) {
            collections.push({ ...mintCollectionInfo, id: uniqueCollectionIds[i] });
          }
        }
      }

      return collections;
    } catch (e) {
      console.log('presetTokensCollections error', e);

      return [];
    }
  }, [getDetailedCollectionInfo, mountedRef]);

  return {
    error,
    getDetailedCollectionInfo,
    getHoldByMe,
    getOffers,
    getTokensOfCollection,
    getTrades,
    holdLoading,
    myHold,
    myTrades,
    offers,
    offersCount,
    offersLoading,
    presetCollections,
    presetTokensCollections,
    trades,
    tradesCount,
    tradesLoading
  };
}
