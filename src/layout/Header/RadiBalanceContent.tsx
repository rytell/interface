import { TokenAmount, WAVAX, JSBI } from '@rytell/sdk'
import React, { useMemo, useState } from 'react'
import { X } from 'react-feather'
import styled from 'styled-components'
import tokenLogo from '../../assets/images/token-logo.png'
import { injected } from '../../connectors'
import { EXCHANGE_API, RADI } from '../../constants'
import { useTotalSupply } from '../../data/TotalSupply'
import { useActiveWeb3React } from '../../hooks'
import { useTotalRadiEarned } from '../../state/stake/hooks'
import { useAggregateRadiBalance, useTokenBalance } from '../../state/wallet/hooks'
import { StyledInternalLink, TYPE, RadiTokenAnimated } from '../../theme'
import { AutoColumn } from '../../components/Column'
import { RowBetween } from '../../components/Row'
import { Break, CardBGImage, CardNoise, CardSection, DataCard } from '../../components/earn/styled'
import { usePair } from '../../data/Reserves'
import { useTranslation } from 'react-i18next'

const ContentWrapper = styled(AutoColumn)`
  width: 100%;
`

const ModalUpper = styled(DataCard)`
  box-shadow: 0px 4px 10px rgba(0, 0, 0, 0.1);
  background: radial-gradient(76.02% 75.41% at 1.84% 0%, #f97316 0%, #e84142 100%);
  background: radial-gradient(174.47% 188.91% at 1.84% 0%, #751a2b 0%, #691726 100%), #edeef2;
  padding: 0.5rem;
`

const StyledClose = styled(X)`
  position: absolute;
  right: 16px;
  top: 16px;

  :hover {
    cursor: pointer;
  }
`
const AddRADI = styled.span`
  width: 100%;
  height: 100%;
  font-weight: 500;
  font-size: 32;
  padding: 4px 6px;
  align-items: center;
  text-align: center;
  background-color: ${({ theme }) => theme.bg3};
  background: radial-gradient(174.47% 188.91% at 1.84% 0%, #f97316 0%, #e84142 100%), #edeef2;
  background: radial-gradient(174.47% 188.91% at 1.84% 0%, #751a2b 0%, #691726 100%), #edeef2;
  border-radius: 12px;
  white-space: nowrap;
  cursor: pointer;

  :hover {
    opacity: 0.8;
  }
`

/**
 * Content for balance stats modal
 */
export default function RadiBalanceContent({ setShowRadiBalanceModal }: { setShowRadiBalanceModal: any }) {
  const { account, chainId } = useActiveWeb3React()
  const radi = chainId ? RADI[chainId] : undefined

  const total = useAggregateRadiBalance()
  const radiBalance: TokenAmount | undefined = useTokenBalance(account ?? undefined, radi)
  const radiToClaim: TokenAmount | undefined = useTotalRadiEarned()

  const totalSupply: TokenAmount | undefined = useTotalSupply(radi)

  // Determine RADI price in AVAX
  const wavax = WAVAX[chainId ? chainId : 43114]
  const [, avaxRadiTokenPair] = usePair(wavax, radi)
  const oneToken = JSBI.BigInt(1000000000000000000)
  const { t } = useTranslation()
  let radiPrice: number | undefined
  if (avaxRadiTokenPair && radi) {
    const avaxRadiRatio = JSBI.divide(
      JSBI.multiply(oneToken, avaxRadiTokenPair.reserveOf(wavax).raw),
      avaxRadiTokenPair?.reserveOf(radi).raw.toString() === '0' ? JSBI.BigInt(1) : avaxRadiTokenPair.reserveOf(radi).raw
    )
    radiPrice = JSBI.toNumber(avaxRadiRatio) / 1000000000000000000
  }

  const [circulation, setCirculation] = useState(totalSupply)

  useMemo(() => {
    if (radi === undefined) return
    fetch(`${EXCHANGE_API}/radi/circulating`)
      .then(res => res.text())
      .then(val => setCirculation(new TokenAmount(radi, val)))
  }, [radi])

  return (
    <ContentWrapper gap="lg">
      <ModalUpper>
        <CardBGImage />
        <CardNoise />
        <CardSection gap="md">
          <RowBetween>
            <TYPE.white color="white">{t('header.radiBreakDown')}</TYPE.white>
            <StyledClose stroke="white" onClick={() => setShowRadiBalanceModal(false)} />
          </RowBetween>
        </CardSection>
        <Break />
        {account && (
          <>
            <CardSection gap="sm">
              <AutoColumn gap="md" justify="center">
                <RadiTokenAnimated width="48px" src={tokenLogo} />{' '}
                <TYPE.white fontSize={48} fontWeight={600} color="white">
                  {total?.toFixed(2, { groupSeparator: ',' })}
                </TYPE.white>
              </AutoColumn>
              <AutoColumn gap="md">
                <RowBetween>
                  <TYPE.white color="white">{t('header.balance')}</TYPE.white>
                  <TYPE.white color="white">{radiBalance?.toFixed(2, { groupSeparator: ',' })}</TYPE.white>
                </RowBetween>
                <RowBetween>
                  <TYPE.white color="white">{t('header.unclaimed')}</TYPE.white>
                  <TYPE.white color="white">
                    {radiToClaim?.toFixed(4, { groupSeparator: ',' })}{' '}
                    {radiToClaim && radiToClaim.greaterThan('0') && (
                      <StyledInternalLink onClick={() => setShowRadiBalanceModal(false)} to={`/radi`}>
                        ({t('earn.claim')})
                      </StyledInternalLink>
                    )}
                  </TYPE.white>
                </RowBetween>
              </AutoColumn>
            </CardSection>
            <Break />
          </>
        )}
        <CardSection gap="sm">
          <AutoColumn gap="md">
            <RowBetween>
              <TYPE.white color="white">{t('header.radiPrice')}</TYPE.white>
              <TYPE.white color="white">{radiPrice?.toFixed(5) ?? '-'} AVAX</TYPE.white>
            </RowBetween>
            <RowBetween>
              <TYPE.white color="white">{t('header.radiCirculation')}</TYPE.white>
              <TYPE.white color="white">{circulation?.toFixed(0, { groupSeparator: ',' })}</TYPE.white>
            </RowBetween>
            <RowBetween>
              <TYPE.white color="white">{t('header.totalSupply')}</TYPE.white>
              <TYPE.white color="white">{totalSupply?.toFixed(0, { groupSeparator: ',' })}</TYPE.white>
            </RowBetween>
          </AutoColumn>
        </CardSection>
        {account && (
          <>
            <CardSection gap="sm">
              <AutoColumn gap="md">
                <AddRADI
                  onClick={() => {
                    injected.getProvider().then(provider => {
                      if (provider) {
                        provider
                          .request({
                            method: 'wallet_watchAsset',
                            params: {
                              type: 'ERC20',
                              options: {
                                address: radi?.address,
                                symbol: radi?.symbol,
                                decimals: radi?.decimals,
                                image:
                                  'https://raw.githubusercontent.com/rytell/assets/main/0x9c5bBb5169B66773167d86818b3e149A4c7e1d1A/logo.png'
                              }
                            }
                          })
                          .catch((error: any) => {
                            console.error(error)
                          })
                      }
                    })
                  }}
                >
                  <TYPE.white color="white">{t('header.addMetamask')}</TYPE.white>
                </AddRADI>
              </AutoColumn>
            </CardSection>
          </>
        )}
      </ModalUpper>
    </ContentWrapper>
  )
}
