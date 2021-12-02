import { ChainId, CurrencyAmount, JSBI, Token, TokenAmount, WAVAX, Pair, Percent } from '@pangolindex/sdk'
import { useMemo, useEffect, useState } from 'react'
import {
  PNG,
  USDTe,
  USDCe,
  DAIe,
  MINICHEF_ADDRESS,
  BIG_INT_ZERO,
  BIG_INT_TWO,
  BIG_INT_ONE,
  BIG_INT_EIGHTEEN,
  BIG_INT_TEN
} from '../../constants'
import { STAKING_REWARDS_INTERFACE } from '../../constants/abis/staking-rewards'
import { PairState, usePair, usePairs } from '../../data/Reserves'
import { useActiveWeb3React } from '../../hooks'
import {
  NEVER_RELOAD,
  useMultipleContractSingleData,
  useSingleCallResult,
  useSingleContractMultipleData
} from '../multicall/hooks'
import { tryParseAmount } from '../swap/hooks'
import { useTranslation } from 'react-i18next'
import ERC20_INTERFACE from '../../constants/abis/erc20'
import useUSDCPrice from '../../utils/useUSDCPrice'
import { getRouterContract } from '../../utils'
import { useTokenBalance } from '../../state/wallet/hooks'
import { useTotalSupply } from '../../data/TotalSupply'
import { useStakingContract } from '../../hooks/useContract'
import { SINGLE_SIDE_STAKING_REWARDS_INFO } from './singleSideConfig'
import { DOUBLE_SIDE_STAKING_REWARDS_INFO } from './doubleSideConfig'

export interface SingleSideStaking {
  rewardToken: Token
  conversionRouteHops: Token[]
  stakingRewardAddress: string
  version: number
}

export interface DoubleSideStaking {
  tokens: [Token, Token]
  stakingRewardAddress: string
  version: number
  multiplier: number
}

export interface Migration {
  from: DoubleSideStaking
  to: DoubleSideStaking
}

export interface BridgeMigrator {
  aeb: string
  ab: string
}

export interface StakingInfoBase {
  // the address of the reward contract
  stakingRewardAddress: string
  // the amount of token currently staked, or undefined if no account
  stakedAmount: TokenAmount
  // the amount of reward token earned by the active account, or undefined if no account
  earnedAmount: TokenAmount
  // the total amount of token staked in the contract
  totalStakedAmount: TokenAmount
  // the amount of token distributed per second to all LPs, constant
  totalRewardRate: TokenAmount
  // the current amount of token distributed to the active account per second.
  // equivalent to percent of total supply * reward rate
  rewardRate: TokenAmount
  // when the period ends
  periodFinish: Date | undefined
  // has the reward period expired
  isPeriodFinished: boolean
  // calculates a hypothetical amount of token distributed to the active account per second.
  getHypotheticalRewardRate: (
    stakedAmount: TokenAmount,
    totalStakedAmount: TokenAmount,
    totalRewardRate: TokenAmount
  ) => TokenAmount
}

export interface SingleSideStakingInfo extends StakingInfoBase {
  // the token being earned
  rewardToken: Token
  // total staked PNG in the pool
  totalStakedInRadi: TokenAmount
  apr: JSBI
}

export interface DoubleSideStakingInfo extends StakingInfoBase {
  // the tokens involved in this pair
  tokens: [Token, Token]
  // the pool weight
  multiplier: JSBI
  // total staked AVAX in the pool
  totalStakedInWavax: TokenAmount
  totalStakedInUsd: TokenAmount
}

export interface StakingInfo extends DoubleSideStakingInfo {
  swapFeeApr?: Number
  stakingApr?: Number
  combinedApr?: Number
}

const calculateTotalStakedAmountInAvaxFromRadi = function(
  amountStaked: JSBI,
  amountAvailable: JSBI,
  avaxRadiPairReserveOfRadi: JSBI,
  avaxRadiPairReserveOfWavax: JSBI,
  reserveInRadi: JSBI,
  chainId: ChainId | undefined
): TokenAmount {
  if (JSBI.EQ(amountAvailable, JSBI.BigInt(0))) {
    return new TokenAmount(WAVAX[chainId || ChainId.AVALANCHE], JSBI.BigInt(0))
  }

  const oneToken = JSBI.BigInt(1000000000000000000)
  const avaxRadiRatio = JSBI.divide(JSBI.multiply(oneToken, avaxRadiPairReserveOfWavax), avaxRadiPairReserveOfRadi)
  const valueOfRadiInAvax = JSBI.divide(JSBI.multiply(reserveInRadi, avaxRadiRatio), oneToken)

  return new TokenAmount(
    WAVAX[chainId || ChainId.AVALANCHE],
    JSBI.divide(
      JSBI.multiply(
        JSBI.multiply(amountStaked, valueOfRadiInAvax),
        JSBI.BigInt(2) // this is b/c the value of LP shares are ~double the value of the wavax they entitle owner to
      ),
      amountAvailable
    )
  )
}

