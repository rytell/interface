import { Interface } from '@ethersproject/abi'
import { abi as IRytellPairABI } from '@rytell/exchange-contracts/artifacts/contracts/core/interfaces/IRytellPair.sol/IRytellPair.json'

const RYTELL_PAIR_INTERFACE = new Interface(IRytellPairABI)

export { RYTELL_PAIR_INTERFACE }
