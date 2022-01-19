import { ChainId } from '@rytell/sdk'
import { useActiveWeb3React } from '../hooks'

export const useSnowtraceUrl = (address: string | undefined) => {
  const { chainId } = useActiveWeb3React()

  if (!address) return

  if (chainId === ChainId.FUJI) {
    return 'https://cchain.explorer.avax-test.network/address/' + address
  }

  return 'https://cchain.explorer.avax.network/address/' + address
}
