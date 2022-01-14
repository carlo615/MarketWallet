// Copyright 2017-2021 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import React, { memo, useCallback, useContext, useMemo, useState } from 'react';
import { NavLink } from 'react-router-dom';
import Button from 'semantic-ui-react/dist/commonjs/elements/Button/Button';
import Popup from 'semantic-ui-react/dist/commonjs/modules/Popup';

import ContractContext from '@polkadot/apps/ContractContext/ContractContext';
import question from '@polkadot/apps/images/question.svg';
import envConfig from '@polkadot/apps-config/envConfig';
import { ChainBalance, WithdrawModal } from '@polkadot/react-components';
import { useBalances } from '@polkadot/react-hooks';
import { formatKsmBalance } from '@polkadot/react-hooks/useKusamaApi';

const { minPrice } = envConfig;

interface Props {
  account?: string;
  isPopupActive?: boolean
}

const PopupMenu = (props: Props) => {
  const { account, isPopupActive } = props;
  const { deposited } = useContext(ContractContext);
  const { freeBalance, freeKusamaBalance } = useBalances(account);
  const [showWithdrawModal, toggleWithdrawModal] = useState<boolean>(false);

  const closeModal = useCallback(() => {
    toggleWithdrawModal(false);
  }, []);

  const openModal = useCallback(() => {
    toggleWithdrawModal(true);
  }, []);

  const withdrawPopup = useMemo(() => {
    return (
      <div className='withdraw-popup'>
        <Button
          className='withdraw-button'
          onClick={openModal}
        >
          Withdraw deposit
        </Button>
        or
        <NavLink
          exact={true}
          strict={true}
          to={'/faq'}
        >learn more
        </NavLink> in FAQ
      </div>
    );
  }, [openModal]);

  return (
    <div className={`manage-balances ${isPopupActive ? 'popup active' : 'popup'}`}>
      <div className='main-balance'>
        <ChainBalance value={freeBalance} />
      </div>
      <div className='other-balance'>
        <div className='balance-line'>
          {formatKsmBalance(freeKusamaBalance)}
          <span className='unit'>KSM</span>
        </div>
        <div className='balance-line'>
          { +formatKsmBalance(deposited) > minPrice && deposited ? formatKsmBalance(deposited) : 0}
          <span className='unit'>KSM deposit</span>
          { !!(deposited && deposited.div(new BN(1000000)).gt(new BN(1))) && (
            <Popup
              className='mobile withdraw-popup'
              content={withdrawPopup}
              on='click'
              position='bottom left'
              trigger={(
                <img
                  alt='withdraw'
                  src={question as string}
                />
              )}
            />
          )}
        </div>
        {/* Todo uncomment this when the 'View all tokens' functional will be clear */}
        {/* <div className='footer-balance'> */}
        {/*  <Menu.Item */}
        {/*    active={location.pathname === '/wallet'} */}
        {/*    as={NavLink} */}
        {/*    className='' */}
        {/*    name='View all tokens' */}
        {/*    to='/wallet' */}
        {/*  /> */}
        {/* </div> */}
      </div>
      { showWithdrawModal && (
        <WithdrawModal
          account={account}
          closeModal={closeModal}
        />
      )}
    </div>
  );
};

export default memo(PopupMenu);
