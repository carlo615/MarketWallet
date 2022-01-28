// Copyright 2017-2021 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringAddress } from '@polkadot/ui-keyring/types';

import React, { useCallback, useContext, useState } from 'react';
import { useHistory } from 'react-router';
import Confirm from 'semantic-ui-react/dist/commonjs/addons/Confirm';
import { keyring } from '@polkadot/ui-keyring';

import { AddressSmall, Button, CopyIcon, StatusContext } from '@polkadot/react-components';

import blockExplorerIcon from './block-explorer.svg';

interface Props {
  account: KeyringAddress;
  setAccount?: (account?: string) => void;
  exportAccount?: (account?: string) => void;
  forgetAccount: (account: string) => void;
}

function AccountTableItem ({ account, exportAccount, forgetAccount, setAccount }: Props): React.ReactElement<Props> | null {
  const history = useHistory();
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState<boolean>(false);
  const { queueAction } = useContext(StatusContext);
  const pair = keyring.getAddress(account.address, null);
  const isInjected = pair?.meta?.isInjected;

  console.log('isInjected', isInjected);

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
    setConfirmDeleteAccount(false);
  }, [account.address, forgetAccount]);

  const closeConfirmation = useCallback(() => {
    setConfirmDeleteAccount(false);
  }, []);

  const openConfirmation = useCallback(() => {
    setConfirmDeleteAccount(true);
  }, []);

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
      { !isInjected && (
        <div className={'actions btn-container'}>
          <Button
            className={'btn-outlined'}
            label={'Export'}
            onClick={_onExport}
          />
          <Button
            className={'btn-outlined'}
            label={'Forget'}
            onClick={openConfirmation}
          />
          <Confirm
            content='Are you sure to delete address from the wallet?'
            onCancel={closeConfirmation}
            onConfirm={_onForget}
            open={confirmDeleteAccount}
          />
        </div>
      )}
    </div>
  );
}

export default React.memo(AccountTableItem);
