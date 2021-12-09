// Copyright 2017-2021 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringAddress } from '@polkadot/ui-keyring/types';

import React, { useCallback, useContext } from 'react';
import { useHistory } from 'react-router';

import { AddressSmall, Button, CopyIcon, StatusContext } from '@polkadot/react-components';

import blockExplorerIcon from './block-explorer.svg';

interface Props {
  account: KeyringAddress;
  setAccount?: (account?: string) => void;
  exportAccount?: (account?: string) => void;
  forgetAccount?: (account?: string) => void;
}

function AccountTableItem ({ account, exportAccount, forgetAccount, setAccount }: Props): React.ReactElement<Props> | null {
  const history = useHistory();
  const { queueAction } = useContext(StatusContext);

  const copyAddress = useCallback(
    (account: string) => () => {
      void navigator.clipboard.writeText(account);

      return queueAction({
        account,
        action: 'clipboard',
        message: 'address copied',
        status: 'queued'
      });
    },
    [queueAction]
  );

  const viewAllTokens = useCallback(() => {
    if (setAccount) {
      setAccount(account.address);
    }

    history.push('/wallet');
  }, [account.address, history, setAccount]);

  const _onExport = useCallback(() => {
    exportAccount && exportAccount(account.address);
  }, [account.address, exportAccount]);

  const _onForget = useCallback(() => {
    forgetAccount && forgetAccount(account.address);
  }, [account.address, forgetAccount]);

  return (
    <div className='accounts-table-item'>
      <div className='item'>
        <AddressSmall value={account.address} />
        <div className='item--address'>
          <span>{account.address}</span>
          <a
            onClick={copyAddress(account.address)}
          >
            <CopyIcon />
          </a>
        </div>
      </div>
      <div className='explorer'>
        <img
          alt='explorer'
          className='explorer-icon'
          src={blockExplorerIcon as string}
        />
        <span>UNIQUE block explorer</span>
      </div>
      <a
        onClick={viewAllTokens}
      >
        View All Tokens
      </a>
      <div className={'actions btn-container'}>
        <Button
          className={'btn-outlined'}
          label={'Export'}
          onClick={_onExport}
        />
        <Button
          className={'btn-outlined'}
          label={'Forget'}
          onClick={_onForget}
        />
      </div>
    </div>
  );
}

export default React.memo(AccountTableItem);