const calculateRewardRateInRadi = function(rewardRate: JSBI, valueOfRadi: JSBI | null): JSBI {
  if (!valueOfRadi || JSBI.EQ(valueOfRadi, 0)) return JSBI.BigInt(0)

  // TODO: Handle situation where stakingToken and rewardToken have different decimals
  const oneToken = JSBI.BigInt(1000000000000000000)

  return JSBI.divide(
    JSBI.multiply(rewardRate, oneToken), // Multiply first for precision
    valueOfRadi
  )
}

const calculateApr = function(rewardRatePerSecond: JSBI, totalSupply: JSBI): JSBI {
  if (JSBI.EQ(totalSupply, 0)) {
    return JSBI.BigInt(0)
  }

  const rewardsPerYear = JSBI.multiply(
    rewardRatePerSecond,
    JSBI.BigInt(31536000) // Seconds in year
  )

  return JSBI.divide(JSBI.multiply(rewardsPerYear, JSBI.BigInt(100)), totalSupply)
}

const calculateTotalStakedAmountInAvax = function(
  amountStaked: JSBI,
  amountAvailable: JSBI,
  reserveInWavax: JSBI,
  chainId: ChainId | undefined
): TokenAmount {
  if (JSBI.GT(amountAvailable, 0)) {
    // take the total amount of LP tokens staked, multiply by AVAX value of all LP tokens, divide by all LP tokens
    return new TokenAmount(
      WAVAX[chainId || ChainId.AVALANCHE],
      JSBI.divide(
        JSBI.multiply(
          JSBI.multiply(amountStaked, reserveInWavax),
          JSBI.BigInt(2) // this is b/c the value of LP shares are ~double the value of the wavax they entitle owner to
        ),
        amountAvailable
      )
    )
  } else {
    return new TokenAmount(WAVAX[chainId || ChainId.AVALANCHE], JSBI.BigInt(0))
  }
}

