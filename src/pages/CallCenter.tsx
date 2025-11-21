import { Box, Typography, Paper } from '@mui/material'

export const CallCenter = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        CallCenter
      </Typography>
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1">
          CallCenter sayfası içeriği buraya gelecek.
        </Typography>
      </Paper>
    </Box>
  )
}

