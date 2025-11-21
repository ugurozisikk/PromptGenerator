import { useState, useCallback, useEffect, useRef } from 'react'
import {
  Box,
  Paper,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Typography,
  IconButton,
  Chip,
  Stack,
  Tabs,
  Tab,
  Grid,
  Tooltip,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import {
  Add,
  Delete,
  ContentCopy,
  Download,
  TableChart,
  Rule,
  AutoAwesome,
  Storage,
  Code,
  AccountTree,
} from '@mui/icons-material'
import { usePrompt } from '../contexts/PromptContext'
import ReactFlow, {
  Node,
  addEdge,
  Background,
  Controls,
  MiniMap,
  Connection,
  useNodesState,
  useEdgesState,
  MarkerType,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { TableNode } from '../components/er-diagram/TableNode'

const nodeTypes = {
  table: TableNode,
}

interface TableColumn {
  id: string
  name: string
  type: string
  primaryKey?: boolean
  nullable?: boolean
  unique?: boolean
}

interface Table {
  id: string
  name: string
  columns: TableColumn[]
  position: { x: number; y: number }
}

interface ServiceNode {
  id: string
  name: string
  type: string
  description?: string
  children?: ServiceNode[]
}

const STORAGE_KEYS = {
  NODES: 'backend_nodes',
  EDGES: 'backend_edges',
  BUSINESS_RULES: 'backend_business_rules',
  SERVICE_INPUT: 'backend_service_input',
  SERVICE_OUTPUT: 'backend_service_output',
  SERVICE_INPUT_NAME: 'backend_service_input_name',
  SERVICE_OUTPUT_NAME: 'backend_service_output_name',
}

const SAMPLE_SERVICE_STRUCTURE = [
  {
    name: 'requestId',
    type: 'string',
    description: 'İsteğe özel benzersiz id',
  },
  {
    name: 'customer',
    type: 'object',
    description: 'Müşteri bilgileri',
    children: [
      { name: 'id', type: 'string', description: 'Müşteri numarası' },
      { name: 'fullName', type: 'string', description: 'Ad Soyad' },
      {
        name: 'contact',
        type: 'object',
        description: 'İletişim bilgileri',
        children: [
          { name: 'email', type: 'string', description: 'E-posta' },
          { name: 'phone', type: 'string', description: 'Telefon' },
        ],
      },
    ],
  },
  {
    name: 'items',
    type: 'array',
    description: 'İşlenecek öğeler',
    children: [
      {
        name: 'item',
        type: 'object',
        children: [
          { name: 'code', type: 'string', description: 'Ürün kodu' },
          { name: 'quantity', type: 'number', description: 'Adet' },
        ],
      },
    ],
  },
]

// Load data from localStorage
const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (error) {
    console.error(`Error loading ${key} from localStorage:`, error)
    return defaultValue
  }
}

// Save data to localStorage
const saveToStorage = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Error saving ${key} to localStorage:`, error)
  }
}

export const Backend = () => {
  const { setPromptHandler } = usePrompt()
  
  // Initialize from localStorage
  const initialNodesData = loadFromStorage<Node[]>(STORAGE_KEYS.NODES, [])
  const initialEdges = loadFromStorage<any[]>(STORAGE_KEYS.EDGES, [])
  const initialBusinessRules = loadFromStorage<string>(STORAGE_KEYS.BUSINESS_RULES, '')
  
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodesData)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const nodesRef = useRef(nodes)
  const [openDialog, setOpenDialog] = useState(false)
  const [editingTable, setEditingTable] = useState<Table | null>(null)
  const [tableName, setTableName] = useState('')
  const [columns, setColumns] = useState<TableColumn[]>([])
  const [newColumnName, setNewColumnName] = useState('')
  const [newColumnType, setNewColumnType] = useState('VARCHAR(255)')
  const [sqlScript, setSqlScript] = useState('')
  const [outputDialogOpen, setOutputDialogOpen] = useState(false)
  const [mainTab, setMainTab] = useState(0)
  const [businessRules, setBusinessRules] = useState(initialBusinessRules)
  const [fullPromptDialogOpen, setFullPromptDialogOpen] = useState(false)
  const [fullPrompt, setFullPrompt] = useState('')
  const [serviceInputNodes, setServiceInputNodes] = useState<ServiceNode[]>(
    loadFromStorage<ServiceNode[]>(STORAGE_KEYS.SERVICE_INPUT, [])
  )
  const [serviceOutputNodes, setServiceOutputNodes] = useState<ServiceNode[]>(
    loadFromStorage<ServiceNode[]>(STORAGE_KEYS.SERVICE_OUTPUT, [])
  )
  const [serviceInputJson, setServiceInputJson] = useState('[]')
  const [serviceOutputJson, setServiceOutputJson] = useState('[]')
  const [serviceInputJsonError, setServiceInputJsonError] = useState<string | null>(null)
  const [serviceOutputJsonError, setServiceOutputJsonError] = useState<string | null>(null)
  const [showServiceInputJsonEditor, setShowServiceInputJsonEditor] = useState(false)
  const [showServiceOutputJsonEditor, setShowServiceOutputJsonEditor] = useState(false)
  const [serviceInputName, setServiceInputName] = useState(
    loadFromStorage<string>(STORAGE_KEYS.SERVICE_INPUT_NAME, 'Input Model')
  )
  const [serviceOutputName, setServiceOutputName] = useState(
    loadFromStorage<string>(STORAGE_KEYS.SERVICE_OUTPUT_NAME, 'Output Model')
  )

  // Keep nodesRef in sync with nodes
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // Save nodes to localStorage whenever they change (without callbacks)
  useEffect(() => {
    const nodesToSave = nodes.map((node: Node) => ({
      ...node,
      data: {
        ...node.data,
        onEdit: undefined,
        onDelete: undefined,
      },
    }))
    saveToStorage(STORAGE_KEYS.NODES, nodesToSave)
  }, [nodes])

  // Save edges to localStorage whenever they change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.EDGES, edges)
  }, [edges])

  // Save businessRules to localStorage whenever they change
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.BUSINESS_RULES, businessRules)
  }, [businessRules])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SERVICE_INPUT, serviceInputNodes)
  }, [serviceInputNodes])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SERVICE_OUTPUT, serviceOutputNodes)
  }, [serviceOutputNodes])

  useEffect(() => {
    setServiceInputJson(JSON.stringify(serviceInputNodes, null, 2))
  }, [serviceInputNodes])

  useEffect(() => {
    setServiceOutputJson(JSON.stringify(serviceOutputNodes, null, 2))
  }, [serviceOutputNodes])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SERVICE_INPUT_NAME, serviceInputName)
  }, [serviceInputName])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SERVICE_OUTPUT_NAME, serviceOutputName)
  }, [serviceOutputName])

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge = {
        ...params,
        type: 'smoothstep',
        animated: true,
        markerEnd: {
          type: MarkerType.ArrowClosed,
        },
        style: { stroke: '#667eea', strokeWidth: 2 },
      }
      setEdges((eds: any[]) => addEdge(newEdge, eds))
    },
    [setEdges]
  )

  const handleAddTable = () => {
    setEditingTable(null)
    setTableName('')
    setColumns([])
    setOpenDialog(true)
  }

  const handleEditTable = useCallback((tableId: string) => {
    const node = nodesRef.current.find((n: Node) => n.id === tableId)
    if (node && node.data) {
      setEditingTable({
        id: node.id,
        name: node.data.label,
        columns: node.data.columns || [],
        position: { x: node.position.x, y: node.position.y },
      })
      setTableName(node.data.label)
      setColumns(node.data.columns || [])
      setOpenDialog(true)
    }
  }, [])

  const handleDeleteTable = useCallback((tableId: string) => {
    setNodes((nds: Node[]) => nds.filter((n: Node) => n.id !== tableId))
    setEdges((eds: any[]) => eds.filter((e: any) => e.source !== tableId && e.target !== tableId))
  }, [setNodes, setEdges])

  // Restore callbacks to nodes after loading from storage (only once on mount)
  useEffect(() => {
    const hasNodesWithoutCallbacks = nodes.some(
      (node: Node) => node.data && (!node.data.onEdit || !node.data.onDelete)
    )
    
    if (hasNodesWithoutCallbacks) {
      setNodes((nds: Node[]) =>
        nds.map((node: Node) => ({
          ...node,
          data: {
            ...node.data,
            onEdit: () => handleEditTable(node.id),
            onDelete: () => handleDeleteTable(node.id),
          },
        }))
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  const handleAddColumn = () => {
    if (newColumnName.trim()) {
      const newColumn: TableColumn = {
        id: `col-${Date.now()}-${Math.random()}`,
        name: newColumnName.trim(),
        type: newColumnType,
        primaryKey: false,
        nullable: true,
        unique: false,
      }
      setColumns((prevColumns) => [...prevColumns, newColumn])
      setNewColumnName('')
      setNewColumnType('VARCHAR(255)')
    }
  }

  const handleDeleteColumn = (columnId: string) => {
    setColumns(columns.filter((col) => col.id !== columnId))
  }

  const handleToggleColumnProperty = (columnId: string, property: keyof TableColumn) => {
    setColumns(
      columns.map((col) =>
        col.id === columnId ? { ...col, [property]: !col[property] } : col
      )
    )
  }

  const handleSaveTable = useCallback(() => {
    if (!tableName.trim()) return

    const tableId = editingTable?.id || `table-${Date.now()}`
    const position = editingTable?.position || {
      x: Math.random() * 400,
      y: Math.random() * 400,
    }

    const newNode: Node = {
      id: tableId,
      type: 'table',
      position,
      data: {
        label: tableName,
        columns: columns,
        onEdit: () => handleEditTable(tableId),
        onDelete: () => handleDeleteTable(tableId),
      },
    }

    if (editingTable) {
      setNodes((nds: Node[]) => nds.map((n: Node) => (n.id === tableId ? newNode : n)))
    } else {
      setNodes((nds: Node[]) => [...nds, newNode])
    }

    setOpenDialog(false)
    setTableName('')
    setColumns([])
    setEditingTable(null)
  }, [tableName, columns, editingTable, handleEditTable, handleDeleteTable])

  const generateSQL = () => {
    let script = '-- ER Diagram SQL Script\n-- Generated automatically\n\n'

    nodes.forEach((node: Node) => {
      if (node.type === 'table' && node.data) {
        const tableName = node.data.label
        const columns = node.data.columns || []

        script += `CREATE TABLE ${tableName} (\n`

        const columnDefs = columns.map((col: TableColumn) => {
          let def = `  ${col.name} ${col.type}`
          if (col.primaryKey) def += ' PRIMARY KEY'
          if (!col.nullable) def += ' NOT NULL'
          if (col.unique) def += ' UNIQUE'
          return def
        })

        script += columnDefs.join(',\n')
        script += '\n);\n\n'
      }
    })

    edges.forEach((edge: any) => {
      const sourceNode = nodes.find((n: Node) => n.id === edge.source)
      const targetNode = nodes.find((n: Node) => n.id === edge.target)
      if (sourceNode && targetNode && sourceNode.data && targetNode.data) {
        script += `ALTER TABLE ${targetNode.data.label}\n`
        script += `  ADD CONSTRAINT fk_${sourceNode.data.label}_${targetNode.data.label}\n`
        script += `  FOREIGN KEY (id) REFERENCES ${sourceNode.data.label}(id);\n\n`
      }
    })

    setSqlScript(script)
    setOutputDialogOpen(true)
  }

  const createServiceNode = (): ServiceNode => ({
    id: `service-node-${Date.now()}-${Math.random()}`,
    name: '',
    type: 'string',
    description: '',
    children: [],
  })

  const addNodeToTree = (nodes: ServiceNode[], parentId: string | undefined, newNode: ServiceNode): ServiceNode[] => {
    if (!parentId) {
      return [...nodes, newNode]
    }
    return nodes.map((node) => {
      if (node.id === parentId) {
        return {
          ...node,
          children: [...(node.children || []), newNode],
        }
      }
      if (node.children) {
        return {
          ...node,
          children: addNodeToTree(node.children, parentId, newNode),
        }
      }
      return node
    })
  }

  const updateNodeInTree = (nodes: ServiceNode[], nodeId: string, updates: Partial<ServiceNode>): ServiceNode[] => {
    return nodes.map((node) => {
      if (node.id === nodeId) {
        return { ...node, ...updates }
      }
      if (node.children) {
        return { ...node, children: updateNodeInTree(node.children, nodeId, updates) }
      }
      return node
    })
  }

  const deleteNodeFromTree = (nodes: ServiceNode[], nodeId: string): ServiceNode[] => {
    return nodes
      .filter((node) => node.id !== nodeId)
      .map((node) => ({
        ...node,
        children: node.children ? deleteNodeFromTree(node.children, nodeId) : node.children,
      }))
  }

  const handleAddServiceNode = (target: 'input' | 'output', parentId?: string) => {
    const newNode = createServiceNode()
    if (target === 'input') {
      setServiceInputNodes((prev) => addNodeToTree(prev, parentId, newNode))
    } else {
      setServiceOutputNodes((prev) => addNodeToTree(prev, parentId, newNode))
    }
  }

  const handleUpdateServiceNode = (
    target: 'input' | 'output',
    nodeId: string,
    field: keyof Pick<ServiceNode, 'name' | 'type' | 'description'>,
    value: string
  ) => {
    if (target === 'input') {
      setServiceInputNodes((prev) => updateNodeInTree(prev, nodeId, { [field]: value }))
    } else {
      setServiceOutputNodes((prev) => updateNodeInTree(prev, nodeId, { [field]: value }))
    }
  }

  const handleDeleteServiceNode = (target: 'input' | 'output', nodeId: string) => {
    if (target === 'input') {
      setServiceInputNodes((prev) => deleteNodeFromTree(prev, nodeId))
    } else {
      setServiceOutputNodes((prev) => deleteNodeFromTree(prev, nodeId))
    }
  }

  const serviceNodeIdCounter = useRef(0)

  const generateServiceNodeId = () => {
    serviceNodeIdCounter.current += 1
    return `service-node-${Date.now()}-${serviceNodeIdCounter.current}`
  }

  const inferPrimitiveType = (value: any): string => {
    if (typeof value === 'number') return 'number'
    if (typeof value === 'boolean') return 'boolean'
    return 'string'
  }

  const normalizeServiceNode = (node: any): ServiceNode => {
    const allowedTypes = ['string', 'number', 'boolean', 'object', 'array', 'date']
    const nodeType = allowedTypes.includes(node?.type) ? node.type : 'string'

    return {
      id: typeof node?.id === 'string' ? node.id : generateServiceNodeId(),
      name: typeof node?.name === 'string' ? node.name : '',
      type: nodeType,
      description: typeof node?.description === 'string' ? node.description : '',
      children: Array.isArray(node?.children)
        ? node.children.map((child: any) => normalizeServiceNode(child))
        : [],
    }
  }

  const convertObjectToNodes = (obj: Record<string, any>): ServiceNode[] => {
    return Object.entries(obj || {}).map(([key, value]) => convertValueToNode(key, value))
  }

  const convertArraySampleToNodes = (arr: any[]): ServiceNode[] => {
    if (!Array.isArray(arr) || arr.length === 0) return []
    const sample = arr.find((item) => item !== undefined && item !== null)
    if (sample === undefined) return []
    if (Array.isArray(sample)) {
      return [convertValueToNode('[0]', sample)]
    }
    if (typeof sample === 'object') {
      return convertObjectToNodes(sample as Record<string, any>)
    }
    return [
      {
        id: generateServiceNodeId(),
        name: '[0]',
        type: inferPrimitiveType(sample),
        description: '',
        children: [],
      },
    ]
  }

  const convertValueToNode = (name: string, value: any): ServiceNode => {
    if (Array.isArray(value)) {
      return {
        id: generateServiceNodeId(),
        name,
        type: 'array',
        description: '',
        children: convertArraySampleToNodes(value),
      }
    }
    if (value && typeof value === 'object') {
      return {
        id: generateServiceNodeId(),
        name,
        type: 'object',
        description: '',
        children: convertObjectToNodes(value as Record<string, any>),
      }
    }
    return {
      id: generateServiceNodeId(),
      name,
      type: inferPrimitiveType(value),
      description: '',
      children: [],
    }
  }

  const parseServiceJson = (json: string): ServiceNode[] => {
    const parsed = JSON.parse(json)
    const looksLikeServiceNodeArray =
      Array.isArray(parsed) &&
      parsed.every((node) => typeof node === 'object' && node !== null && 'name' in node && 'type' in node)

    if (looksLikeServiceNodeArray) {
      return (parsed as any[]).map((node) => normalizeServiceNode(node))
    }

    if (Array.isArray(parsed)) {
      return [
        {
          id: generateServiceNodeId(),
          name: 'items',
          type: 'array',
          description: '',
          children: convertArraySampleToNodes(parsed),
        },
      ]
    }

    if (parsed && typeof parsed === 'object') {
      return convertObjectToNodes(parsed as Record<string, any>)
    }

    return [
      {
        id: generateServiceNodeId(),
        name: 'value',
        type: inferPrimitiveType(parsed),
        description: '',
        children: [],
      },
    ]
  }

  const handleApplyServiceJson = (target: 'input' | 'output') => {
    try {
      if (target === 'input') {
        const parsed = parseServiceJson(serviceInputJson)
        setServiceInputNodes(parsed)
        setServiceInputJsonError(null)
      } else {
        const parsed = parseServiceJson(serviceOutputJson)
        setServiceOutputNodes(parsed)
        setServiceOutputJsonError(null)
      }
    } catch (error: any) {
      if (target === 'input') {
        setServiceInputJsonError(error.message)
      } else {
        setServiceOutputJsonError(error.message)
      }
    }
  }

  const handleLoadSampleJson = (target: 'input' | 'output') => {
    const sampleJson = JSON.stringify(SAMPLE_SERVICE_STRUCTURE, null, 2)
    if (target === 'input') {
      setServiceInputJson(sampleJson)
      setServiceInputJsonError(null)
    } else {
      setServiceOutputJson(sampleJson)
      setServiceOutputJsonError(null)
    }
    try {
      const parsed = parseServiceJson(sampleJson)
      if (target === 'input') {
        setServiceInputNodes(parsed)
      } else {
        setServiceOutputNodes(parsed)
      }
    } catch (error) {
      console.error('Sample JSON parse error:', error)
    }
  }

  const renderServiceTree = (
    nodes: ServiceNode[],
    target: 'input' | 'output',
    depth: number = 0
  ): JSX.Element[] => {
    const accent = target === 'input' ? '#667eea' : '#00A859'
    return nodes.map((node) => {
      const canAddChild = node.type === 'object'
      return (
        <Box key={node.id} sx={{ ml: depth * 1.2, mb: 1 }}>
          <Box
            sx={{
              borderRadius: 1,
              border: '1px solid',
              borderColor: alpha(accent, 0.2),
              bgcolor: alpha(accent, depth === 0 ? 0.05 : 0.02),
              p: 1,
            }}
          >
            <Stack spacing={0.75}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <TextField
                  placeholder="Alan adı"
                  variant="standard"
                  value={node.name}
                  onChange={(e) => handleUpdateServiceNode(target, node.id, 'name', e.target.value)}
                  size="small"
                  sx={{ flex: 1, minWidth: 140 }}
                />
                <TextField
                  variant="standard"
                  select
                  size="small"
                  value={node.type}
                  onChange={(e) => handleUpdateServiceNode(target, node.id, 'type', e.target.value)}
                  sx={{ width: 120 }}
                  SelectProps={{ native: true }}
                >
                  <option value="string">string</option>
                  <option value="number">number</option>
                  <option value="boolean">boolean</option>
                  <option value="object">object</option>
                  <option value="array">array</option>
                  <option value="date">date</option>
                </TextField>
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ ml: 'auto' }}>
                  <Tooltip title={canAddChild ? 'Alt alan ekle' : 'Alt alanlar sadece object tipli alanlar için eklenebilir'}>
                    <span>
                      <IconButton
                        size="small"
                        onClick={() => handleAddServiceNode(target, node.id)}
                        disabled={!canAddChild}
                      >
                        <Add fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Alanı sil">
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDeleteServiceNode(target, node.id)}
                    >
                      <Delete fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
              <TextField
                placeholder="Kısa açıklama"
                variant="standard"
                value={node.description || ''}
                onChange={(e) => handleUpdateServiceNode(target, node.id, 'description', e.target.value)}
                size="small"
                multiline
                minRows={1}
                maxRows={3}
              />
            </Stack>
          </Box>
          {node.children && node.children.length > 0 && (
            <Box sx={{ mt: 0.5 }}>{renderServiceTree(node.children, target, depth + 1)}</Box>
          )}
        </Box>
      )
    })
  }

  const formatServiceTreeForPrompt = (
    nodes: ServiceNode[],
    depth: number = 0
  ): string => {
    let text = ''
    nodes.forEach((node) => {
      const indent = '  '.repeat(depth)
      text += `${indent}- ${node.name || '(adsız)'} (${node.type})`
      if (node.description) {
        text += ` - ${node.description}`
      }
      text += '\n'
      if (node.children && node.children.length > 0) {
        text += formatServiceTreeForPrompt(node.children, depth + 1)
      }
    })
    return text
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(sqlScript)
  }

  const handleDownload = () => {
    const filename = 'database_schema.sql'
    const blob = new Blob([sqlScript], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const generateFullPrompt = useCallback(() => {
    let prompt = '# Backend Projesi - Tam Prompt\n\n'
    
    // Veritabanı Şeması
    if (nodes.length > 0) {
      prompt += '## Veritabanı Şeması\n\n'
      prompt += 'Aşağıdaki ER diyagramına göre veritabanı şeması oluşturulmalıdır:\n\n'

      nodes.forEach((node: Node) => {
        if (node.type === 'table' && node.data) {
          const tableName = node.data.label
          const columns = node.data.columns || []

          prompt += `### Tablo: ${tableName}\n`
          prompt += 'Kolonlar:\n'

          columns.forEach((col: TableColumn) => {
            let colDesc = `- ${col.name} (${col.type})`
            if (col.primaryKey) colDesc += ' [PRIMARY KEY]'
            if (!col.nullable) colDesc += ' [NOT NULL]'
            if (col.unique) colDesc += ' [UNIQUE]'
            prompt += colDesc + '\n'
          })
          prompt += '\n'
        }
      })

      if (edges.length > 0) {
        prompt += '### İlişkiler\n\n'
        edges.forEach((edge: any) => {
          const sourceNode = nodes.find((n: Node) => n.id === edge.source)
          const targetNode = nodes.find((n: Node) => n.id === edge.target)
          if (sourceNode && targetNode && sourceNode.data && targetNode.data) {
            prompt += `- ${sourceNode.data.label} -> ${targetNode.data.label} (Foreign Key ilişkisi)\n`
          }
        })
        prompt += '\n'
      }
    } else {
      prompt += '## Veritabanı Şeması\n\n'
      prompt += 'Henüz veritabanı şeması tanımlanmamış.\n\n'
    }

    // İş Kuralları
    if (businessRules.trim()) {
      prompt += '## İş Kuralları ve Analiz Dökümanları\n\n'
      prompt += businessRules.trim()
      prompt += '\n\n'
    } else {
      prompt += '## İş Kuralları ve Analiz Dökümanları\n\n'
      prompt += 'Henüz iş kuralları ve analiz dökümanları girilmemiş.\n\n'
    }

    // Servis IO Modelleri
    prompt += '## Servis IO Modelleri\n\n'

    prompt += `### Input Model: ${serviceInputName || 'Input Model'}\n\n`
    if (serviceInputNodes.length > 0) {
      prompt += formatServiceTreeForPrompt(serviceInputNodes)
      prompt += '\n'
    } else {
      prompt += 'Henüz input modeli tanımlanmamış.\n\n'
    }

    prompt += `### Output Model: ${serviceOutputName || 'Output Model'}\n\n`
    if (serviceOutputNodes.length > 0) {
      prompt += formatServiceTreeForPrompt(serviceOutputNodes)
      prompt += '\n'
    } else {
      prompt += 'Henüz output modeli tanımlanmamış.\n\n'
    }

    // Sonuç
    prompt += '---\n\n'
    prompt += 'Yukarıdaki veritabanı şeması ve iş kurallarına göre backend projesini oluştur. '
    prompt += 'Tüm gereksinimleri dikkate alarak, modern ve ölçeklenebilir bir mimari tasarla. '
    prompt += 'Proje yapısını, API endpoint\'lerini, modelleri, servisleri ve tüm gerekli bileşenleri oluştur.'

    setFullPrompt(prompt)
    setFullPromptDialogOpen(true)
  }, [
    nodes,
    edges,
    businessRules,
    serviceInputNodes,
    serviceOutputNodes,
    serviceInputName,
    serviceOutputName,
  ])

  // Register prompt handler
  useEffect(() => {
    setPromptHandler(generateFullPrompt)
  }, [setPromptHandler, generateFullPrompt])

  const handleCopyFullPrompt = () => {
    navigator.clipboard.writeText(fullPrompt)
  }

  const handleDownloadFullPrompt = () => {
    const blob = new Blob([fullPrompt], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backend_full_prompt.txt'
    a.click()
    URL.revokeObjectURL(url)
  }


  return (
    <Box sx={{ height: 'calc(100vh - 150px)' }}>
      <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Tabs
          value={mainTab}
          onChange={(_, newValue) => setMainTab(newValue)}
          sx={{
            borderBottom: 1,
            borderColor: 'divider',
            px: 2,
            pt: 1,
          }}
        >
          <Tab label="Database" icon={<TableChart />} iconPosition="start" />
          <Tab label="İş Kuralları" icon={<Rule />} iconPosition="start" />
          <Tab label="Servis IO" icon={<Storage />} iconPosition="start" />
        </Tabs>

        {/* Database Tab */}
        <Box sx={{ flex: 1, display: mainTab === 0 ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
          <Stack direction="row" spacing={2} sx={{ p: 2, pb: 1 }}>
            <Button
              variant="contained"
              startIcon={<Add />}
              onClick={handleAddTable}
              sx={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                '&:hover': {
                  background: 'linear-gradient(135deg, #5568d3 0%, #653a8f 100%)',
                },
              }}
            >
              Tablo Ekle
            </Button>
            <Button
              variant="outlined"
              startIcon={<TableChart />}
              onClick={generateSQL}
              disabled={nodes.length === 0}
            >
              SQL Script Oluştur
            </Button>
          </Stack>

          <Box sx={{ flex: 1, position: 'relative', p: 2, pt: 0 }}>
            <Paper sx={{ height: '100%', position: 'relative' }}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap />
              </ReactFlow>
            </Paper>
          </Box>
        </Box>

        {/* İş Kuralları Tab */}
        <Box sx={{ flex: 1, display: mainTab === 1 ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
          <Paper sx={{ flex: 1, p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Analiz Dökümanları
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              İş kuralları, analiz dökümanları ve gereksinimleri buraya girebilirsiniz.
            </Typography>
            <TextField
              multiline
              fullWidth
              value={businessRules}
              onChange={(e) => setBusinessRules(e.target.value)}
              placeholder="İş kuralları ve analiz dökümanlarınızı buraya yazın..."
              sx={{
                flex: 1,
                '& .MuiInputBase-root': {
                  height: '100%',
                  alignItems: 'flex-start',
                },
                '& .MuiInputBase-input': {
                  height: '100% !important',
                  overflow: 'auto !important',
                },
              }}
              rows={20}
            />
          </Paper>
        </Box>

        {/* Servis IO Tab */}
        <Box sx={{ flex: 1, display: mainTab === 2 ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
          <Grid container spacing={2} sx={{ flex: 1, overflow: 'hidden' }}>
            <Grid item xs={12} md={6} sx={{ height: '100%' }}>
              <Paper sx={{ height: '100%', p: 2, display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Box sx={{ flex: 1, pr: 2 }}>
                    <TextField
                      label="Input Model Adı"
                      value={serviceInputName}
                      onChange={(e) => setServiceInputName(e.target.value)}
                      size="small"
                      fullWidth
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Servis giriş parametrelerini hiyerarşik olarak tanımlayın.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Alan ekle">
                      <IconButton
                        color="primary"
                        size="small"
                        onClick={() => handleAddServiceNode('input')}
                        sx={{
                          border: '1px solid',
                          borderColor: alpha('#667eea', 0.4),
                          bgcolor: alpha('#667eea', 0.08),
                        }}
                      >
                        <Add fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={showServiceInputJsonEditor ? 'Tree moduna geç' : 'JSON editöre geç'}>
                      <IconButton
                        size="small"
                        color={showServiceInputJsonEditor ? 'primary' : 'default'}
                        onClick={() => setShowServiceInputJsonEditor((prev) => !prev)}
                        sx={{
                          border: '1px solid',
                          borderColor: alpha('#667eea', 0.4),
                          bgcolor: showServiceInputJsonEditor ? alpha('#667eea', 0.08) : 'transparent',
                        }}
                      >
                        {showServiceInputJsonEditor ? <AccountTree fontSize="small" /> : <Code fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                  {showServiceInputJsonEditor ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <TextField
                        multiline
                        minRows={8}
                        maxRows={16}
                        fullWidth
                        value={serviceInputJson}
                        onChange={(e) => setServiceInputJson(e.target.value)}
                        sx={{
                          fontFamily: 'monospace',
                          '& .MuiInputBase-root': {
                            fontFamily: 'monospace',
                            alignItems: 'flex-start',
                          },
                        }}
                      />
                      {serviceInputJsonError && (
                        <Typography color="error" variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                          {serviceInputJsonError}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
                        <Button
                          variant="outlined"
                          startIcon={<Code />}
                          onClick={() => handleLoadSampleJson('input')}
                        >
                          Örnek JSON
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<Storage />}
                          onClick={() => handleApplyServiceJson('input')}
                        >
                          JSON'dan Uygula
                        </Button>
                      </Stack>
                    </Box>
                  ) : serviceInputNodes.length > 0 ? (
                    renderServiceTree(serviceInputNodes, 'input')
                  ) : (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 3,
                        textAlign: 'center',
                        color: 'text.secondary',
                        borderStyle: 'dashed',
                      }}
                    >
                      <Typography variant="body2">
                        Henüz input alanı eklenmedi. Başlangıç alanı oluşturmak için "Alan Ekle" butonunu kullanın.
                      </Typography>
                    </Paper>
                  )}
                </Box>
              </Paper>
            </Grid>

            <Grid item xs={12} md={6} sx={{ height: '100%' }}>
              <Paper sx={{ height: '100%', p: 2, display: 'flex', flexDirection: 'column' }}>
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 2 }}>
                  <Box sx={{ flex: 1, pr: 2 }}>
                    <TextField
                      label="Output Model Adı"
                      value={serviceOutputName}
                      onChange={(e) => setServiceOutputName(e.target.value)}
                      size="small"
                      fullWidth
                    />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                      Servis dönüş verisini JSON tree olarak inşa edin.
                    </Typography>
                  </Box>
                  <Stack direction="row" spacing={0.5}>
                    <Tooltip title="Alan ekle">
                      <IconButton
                        color="primary"
                        size="small"
                        onClick={() => handleAddServiceNode('output')}
                        sx={{
                          border: '1px solid',
                          borderColor: alpha('#00A859', 0.4),
                          bgcolor: alpha('#00A859', 0.08),
                        }}
                      >
                        <Add fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={showServiceOutputJsonEditor ? 'Tree moduna geç' : 'JSON editöre geç'}>
                      <IconButton
                        size="small"
                        color={showServiceOutputJsonEditor ? 'primary' : 'default'}
                        onClick={() => setShowServiceOutputJsonEditor((prev) => !prev)}
                        sx={{
                          border: '1px solid',
                          borderColor: alpha('#00A859', 0.4),
                          bgcolor: showServiceOutputJsonEditor ? alpha('#00A859', 0.08) : 'transparent',
                        }}
                      >
                        {showServiceOutputJsonEditor ? <AccountTree fontSize="small" /> : <Code fontSize="small" />}
                      </IconButton>
                    </Tooltip>
                  </Stack>
                </Stack>
                <Box sx={{ flex: 1, overflow: 'auto' }}>
                  {showServiceOutputJsonEditor ? (
                    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <TextField
                        multiline
                        minRows={8}
                        maxRows={16}
                        fullWidth
                        value={serviceOutputJson}
                        onChange={(e) => setServiceOutputJson(e.target.value)}
                        sx={{
                          fontFamily: 'monospace',
                          '& .MuiInputBase-root': {
                            fontFamily: 'monospace',
                            alignItems: 'flex-start',
                          },
                        }}
                      />
                      {serviceOutputJsonError && (
                        <Typography color="error" variant="caption" sx={{ display: 'block', mt: 0.5 }}>
                          {serviceOutputJsonError}
                        </Typography>
                      )}
                      <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1 }}>
                        <Button
                          variant="outlined"
                          startIcon={<Code />}
                          onClick={() => handleLoadSampleJson('output')}
                        >
                          Örnek JSON
                        </Button>
                        <Button
                          variant="contained"
                          startIcon={<Storage />}
                          onClick={() => handleApplyServiceJson('output')}
                        >
                          JSON'dan Uygula
                        </Button>
                      </Stack>
                    </Box>
                  ) : serviceOutputNodes.length > 0 ? (
                    renderServiceTree(serviceOutputNodes, 'output')
                  ) : (
                    <Paper
                      variant="outlined"
                      sx={{
                        p: 3,
                        textAlign: 'center',
                        color: 'text.secondary',
                        borderStyle: 'dashed',
                      }}
                    >
                      <Typography variant="body2">
                        Henüz output alanı eklenmedi. Yapıyı tanımlamak için "Alan Ekle" butonunu kullanın.
                      </Typography>
                    </Paper>
                  )}
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </Box>
      </Paper>

      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          {editingTable ? 'Tabloyu Düzenle' : 'Yeni Tablo Ekle'}
        </DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Tablo Adı"
            fullWidth
            variant="outlined"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            sx={{ mb: 3 }}
          />

          <Typography variant="subtitle2" sx={{ mb: 2 }}>
            Kolonlar
          </Typography>

          <Stack spacing={2} sx={{ mb: 2 }}>
            {columns.map((column) => (
              <Paper key={column.id} sx={{ p: 2 }}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Typography variant="body2" sx={{ flex: 1, fontWeight: 600 }}>
                    {column.name}
                  </Typography>
                  <Chip label={column.type} size="small" />
                  <Chip
                    label="PK"
                    size="small"
                    color={column.primaryKey ? 'primary' : 'default'}
                    onClick={() => handleToggleColumnProperty(column.id, 'primaryKey')}
                    sx={{ cursor: 'pointer' }}
                  />
                  <Chip
                    label="NULL"
                    size="small"
                    color={column.nullable ? 'default' : 'error'}
                    onClick={() => handleToggleColumnProperty(column.id, 'nullable')}
                    sx={{ cursor: 'pointer' }}
                  />
                  <Chip
                    label="UNIQUE"
                    size="small"
                    color={column.unique ? 'success' : 'default'}
                    onClick={() => handleToggleColumnProperty(column.id, 'unique')}
                    sx={{ cursor: 'pointer' }}
                  />
                  <IconButton
                    size="small"
                    onClick={() => handleDeleteColumn(column.id)}
                    color="error"
                  >
                    <Delete />
                  </IconButton>
                </Stack>
              </Paper>
            ))}
          </Stack>

          <Stack direction="row" spacing={2}>
            <TextField
              label="Kolon Adı"
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              size="small"
              sx={{ flex: 1 }}
            />
            <TextField
              select
              label="Tip"
              value={newColumnType}
              onChange={(e) => setNewColumnType(e.target.value)}
              size="small"
              SelectProps={{ native: true }}
              sx={{ width: 200 }}
            >
              <option value="VARCHAR(255)">VARCHAR(255)</option>
              <option value="INT">INT</option>
              <option value="BIGINT">BIGINT</option>
              <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
              <option value="DATE">DATE</option>
              <option value="DATETIME">DATETIME</option>
              <option value="BOOLEAN">BOOLEAN</option>
              <option value="TEXT">TEXT</option>
            </TextField>
            <Button
              variant="outlined"
              startIcon={<Add />}
              onClick={handleAddColumn}
              disabled={!newColumnName.trim()}
            >
              Ekle
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDialog(false)}>İptal</Button>
          <Button
            onClick={handleSaveTable}
            variant="contained"
            disabled={!tableName.trim() || columns.length === 0}
          >
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>

      {/* SQL Script Dialog */}
      <Dialog
        open={outputDialogOpen}
        onClose={() => setOutputDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <TableChart sx={{ color: '#667eea' }} />
              SQL Script
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<ContentCopy />}
                onClick={handleCopy}
                size="small"
                variant="outlined"
              >
                Kopyala
              </Button>
              <Button
                startIcon={<Download />}
                onClick={handleDownload}
                size="small"
                variant="contained"
                sx={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                İndir
              </Button>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            value={sqlScript}
            onChange={(e) => setSqlScript(e.target.value)}
            sx={{
              mt: 2,
              '& .MuiInputBase-root': {
                fontFamily: 'monospace',
                fontSize: '0.875rem',
              },
            }}
            rows={20}
            placeholder="SQL script buraya gelecek..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOutputDialogOpen(false)}>Kapat</Button>
        </DialogActions>
      </Dialog>

      {/* Full Prompt Dialog */}
      <Dialog
        open={fullPromptDialogOpen}
        onClose={() => setFullPromptDialogOpen(false)}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AutoAwesome sx={{ color: '#667eea' }} />
              Tam Prompt
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<ContentCopy />}
                onClick={handleCopyFullPrompt}
                size="small"
                variant="outlined"
              >
                Kopyala
              </Button>
              <Button
                startIcon={<Download />}
                onClick={handleDownloadFullPrompt}
                size="small"
                variant="contained"
                sx={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                }}
              >
                İndir
              </Button>
            </Stack>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <TextField
            multiline
            fullWidth
            value={fullPrompt}
            onChange={(e) => setFullPrompt(e.target.value)}
            sx={{
              mt: 2,
              '& .MuiInputBase-root': {
                fontSize: '0.875rem',
              },
            }}
            rows={25}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFullPromptDialogOpen(false)}>Kapat</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