// gets the staking info from the network for the active chain id
export function useStakingInfo(version: number, pairToFilterBy?: Pair | null): DoubleSideStakingInfo[] {
  const { chainId, account } = useActiveWeb3React()

  const info = useMemo(
    () =>
      chainId
        ? DOUBLE_SIDE_STAKING_REWARDS_INFO[chainId]?.[version]?.filter(stakingRewardInfo =>
            pairToFilterBy === undefined
              ? true
              : pairToFilterBy === null
              ? false
              : pairToFilterBy.involvesToken(stakingRewardInfo.tokens[0]) &&
                pairToFilterBy.involvesToken(stakingRewardInfo.tokens[1])
          ) ?? []
        : [],
    [chainId, pairToFilterBy, version]
  )

  const radi = PNG[chainId || ChainId.AVALANCHE]

  const rewardsAddresses = useMemo(() => info.map(({ stakingRewardAddress }) => stakingRewardAddress), [info])

  const accountArg = useMemo(() => [account ?? undefined], [account])

  // get all the info from the staking rewards contracts
  const tokens = useMemo(() => info.map(({ tokens }) => tokens), [info])
  const balances = useMultipleContractSingleData(rewardsAddresses, STAKING_REWARDS_INTERFACE, 'balanceOf', accountArg)
  const earnedAmounts = useMultipleContractSingleData(rewardsAddresses, STAKING_REWARDS_INTERFACE, 'earned', accountArg)
  const stakingTotalSupplies = useMultipleContractSingleData(rewardsAddresses, STAKING_REWARDS_INTERFACE, 'totalSupply')
  const pairs = usePairs(tokens)

  const pairAddresses = useMemo(() => {
    const pairsHaveLoaded = pairs?.every(([state, pair]) => state === PairState.EXISTS)
    if (!pairsHaveLoaded) return []
    else return pairs.map(([state, pair]) => pair?.liquidityToken.address)
  }, [pairs])

  const pairTotalSupplies = useMultipleContractSingleData(pairAddresses, ERC20_INTERFACE, 'totalSupply')

  const [avaxRadiPairState, avaxRadiPair] = usePair(WAVAX[chainId || ChainId.AVALANCHE], radi)

  // tokens per second, constants
  const rewardRates = useMultipleContractSingleData(
    rewardsAddresses,
    STAKING_REWARDS_INTERFACE,
    'rewardRate',
    undefined,
    NEVER_RELOAD
  )
  const periodFinishes = useMultipleContractSingleData(
    rewardsAddresses,
    STAKING_REWARDS_INTERFACE,
    'periodFinish',
    undefined,
    NEVER_RELOAD
  )

  const usdPrice = useUSDCPrice(WAVAX[chainId ? chainId : ChainId.AVALANCHE])

  return useMemo(() => {
    if (!chainId || !radi) return []

    return rewardsAddresses.reduce<DoubleSideStakingInfo[]>((memo, rewardsAddress, index) => {
      // these two are dependent on account
      const balanceState = balances[index]
      const earnedAmountState = earnedAmounts[index]

      // these get fetched regardless of account
      const stakingTotalSupplyState = stakingTotalSupplies[index]
      const rewardRateState = rewardRates[index]
      const periodFinishState = periodFinishes[index]
      const [pairState, pair] = pairs[index]
      const pairTotalSupplyState = pairTotalSupplies[index]

      if (
        // these may be undefined if not logged in
        !balanceState?.loading &&
        !earnedAmountState?.loading &&
        // always need these
        stakingTotalSupplyState?.loading === false &&
        rewardRateState?.loading === false &&
        periodFinishState?.loading === false &&
        pairTotalSupplyState?.loading === false &&
        pair &&
        avaxRadiPair &&
        pairState !== PairState.LOADING &&
        avaxRadiPairState !== PairState.LOADING
      ) {
        if (
          balanceState?.error ||
          earnedAmountState?.error ||
          stakingTotalSupplyState.error ||
          rewardRateState.error ||
          periodFinishState.error ||
          pairTotalSupplyState.error ||
          pairState === PairState.INVALID ||
          pairState === PairState.NOT_EXISTS ||
          avaxRadiPairState === PairState.INVALID ||
          avaxRadiPairState === PairState.NOT_EXISTS
        ) {
          console.error('Failed to load staking rewards info')
          return memo
        }

        // get the LP token
        const tokens = info[index].tokens
        const wavax = tokens[0].equals(WAVAX[tokens[0].chainId]) ? tokens[0] : tokens[1]
        const dummyPair = new Pair(new TokenAmount(tokens[0], '0'), new TokenAmount(tokens[1], '0'), chainId)
        // check for account, if no account set to 0

        const periodFinishMs = periodFinishState.result?.[0]?.mul(1000)?.toNumber()

        // periodFinish will be 0 immediately after a reward contract is initialized
        const isPeriodFinished = periodFinishMs === 0 ? false : periodFinishMs < Date.now()

        const totalSupplyStaked = JSBI.BigInt(stakingTotalSupplyState.result?.[0])
        const totalSupplyAvailable = JSBI.BigInt(pairTotalSupplyState.result?.[0])

        const stakedAmount = new TokenAmount(dummyPair.liquidityToken, JSBI.BigInt(balanceState?.result?.[0] ?? 0))
        const totalStakedAmount = new TokenAmount(dummyPair.liquidityToken, JSBI.BigInt(totalSupplyStaked))
        const totalRewardRate = new TokenAmount(radi, JSBI.BigInt(isPeriodFinished ? 0 : rewardRateState.result?.[0]))

        const isAvaxPool = tokens[0].equals(WAVAX[tokens[0].chainId])
        const totalStakedInWavax = isAvaxPool
          ? calculateTotalStakedAmountInAvax(
              totalSupplyStaked,
              totalSupplyAvailable,
              pair.reserveOf(wavax).raw,
              chainId
            )
          : calculateTotalStakedAmountInAvaxFromRadi(
              totalSupplyStaked,
              totalSupplyAvailable,
              avaxRadiPair.reserveOf(radi).raw,
              avaxRadiPair.reserveOf(WAVAX[tokens[1].chainId]).raw,
              pair.reserveOf(radi).raw,
              chainId
            )

        const totalStakedInUsd = totalStakedInWavax && (usdPrice?.quote(totalStakedInWavax) as TokenAmount)
        const getHypotheticalRewardRate = (
          stakedAmount: TokenAmount,
          totalStakedAmount: TokenAmount,
          totalRewardRate: TokenAmount
        ): TokenAmount => {
          return new TokenAmount(
            radi,
            JSBI.greaterThan(totalStakedAmount.raw, JSBI.BigInt(0))
              ? JSBI.divide(JSBI.multiply(totalRewardRate.raw, stakedAmount.raw), totalStakedAmount.raw)
              : JSBI.BigInt(0)
          )
        }

        const individualRewardRate = getHypotheticalRewardRate(stakedAmount, totalStakedAmount, totalRewardRate)

        const multiplier = info[index].multiplier

        memo.push({
          stakingRewardAddress: rewardsAddress,
          tokens: tokens,
          periodFinish: periodFinishMs > 0 ? new Date(periodFinishMs) : undefined,
          isPeriodFinished: isPeriodFinished,
          earnedAmount: new TokenAmount(radi, JSBI.BigInt(earnedAmountState?.result?.[0] ?? 0)),
          rewardRate: individualRewardRate,
          totalRewardRate: totalRewardRate,
          stakedAmount: stakedAmount,
          totalStakedAmount: totalStakedAmount,
          totalStakedInWavax: totalStakedInWavax,
          totalStakedInUsd: totalStakedInUsd,
          multiplier: JSBI.BigInt(multiplier),
          getHypotheticalRewardRate
        })
      }
      return memo
    }, [])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    chainId,
    radi,
    rewardsAddresses,
    balances,
    earnedAmounts,
    stakingTotalSupplies,
    rewardRates,
    periodFinishes,
    pairs,
    pairTotalSupplies,
    avaxRadiPair,
    avaxRadiPairState,
    info
  ])
}

