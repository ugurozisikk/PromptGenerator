import { Box, Typography, Paper } from '@mui/material'

export const Android = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Android
      </Typography>
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1">
          Android sayfası içeriği buraya gelecek.
        </Typography>
      </Paper>
    </Box>
  )
}

