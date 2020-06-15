// Copyright 2017-2020 @polkadot/app-accounts authors & contributors
// This software may be modified and distributed under the terms
// of the Apache-2.0 license. See the LICENSE file for details.

import { SubmittableExtrinsic } from '@polkadot/api/types';
import { DeriveBalancesAll, DeriveDemocracyLock } from '@polkadot/api-derive/types';
import { ActionStatus } from '@polkadot/react-components/Status/types';
import { RecoveryConfig } from '@polkadot/types/interfaces';
import { SortedAccount } from './types';

import BN from 'bn.js';
import React, { useCallback, useContext, useState, useEffect } from 'react';
import styled from 'styled-components';
import { ApiPromise } from '@polkadot/api';
import { getLedger } from '@polkadot/react-api';
import { AddressInfo, AddressMini, AddressSmall, Badge, Button, ChainLock, CryptoType, Forget, Icon, IdentityIcon, LinkExternal, Menu, Popup, StatusContext, Tags } from '@polkadot/react-components';
import { useAccountInfo, useApi, useCall, useToggle } from '@polkadot/react-hooks';
import { Option } from '@polkadot/types';
import keyring from '@polkadot/ui-keyring';
import { formatBalance, formatNumber } from '@polkadot/util';

import { useTranslation } from '../translate';
import Backup from './modals/Backup';
import ChangePass from './modals/ChangePass';
import Derive from './modals/Derive';
import Identity from './modals/Identity';
import MultisigApprove from './modals/MultisigApprove';
import RecoverAccount from './modals/RecoverAccount';
import RecoverSetup from './modals/RecoverSetup';
import Transfer from './modals/Transfer';
import useMultisigApprovals from './useMultisigApprovals';
import useProxies from './useProxies';

interface Props extends SortedAccount {
  className?: string;
  filter: string;
  setBalance: (address: string, value: BN) => void;
  toggleFavorite: (address: string) => void;
}

interface DemocracyUnlockable {
  democracyUnlockTx: SubmittableExtrinsic<'promise'> | null;
  ids: BN[];
}

function calcVisible (filter: string, name: string, tags: string[]): boolean {
  if (filter.length === 0) {
    return true;
  }

  const _filter = filter.toLowerCase();

  return tags.reduce((result: boolean, tag: string): boolean => {
    return result || tag.toLowerCase().includes(_filter);
  }, name.toLowerCase().includes(_filter));
}

function createClearDemocracyTx (api: ApiPromise, address: string, unlockableIds: BN[]): SubmittableExtrinsic<'promise'> {
  return api.tx.utility.batch(
    unlockableIds
      .map((id) => api.tx.democracy.removeVote(id))
      .concat(api.tx.democracy.unlock(address))
  );
}