export function useSingleSideStakingInfo(
  version: number,
  rewardTokenToFilterBy?: Token | null
): SingleSideStakingInfo[] {
  const { chainId, library, account } = useActiveWeb3React()

  const info = useMemo(
    () =>
      chainId
        ? SINGLE_SIDE_STAKING_REWARDS_INFO[chainId]?.[version]?.filter(stakingRewardInfo =>
            rewardTokenToFilterBy === undefined
              ? true
              : rewardTokenToFilterBy === null
              ? false
              : rewardTokenToFilterBy.equals(stakingRewardInfo.rewardToken)
          ) ?? []
        : [],
    [chainId, rewardTokenToFilterBy, version]
  )

  const radi = PNG[chainId || ChainId.AVALANCHE]

  const rewardsAddresses = useMemo(() => info.map(({ stakingRewardAddress }) => stakingRewardAddress), [info])
  const routes = useMemo(
    (): string[][] =>
      info.map(({ conversionRouteHops, rewardToken }) => {
        return [radi.address, ...conversionRouteHops.map(token => token.address), rewardToken.address]
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }),
    [info, radi]
  )

  const accountArg = useMemo(() => [account ?? undefined], [account])
  const getAmountsOutArgs = useMemo(() => {
    const amountIn = '1' + '0'.repeat(18) // 1 PNG
    return routes.map(route => [amountIn, route])
  }, [routes])

  const routerContract = useMemo(() => {
    if (!chainId || !library) return
    return getRouterContract(chainId, library)
  }, [chainId, library])

  // get all the info from the staking rewards contracts
  const balances = useMultipleContractSingleData(rewardsAddresses, STAKING_REWARDS_INTERFACE, 'balanceOf', accountArg)
  const earnedAmounts = useMultipleContractSingleData(rewardsAddresses, STAKING_REWARDS_INTERFACE, 'earned', accountArg)
  const stakingTotalSupplies = useMultipleContractSingleData(rewardsAddresses, STAKING_REWARDS_INTERFACE, 'totalSupply')

  // tokens per second, constants
  const rewardRates = useMultipleContractSingleData(
    rewardsAddresses,
    STAKING_REWARDS_INTERFACE,
    'rewardRate',
    undefined,
    NEVER_RELOAD
  )
  const periodFinishes = useMultipleContractSingleData(
    rewardsAddresses,
    STAKING_REWARDS_INTERFACE,
    'periodFinish',
    undefined,
    NEVER_RELOAD
  )

  const amountsOuts = useSingleContractMultipleData(routerContract, 'getAmountsOut', getAmountsOutArgs, NEVER_RELOAD)

  return useMemo(() => {
    if (!chainId || !radi) return []

    return rewardsAddresses.reduce<SingleSideStakingInfo[]>((memo, rewardsAddress, index) => {
      // these two are dependent on account
      const balanceState = balances[index]
      const earnedAmountState = earnedAmounts[index]

      // these get fetched regardless of account
      const stakingTotalSupplyState = stakingTotalSupplies[index]
      const rewardRateState = rewardRates[index]
      const periodFinishState = periodFinishes[index]
      const amountsOutsState = amountsOuts[index]

      if (
        // these may be undefined if not logged in
        !balanceState?.loading &&
        !earnedAmountState?.loading &&
        // always need these
        stakingTotalSupplyState?.loading === false &&
        rewardRateState?.loading === false &&
        periodFinishState?.loading === false &&
        amountsOutsState?.loading === false
      ) {
        if (
          balanceState?.error ||
          earnedAmountState?.error ||
          stakingTotalSupplyState.error ||
          rewardRateState.error ||
          periodFinishState.error ||
          amountsOutsState.error
        ) {
          console.error('Failed to load staking rewards info')
          return memo
        }

        const rewardToken = info[index].rewardToken
        const valueOfRadi = JSBI.BigInt(amountsOutsState.result?.[0]?.slice(-1)?.[0] ?? 0)
        const periodFinishMs = periodFinishState.result?.[0]?.mul(1000)?.toNumber()

        // periodFinish will be 0 immediately after a reward contract is initialized
        const isPeriodFinished = periodFinishMs === 0 ? false : periodFinishMs < Date.now()

        const totalSupplyStaked = JSBI.BigInt(stakingTotalSupplyState.result?.[0])

        const stakedAmount = new TokenAmount(radi, JSBI.BigInt(balanceState?.result?.[0] ?? 0))
        const totalStakedAmount = new TokenAmount(radi, JSBI.BigInt(totalSupplyStaked))
        const totalRewardRate = new TokenAmount(
          rewardToken,
          JSBI.BigInt(isPeriodFinished ? 0 : rewardRateState.result?.[0])
        )
        const earnedAmount = new TokenAmount(radi, JSBI.BigInt(earnedAmountState?.result?.[0] ?? 0))

        const rewardRateInRadi = calculateRewardRateInRadi(totalRewardRate.raw, valueOfRadi)

        const apr = isPeriodFinished ? JSBI.BigInt(0) : calculateApr(rewardRateInRadi, totalSupplyStaked)

        const getHypotheticalRewardRate = (
          stakedAmount: TokenAmount,
          totalStakedAmount: TokenAmount,
          totalRewardRate: TokenAmount
        ): TokenAmount => {
          return new TokenAmount(
            rewardToken,
            JSBI.greaterThan(totalStakedAmount.raw, JSBI.BigInt(0))
              ? JSBI.divide(JSBI.multiply(totalRewardRate.raw, stakedAmount.raw), totalStakedAmount.raw)
              : JSBI.BigInt(0)
          )
        }

        const individualRewardRate = getHypotheticalRewardRate(stakedAmount, totalStakedAmount, totalRewardRate)

        memo.push({
          stakingRewardAddress: rewardsAddress,
          rewardToken: rewardToken,
          periodFinish: periodFinishMs > 0 ? new Date(periodFinishMs) : undefined,
          isPeriodFinished: isPeriodFinished,
          earnedAmount: earnedAmount,
          rewardRate: individualRewardRate,
          totalRewardRate: totalRewardRate,
          stakedAmount: stakedAmount,
          totalStakedAmount: totalStakedAmount,
          totalStakedInRadi: totalStakedAmount,
          getHypotheticalRewardRate,
          apr: apr
        })
      }
      return memo
    }, [])
  }, [
    chainId,
    radi,
    rewardsAddresses,
    balances,
    earnedAmounts,
    stakingTotalSupplies,
    rewardRates,
    periodFinishes,
    amountsOuts,
    info
  ])
}

