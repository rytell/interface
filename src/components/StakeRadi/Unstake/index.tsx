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
import { RowBetween } from '../../Row'
import { AutoColumn } from '../../Column'
import { ButtonPrimary } from '../../Button'
import moment from 'moment'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
  padding: 1.5rem;
`

const InputWrapper = styled.div`
  display: flex;
`

const StakeAmount = styled(RowBetween)`
  display: grid;
  grid-template-columns: 5rem 1fr;
  gap: 1.5rem;
  background-color: ${({ theme }) => theme.bg2};
  border: 2px solid ${({ theme }) => theme.bg3};
  border-radius: 1.25rem;
  padding: 1rem 1rem;
  button {
    font-size: 1rem;
    padding: 0.75rem 1rem;
    background-color: ${({ theme }) => theme.primary1};
    border: 2px solid ${({ theme }) => theme.primary1};
    border-radius: 1.5rem;
    color: #fff;
    &:hover,
    &:focus {
      background-color: ${({ theme }) => theme.primary1};
      border-color: ${({ theme }) => theme.primary1};
    }
  }
  > * {
    height: 100%;
  }
`

const StakeInput = styled.input`
  color: ${({ theme }) => theme.text1};
  background-color: transparent;
  border: none;
  padding: 0.5rem;
  font-size: 15px;
  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
  }
`

const UnstakeWarning = () => {
  const { account, chainId } = useActiveWeb3React()
  const stakingPool = useStakingPoolContract()
  const [formattedUnlockDate, setFormattedUnlockDate] = useState(moment().format())
  const [itsBeforeUnlockDate, setIsBeforeUnlockDate] = useState(false)
  const [feePercentage, setFeePercentage] = useState(0)

  const getData = useCallback(async () => {
    const [
      unlockDate,
      MAX_EARLY_WITHDRAW_FEE_PERCENTAGE_BASE,
      earlyWithdrawalFeePortionFromPercentageBase
    ] = await Promise.all([
      stakingPool?.unlockDate(),
      stakingPool?.MAX_EARLY_WITHDRAW_FEE_PERCENTAGE_BASE(),
      stakingPool?.earlyWithdrawalFeePortionFromPercentageBase()
    ])

    setIsBeforeUnlockDate(unlockDate.toNumber() * 1000 > new Date().getTime())
    setFormattedUnlockDate(moment(unlockDate.toNumber() * 1000).format('LLL'))
    setFeePercentage(
      (earlyWithdrawalFeePortionFromPercentageBase.toNumber() / MAX_EARLY_WITHDRAW_FEE_PERCENTAGE_BASE.toNumber()) * 100
    )
  }, [stakingPool])

  useEffect(() => {
    if (!chainId || !account) return
    getData()
  }, [account, chainId, getData])

  return itsBeforeUnlockDate ? (
    <div>
      Be aware, if you unstake before {formattedUnlockDate}, you will receive {feePercentage}% less $RADI.
    </div>
  ) : (
    <></>
  )
}

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

    const etherXradiCurrentSupply = +fromWei(totalSupply.toString(), 'ether') || 1

    const xRadiCurrentPrice = +fromWei(stakingPoolRadiBalance.toString(), 'ether') / etherXradiCurrentSupply

    const xRadiInRadi = +fromWei(balance.toString(), 'ether') * xRadiCurrentPrice

    setRadiBalance(xRadiInRadi.toFixed(4).toLocaleString())
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
    <ContentWrapper gap="lg">
      <RowBetween>
        <TYPE.largeHeader>Unstake</TYPE.largeHeader>
      </RowBetween>
      <UnstakeWarning />
      <RowBetween>You have {Number(xRadiBalance).toFixed(4)} xRADI</RowBetween>
      <RowBetween>Worth {radiBalance} RADI</RowBetween>
      <InputWrapper>
        <StakeAmount>
          <button onClick={handleSetMax}>Max</button>
          <StakeInput type="text" value={typedValue} onChange={handleChangeTypedValue} />
        </StakeAmount>
      </InputWrapper>
      <ButtonPrimary onClick={handleStake}>Unstake</ButtonPrimary>
    </ContentWrapper>
  )
}