function Account ({ account: { address, meta }, className = '', filter, isFavorite, setBalance, toggleFavorite }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const { queueExtrinsic } = useContext(StatusContext);
  const api = useApi();
  const bestNumber = useCall<BN>(api.api.derive.chain.bestNumber, []);
  const balancesAll = useCall<DeriveBalancesAll>(api.api.derive.balances.all, [address]);
  const democracyLocks = useCall<DeriveDemocracyLock[]>(api.api.derive.democracy?.locks, [address]);
  const recoveryInfo = useCall<RecoveryConfig | null>(api.api.query.recovery?.recoverable, [address], {
    transform: (opt: Option<RecoveryConfig>) => opt.unwrapOr(null)
  });
  const multiInfos = useMultisigApprovals(address);
  const proxyInfo = useProxies(address);
  const { flags: { isDevelopment, isExternal, isHardware, isInjected, isMultisig, isProxied }, genesisHash, name: accName, onSetGenesisHash, tags } = useAccountInfo(address);
  const [{ democracyUnlockTx }, setUnlockableIds] = useState<DemocracyUnlockable>({ democracyUnlockTx: null, ids: [] });
  const [isVisible, setIsVisible] = useState(true);
  const [isBackupOpen, toggleBackup] = useToggle();
  const [isDeriveOpen, toggleDerive] = useToggle();
  const [isForgetOpen, toggleForget] = useToggle();
  const [isIdentityOpen, toggleIdentity] = useToggle();
  const [isMultisigOpen, toggleMultisig] = useToggle();
  const [isPasswordOpen, togglePassword] = useToggle();
  const [isRecoverAccountOpen, toggleRecoverAccount] = useToggle();
  const [isRecoverSetupOpen, toggleRecoverSetup] = useToggle();
  const [isSettingsOpen, toggleSettings] = useToggle();
  const [isTransferOpen, toggleTransfer] = useToggle();

  useEffect((): void => {
    balancesAll && setBalance(address, balancesAll.freeBalance);
  }, [address, balancesAll, setBalance]);

  useEffect((): void => {
    setIsVisible(
      calcVisible(filter, accName, tags)
    );
  }, [accName, filter, tags]);

  useEffect((): void => {
    bestNumber && democracyLocks && setUnlockableIds(
      (prev): DemocracyUnlockable => {
        const ids = democracyLocks
          .filter(({ isFinished, unlockAt }) => isFinished && bestNumber.gt(unlockAt))
          .map(({ referendumId }) => referendumId);

        if (JSON.stringify(prev.ids) === JSON.stringify(ids)) {
          return prev;
        }

        return {
          democracyUnlockTx: createClearDemocracyTx(api.api, address, ids),
          ids
        };
      }
    );
  }, [address, api, bestNumber, democracyLocks]);

  const _onFavorite = useCallback(
    () => toggleFavorite(address),
    [address, toggleFavorite]
  );

  const _onForget = useCallback(
    (): void => {
      if (!address) {
        return;
      }

      const status: Partial<ActionStatus> = {
        account: address,
        action: 'forget'
      };

      try {
        keyring.forgetAccount(address);
        status.status = 'success';
        status.message = t<string>('account forgotten');
      } catch (error) {
        status.status = 'error';
        status.message = (error as Error).message;
      }
    },
    [address, t]
  );

  const _clearDemocracyLocks = useCallback(
    (): void => {
      democracyUnlockTx && queueExtrinsic({
        accountId: address,
        extrinsic: democracyUnlockTx
      });
    },
    [address, democracyUnlockTx, queueExtrinsic]
  );

  const _showOnHardware = useCallback(
    (): void => {
      // TODO: we should check the hardwareType from metadata here as well,
      // for now we are always assuming hardwareType === 'ledger'
      getLedger()
        .getAddress(true)
        .catch((error): void => {
          console.error(`ledger: ${(error as Error).message}`);
        });
    },
    []
  );

  if (!isVisible) {
    return null;
  }

  return (
    <tr className={className}>
      <td className='favorite'>
        <Icon
          className={`${isFavorite ? 'isSelected isColorHighlight' : ''}`}
          name={isFavorite ? 'star' : 'star outline'}
          onClick={_onFavorite}
        />
      </td>
      <td className='together'>
        {recoveryInfo && (
          <Badge
            hover={
              <div>
                <p>{t<string>('This account is recoverable, with the following friends:')}</p>
                <div>
                  {recoveryInfo.friends.map((friend, index): React.ReactNode => (
                    <IdentityIcon
                      key={index}
                      value={friend}
                    />
                  ))}
                </div>
                <table>
                  <tbody>
                    <tr>
                      <td>{t<string>('threshold')}</td>
                      <td>{formatNumber(recoveryInfo.threshold)}</td>
                    </tr>
                    <tr>
                      <td>{t<string>('delay')}</td>
                      <td>{formatNumber(recoveryInfo.delayPeriod)}</td>
                    </tr>
                    <tr>
                      <td>{t<string>('deposit')}</td>
                      <td>{formatBalance(recoveryInfo.deposit)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            }
            info={<Icon name='shield' />}
            isInline
            isTooltip
            type='online'
          />
        )}
        {multiInfos && multiInfos.length !== 0 && (
          <Badge
            hover={t<string>('Multisig approvals pending')}
            info={multiInfos.length}
            isInline
            isTooltip
            type='brown'
          />
        )}
        {isProxied && !proxyInfo.hasOwned && (
          <Badge
            hover={t<string>('Proxied account has no owned proxies')}
            info='0'
            isInline
            isTooltip
            type='brown'
          />
        )}
      </td>
      <td className='address'>
        <AddressSmall value={address} />
        {isBackupOpen && (
          <Backup
            address={address}
            key='modal-backup-account'
            onClose={toggleBackup}
          />
        )}
        {isDeriveOpen && (
          <Derive
            from={address}
            key='modal-derive-account'
            onClose={toggleDerive}
          />
        )}
        {isForgetOpen && (
          <Forget
            address={address}
            key='modal-forget-account'
            onClose={toggleForget}
            onForget={_onForget}
          />
        )}
        {isIdentityOpen && (
          <Identity
            address={address}
            key='modal-identity'
            onClose={toggleIdentity}
          />
        )}
        {isPasswordOpen && (
          <ChangePass
            address={address}
            key='modal-change-pass'
            onClose={togglePassword}
          />
        )}
        {isTransferOpen && (
          <Transfer
            key='modal-transfer'
            onClose={toggleTransfer}
            senderId={address}
          />
        )}
        {isMultisigOpen && multiInfos && (
          <MultisigApprove
            address={address}
            key='multisig-approve'
            onClose={toggleMultisig}
            ongoing={multiInfos}
            threshold={meta.threshold as number}
            who={meta.who as string[]}
          />
        )}
        {isRecoverAccountOpen && (
          <RecoverAccount
            address={address}
            key='recover-account'
            onClose={toggleRecoverAccount}
          />
        )}
        {isRecoverSetupOpen && (
          <RecoverSetup
            address={address}
            key='recover-setup'
            onClose={toggleRecoverSetup}
          />
        )}
      </td>
      <td className='address'>
        {meta.parentAddress && (
          <AddressMini value={meta.parentAddress} />
        )}
      </td>
      <td className='number'>
        <CryptoType accountId={address} />
      </td>
      <td className='all'>
        <div className='tags'>
          <Tags value={tags} />
        </div>
      </td>
      <td className='number ui--media-1500'>
        {balancesAll && formatNumber(balancesAll.accountNonce)}
      </td>
      <td className='number'>
        <AddressInfo
          address={address}
          withBalance
          withBalanceToggle
          withExtended={false}
        />
      </td>
      <td className='button'>
        <Button
          icon='paper plane'
          label={t<string>('send')}
          onClick={toggleTransfer}
        />
        <Popup
          className='theme--default'
          isOpen={isSettingsOpen}
          onClose={toggleSettings}
          trigger={
            <Button
              icon='ellipsis vertical'
              onClick={toggleSettings}
            />
          }
        >
          <Menu
            onClick={toggleSettings}
            text
            vertical
          >
            <Menu.Item
              disabled={!api.api.tx.identity?.setIdentity}
              onClick={toggleIdentity}
            >
              {t<string>('Set on-chain identity')}
            </Menu.Item>
            <Menu.Item
              disabled={!democracyUnlockTx}
              onClick={_clearDemocracyLocks}
            >
              {t<string>('Clear expired democracy locks')}
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              disabled={isExternal || isInjected || isMultisig}
              onClick={toggleDerive}
            >
              {t<string>('Derive account via derivation path')}
            </Menu.Item>
            {isHardware && (
              <Menu.Item onClick={_showOnHardware}
              >
                {t<string>('Show address on hardware device')}
              </Menu.Item>
            )}
            <Menu.Divider />
            <Menu.Item
              disabled={isExternal || isInjected || isMultisig || isDevelopment}
              onClick={toggleBackup}
            >
              {t<string>('Create a backup file for this account')}
            </Menu.Item>
            <Menu.Item
              disabled={isExternal || isInjected || isMultisig || isDevelopment}
              onClick={togglePassword}
            >
              {t("Change this account's password")}
            </Menu.Item>
            <Menu.Item
              disabled={isInjected || isDevelopment}
              onClick={toggleForget}
            >
              {t<string>('Forget this account')}
            </Menu.Item>
            {api.api.tx.recovery?.createRecovery && (
              <>
                <Menu.Divider />
                {!recoveryInfo && (
                  <Menu.Item onClick={toggleRecoverSetup}>
                    {t<string>('Make recoverable')}
                  </Menu.Item>
                )}
                <Menu.Item onClick={toggleRecoverAccount}>
                  {t<string>('Initiate recovery for another')}
                </Menu.Item>
              </>
            )}
            {isMultisig && (
              <>
                <Menu.Divider />
                <Menu.Item
                  disabled={!multiInfos || !multiInfos.length}
                  onClick={toggleMultisig}
                >
                  {t<string>('Multisig approvals')}
                </Menu.Item>
              </>
            )}
            {!api.isDevelopment && (
              <>
                <Menu.Divider />
                <ChainLock
                  className='accounts--network-toggle'
                  genesisHash={genesisHash}
                  onChange={onSetGenesisHash}
                />
              </>
            )}
          </Menu>
        </Popup>
      </td>
      <td className='mini ui--media-1400'>
        <LinkExternal
          className='ui--AddressCard-exporer-link'
          data={address}
          type='address'
          withShort
        />
      </td>
    </tr>
  );
}

export default React.memo(styled(Account)`
  .tags {
    width: 100%;
    min-height: 1.5rem;
  }
`);
