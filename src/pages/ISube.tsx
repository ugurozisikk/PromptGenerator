import { Box, Typography, Paper } from '@mui/material'

export const ISube = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        İŞube
      </Typography>
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1">
          İŞube sayfası içeriği buraya gelecek.
        </Typography>
      </Paper>
    </Box>
  )
}

