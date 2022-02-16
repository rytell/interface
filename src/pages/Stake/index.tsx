import React, { ReactElement, useCallback, useEffect, useState } from 'react'
import moment from 'moment'
import { AutoColumn } from '../../components/Column'
import styled from 'styled-components'
import { TYPE } from '../../theme'
import { NavLink, RouteComponentProps } from 'react-router-dom'
import { RowBetween } from '../../components/Row'
import { CardSection, DataCard } from '../../components/earn/styled'
import { useTranslation } from 'react-i18next'
import { useRadiContract, useStakingPoolContract } from '../../hooks/useContract'
import { RADI, RADI_STAKING_POOL } from '../../constants'
import { ChainId, JSBI, TokenAmount } from '@rytell/sdk'
import { useActiveWeb3React } from '../../hooks'
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback'
import { ethers } from 'ethers'
import { fromWei } from 'web3-utils'
import { darken } from 'polished'
import { BigNumber } from 'ethers'
import Modal from '../../components/Modal'
import { StakeRadi } from '../../components/StakeRadi/Stake'
import { UnstakeRadi } from '../../components/StakeRadi/Unstake'
import { useAllTransactions } from '../../state/transactions/hooks'
import { ButtonPrimary } from '../../components/Button'
import { EXCHANGE_API } from '../../constants/index'

const PageWrapper = styled(AutoColumn)`
  max-width: 640px;
  width: 100%;
`

const TopSection = styled(AutoColumn)`
  max-width: 720px;
  width: 100%;
`

const PoolSection = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  column-gap: 10px;
  row-gap: 15px;
  width: 100%;
  justify-self: center;
`

const activeClassName = 'ACTIVE'

const StyledNavLink = styled(NavLink).attrs({
  activeClassName
})`
  ${({ theme }) => theme.flexRowNoWrap}
  align-items: left;
  border-radius: 3rem;
  outline: none;
  cursor: pointer;
  text-decoration: none;
  color: ${({ theme }) => theme.text2};
  font-size: 1rem;
  width: fit-content;
  margin: 0 12px;
  font-weight: 500;

  &.${activeClassName} {
    border-radius: 12px;
    font-weight: 600;
    color: ${({ theme }) => theme.text1};
  }

  :hover,
  :focus {
    color: ${({ theme }) => darken(0.1, theme.text1)};
  }
`

const Buttons = styled.div`
  width: 100%;
  display: grid;
  grid-auto-flow: column;
  gap: 1.5rem;

  button {
    display: block;
  }
