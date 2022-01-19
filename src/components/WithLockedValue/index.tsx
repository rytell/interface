import React, { ReactNode } from 'react'
import styled from 'styled-components'
import { useActiveWeb3React } from '../../hooks'

const Locked = styled.span`
  color: ${({ theme }) => theme.text3};
`

export const WithLockedValue = ({ children }: { children: ReactNode }) => {
  const { account } = useActiveWeb3React()

  return !account ? <Locked>Locked</Locked> : <>{children}</>
}
