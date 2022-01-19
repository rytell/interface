import React, { ReactNode } from 'react'
import styled from 'styled-components'
const PoolsGridItems = styled.div``

export default function PoolsGrid({ pools }: { pools: ReactNode[] }) {
  return <PoolsGridItems className="poolsGrid">{pools}</PoolsGridItems>
}