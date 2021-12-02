import React from 'react'
import { Text, Box } from '@pangolindex/components'
import { useDarkModeManager } from '../../state/user/hooks'
import Logo from '../../assets/svg/icon.svg'
import LogoDark from '../../assets/svg/icon.svg'
import { Title, RadiIcon, LogoWrapper } from './styled'

interface LogoProps {
  collapsed: boolean
}

export default function LogoIcon({ collapsed }: LogoProps) {
  const [isDark] = useDarkModeManager()

  return (
    <LogoWrapper collapsed={collapsed}>
      <Box>
        <Title href=".">
          <RadiIcon>
            <img width={'28px'} src={isDark ? LogoDark : Logo} alt="logo" />
          </RadiIcon>
        </Title>
      </Box>
      {!collapsed && (
        <Box ml={12}>
          <Text color="text1" fontSize={16}>
            Rytell
          </Text>
        </Box>
      )}
    </LogoWrapper>
  )
}
