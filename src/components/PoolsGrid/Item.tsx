import { Fraction, JSBI } from '@rytell/sdk'
import React, { useMemo } from 'react'
import styled from 'styled-components'
import { useActiveWeb3React } from '../../hooks'
import { useWalletModalToggle } from '../../state/application/hooks'
import { StakingInfo } from '../../state/stake/hooks'
import { StyledInternalLink } from '../../theme'
import { currencyId } from '../../utils/currencyId'
import { useSnowtraceUrl } from '../../utils/useSnowtraceUrl'
import { unwrappedToken } from '../../utils/wrappedCurrency'
import { WithLockedValue } from '../WithLockedValue'

const Item = styled.div`
  display: flex;
  flex: 1;
  flex-direction: column;
  padding: 0.5rem;
  background-color: ${({ theme }) => theme.color2};
  [class*='-item-header'] h4 {
    color: ${({ theme }) => theme.text1};
    word-break: break-all;
    span {
      display: inline-block;
    }
  }
  .poolsGrid-item-header-features span {
    background-color: ${({ theme }) => theme.primary1};
    border: 2px solid ${({ theme }) => theme.primary2};
  }
  .poolsGrid-item-header-features span:nth-child(1) {
    color: ${({ theme }) => theme.primary2};
    border-color: ${({ theme }) => theme.primary2};
    background-color: transparent;
  }
  .poolsGrid-item-content a:hover {
    text-decoration: none;
  }
  .poolsGrid-item-grid {
    grid-template-columns: 1fr;
  }
  .poolsGrid-item-grid p:nth-child(1) {
    color: ${({ theme }) => theme.text6};
  }
  .grid-item-details {
    background-color: transparent;
  }
  .grid-item-details-btn {
    color: ${({ theme }) => theme.primary3};
  }
  .grid-item-details-btn svg {
    fill: ${({ theme }) => theme.primary3};
  }
  .grid-item-details .poolsGrid-item-table span {
    color: ${({ theme }) => theme.text1};
  }
  .grid-item-details .poolsGrid-item-table a {
    color: ${({ theme }) => theme.primary3};
  }
`

const ExtLink = styled.div`
  margin-left: 0.125em;
`

export default function PoolsGridItem({
  stakingInfo,
  apr,
  onClickClaim
}: {
  stakingInfo: StakingInfo
  apr: string
  onClickClaim: (stakingInfo: StakingInfo) => void
}) {
  const { account } = useActiveWeb3React()
  const {
    tokens,
    stakedAmount,
    totalRewardRate,
    totalStakedInWavax,
    earnedAmount,
    multiplier,
    stakingRewardAddress
  } = stakingInfo
  const token0 = tokens[0]
  const token1 = tokens[1]

  const currency0 = unwrappedToken(token0)
  const currency1 = unwrappedToken(token1)
  const weeklyRewardAmount = totalRewardRate.multiply(JSBI.BigInt(60 * 60 * 24 * 7))
  let weeklyRewardPerAvax = weeklyRewardAmount.divide(totalStakedInWavax)
  if (JSBI.EQ(weeklyRewardPerAvax.denominator, 0)) {
    weeklyRewardPerAvax = new Fraction(JSBI.BigInt(0), JSBI.BigInt(1))
  }

  const isStaking = Boolean(stakedAmount.greaterThan('0'))
  const toggleWalletModal = useWalletModalToggle()

  const liquidityPoolCalculatedSymbol = useMemo(() => {
    if (currency0.symbol && currency0.symbol === 'AVAX' && currency1.symbol && currency1.symbol === 'RADI') {
      return `RADI/AVAX`
    }

    return (
      <>
        <span>{currency0.symbol}</span>/<span>{currency1.symbol}</span>
      </>
    )
  }, [currency0, currency1])

  const token0Url = useSnowtraceUrl(token0.address)
  const token1Url = useSnowtraceUrl(token1.address)
  const liquidityPoolUrl = useSnowtraceUrl(stakingRewardAddress)

  return (
    <Item className="poolsGrid-item">
      <div className="poolsGrid-item-content">
        <div className="poolsGrid-item-header">
          <div>
            <h4>{liquidityPoolCalculatedSymbol}</h4>
            <div className="poolsGrid-item-header-features">
              <span>{multiplier?.toString() !== '0' ? <>Core</> : 'Delisted Pool'}</span>
              <span>{multiplier?.toString()}X</span>
            </div>
          </div>
        </div>
        <div className="poolsGrid-item-table">
          <p>APR: {multiplier?.toString() === '0' ? <span>0%</span> : <span>{apr}%</span>}</p>
          <p>
            Earn: <span>RADI</span>
          </p>
        </div>
        <div className="poolsGrid-item-grid">
          <div>
            <p>RADI earned</p>
            <WithLockedValue>
              <p>{earnedAmount.toFixed(0, { groupSeparator: ',' })}</p>
            </WithLockedValue>
          </div>
          {/* <div>
            <button
              className="btn"
              onClick={() => onClickClaim(stakingInfo)}
              disabled={!account || !earnedAmount.greaterThan('0')}
            >
              Claim
            </button>
          </div> */}
        </div>
        {account ? (
          <StyledInternalLink to={`/radi/${currencyId(currency0)}/${currencyId(currency1)}`}>
            {isStaking ? (
              <button className="btn">Manage</button>
            ) : (
              <button className="btn btn-secondary">Deposit</button>
            )}
          </StyledInternalLink>
        ) : (
          <button className="btn hero-btn" onClick={toggleWalletModal}>
            Unlock Wallet
          </button>
        )}
      </div>
      <div className="grid-item-details">
        <details>
          <summary>
            <span className="grid-item-details-btn">Details /</span>
          </summary>
          <div className="poolsGrid-item-table">
            <p>
              Get LP tokens: <span>{`${currency0.symbol}-${currency1.symbol}`} LP</span>
            </p>
            <p>
              Total Staked In WAVAX:{' '}
              <span>{`${totalStakedInWavax.toSignificant(4, { groupSeparator: ',' }) ?? '-'} AVAX`}</span>
            </p>
            <a href={token0Url} target="_blank" rel="noopener noreferrer">
              View {token0.symbol} Contract <ExtLink />
            </a>
            <a href={token1Url} target="_blank" rel="noopener noreferrer">
              View {token1.symbol} Contract <ExtLink />
            </a>
            <a href={liquidityPoolUrl} target="_blank" rel="noopener noreferrer">
              View Farm Contract <ExtLink />
            </a>
          </div>
        </details>
      </div>
    </Item>
  )
}