`

const Button = styled(ButtonPrimary)`
  cursor: pointer;
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
`

const GetRadiOrInteract = ({
  children,
  balance,
  xRadiBalance
}: {
  children: ReactElement
  balance: string
  xRadiBalance: string
}) => {
  return +balance > 0 || +xRadiBalance > 0 ? (
    children
  ) : (
    <StyledNavLink id={`swap-nav-link`} to={'/swap'}>
      <span style={{ color: '#fff' }}>Go get some RADI first!</span>
    </StyledNavLink>
  )
}

//
const getRadiAnnualProjection = (): any => {
  const response = fetch(`${EXCHANGE_API}/volume/annual-projection`).then(resp => resp.text().then(val => val))
  return response
}

const getExchangeAnnualProjection = (totalRadi: any, radiAnnualProjection: any, totalXRadi: any): any => {
  const exchange = (totalRadi + radiAnnualProjection) / totalXRadi
  const price = totalRadi / totalXRadi
  const diff = exchange - price / price

  return (diff * 100).toFixed(4)
}

const UserCurrentBalances = ({ radiBalance, stakingBalance }: { radiBalance: string; stakingBalance: string }) => {
  return (
    <>
      <div style={{ color: '#fff' }}>You have {stakingBalance} xRADI</div>
      <div style={{ color: '#fff' }}>Which is worth {radiBalance} $RADI</div>
    </>
  )
}

const StakingPoolInfo = ({
  totalMinted,
  totalStaked,
  price,
  annualProjection,
  earlyWithdrawFee,
  unlockDate
}: {
  totalStaked: string
  totalMinted: string
  price: string
  annualProjection: string
  earlyWithdrawFee: string
  unlockDate: string
}) => {
  return (
    <>
      <div style={{ color: '#fff' }}>Total $RADI staked: {totalStaked}</div>
      <div style={{ color: '#fff' }}>Total xRADI supply: {totalMinted}</div>
      <div style={{ color: '#fff' }}>Each xRADI is worth {price} $RADI now</div>
      <div style={{ color: '#fff' }}>APR: {annualProjection}%</div>
      <div style={{ color: '#fff' }}>Early Withdraw Fee: {earlyWithdrawFee}%</div>
      <div style={{ color: '#fff' }}>Unlock Date: {unlockDate}</div>
    </>
  )
}

const ApproveOrInteract = ({
  children,
  approval,
  onApprove
}: {
  children: ReactElement
  approval: ApprovalState
  onApprove: () => Promise<void>
}) => {
  switch (approval) {
    case ApprovalState.APPROVED:
      return children
    case ApprovalState.NOT_APPROVED:
      return <Button onClick={onApprove}>Approve</Button>
    case ApprovalState.PENDING:
      return <>Approving...</>
    default:
      return <>Checking Approval state...</>
  }
}

export default function Earn({
  match: {
    params: { version }
  }
}: RouteComponentProps<{ version: string }>) {
  const { chainId, account } = useActiveWeb3React()
  const { t } = useTranslation()
  const radi = useRadiContract()
  const stakingPool = useStakingPoolContract()
  const txs = useAllTransactions()
  const [txLength, setTxsLength] = useState(-1)

  const [userRadiBalance, setRadiBalance] = useState('')
  const [userRadiBigNumberBalance, setRadiBigNumberBalance] = useState('')
  const [userStakingBalance, setStakingBalance] = useState('')
  const [totalStaked, setStakingPoolRadiBalance] = useState('')
  const [totalMinted, setXRadiSupply] = useState('')
  const [xRadiPrice, setXRadiPrice] = useState('')
  const [xRadiInRadiBalance, setXRadiInRadiBalance] = useState('')
  const [radiAnnualProjection, setRadiAnnualProjection] = useState('')
  const [earlyWithdrawFee, setEarlyWitdrawFee] = useState('')
  const [unlockDate, setUnlockDate] = useState('')

  const [stakingModalOpen, setStakingModalOpen] = useState(false)
  const [unstakingModalOpen, setUnstakingModalOpen] = useState(false)

  const parsedMaxAmount = new TokenAmount(RADI[chainId || ChainId.AVALANCHE], JSBI.BigInt(ethers.constants.MaxUint256))
  const parsedCurrentBalance = new TokenAmount(RADI[chainId || ChainId.AVALANCHE], userRadiBigNumberBalance)

  const [, stakingPoolApproveCallback] = useApproveCallback(
    parsedMaxAmount,
    RADI_STAKING_POOL[chainId || ChainId.AVALANCHE]
  )

  const [approval] = useApproveCallback(parsedCurrentBalance, RADI_STAKING_POOL[chainId || ChainId.AVALANCHE])

  const getData = useCallback(async () => {
    const userBalance = await radi?.balanceOf(account)
    const userStakingBalance = await stakingPool?.balanceOf(account) // users's xRADI
    const stakingPoolBalance = (await radi?.balanceOf(stakingPool?.address)) as BigNumber // xRADI balance on RADI
    const xRadiCurrentSupply = (await stakingPool?.totalSupply()) as BigNumber // xRADI totalSupply

    const etherXradiCurrentSupply = +fromWei(xRadiCurrentSupply.toString(), 'ether') || 1

    const xRadiCurrentPrice = +fromWei(stakingPoolBalance.toString(), 'ether') / etherXradiCurrentSupply

    const xRadiInRadi = +fromWei(userStakingBalance.toString(), 'ether') * xRadiCurrentPrice // user's xRADI worth in RADI

    const radiAnnualProjectionValue = await getRadiAnnualProjection()
    const percentajeAnnualProjection = getExchangeAnnualProjection(
      +fromWei(stakingPoolBalance.toString(), 'ether'),
      +radiAnnualProjectionValue,
      +fromWei(xRadiCurrentSupply.toString(), 'ether')
    )

    const earlyWithdraw = await stakingPool?.earlyWithdrawalFeePortionFromPercentageBase()
    const unlockDateStamp = await stakingPool?.unlockDate()
    const unlockDateMoment = moment(unlockDateStamp * 1000)

    setRadiBigNumberBalance(userBalance)
    setRadiBalance(fromWei(userBalance.toString(), 'ether'))
    setStakingBalance(fromWei(userStakingBalance.toString(), 'ether'))
    setStakingPoolRadiBalance(fromWei(stakingPoolBalance.toString(), 'ether'))
    setXRadiSupply(fromWei(xRadiCurrentSupply.toString(), 'ether'))
    setXRadiPrice(xRadiCurrentPrice.toLocaleString())
    setXRadiInRadiBalance(xRadiInRadi.toLocaleString())
    setRadiAnnualProjection(percentajeAnnualProjection)
    setEarlyWitdrawFee(earlyWithdraw.toNumber())
    setUnlockDate(unlockDateMoment.format('LLL'))
  }, [radi, stakingPool, account])

  useEffect(() => {
    if (!chainId || !account || Object.keys(txs).length === txLength) return

    getData()

    setTxsLength(Object.keys(txs).length)
  }, [chainId, account, txLength, getData, txs])

  return (
    <PageWrapper gap="lg" justify="center">
      <Modal isOpen={stakingModalOpen} onDismiss={() => setStakingModalOpen(false)}>
        <StakeRadi onDismiss={() => setStakingModalOpen(false)} />
      </Modal>
      <Modal isOpen={unstakingModalOpen} onDismiss={() => setUnstakingModalOpen(false)}>
        <UnstakeRadi onDismiss={() => setUnstakingModalOpen(false)} />
      </Modal>
      <TopSection gap="md">
        <DataCard>
          <CardSection>
            <AutoColumn gap="md">
              <RowBetween>
                <TYPE.white fontWeight={600}>{t('earnPage.rytellLiquidityStaking')}</TYPE.white>
              </RowBetween>
              <RowBetween>
                <TYPE.white fontSize={14}>{t('earnPage.depositRytellStaking')}</TYPE.white>
              </RowBetween>
            </AutoColumn>
          </CardSection>
        </DataCard>
      </TopSection>

      <AutoColumn gap="lg" style={{ width: '100%', maxWidth: '720px' }}>
        {/* <DataRow style={{ alignItems: 'baseline' }}>
          <TYPE.mediumHeader style={{ marginTop: '0.5rem' }}>{t('earnPage.currentOpportunities')}</TYPE.mediumHeader>
        </DataRow> */}
        <GetRadiOrInteract balance={userRadiBalance} xRadiBalance={userStakingBalance}>
          <PoolSection>
            {account ? (
              <>
                <UserCurrentBalances radiBalance={xRadiInRadiBalance} stakingBalance={userStakingBalance} />
                <StakingPoolInfo
                  totalMinted={totalMinted}
                  totalStaked={totalStaked}
                  price={xRadiPrice}
                  annualProjection={radiAnnualProjection}
                  earlyWithdrawFee={earlyWithdrawFee}
                  unlockDate={unlockDate}
                />
                <ApproveOrInteract approval={approval} onApprove={stakingPoolApproveCallback}>
                  <Buttons>
                    <Button onClick={() => setStakingModalOpen(true)}>Stake</Button>
                    <Button onClick={() => setUnstakingModalOpen(true)}>Unstake</Button>
                  </Buttons>
                </ApproveOrInteract>
              </>
            ) : (
              <TYPE.mediumHeader style={{ marginTop: '0.5rem' }}>
                Please connect your wallet to see staking info and interactions available.
              </TYPE.mediumHeader>
            )}
          </PoolSection>
        </GetRadiOrInteract>
      </AutoColumn>
    </PageWrapper>
  )
}
