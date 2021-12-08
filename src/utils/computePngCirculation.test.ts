import { ChainId, JSBI, Token, TokenAmount } from '@rytell/sdk'
import { BigNumber } from 'ethers'
import { ZERO_ADDRESS } from '../constants'
import { computeRadiCirculation } from './computeRadiCirculation'

describe('computeRadiCirculation', () => {
  const token = new Token(ChainId.AVALANCHE, ZERO_ADDRESS, 18)

  function expandTo18Decimals(num: JSBI | string | number) {
    return JSBI.multiply(JSBI.BigInt(num), JSBI.exponentiate(JSBI.BigInt(10), JSBI.BigInt(18)))
  }

  function tokenAmount(num: JSBI | string | number) {
    return new TokenAmount(token, expandTo18Decimals(num))
  }

  it('before staking', () => {
    expect(computeRadiCirculation(token, BigNumber.from(0), undefined)).toEqual(tokenAmount(150_000_000))
    expect(computeRadiCirculation(token, BigNumber.from(1600387200), undefined)).toEqual(tokenAmount(150_000_000))
  })
  it('mid staking', () => {
    expect(computeRadiCirculation(token, BigNumber.from(1600387200 + 15 * 24 * 60 * 60), undefined)).toEqual(
      tokenAmount(155_000_000)
    )
  })
  it('after staking and treasury vesting cliff', () => {
    expect(computeRadiCirculation(token, BigNumber.from(1600387200 + 60 * 24 * 60 * 60), undefined)).toEqual(
      tokenAmount(224_575_341)
    )
  })
  it('subtracts unclaimed radi', () => {
    expect(computeRadiCirculation(token, BigNumber.from(1600387200 + 15 * 24 * 60 * 60), tokenAmount(1000))).toEqual(
      tokenAmount(154_999_000)
    )
  })
})
