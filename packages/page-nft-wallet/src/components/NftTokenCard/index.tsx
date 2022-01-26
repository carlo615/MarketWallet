// Copyright 2017-2021 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import './styles.scss';

import type { NftCollectionInterface } from '@polkadot/react-hooks/useCollection';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useHistory } from 'react-router';
import Item from 'semantic-ui-react/dist/commonjs/views/Item';

import { useSchema } from '@polkadot/react-hooks';

interface Props {
  account: string;
  canTransferTokens: boolean;
  collection: NftCollectionInterface;
  openTransferModal: (collection: NftCollectionInterface, tokenId: string, balance: number) => void;
  token: string;
  tokensSelling: string[];
}

function NftTokenCard ({ account, collection, token, tokensSelling }: Props): React.ReactElement<Props> {
  const { attributes, tokenUrl } = useSchema(account, collection.id, token);
  const [tokenState, setTokenState] = useState<'none' | 'selling'>('none');
  const history = useHistory();

  const openDetailedInformationModal = useCallback((collectionId: string | number, tokenId: string) => {
    history.push(`/wallet/token-details?collectionId=${collectionId}&tokenId=${tokenId}`);
  }, [history]);

  const attrebutesToShow = useMemo(() => {
    if (attributes) {
      return [...Object.keys(attributes).filter((attr: string) => attr !== 'ipfsJson').map((attr: string) => {
        if (attr.toLowerCase().includes('hash')) {
          return `${attr}: ${(attributes[attr] as string).substring(0, 8)}...`;
        }

        if (Array.isArray(attributes[attr])) {
          return `${attr}: ${((attributes[attr] as string[]).join(', '))}`;
        }

        return `${attr}: ${(attributes[attr] as string)}`;
      })].join(', ');
    }

    return '';
  }, [attributes]);

  const updateTokenState = useCallback(() => {
    let tState: 'none' | 'selling' = 'none';

    if (tokensSelling.indexOf(token) !== -1) {
      tState = 'selling';
    }

    setTokenState(tState);
  }, [token, tokensSelling]);

  const onOpen = useCallback(() => {
    openDetailedInformationModal(collection.id, token);
  }, [collection, token, openDetailedInformationModal]);

  useEffect(() => {
    updateTokenState();
  }, [updateTokenState]);

  return (
    <div
      className='token-row'
      key={token}
    >
      <div
        className='token-image'
        onClick={onOpen}
      >
        { tokenUrl && (
          <Item.Image
            size='mini'
            src={tokenUrl}
          />
        )}
      </div>
      <div
        className='token-info-attributes'
        onClick={onOpen}
      >
        <div className='token-name'>
          #{token.toString()}
        </div>
        <div className='token-attributes'>
          { attributes && Object.values(attributes).length > 0 && (
            <span>
              <strong>Attributes: </strong>{attrebutesToShow}
            </span>
          )}
        </div>
      </div>
      <div className='token-actions'>
        { tokenState === 'selling' && (
          <span className='token-state'>
            Selling
          </span>
        )}
      </div>
    </div>
  );
}

export default React.memo(NftTokenCard);
