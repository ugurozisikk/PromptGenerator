import { Box, Typography, Paper } from '@mui/material'

export const Home = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Ana Sayfa
      </Typography>
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1">
          Hoş geldiniz! Sol menüden bir sayfa seçebilirsiniz.
        </Typography>
      </Paper>
    </Box>
  )
}

