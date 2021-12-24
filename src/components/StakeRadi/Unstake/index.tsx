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

export const UnstakeRadi = ({ onDismiss }: { onDismiss: () => void }) => {
  const { account, chainId } = useActiveWeb3React()
  const radi = useRadiContract()
  const stakingPool = useStakingPoolContract()

  const [xRadiBalance, setXRadiBalance] = useState('')
  const [radiBalance, setRadiBalance] = useState('')
  const [typedValue, setTypedValue] = useState('')
  const addTransaction = useTransactionAdder()

  const getData = useCallback(async () => {
    const [balance, stakingPoolRadiBalance, totalSupply] = await Promise.all([
      stakingPool?.balanceOf(account),
      radi?.balanceOf(stakingPool?.address),
      stakingPool?.totalSupply()
    ])

    const price = stakingPoolRadiBalance.div(totalSupply.toString() === '0' ? 1 : totalSupply)
    const xRadiInRadi = price.mul(balance)

    setRadiBalance(fromWei(xRadiInRadi.toString(), 'ether'))
    setXRadiBalance(fromWei(balance.toString(), 'ether'))
  }, [account, stakingPool, radi])

  useEffect(() => {
    if (!chainId || !account) return
    getData()
  }, [account, chainId, getData])

  const handleChangeTypedValue = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target
    setTypedValue(value)
  }

  const handleSetMax = () => {
    setTypedValue(xRadiBalance)
  }

  const handleStake = async () => {
    const parsedAmmount = tryParseAmount(typedValue, RADI[chainId || ChainId.AVALANCHE])
    if (!stakingPool || !parsedAmmount) return

    const txReceipt = await stakingPool.leave(`0x${parsedAmmount?.raw.toString(16)}`)

    addTransaction(txReceipt, { summary: `Unstake ${typedValue} xRADI as RADI to Wallet` })
    onDismiss()
  }

  return (
    <Wrapper>
      <TYPE.mediumHeader style={{ marginTop: '0.5rem' }}>You have {xRadiBalance} xRADI</TYPE.mediumHeader>
      <TYPE.mediumHeader style={{ marginTop: '0.5rem' }}>Worth {radiBalance} RADI</TYPE.mediumHeader>
      <InputWrapper>
        <input type="text" value={typedValue} onChange={handleChangeTypedValue} />
        <button onClick={handleSetMax}>Max</button>
      </InputWrapper>
      <button onClick={handleStake}>Unstake</button>
    </Wrapper>
  )
}
