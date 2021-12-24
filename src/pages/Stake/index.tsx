import React, { ReactElement, useCallback, useEffect, useState } from 'react'
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

const Button = styled.span`
  border-radius: 3px;
  border: 1px solid gray;
  cursor: pointer;
  width: 5rem;
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
`

const GetRadiOrInteract = ({ children, balance }: { children: ReactElement; balance: string }) => {
  return +balance > 0 ? (
    children
  ) : (
    <StyledNavLink id={`swap-nav-link`} to={'/swap'}>
      Go get some RADI first!
    </StyledNavLink>
  )
}

const UserCurrentBalances = ({ radiBalance, stakingBalance }: { radiBalance: string; stakingBalance: string }) => {
  return (
    <>
      <div>You have {stakingBalance} xRADI</div>
      <div>Which is worth {radiBalance} $RADI</div>
    </>
  )
}

const StakingPoolInfo = ({
  totalMinted,
  totalStaked,
  price
}: {
  totalStaked: string
  totalMinted: string
  price: string
}) => {
  return (
    <>
      <div>Total $RADI staked: {totalStaked}</div>
      <div>Total xRADI supply: {totalMinted}</div>
      <div>Each xRADI is worth {price} $RADI now</div>
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
      return <></>
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

  const [userRadiBalance, setRadiBalance] = useState('')
  const [userRadiBigNumberBalance, setRadiBigNumberBalance] = useState('')
  const [userStakingBalance, setStakingBalance] = useState('')
  const [totalStaked, setStakingPoolRadiBalance] = useState('')
  const [totalMinted, setXRadiSupply] = useState('')
  const [xRadiPrice, setXRadiPrice] = useState('')
  const [xRadiInRadiBalance, setXRadiInRadiBalance] = useState('')

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
    const userStakingBalance = await stakingPool?.balanceOf(account)
    const stakingPoolBalance = (await radi?.balanceOf(stakingPool?.address)) as BigNumber
    const xRadiCurrentSupply = (await stakingPool?.totalSupply()) as BigNumber
    const xRadiCurrentPrice = stakingPoolBalance.div(xRadiCurrentSupply.toString() === '0' ? 1 : xRadiCurrentSupply)

    const xRadiInRadi = xRadiCurrentPrice.mul(userStakingBalance)

    setRadiBigNumberBalance(userBalance)
    setRadiBalance(fromWei(userBalance.toString(), 'ether'))
    setStakingBalance(fromWei(userStakingBalance.toString(), 'ether'))
    setStakingPoolRadiBalance(fromWei(stakingPoolBalance.toString(), 'ether'))
    setXRadiSupply(fromWei(xRadiCurrentSupply.toString(), 'ether'))
    setXRadiPrice(fromWei(xRadiCurrentPrice.toString(), 'wei'))
    setXRadiInRadiBalance(fromWei(xRadiInRadi.toString(), 'ether'))
    if (txs) return
  }, [radi, stakingPool, account, txs])

  useEffect(() => {
    if (!chainId || !account) return

    getData()
  }, [chainId, account, getData])

  // const DataRow = styled(RowBetween)`
  //   ${({ theme }) => theme.mediaWidth.upToSmall`
  //    flex-direction: column;
  //  `};
  // `

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
        <GetRadiOrInteract balance={userRadiBalance}>
          <PoolSection>
            {account ? (
              <>
                <UserCurrentBalances radiBalance={xRadiInRadiBalance} stakingBalance={userStakingBalance} />
                <StakingPoolInfo totalMinted={totalMinted} totalStaked={totalStaked} price={xRadiPrice} />
                <ApproveOrInteract approval={approval} onApprove={stakingPoolApproveCallback}>
                  <>
                    <Button onClick={() => setStakingModalOpen(true)}>Stake</Button>
                    <Button onClick={() => setUnstakingModalOpen(true)}>Unstake</Button>
                  </>
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