export function useTotalRadiEarned(): TokenAmount | undefined {
  const { chainId } = useActiveWeb3React()
  const radi = PNG[chainId || ChainId.AVALANCHE]
  const stakingInfo0 = useStakingInfo(0)
  const stakingInfo1 = useStakingInfo(1)
  const stakingInfo2 = useMinichefStakingInfos(2)

  const earned0 = useMemo(() => {
    if (!radi) new TokenAmount(radi, '0')
    return (
      stakingInfo0?.reduce(
        (accumulator, stakingInfo) => accumulator.add(stakingInfo.earnedAmount),
        new TokenAmount(radi, '0')
      ) ?? new TokenAmount(radi, '0')
    )
  }, [stakingInfo0, radi])

  const earned1 = useMemo(() => {
    if (!radi) new TokenAmount(radi, '0')
    return (
      stakingInfo1?.reduce(
        (accumulator, stakingInfo) => accumulator.add(stakingInfo.earnedAmount),
        new TokenAmount(radi, '0')
      ) ?? new TokenAmount(radi, '0')
    )
  }, [stakingInfo1, radi])

  const earned2 = useMemo(() => {
    if (!radi) new TokenAmount(radi, '0')
    return (
      stakingInfo2?.reduce(
        (accumulator, stakingInfo) => accumulator.add(stakingInfo.earnedAmount),
        new TokenAmount(radi, '0')
      ) ?? new TokenAmount(radi, '0')
    )
  }, [stakingInfo2, radi])

  return earned0.add(earned1).add(earned2)
  // return earned0 ? (earned1 ? earned0.add(earned1) : earned0) : earned1 ? earned1 : undefined
}

// based on typed value
export function useDerivedStakeInfo(
  typedValue: string,
  stakingToken: Token,
  userLiquidityUnstaked: TokenAmount | undefined
): {
  parsedAmount?: CurrencyAmount
  error?: string
} {
  const { account } = useActiveWeb3React()
  const { t } = useTranslation()

  const parsedInput: CurrencyAmount | undefined = tryParseAmount(typedValue, stakingToken)

  const parsedAmount =
    parsedInput && userLiquidityUnstaked && JSBI.lessThanOrEqual(parsedInput.raw, userLiquidityUnstaked.raw)
      ? parsedInput
      : undefined

  let error: string | undefined
  if (!account) {
    error = t('stakeHooks.connectWallet')
  }
  if (!parsedAmount) {
    error = error ?? t('stakeHooks.enterAmount')
  }

  return {
    parsedAmount,
    error
  }
}

// based on typed value
export function useDerivedUnstakeInfo(
  typedValue: string,
  stakingAmount: TokenAmount
): {
  parsedAmount?: CurrencyAmount
  error?: string
} {
  const { account } = useActiveWeb3React()
  const { t } = useTranslation()

  const parsedInput: CurrencyAmount | undefined = tryParseAmount(typedValue, stakingAmount.token)

  const parsedAmount = parsedInput && JSBI.lessThanOrEqual(parsedInput.raw, stakingAmount.raw) ? parsedInput : undefined

  let error: string | undefined
  if (!account) {
    error = t('stakeHooks.connectWallet')
  }
  if (!parsedAmount) {
    error = error ?? t('stakeHooks.enterAmount')
  }

  return {
    parsedAmount,
    error
  }
}

