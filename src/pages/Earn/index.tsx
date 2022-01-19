import { ChainId, JSBI } from '@rytell/sdk'
import React, { useEffect, useState } from 'react'
import { RouteComponentProps } from 'react-router-dom'
import styled from 'styled-components'
import ClaimRewardModal from '../../components/earn/ClaimRewardModal'
import Loader from '../../components/Loader'
import PoolsGrid from '../../components/PoolsGrid'
import PoolsGridItem from '../../components/PoolsGrid/Item'
import { STAKING_REWARDS_INFO } from '../../constants/index'
import { useActiveWeb3React } from '../../hooks'
import { StakingInfo, useStakingInfo } from '../../state/stake/hooks'
import { unwrappedToken } from '../../utils/wrappedCurrency'

const Wrapper = styled.div`
  width: 100vw;
  margin-top: -2rem;
  background-color: ${({ theme }) => theme.color2};
  overflow: hidden;
`

const LoaderWrapper = styled.div`
  display: flex;
  flex: 1;
  justify-content: center;
  align-items: center;
  padding: 1.5rem 0;
  svg {
    width: 2rem;
    height: 2rem;
  }
`

const fetchPoolAprs = async (
  chainId: ChainId | undefined,
  stakingInfos: StakingInfo[],
  callback: (arr: any[]) => any,
  props: {
    onClickClaim: (stakingInfo: StakingInfo) => void
  }
) => {
  callback([])
  const results = await Promise.all(
    stakingInfos
      ?.sort(function(info_a, info_b) {
        // greater stake in avax comes first
        return info_a.totalStakedInWavax?.greaterThan(info_b.totalStakedInWavax ?? JSBI.BigInt(0)) ? -1 : 1
      })
      .sort(function(info_a, info_b) {
        if (info_a.stakedAmount.greaterThan(JSBI.BigInt(0))) {
          if (info_b.stakedAmount.greaterThan(JSBI.BigInt(0)))
            // both are being staked, so we keep the previous sorting
            return 0
          // the second is actually not at stake, so we should bring the first up
          else return -1
        } else {
          if (info_b.stakedAmount.greaterThan(JSBI.BigInt(0)))
            // first is not being staked, but second is, so we should bring the first down
            return 1
          // none are being staked, let's keep the  previous sorting
          else return 0
        }
      })
      .sort(function(info_a, info_b) {
        // greater stake in avax comes first
        return +(info_b.multiplier?.toString() || '0') - +(info_a.multiplier?.toString() || '0')
      })
    // .map(stakingInfo => {
    //   return fetch(
    //     `${process.env.REACT_APP_APR_API}${stakingInfo.stakingRewardAddress}/${chainId || ChainId.AVALANCHE}`
    //   )
    //     .then(res => res.text())
    //     .then(res => ({ apr: res, ...stakingInfo }))
    // })
  )

  if (results.length) {
    callback(
      results.map(stakingInfo => {
        const { tokens } = stakingInfo

        const token0 = tokens[0]
        const token1 = tokens[1]

        const currency0 = unwrappedToken(token0)
        const currency1 = unwrappedToken(token1)
        return (
          <PoolsGridItem
            apr={'0'}
            stakingInfo={stakingInfo}
            key={`${currency0.symbol}-${currency1.symbol}`}
            onClickClaim={props.onClickClaim}
          />
        )
      })
    )
  }
}

export default function Earn({
  match: {
    params: { version }
  }
}: RouteComponentProps<{ version: string }>) {
  const { chainId } = useActiveWeb3React()
  const [stakingVersionIndex, setStakingVersionIndex] = useState<number>(0)
  const stakingInfos = useStakingInfo(undefined, { once: true })
  const [poolCards, setPoolCards] = useState<
    {
      stakingInfo: StakingInfo
      version: string
      apr: string
    }[]
  >([])

  const [showClaimRewardModal, setShowClaimRewardModal] = useState(false)
  const [currentStakingPool, setCurrentStakingPool] = useState<StakingInfo | undefined>()

  useEffect(() => {
    setStakingVersionIndex(Number(version) <= 1 ? 1 : Number(version) - 1)
  }, [version])

  useEffect(() => {
    fetchPoolAprs(chainId, stakingInfos, setPoolCards, {
      onClickClaim: stakingInfo => {
        setCurrentStakingPool(stakingInfo)
        setShowClaimRewardModal(true)
      }
    })
  }, [chainId, stakingInfos, stakingVersionIndex])

  const stakingRewardsExist = Boolean(
    typeof chainId === 'number' && (STAKING_REWARDS_INFO[chainId || ChainId.AVALANCHE]?.length ?? 0) > 0
  )

  return (
    <Wrapper>
      {currentStakingPool && (
        <ClaimRewardModal
          isOpen={showClaimRewardModal}
          onDismiss={() => {
            setCurrentStakingPool(undefined)
            setShowClaimRewardModal(false)
          }}
          stakingInfo={currentStakingPool}
        />
      )}

      {stakingRewardsExist && poolCards?.length === 0 ? (
        <LoaderWrapper>
          <Loader style={{ margin: 'auto' }} />
        </LoaderWrapper>
      ) : !stakingRewardsExist ? (
        'No active rewards'
      ) : (
        <PoolsGrid pools={poolCards} />
      )}
    </Wrapper>
  )
}
