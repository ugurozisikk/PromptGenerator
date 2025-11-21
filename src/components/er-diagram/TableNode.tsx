import { memo } from 'react'
import { Handle, Position, NodeProps } from 'reactflow'
import { Box, Typography, Paper, IconButton, Chip } from '@mui/material'
import { Edit, Delete } from '@mui/icons-material'
import { alpha } from '@mui/material/styles'

interface TableColumn {
  id: string
  name: string
  type: string
  primaryKey?: boolean
  nullable?: boolean
  unique?: boolean
}

interface TableNodeData {
  label: string
  columns: TableColumn[]
  onEdit: () => void
  onDelete: () => void
}

export const TableNode = memo(({ data, selected }: NodeProps<TableNodeData>) => {
  return (
    <Paper
      elevation={selected ? 8 : 2}
      sx={{
        minWidth: 200,
        border: selected ? '2px solid #667eea' : '1px solid',
        borderColor: selected ? '#667eea' : alpha('#000', 0.1),
        borderRadius: 2,
        overflow: 'hidden',
        transition: 'all 0.2s ease',
      }}
    >
      <Box
        sx={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          p: 1.5,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Typography
          variant="subtitle1"
          sx={{
            color: 'white',
            fontWeight: 700,
            fontSize: '0.95rem',
          }}
        >
          {data.label}
        </Typography>
        <Box>
          <IconButton
            size="small"
            onClick={data.onEdit}
            sx={{
              color: 'white',
              '&:hover': { backgroundColor: alpha('#fff', 0.2) },
            }}
          >
            <Edit fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={data.onDelete}
            sx={{
              color: 'white',
              '&:hover': { backgroundColor: alpha('#fff', 0.2) },
            }}
          >
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <Box sx={{ p: 1.5, bgcolor: 'white' }}>
        {data.columns.map((column, index) => (
          <Box
            key={column.id}
            sx={{
              py: 0.75,
              px: 1,
              borderBottom:
                index < data.columns.length - 1
                  ? `1px solid ${alpha('#000', 0.08)}`
                  : 'none',
              display: 'flex',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Typography
              variant="body2"
              sx={{
                flex: 1,
                fontWeight: column.primaryKey ? 600 : 400,
                fontSize: '0.8rem',
              }}
            >
              {column.name}
            </Typography>
            <Chip
              label={column.type}
              size="small"
              sx={{
                height: 20,
                fontSize: '0.7rem',
                bgcolor: alpha('#667eea', 0.1),
                color: '#667eea',
              }}
            />
            {column.primaryKey && (
              <Chip
                label="PK"
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.7rem',
                  bgcolor: '#667eea',
                  color: 'white',
                }}
              />
            )}
          </Box>
        ))}
      </Box>

      <Handle
        type="source"
        position={Position.Right}
        style={{
          background: '#667eea',
          width: 10,
          height: 10,
        }}
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{
          background: '#667eea',
          width: 10,
          height: 10,
        }}
      />
    </Paper>
  )
})

TableNode.displayName = 'TableNode'