export function useGetStakingDataWithAPR(version: number) {
  const stakingInfos = useStakingInfo(version)

  const [stakingInfoData, setStakingInfoData] = useState<StakingInfo[]>(stakingInfos)

  useEffect(() => {
    if (stakingInfos?.length > 0) {
      Promise.all(
        stakingInfos.map(stakingInfo => {
          return fetch(`https://api.rytell.exchange/rytell/apr/${stakingInfo.stakingRewardAddress}`)
            .then(res => res.json())
            .then(res => ({
              swapFeeApr: Number(res.swapFeeApr),
              stakingApr: Number(res.stakingApr),
              combinedApr: Number(res.combinedApr),
              ...stakingInfo
            }))
        })
      ).then(updatedStakingInfos => {
        setStakingInfoData(updatedStakingInfos)
      })
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stakingInfos?.length, version])

  return stakingInfoData
}

export function useGetPairDataFromPair(pair: Pair) {
  const { account } = useActiveWeb3React()

  const usdPriceCurrency0 = useUSDCPrice(pair.token0)
  const usdPriceCurrency1 = useUSDCPrice(pair.token1)

  const zeroTokenAmount0 = new TokenAmount(pair.token0, '0')
  const zeroTokenAmount1 = new TokenAmount(pair.token1, '0')

  const userPoolBalance = useTokenBalance(account ?? undefined, pair.liquidityToken)
  const totalPoolTokens = useTotalSupply(pair.liquidityToken)

  const getHypotheticalPoolOwnership = (userBalance: JSBI | undefined, poolTotalBalance: JSBI | undefined): Percent => {
    if (!userBalance || !poolTotalBalance || JSBI.equal(poolTotalBalance, BIG_INT_ZERO)) {
      return new Percent(BIG_INT_ZERO, BIG_INT_ONE)
    }
    return new Percent(userBalance, poolTotalBalance).multiply('100')
  }

  const poolTokenPercentage =
    !!userPoolBalance && !!totalPoolTokens && JSBI.greaterThanOrEqual(totalPoolTokens.raw, userPoolBalance.raw)
      ? new Percent(userPoolBalance.raw, totalPoolTokens.raw)
      : undefined

  const [token0Deposited, token1Deposited] =
    !!pair &&
    !!totalPoolTokens &&
    !!userPoolBalance &&
    // this condition is a short-circuit in the case where useTokenBalance updates sooner than useTotalSupply
    JSBI.greaterThanOrEqual(totalPoolTokens.raw, userPoolBalance.raw)
      ? [
          pair.getLiquidityValue(pair.token0, totalPoolTokens, userPoolBalance, false),
          pair.getLiquidityValue(pair.token1, totalPoolTokens, userPoolBalance, false)
        ]
      : [zeroTokenAmount0, zeroTokenAmount1]

  const usdAmountCurrency0: CurrencyAmount = usdPriceCurrency0?.quote(token0Deposited) ?? zeroTokenAmount0
  const usdAmountCurrency1: CurrencyAmount = usdPriceCurrency1?.quote(token1Deposited) ?? zeroTokenAmount1

  const totalAmountUsd: CurrencyAmount = usdAmountCurrency0?.add(usdAmountCurrency1)

  return {
    currency0: pair.token0,
    currency1: pair.token1,
    userPoolBalance: userPoolBalance,
    totalPoolTokens: totalPoolTokens,
    token0Deposited: token0Deposited,
    token1Deposited: token1Deposited,
    totalAmountUsd: totalAmountUsd,
    poolTokenPercentage: poolTokenPercentage,
    getHypotheticalPoolOwnership
  }
}
export const useMinichefPools = (): { [key: string]: number } => {
  const minichefContract = useStakingContract(MINICHEF_ADDRESS)
  const lpTokens = useSingleCallResult(minichefContract, 'lpTokens', []).result
  const lpTokensArr = lpTokens?.[0]

  return useMemo(() => {
    const poolMap: { [key: string]: number } = {}
    if (lpTokensArr) {
      lpTokensArr.forEach((address: string, index: number) => {
        poolMap[address] = index
      })
    }
    return poolMap
  }, [lpTokensArr])
}

export const useMinichefStakingInfos = (version = 2, pairToFilterBy?: Pair | null): DoubleSideStakingInfo[] => {
  const { chainId, account } = useActiveWeb3React()
  const minichefContract = useStakingContract(MINICHEF_ADDRESS)
  const poolMap = useMinichefPools()
  const radi = chainId ? PNG[chainId] : PNG[chainId || ChainId.AVALANCHE]

  let info = useMemo(
    () =>
      chainId
        ? DOUBLE_SIDE_STAKING_REWARDS_INFO[chainId]?.[version]?.filter(item =>
            pairToFilterBy === undefined
              ? true
              : pairToFilterBy === null
              ? false
              : pairToFilterBy.involvesToken(item.tokens[0]) && pairToFilterBy.involvesToken(item.tokens[1])
          ) ?? []
        : [],
    [chainId, pairToFilterBy, version]
  )

  const tokens = useMemo(() => info.map(({ tokens }) => tokens), [info])
  const pairs = usePairs(tokens)

  const pairAddresses = useMemo(() => {
    return pairs.map(([state, pair]) => pair?.liquidityToken.address)
  }, [pairs])

  const pairTotalSupplies = useMultipleContractSingleData(pairAddresses, ERC20_INTERFACE, 'totalSupply')
  const balances = useMultipleContractSingleData(pairAddresses, ERC20_INTERFACE, 'balanceOf', [MINICHEF_ADDRESS])

  const [avaxRadiPairState, avaxRadiPair] = usePair(WAVAX[chainId || ChainId.AVALANCHE], radi)

  const poolIdArray = useMemo(() => {
    if (!pairAddresses || !poolMap) return []
    // TODO: clean up this logic. seems like a lot of work to ensure correct types
    const NOT_FOUND = -1
    const results = pairAddresses.map(address => poolMap[address ?? ''] ?? NOT_FOUND)
    if (results.some(result => result === NOT_FOUND)) return []
    return results
  }, [poolMap, pairAddresses])

  const poolsIdInput = useMemo(() => {
    if (!poolIdArray) return []
    return poolIdArray.map(pid => [pid])
  }, [poolIdArray])
  const poolInfos = useSingleContractMultipleData(minichefContract, 'poolInfo', poolsIdInput ?? [])

  const userInfoInput = useMemo(() => {
    if (!poolIdArray || !account) return []
    return poolIdArray.map(pid => [pid, account])
  }, [poolIdArray, account])
  const userInfos = useSingleContractMultipleData(minichefContract, 'userInfo', userInfoInput ?? [])

  const pendingRewards = useSingleContractMultipleData(minichefContract, 'pendingReward', userInfoInput ?? [])

  const rewardPerSecond = useSingleCallResult(minichefContract, 'rewardPerSecond', []).result
  const totalAllocPoint = useSingleCallResult(minichefContract, 'totalAllocPoint', []).result
  const rewardsExpiration = useSingleCallResult(minichefContract, 'rewardsExpiration', []).result
  const usdPrice = useUSDCPrice(WAVAX[chainId ? chainId : ChainId.AVALANCHE])
  const avaxPrice = usdPrice?.quote(
    new TokenAmount(WAVAX[chainId ? chainId : ChainId.AVALANCHE], JSBI.exponentiate(BIG_INT_TEN, BIG_INT_EIGHTEEN))
  )

  const arr = useMemo(() => {
    if (!chainId || !radi || !avaxPrice) return []

    return pairAddresses.reduce<any[]>((memo, pairAddress, index) => {
      const pairTotalSupplyState = pairTotalSupplies[index]
      const balanceState = balances[index]
      const poolInfo = poolInfos[index]
      const userPoolInfo = userInfos[index]
      const [pairState, pair] = pairs[index]
      const pendingRewardInfo = pendingRewards[index]

      if (
        pairTotalSupplyState?.loading === false &&
        poolInfo?.loading === false &&
        balanceState?.loading === false &&
        pair &&
        avaxRadiPair &&
        pairState !== PairState.LOADING &&
        avaxRadiPairState !== PairState.LOADING &&
        rewardPerSecond &&
        totalAllocPoint &&
        rewardsExpiration?.[0]
      ) {
        if (
          balanceState?.error ||
          pairTotalSupplyState.error ||
          pairState === PairState.INVALID ||
          pairState === PairState.NOT_EXISTS ||
          avaxRadiPairState === PairState.INVALID ||
          avaxRadiPairState === PairState.NOT_EXISTS
        ) {
          console.error('Failed to load staking rewards info')
          return memo
        }

        // get the LP token
        const token0 = pair?.token0
        const token1 = pair?.token1
        const tokens = [token0, token1]
        const dummyPair = new Pair(new TokenAmount(tokens[0], '0'), new TokenAmount(tokens[1], '0'), chainId)
        const lpToken = dummyPair.liquidityToken

        const poolAllocPointAmount = new TokenAmount(lpToken, JSBI.BigInt(poolInfo?.result?.['allocPoint']))
        const totalAllocPointAmount = new TokenAmount(lpToken, JSBI.BigInt(totalAllocPoint?.[0]))
        const rewardRatePerSecAmount = new TokenAmount(radi, JSBI.BigInt(rewardPerSecond?.[0]))
        const poolRewardRate = new TokenAmount(
          radi,
          JSBI.divide(JSBI.multiply(poolAllocPointAmount.raw, rewardRatePerSecAmount.raw), totalAllocPointAmount.raw)
        )

        const periodFinishMs = rewardsExpiration?.[0]?.mul(1000)?.toNumber()
        // periodFinish will be 0 immediately after a reward contract is initialized
        const isPeriodFinished =
          periodFinishMs === 0 ? false : periodFinishMs < Date.now() || poolAllocPointAmount.equalTo('0')

        const totalSupplyStaked = JSBI.BigInt(balanceState?.result?.[0])
        const totalSupplyAvailable = JSBI.BigInt(pairTotalSupplyState?.result?.[0])
        const totalStakedAmount = new TokenAmount(lpToken, JSBI.BigInt(balanceState?.result?.[0]))
        const stakedAmount = new TokenAmount(lpToken, JSBI.BigInt(userPoolInfo?.result?.['amount'] ?? 0))
        const earnedAmount = new TokenAmount(radi, JSBI.BigInt(pendingRewardInfo?.result?.['pending'] ?? 0))
        const multiplier = JSBI.BigInt(poolInfo?.result?.['allocPoint'])

        const isAvaxPool = pair.involvesToken(WAVAX[chainId])
        const isRadiPool = pair.involvesToken(PNG[chainId])

        let totalStakedInUsd = new TokenAmount(DAIe[chainId], BIG_INT_ZERO)
        const totalStakedInWavax = new TokenAmount(WAVAX[chainId], BIG_INT_ZERO)

        if (JSBI.equal(totalSupplyAvailable, BIG_INT_ZERO)) {
          // Default to 0 values above avoiding division by zero errors
        } else if (pair.involvesToken(DAIe[chainId])) {
          const pairValueInDAI = JSBI.multiply(pair.reserveOf(DAIe[chainId]).raw, BIG_INT_TWO)
          const stakedValueInDAI = JSBI.divide(JSBI.multiply(pairValueInDAI, totalSupplyStaked), totalSupplyAvailable)
          totalStakedInUsd = new TokenAmount(DAIe[chainId], stakedValueInDAI)
        } else if (pair.involvesToken(USDCe[chainId])) {
          const pairValueInUSDC = JSBI.multiply(pair.reserveOf(USDCe[chainId]).raw, BIG_INT_TWO)
          const stakedValueInUSDC = JSBI.divide(JSBI.multiply(pairValueInUSDC, totalSupplyStaked), totalSupplyAvailable)
          totalStakedInUsd = new TokenAmount(USDCe[chainId], stakedValueInUSDC)
        } else if (pair.involvesToken(USDTe[chainId])) {
          const pairValueInUSDT = JSBI.multiply(pair.reserveOf(USDTe[chainId]).raw, BIG_INT_TWO)
          const stakedValueInUSDT = JSBI.divide(JSBI.multiply(pairValueInUSDT, totalSupplyStaked), totalSupplyAvailable)
          totalStakedInUsd = new TokenAmount(USDTe[chainId], stakedValueInUSDT)
        } else if (isAvaxPool) {
          const totalStakedInWavax = calculateTotalStakedAmountInAvax(
            totalSupplyStaked,
            totalSupplyAvailable,
            pair.reserveOf(WAVAX[chainId]).raw,
            chainId
          )
          totalStakedInUsd = totalStakedInWavax && (usdPrice?.quote(totalStakedInWavax) as TokenAmount)
        } else if (isRadiPool) {
          const totalStakedInWavax = calculateTotalStakedAmountInAvaxFromRadi(
            totalSupplyStaked,
            totalSupplyAvailable,
            avaxRadiPair.reserveOf(radi).raw,
            avaxRadiPair.reserveOf(WAVAX[chainId]).raw,
            pair.reserveOf(radi).raw,
            chainId
          )
          totalStakedInUsd = totalStakedInWavax && (usdPrice?.quote(totalStakedInWavax) as TokenAmount)
        } else {
          // Contains no stablecoin, WAVAX, nor PNG
          console.error(`Could not identify total staked value for pair ${pair.liquidityToken.address}`)
        }

        const getHypotheticalRewardRate = (
          stakedAmount: TokenAmount,
          totalStakedAmount: TokenAmount,
          totalRewardRate: TokenAmount
        ): TokenAmount => {
          return new TokenAmount(
            radi,
            JSBI.greaterThan(totalStakedAmount.raw, JSBI.BigInt(0))
              ? JSBI.divide(JSBI.multiply(totalRewardRate.raw, stakedAmount.raw), totalStakedAmount.raw)
              : JSBI.BigInt(0)
          )
        }

        const userRewardRate = getHypotheticalRewardRate(stakedAmount, totalStakedAmount, poolRewardRate)

        memo.push({
          stakingRewardAddress: MINICHEF_ADDRESS,
          tokens,
          earnedAmount,
          rewardRate: userRewardRate,
          totalRewardRate: poolRewardRate,
          stakedAmount,
          totalStakedAmount,
          totalStakedInWavax,
          totalStakedInUsd,
          multiplier: JSBI.divide(multiplier, JSBI.BigInt(100)),
          periodFinish: periodFinishMs > 0 ? new Date(periodFinishMs) : undefined,
          isPeriodFinished,
          getHypotheticalRewardRate
        })
      }

      return memo
    }, [])
  }, [
    chainId,
    radi,
    pairTotalSupplies,
    poolInfos,
    userInfos,
    pairs,
    avaxRadiPair,
    avaxRadiPairState,
    rewardPerSecond,
    totalAllocPoint,
    pendingRewards,
    rewardsExpiration,
    balances,
    usdPrice,
    avaxPrice,
    pairAddresses
  ])

  return arr
}
