// Copyright 2017-2022 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { memo, useCallback, useContext } from 'react';
import { NavLink } from 'react-router-dom';
import Button from 'semantic-ui-react/dist/commonjs/elements/Button/Button';
import Popup from 'semantic-ui-react/dist/commonjs/modules/Popup';

import ContractContext from '@polkadot/apps/ContractContext/ContractContext';
import question from '@polkadot/apps/images/question.svg';
import envConfig from '@polkadot/apps-config/envConfig';
import { ChainBalance } from '@polkadot/react-components';
import { useBalances, useNftContract } from '@polkadot/react-hooks';
import { formatKsmBalance } from '@polkadot/react-hooks/useKusamaApi';

interface Props {
  isPopupActive?: boolean
}

const PopupMenu = (props: Props) => {
  const { isPopupActive } = props;
  const { account, deposited, ethAccount, getUserDeposit } = useContext(ContractContext);
  const { freeBalance, freeKusamaBalance } = useBalances(account);
  const { withdrawAllKSM } = useNftContract(account, ethAccount);
  const { minPrice } = envConfig;

  const revertMoney = useCallback(() => {
    withdrawAllKSM(() => null, () => void getUserDeposit());
  }, [getUserDeposit, withdrawAllKSM]);

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
          { deposited?.gtn(minPrice) ? formatKsmBalance(deposited) : 0}
          <span className='unit'>KSM deposit</span>
          { isPopupActive && deposited?.gtn(minPrice) && (
            <Popup
              className='mobile withdraw-popup'
              content={(
                <div className='withdraw-popup'>
                  <Button
                    className='withdraw-button'
                    onClick={revertMoney}
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
              )}
              on='click'
              position='bottom left'
              style={{ left: '-7px' }}
              trigger={(
                <img
                  alt='withdraw'
                  src={question as string}
                />
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(PopupMenu);
