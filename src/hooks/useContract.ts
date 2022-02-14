import { Contract } from '@ethersproject/contracts'
import { ChainId, WAVAX } from '@rytell/sdk'
import { abi as IRytellPairABI } from '@rytell/exchange-contracts/artifacts/contracts/core/interfaces/IRytellPair.sol/IRytellPair.json'
import { abi as STAKING_REWARDS_ABI } from '@pangolindex/governance/artifacts/contracts/StakingRewards.sol/StakingRewards.json'
import { abi as AIRDROP_ABI } from '@pangolindex/governance/artifacts/contracts/Airdrop.sol/Airdrop.json'
import { abi as GOVERNANCE_ABI } from '@pangolindex/governance/artifacts/contracts/GovernorAlpha.sol/GovernorAlpha.json'
import { abi as RADI_ABI } from '@rytell/tokens/artifacts/contracts/Radi.sol/Radi.json'
import { abi as BRIDGE_MIGRATOR_ABI } from '@rytell/exchange-contracts/artifacts/contracts/periphery/RytellBridgeMigrationRouter.sol/RytellBridgeMigrationRouter.json'
import { abi as MINICHEF_ABI } from '@pangolindex/governance/artifacts/contracts/MiniChefV2.sol/MiniChefV2.json'
import { abi as STAKING_RADI_ABI } from '@rytell/staking-radi/artifacts/contracts/StakingPool.sol/StakingPool.json'
import { abi as LIQUIDITY_POOL_MANAGER_ABI } from '@rytell/liquidity-pools/artifacts/contracts/LiquidityPoolManager.sol/LiquidityPoolManager.json'
import { useMemo } from 'react'
import ENS_PUBLIC_RESOLVER_ABI from '../constants/abis/ens-public-resolver.json'
import { ERC20_BYTES32_ABI } from '../constants/abis/erc20'
import ERC20_ABI from '../constants/abis/erc20.json'
import BRIDGE_TOKEN_ABI from '../constants/abis/bridge-token.json'
import { MIGRATOR_ABI, MIGRATOR_ADDRESS } from '../constants/abis/migrator'
import WETH_ABI from '../constants/abis/weth.json'
import { MULTICALL_ABI, MULTICALL_NETWORKS } from '../constants/multicall'
import { V1_EXCHANGE_ABI } from '../constants/v1'
import { getContract } from '../utils'
import { useActiveWeb3React } from './index'
import {
  AIRDROP_ADDRESS,
  BRIDGE_MIGRATOR_ADDRESS,
  MINICHEF_ADDRESS,
  RADI,
  GOVERNANCE_ADDRESS,
  RADI_STAKING_POOL,
  LIQUIDITY_POOL_MANAGER_ADDRESS
} from '../constants'

// returns null on errors
function useContract(address: string | undefined, ABI: any, withSignerIfPossible = true): Contract | null {
  const { library, account } = useActiveWeb3React()

  return useMemo(() => {
    if (!address || !ABI || !library) return null
    try {
      return getContract(address, ABI, library, withSignerIfPossible && account ? account : undefined)
    } catch (error) {
      console.error('Failed to get contract', error)
      return null
    }
  }, [address, ABI, library, withSignerIfPossible, account])
}

export function useV2MigratorContract(): Contract | null {
  return useContract(MIGRATOR_ADDRESS, MIGRATOR_ABI, true)
}

export function useMiniChefContract(): Contract | null {
  return useContract(MINICHEF_ADDRESS, MINICHEF_ABI, true)
}

export function useBridgeMigratorContract(): Contract | null {
  return useContract(BRIDGE_MIGRATOR_ADDRESS, BRIDGE_MIGRATOR_ABI, true)
}

export function useV1ExchangeContract(address?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(address, V1_EXCHANGE_ABI, withSignerIfPossible)
}

export function useTokenContract(tokenAddress?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(tokenAddress, ERC20_ABI, withSignerIfPossible)
}

export function useBridgeTokenContract(tokenAddress?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(tokenAddress, BRIDGE_TOKEN_ABI, withSignerIfPossible)
}

export function useWETHContract(withSignerIfPossible?: boolean): Contract | null {
  const { chainId } = useActiveWeb3React()
  return useContract(chainId ? WAVAX[chainId]?.address : undefined, WETH_ABI, withSignerIfPossible)
}

export function useENSResolverContract(address: string | undefined, withSignerIfPossible?: boolean): Contract | null {
  return useContract(address, ENS_PUBLIC_RESOLVER_ABI, withSignerIfPossible)
}

export function useBytes32TokenContract(tokenAddress?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(tokenAddress, ERC20_BYTES32_ABI, withSignerIfPossible)
}

export function usePairContract(pairAddress?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(pairAddress, IRytellPairABI, withSignerIfPossible)
}

export function useMulticallContract(): Contract | null {
  const { chainId } = useActiveWeb3React()
  return useContract(chainId && MULTICALL_NETWORKS[chainId], MULTICALL_ABI, false)
}

export function useGovernanceContract(): Contract | null {
  return useContract(GOVERNANCE_ADDRESS, GOVERNANCE_ABI, true)
}

export function useRadiContract(): Contract | null {
  const { chainId } = useActiveWeb3React()
  return useContract(chainId ? RADI[chainId].address : undefined, RADI_ABI, true)
}

export function useStakingPoolContract(): Contract | null {
  const { chainId } = useActiveWeb3React()
  return useContract(chainId ? RADI_STAKING_POOL[chainId] : undefined, STAKING_RADI_ABI, true)
}

export function useStakingContract(stakingAddress?: string, withSignerIfPossible?: boolean): Contract | null {
  return useContract(
    stakingAddress,
    stakingAddress === MINICHEF_ADDRESS ? MINICHEF_ABI : STAKING_REWARDS_ABI,
    withSignerIfPossible
  )
}

export function useAirdropContract(): Contract | null {
  const { chainId } = useActiveWeb3React()
  return useContract(chainId ? AIRDROP_ADDRESS[chainId] : undefined, AIRDROP_ABI, true)
}

export function useLiquidityPoolManagerContract() {
  const { chainId } = useActiveWeb3React()
  return useContract(LIQUIDITY_POOL_MANAGER_ADDRESS[chainId || ChainId.FUJI], LIQUIDITY_POOL_MANAGER_ABI, false)
}
