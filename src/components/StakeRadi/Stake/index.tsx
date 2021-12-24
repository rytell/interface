import React, { useCallback, useEffect, useState } from 'react'
import styled from 'styled-components'
import { useActiveWeb3React } from '../../../hooks'
import { useRadiContract, useStakingPoolContract } from '../../../hooks/useContract'
import { TYPE } from '../../../theme'
import { fromWei } from 'web3-utils'
import { tryParseAmount } from '../../../state/swap/hooks'
import { ChainId } from '@rytell/sdk'
import { RADI } from '../../../constants'
import { useTransactionAdder } from '../../../state/transactions/hooks'

const Wrapper = styled.div`
  display: flex;
  flex-direction: column;
  padding: 1rem;
`

const InputWrapper = styled.div`
  display: flex;
  padding-top: 1rem;
`

export const StakeRadi = ({ onDismiss }: { onDismiss: () => void }) => {
  const { account, chainId } = useActiveWeb3React()
  const radi = useRadiContract()
  const stakingPool = useStakingPoolContract()
  const [typedValue, setTypedValue] = useState('')
  const [radiBalance, setRadiBalance] = useState('')
  const addTransaction = useTransactionAdder()

  const getData = useCallback(async () => {
    const balance = await radi?.balanceOf(account)
    setRadiBalance(fromWei(balance.toString(), 'ether'))
  }, [account, radi])

  useEffect(() => {
    if (!chainId || !account) return
    getData()
  }, [account, chainId, getData])

  const handleChangeTypedValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setTypedValue(value)
  }

  const handleSetMax = () => {
    setTypedValue(radiBalance)
  }

  const handleStake = async () => {
    const parsedAmmount = tryParseAmount(typedValue, RADI[chainId || ChainId.AVALANCHE])

    if (!stakingPool || !parsedAmmount) return

    const txReceipt = await stakingPool.enter(`0x${parsedAmmount?.raw.toString(16)}`)

    addTransaction(txReceipt, { summary: `Stake ${typedValue} RADI into xRADI Pool` })
    onDismiss()
  }

  return (
    <Wrapper>
      <TYPE.mediumHeader style={{ marginTop: '0.5rem' }}>You have {radiBalance} $RADI</TYPE.mediumHeader>
      <InputWrapper>
        <input type="text" value={typedValue} onChange={handleChangeTypedValue} />
        <button onClick={handleSetMax}>Max</button>
      </InputWrapper>
      <button onClick={handleStake}>Stake</button>
    </Wrapper>
  )
}
