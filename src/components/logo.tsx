import React from 'react'
import {Box, Text} from 'ink'
import {useTheme} from '../theme.js'

const ART = [
  '  _  _____ _   _  ___  ',
  ' | |/ /_ _| \\ | |/ _ \\ ',
  ' | \' / | ||  \\| | | | |',
  ' | . \\ | || |\\  | |_| |',
  ' |_|\\_\\___|_| \\_|\\___/ ',
]

export function Logo() {
  const theme = useTheme()

  return (
    <Box flexDirection="column" alignItems="center" flexShrink={0}>
      {ART.map((line, row) => (
        <Text key={row} color={theme.primary} bold>
          {line}
        </Text>
      ))}
    </Box>
  )
}
