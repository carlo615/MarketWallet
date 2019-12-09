// Copyright 2017-2019 @polkadot/app-democracy authors & contributors
// This software may be modified and distributed under the terms
// of the Apache-2.0 license. See the LICENSE file for details.

import { DerivedCouncilProposals } from '@polkadot/api-derive/types';

import { useState, useEffect } from 'react';
import { useApi, useCall } from '@polkadot/react-hooks';

export default function useCounter (): number {
  const { api, isApiReady } = useApi();
  const motions = useCall<DerivedCouncilProposals>(isApiReady ? api.derive.council.proposals : undefined, []);
  const [counter, setCounter] = useState(0);

  useEffect((): void => {
    setCounter(motions?.length || 0);
  }, [motions]);

  return counter;
}
