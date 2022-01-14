// Copyright 2017-2021 @polkadot/apps, UseTech authors & contributors
// SPDX-License-Identifier: Apache-2.0

import './styles.scss';

import BN from 'bn.js';
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Button from 'semantic-ui-react/dist/commonjs/elements/Button';
import Header from 'semantic-ui-react/dist/commonjs/elements/Header';
import Image from 'semantic-ui-react/dist/commonjs/elements/Image';
import Loader from 'semantic-ui-react/dist/commonjs/elements/Loader';

import envConfig from '@polkadot/apps-config/envConfig';
import { TransferModal } from '@polkadot/react-components';
import formatPrice from '@polkadot/react-components/util/formatPrice';
import { useBalance, useDecoder, useMarketplaceStages, useSchema } from '@polkadot/react-hooks';
import { subToEth } from '@polkadot/react-hooks/utils';

import BuySteps from './BuySteps';
import SaleSteps from './SaleSteps';
import SetPriceModal from './SetPriceModal';

const { kusamaDecimals } = envConfig;

interface NftDetailsProps {
  account: string;
}

function NftDetails ({ account }: NftDetailsProps): React.ReactElement<NftDetailsProps> {
  const query = new URLSearchParams(useLocation().search);
  const tokenId = query.get('tokenId') || '';
  const collectionId = query.get('collectionId') || '';
  const [showTransferForm, setShowTransferForm] = useState<boolean>(false);
  const [ethAccount, setEthAccount] = useState<string>();
  const [lowKsmBalanceToBuy, setLowKsmBalanceToBuy] = useState<boolean>(false);
  const [kusamaFees, setKusamaFees] = useState<BN | null>(null);
  const { balance } = useBalance(account);
  const { hex2a } = useDecoder();
  const { attributes, collectionInfo, tokenUrl } = useSchema(account, collectionId, tokenId);
  const [tokenPriceForSale, setTokenPriceForSale] = useState<string>('');
  const { cancelStep, deposited, escrowAddress, formatKsmBalance, getKusamaTransferFee, getRevertedFee, kusamaAvailableBalance, readyToAskPrice, sendCurrentUserAction, setPrice, setReadyToAskPrice, tokenAsk, tokenDepositor, tokenInfo, transferStep } = useMarketplaceStages(account, ethAccount, collectionInfo, tokenId);

  const uSellIt = tokenAsk && tokenAsk?.ownerAddr.toLowerCase() === ethAccount && tokenAsk.flagActive === '1';
  const uOwnIt = tokenInfo?.owner?.Substrate === account || tokenInfo?.owner?.Ethereum?.toLowerCase() === ethAccount || uSellIt;

  const tokenPrice = (tokenAsk?.flagActive === '1' && tokenAsk?.price && tokenAsk?.price.gtn(0)) ? tokenAsk.price : 0;
  const isOwnerEscrow = !!(!uOwnIt && tokenInfo && tokenInfo.owner && tokenInfo.owner.toString() === escrowAddress && tokenDepositor && (tokenAsk && (tokenAsk.ownerAddr.toLowerCase() !== ethAccount || tokenAsk.flagActive !== '1')));

  console.log('collectionInfo', collectionInfo, 'tokenAsk', tokenAsk, 'tokenPrice', tokenPrice, 'tokenInfo', tokenInfo, 'ethAccount', ethAccount, 'attributes', attributes);

  const goBack = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    history.back();
  }, []);

  const onSavePrice = useCallback(() => {
    const parts = tokenPriceForSale.split('.');
    const priceLeft = new BN(parts[0]).mul(new BN(10).pow(new BN(12)));
    const priceRight = new BN(parseFloat(`0.${parts[1]}`) * Math.pow(10, kusamaDecimals));
    const price = priceLeft.add(priceRight);

    setPrice(price);
  }, [setPrice, tokenPriceForSale]);

  const onTransferSuccess = useCallback(() => {
    setShowTransferForm(false);
    sendCurrentUserAction('UPDATE_TOKEN_STATE');
  }, [sendCurrentUserAction]);

  const closeAskModal = useCallback(() => {
    setReadyToAskPrice(false);

    setTimeout(() => {
      sendCurrentUserAction('ASK_NOT_FILLED');
    }, 1000);
  }, [setReadyToAskPrice, sendCurrentUserAction]);

  const ksmFeesCheck = useCallback(async () => {
    // tokenPrice + marketFees + kusamaFees * 2
    if (tokenAsk?.price) {
      const kusamaFees: BN | null = await getKusamaTransferFee(escrowAddress, tokenAsk.price);

      if (kusamaFees) {
        setKusamaFees(kusamaFees);
        const balanceNeeded = tokenAsk.price.add(kusamaFees.muln(2));
        const isLow = !!kusamaAvailableBalance?.add(deposited || new BN(0)).lte(balanceNeeded);

        setLowKsmBalanceToBuy(isLow);
      }
    }
  }, [deposited, escrowAddress, kusamaAvailableBalance, getKusamaTransferFee, tokenAsk]);

  const getMarketPrice = useCallback((price: BN) => {
    return formatPrice(formatKsmBalance(price.sub(getRevertedFee(price))));
  }, [formatKsmBalance, getRevertedFee]);

  const onCancel = useCallback(() => {
    sendCurrentUserAction('CANCEL');
  }, [sendCurrentUserAction]);

  const onBuy = useCallback(() => {
    sendCurrentUserAction('BUY');
  }, [sendCurrentUserAction]);

  const toggleTransferForm = useCallback(() => {
    setShowTransferForm(!showTransferForm);
  }, [showTransferForm]);

  const onSell = useCallback(() => {
    sendCurrentUserAction('SELL');
  }, [sendCurrentUserAction]);

  const closeTransferModal = useCallback(() => {
    setShowTransferForm(false);
  }, []);

  useEffect(() => {
    void ksmFeesCheck();
  }, [ksmFeesCheck]);

  useEffect(() => {
    if (account) {
      setEthAccount(subToEth(account).toLowerCase());
    }
  }, [account]);

  return (
    <div className='toke-details'>
      <div
        className='go-back'
      >
        <a
          href='/'
          onClick={goBack}
        >
          <svg fill='none'
            height='16'
            viewBox='0 0 16 16'
            width='16'
            xmlns='http://www.w3.org/2000/svg'>
            <path d='M13.5 8H2.5'
              stroke='var(--card-link-color)'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
            <path d='M7 3.5L2.5 8L7 12.5'
              stroke='var(--card-link-color)'
              strokeLinecap='round'
              strokeLinejoin='round'
            />
          </svg>
          back
        </a>
      </div>
      <div className='token-info'>
        <div className='token-info--row'>
          <div className='token-info--row--image'>
            { collectionInfo && (
              <Image
                className='token-image-big'
                src={tokenUrl}
              />
            )}
          </div>
          <div className='token-info--row--attributes'>
            <Header as='h3'>
              {collectionInfo && <span>{hex2a(collectionInfo.tokenPrefix)}</span>} #{tokenId}
            </Header>
            { attributes && Object.values(attributes).length > 0 && (
              <div className='accessories'>
                Attributes:
                {Object.keys(attributes).map((attrKey) => {
                  if (attrKey === 'ipfsJson') {
                    return null;
                  }

                  if (!Array.isArray(attributes[attrKey])) {
                    return <p key={attrKey}>{attrKey}: {attributes[attrKey]}</p>;
                  }

                  return (
                    <p key={attrKey}>{attrKey}: {(attributes[attrKey] as string[]).join(', ')}</p>
                  );
                })}
              </div>
            )}
            { !!tokenPrice && (
              <>
                <Header as={'h2'}>
                  {formatPrice(formatKsmBalance(tokenPrice))} KSM
                </Header>
                {/* @todo - substrate commission from price - fixed? */}
                <p>Fee: {formatKsmBalance(getRevertedFee(tokenPrice))} KSM, Price: {getMarketPrice(tokenPrice)} KSM</p>
                {/* { (!uOwnIt && !transferStep && tokenAsk) && lowBalanceToBuy && (
                  <div className='warning-block'>Your balance is too low to pay fees. <a href='https://t.me/unique2faucetbot'
                    rel='noreferrer nooperer'
                    target='_blank'>Get testUNQ here</a></div>
                )} */}
                { (!uOwnIt && !transferStep && tokenAsk) && lowKsmBalanceToBuy && (
                  <div className='warning-block'>Your balance is too low to buy</div>
                )}
              </>
            )}
            <div className='divider' />
            { (uOwnIt && !uSellIt) && (
              <Header as='h4'>You own it!</Header>
            )}
            { uSellIt && (
              <Header as='h4'>You`re selling it!</Header>
            )}
            { isOwnerEscrow && (
              <Header as='h5'>The owner is Escrow</Header>
            )}

            { (!uOwnIt && tokenInfo?.owner && tokenInfo.owner?.Ethereum !== escrowAddress && tokenAsk?.flagActive !== '1') && (
              <Header as='h5'>The owner is {tokenInfo?.owner.Substrate || tokenInfo?.owner.Ethereum || ''}</Header>
            )}

            { (!uOwnIt && tokenInfo && tokenInfo.owner && tokenInfo.owner.toString() === escrowAddress && tokenAsk?.ownerAddr && tokenAsk.flagActive) && (
              <Header as='h5'>The owner is {tokenAsk?.ownerAddr}</Header>
            )}
            <div className='buttons'>
              { (uOwnIt && !uSellIt) && (
                <Button
                  content='Transfer'
                  onClick={toggleTransferForm}
                />
              )}
              {(!account && !!tokenPrice) && (
                <div>
                  <Button
                    content='Buy it'
                    disabled
                    title='ass'
                  />
                  <p className='text-with-button'>Сonnect your wallet to make transactions</p>
                </div>
              )}
              <>
                { (!uOwnIt && !transferStep && !!tokenPrice && kusamaFees) && (
                  <>
                    <div className='warning-block'>A small Kusama Network transaction fee up to {formatKsmBalance(kusamaFees.muln(2))} KSM will be
                      applied to the transaction</div>
                    <Button
                      content={`Buy it - ${formatKsmBalance(tokenPrice.add(kusamaFees.muln(2)))} KSM`}
                      disabled={lowKsmBalanceToBuy}
                      onClick={onBuy}
                    />
                  </>
                )}

                { (uOwnIt && !uSellIt) && (
                  <Button
                    content='Sell'
                    onClick={onSell}
                  />
                )}
                { (uSellIt && !transferStep) && (
                  <Button
                    content={
                      <>
                        Delist
                        { cancelStep && (
                          <Loader
                            active
                            inline='centered'
                          />
                        )}
                      </>
                    }
                    onClick={onCancel}
                  />
                )}
              </>
            </div>

            { (showTransferForm && collectionInfo) && (
              <TransferModal
                account={account}
                closeModal={closeTransferModal}
                collection={collectionInfo}
                tokenId={tokenId}
                updateTokens={onTransferSuccess}
              />
            )}
            { !!(transferStep && transferStep <= 3) && (
              <SaleSteps step={transferStep} />
            )}
            { !!(transferStep && transferStep >= 4) && (
              <BuySteps step={transferStep - 3} />
            )}
            { (!collectionInfo || (account && (!kusamaAvailableBalance || !balance))) && (
              <Loader
                active
                className='load-info'
                inline='centered'
              />
            )}
          </div>
        </div>
      </div>
      { readyToAskPrice && (
        <SetPriceModal
          closeModal={closeAskModal}
          onSavePrice={onSavePrice}
          setTokenPriceForSale={setTokenPriceForSale}
          tokenPriceForSale={tokenPriceForSale}
        />
      )}
    </div>
  );
}

export default React.memo(NftDetails);
