import { Box, Typography, Paper } from '@mui/material'

export const iOS = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        iOS
      </Typography>
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1">
          iOS sayfası içeriği buraya gelecek.
        </Typography>
      </Paper>
    </Box>
  )
}

