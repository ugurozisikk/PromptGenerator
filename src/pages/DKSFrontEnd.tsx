import { Box, Typography, Paper } from '@mui/material'

export const DKSFrontEnd = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        DKS FrontEnd
      </Typography>
      <Paper sx={{ p: 3, mt: 3 }}>
        <Typography variant="body1">
          DKS FrontEnd sayfası içeriği buraya gelecek.
        </Typography>
      </Paper>
    </Box>
  )
}

