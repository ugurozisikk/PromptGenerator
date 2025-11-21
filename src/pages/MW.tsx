import { useState, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import {
  Box,
  Paper,
  Button,
  TextField,
  Typography,
  IconButton,
  Chip,
  Stack,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  alpha,
  CircularProgress,
  Alert,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material'
import {
  Delete,
  Edit,
  DragIndicator,
  Storage,
  Computer,
  Refresh,
  AutoAwesome,
  ContentCopy,
  Download,
  Clear,
} from '@mui/icons-material'
import { usePrompt } from '../contexts/PromptContext'

interface SwaggerPath {
  path: string
  methods: {
    method: string
    summary?: string
    operationId?: string
    requestBody?: any
    responses?: any
  }[]
}

interface SwaggerSpec {
  paths: Record<string, Record<string, any>>
  components?: {
    schemas?: Record<string, any>
  }
}

interface JsonNode {
  id: string
  key: string
  value: any
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null'
  children?: JsonNode[]
  path: string
}

interface ClientField {
  id: string
  name: string
  type: string
  sourcePath: string
  sourceKey: string
  sourceCategory?: 'body' | 'path' | 'query' | 'form-data' | 'output'
  children?: ClientField[]
}

const STORAGE_KEYS = {
  SWAGGER_URL: 'mw_swagger_url',
  INPUT_CLIENT_FIELDS: 'mw_input_client_fields',
  OUTPUT_CLIENT_FIELDS: 'mw_output_client_fields',
  MIDDLEWARE_ENDPOINT: 'mw_middleware_endpoint',
  MIDDLEWARE_METHOD: 'mw_middleware_method',
  ANALYSIS_REQUIREMENTS: 'mw_analysis_requirements',
}

const loadFromStorage = <T,>(key: string, defaultValue: T): T => {
  try {
    const item = localStorage.getItem(key)
    return item ? JSON.parse(item) : defaultValue
  } catch (error) {
    console.error(`Error loading ${key} from localStorage:`, error)
    return defaultValue
  }
}

const saveToStorage = <T,>(key: string, value: T): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (error) {
    console.error(`Error saving ${key} to localStorage:`, error)
  }
}

// Convert JSON schema to tree structure
const schemaToTree = (schema: any, path: string = '', key: string = 'root', spec?: SwaggerSpec): JsonNode[] => {
  if (!schema) {
    console.log('schemaToTree: schema is null or undefined', { path, key })
    return []
  }

  console.log('schemaToTree called:', { path, key, schemaType: schema.type, hasProperties: !!schema.properties, hasItems: !!schema.items, hasRef: !!schema.$ref })

  const nodes: JsonNode[] = []

  // Resolve schema first
  let workingSchema = schema
  if (spec) {
    const resolved = resolveSchema(schema, spec)
    console.log('schemaToTree after resolveSchema:', { original: schema, resolved, areEqual: resolved === schema })
    if (resolved) {
      workingSchema = resolved
      // If schema was significantly changed, recursively process the resolved schema
      if (resolved !== schema && (resolved.properties || resolved.type || resolved.items)) {
        console.log('Recursively calling schemaToTree with resolved schema')
        return schemaToTree(resolved, path, key, spec)
      }
    }
  }

  // Use workingSchema (either original or resolved)
  const finalSchema = workingSchema || schema
  console.log('schemaToTree: using final schema', { hasProperties: !!finalSchema.properties, hasItems: !!finalSchema.items, type: finalSchema.type })

  // If schema has properties, it's an object
  if (finalSchema.properties) {
    console.log('schemaToTree: processing properties', Object.keys(finalSchema.properties))
    Object.entries(finalSchema.properties).forEach(([propKey, propValue]: [string, any]) => {
      const currentPath = path ? `${path}.${propKey}` : propKey
      console.log(`schemaToTree: processing property ${propKey}`, propValue)
      
      // Resolve $ref in property - use resolveSchema for better handling
      let resolvedProp = propValue
      if (spec) {
        resolvedProp = resolveSchema(propValue, spec) || propValue
        console.log(`schemaToTree: resolved property ${propKey}`, { original: propValue, resolved: resolvedProp })
      }
      
      // Determine type
      let propType = resolvedProp.type
      if (!propType) {
        if (resolvedProp.properties) propType = 'object'
        else if (resolvedProp.items) propType = 'array'
        else if (resolvedProp.$ref) {
          // If still has $ref, try to resolve it
          const refResolved = spec ? getSchemaFromRef(resolvedProp.$ref, spec) : null
          if (refResolved) {
            propType = refResolved.type || (refResolved.properties ? 'object' : 'string')
          } else {
            propType = 'string' // default
          }
        } else {
          propType = 'string' // default
        }
      }
      
      const node: JsonNode = {
        id: `${path ? path + '.' : ''}${propKey}`,
        key: propKey,
        value: resolvedProp,
        type: propType as any,
        path: currentPath,
      }

      // Recursively process children
      if (resolvedProp.type === 'object' && resolvedProp.properties) {
        node.children = schemaToTree(resolvedProp, currentPath, propKey, spec)
      } else if (resolvedProp.type === 'array' && resolvedProp.items) {
        // Resolve items schema
        let itemsSchema = resolvedProp.items
        if (spec) {
          itemsSchema = resolveSchema(itemsSchema, spec) || itemsSchema
        }
        node.children = schemaToTree(itemsSchema, `${currentPath}[]`, propKey, spec)
      } else if (!resolvedProp.type && resolvedProp.properties) {
        // No type but has properties - treat as object
        node.type = 'object'
        node.children = schemaToTree(resolvedProp, currentPath, propKey, spec)
      } else if (!resolvedProp.type && resolvedProp.items) {
        // No type but has items - treat as array
        node.type = 'array'
        let itemsSchema = resolvedProp.items
        if (spec) {
          itemsSchema = resolveSchema(itemsSchema, spec) || itemsSchema
        }
        node.children = schemaToTree(itemsSchema, `${currentPath}[]`, propKey, spec)
      }

      console.log(`schemaToTree: created node for ${propKey}`, node)
      nodes.push(node)
    })
    console.log('schemaToTree: total nodes created from properties', nodes.length)
  } else if (finalSchema.type === 'array' && finalSchema.items) {
    let resolvedItems = finalSchema.items
    if (finalSchema.items.$ref && spec) {
      const refResolved = getSchemaFromRef(finalSchema.items.$ref, spec)
      if (refResolved) {
        resolvedItems = { ...refResolved, ...finalSchema.items }
        delete resolvedItems.$ref
      }
    }
    
    // Handle allOf, oneOf, anyOf in items
    if (spec && (resolvedItems.allOf || resolvedItems.oneOf || resolvedItems.anyOf)) {
      resolvedItems = resolveSchema(resolvedItems, spec) || resolvedItems
    }

    const node: JsonNode = {
      id: `${path}[]`,
      key: 'items',
      value: resolvedItems,
      type: 'array',
      path: `${path}[]`,
    }
    node.children = schemaToTree(resolvedItems, `${path}[]`, 'items', spec)
    nodes.push(node)
  } else if (finalSchema.type && finalSchema.type !== 'object' && finalSchema.type !== 'array') {
    // Primitive type (string, number, boolean, etc.)
    console.log('schemaToTree: creating primitive node', finalSchema.type)
    const node: JsonNode = {
      id: path || key,
      key: key === 'root' ? 'value' : key,
      value: finalSchema,
      type: finalSchema.type as any,
      path: path || key,
    }
    nodes.push(node)
  } else if (!finalSchema.type && !finalSchema.properties && !finalSchema.items) {
    // Unknown schema structure - try to infer
    console.log('schemaToTree: Unknown schema structure:', finalSchema)
    // If we have a type in the resolved schema, use it
    if (finalSchema.type) {
      const node: JsonNode = {
        id: path || key,
        key: key === 'root' ? 'value' : key,
        value: finalSchema,
        type: finalSchema.type as any,
        path: path || key,
      }
      nodes.push(node)
    } else {
      // If no type, properties, or items, it might be an empty object or unknown structure
      console.warn('schemaToTree: Schema has no type, properties, or items. Returning empty array.')
    }
  }

  console.log('schemaToTree: returning', nodes.length, 'nodes')
  return nodes
}

// Helper function to get schema from ref
const getSchemaFromRef = (ref: string, spec?: SwaggerSpec | null): any => {
  if (!spec) return null
  // OpenAPI 3.0 format: #/components/schemas/Order
  if (ref.startsWith('#/components/schemas/')) {
    const schemaName = ref.replace('#/components/schemas/', '')
    return spec.components?.schemas?.[schemaName] || null
  }
  
  // Swagger 2.0 format: #/definitions/Order
  if (ref.startsWith('#/definitions/')) {
    const schemaName = ref.replace('#/definitions/', '')
    return (spec as any).definitions?.[schemaName] || null
  }
  
  return null
}

// Resolve schema (handle $ref, allOf, oneOf, anyOf)
const resolveSchema = (schema: any, spec?: SwaggerSpec | null): any => {
  if (!schema) {
    console.log('resolveSchema: schema is null or undefined')
    return null
  }

  console.log('resolveSchema called:', { hasRef: !!schema.$ref, hasAllOf: !!schema.allOf, hasOneOf: !!schema.oneOf, hasAnyOf: !!schema.anyOf, hasProperties: !!schema.properties, type: schema.type })

  // Handle $ref
  if (schema.$ref) {
    if (!spec) {
      console.warn('resolveSchema: spec is required to resolve $ref but was not provided')
      return schema
    }
    console.log('resolveSchema: resolving $ref', schema.$ref)
    const resolved = getSchemaFromRef(schema.$ref, spec)
    if (resolved) {
      console.log('resolveSchema: resolved $ref', schema.$ref, 'to', resolved)
      // Merge any additional properties from the original schema
      const merged = { ...resolved }
      Object.keys(schema).forEach(key => {
        if (key !== '$ref') {
          merged[key] = schema[key]
        }
      })
      console.log('resolveSchema: merged schema', merged)
      return resolveSchema(merged, spec) // Recursively resolve nested refs
    } else {
      console.warn('resolveSchema: could not resolve $ref', schema.$ref)
    }
    return null
  }

  // Handle allOf - merge all schemas
  if (schema.allOf && Array.isArray(schema.allOf)) {
    const merged: any = { type: 'object', properties: {}, required: [] }
    schema.allOf.forEach((s: any) => {
      const resolved = resolveSchema(s, spec)
      if (resolved) {
        if (resolved.properties) {
          merged.properties = { ...merged.properties, ...resolved.properties }
        }
        if (resolved.required && Array.isArray(resolved.required)) {
          merged.required = [...merged.required, ...resolved.required]
        }
        // Merge other properties
        Object.keys(resolved).forEach(key => {
          if (key !== 'properties' && key !== 'required' && !merged[key]) {
            merged[key] = resolved[key]
          }
        })
      }
    })
    // Preserve original schema properties
    Object.keys(schema).forEach(key => {
      if (key !== 'allOf' && !merged[key]) {
        merged[key] = schema[key]
      }
    })
    return merged
  }

  // Handle oneOf - take the first schema
  if (schema.oneOf && Array.isArray(schema.oneOf) && schema.oneOf.length > 0) {
    const first = schema.oneOf[0]
    const resolved = resolveSchema(first, spec)
    return resolved || first
  }

  // Handle anyOf - take the first schema
  if (schema.anyOf && Array.isArray(schema.anyOf) && schema.anyOf.length > 0) {
    const first = schema.anyOf[0]
    const resolved = resolveSchema(first, spec)
    return resolved || first
  }

  // If schema has properties but no type, assume it's an object
  if (schema.properties && !schema.type) {
    return { ...schema, type: 'object' }
  }

  // If schema has items but no type, assume it's an array
  if (schema.items && !schema.type) {
    return { ...schema, type: 'array' }
  }

  return schema
}

// Render JSON tree recursively
const renderJsonTree = (
  nodes: JsonNode[],
  depth: number = 0,
  onDragStart: (node: JsonNode, type: 'input' | 'output') => void,
  expandedNodes: Set<string>,
  onToggleExpand: (nodeId: string) => void,
  nodeType: 'input' | 'output' = 'input'
) => {
  const nodeColor = nodeType === 'input' ? '#667eea' : '#00A859'
  
  return nodes.map((node) => {
    const hasChildren = node.children && node.children.length > 0
    const isExpanded = expandedNodes.has(node.id)

    return (
      <Box key={node.id} sx={{ ml: depth * 2 }}>
        <Box
          draggable
          onDragStart={(e) => {
            e.dataTransfer.effectAllowed = 'move'
            onDragStart(node, nodeType)
          }}
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            py: 0.75,
            px: 1.5,
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: alpha(nodeColor, 0.2),
            mb: 0.5,
            cursor: 'grab',
            backgroundColor: '#ffffff',
            transition: 'all 0.2s ease',
            '&:hover': {
              borderColor: nodeColor,
              backgroundColor: alpha(nodeColor, 0.05),
              transform: 'translateY(-1px)',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
            },
            '&:active': {
              cursor: 'grabbing',
              transform: 'translateY(0)',
            },
          }}
        >
          <DragIndicator sx={{ fontSize: 16, color: nodeColor }} />
          {hasChildren && (
            <IconButton
              size="small"
              onClick={() => onToggleExpand(node.id)}
              sx={{ p: 0.5 }}
            >
              <Typography variant="body2">{isExpanded ? '▼' : '▶'}</Typography>
            </IconButton>
          )}
          <Typography variant="body2" sx={{ fontWeight: 500 }}>
            {node.key}
          </Typography>
          <Chip label={node.type} size="small" />
          {node.type === 'array' && (
            <Chip label="array" size="small" color="secondary" />
          )}
        </Box>
        {hasChildren && isExpanded && node.children && (
          <Box>
            {renderJsonTree(node.children, depth + 1, onDragStart, expandedNodes, onToggleExpand, nodeType)}
          </Box>
        )}
      </Box>
    )
  })
}

export const MW = () => {
  const { setPromptHandler } = usePrompt()
  const location = useLocation()
  
  const [swaggerUrl, setSwaggerUrl] = useState<string>(
    loadFromStorage<string>(STORAGE_KEYS.SWAGGER_URL, '')
  )
  const [swaggerSpec, setSwaggerSpec] = useState<SwaggerSpec | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paths, setPaths] = useState<SwaggerPath[]>([])
  const [selectedPath, setSelectedPath] = useState<string>('')
  const [bodyTree, setBodyTree] = useState<JsonNode[]>([])
  const [outputTree, setOutputTree] = useState<JsonNode[]>([])
  const [pathParams, setPathParams] = useState<JsonNode[]>([])
  const [queryParams, setQueryParams] = useState<JsonNode[]>([])
  const [formDataParams, setFormDataParams] = useState<JsonNode[]>([])
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [inputClientFields, setInputClientFields] = useState<ClientField[]>(
    loadFromStorage<ClientField[]>(STORAGE_KEYS.INPUT_CLIENT_FIELDS, [])
  )
  const [outputClientFields, setOutputClientFields] = useState<ClientField[]>(
    loadFromStorage<ClientField[]>(STORAGE_KEYS.OUTPUT_CLIENT_FIELDS, [])
  )
  const [draggedNode, setDraggedNode] = useState<JsonNode | null>(null)
  const [draggedNodeType, setDraggedNodeType] = useState<'input' | 'output' | null>(null)
  const [draggedClientField, setDraggedClientField] = useState<ClientField | null>(null)
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null)
  const [editingFieldName, setEditingFieldName] = useState<string>('')
  const [editingFieldType, setEditingFieldType] = useState<'input' | 'output'>('input')
  const [backendViewTab, setBackendViewTab] = useState<'input' | 'output'>('input')
  const [fullPromptDialogOpen, setFullPromptDialogOpen] = useState(false)
  const [fullPrompt, setFullPrompt] = useState('')
  const [middlewareEndpoint, setMiddlewareEndpoint] = useState<string>(
    loadFromStorage<string>(STORAGE_KEYS.MIDDLEWARE_ENDPOINT, '')
  )
  const [middlewareMethod, setMiddlewareMethod] = useState<string>(
    loadFromStorage<string>(STORAGE_KEYS.MIDDLEWARE_METHOD, 'GET')
  )
  const [mainTab, setMainTab] = useState(0)
  const [analysisRequirements, setAnalysisRequirements] = useState<string>(
    loadFromStorage<string>(STORAGE_KEYS.ANALYSIS_REQUIREMENTS, '')
  )

  // Save to localStorage
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.SWAGGER_URL, swaggerUrl)
  }, [swaggerUrl])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.INPUT_CLIENT_FIELDS, inputClientFields)
  }, [inputClientFields])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.OUTPUT_CLIENT_FIELDS, outputClientFields)
  }, [outputClientFields])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.MIDDLEWARE_ENDPOINT, middlewareEndpoint)
  }, [middlewareEndpoint])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.MIDDLEWARE_METHOD, middlewareMethod)
  }, [middlewareMethod])

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.ANALYSIS_REQUIREMENTS, analysisRequirements)
  }, [analysisRequirements])

  // Clear all data when component unmounts or location changes (navigating away)
  useEffect(() => {
    // Check if we're navigating away from MW page
    if (location.pathname !== '/mw') {
      // Clear all state (but keep swaggerUrl from localStorage)
      setSwaggerSpec(null)
      setPaths([])
      setSelectedPath('')
      setBodyTree([])
      setOutputTree([])
      setPathParams([])
      setQueryParams([])
      setFormDataParams([])
      setInputClientFields([])
      setOutputClientFields([])
      setExpandedNodes(new Set())
      setError(null)
      setMiddlewareEndpoint('')
      setMiddlewareMethod('GET')
      // Clear localStorage except SWAGGER_URL
      Object.values(STORAGE_KEYS).forEach(key => {
        if (key !== STORAGE_KEYS.SWAGGER_URL) {
          localStorage.removeItem(key)
        }
      })
      console.log('Cleared all MW data on navigation away (kept Swagger URL)')
    }
    
    return () => {
      // Cleanup function: clear all localStorage data when component unmounts except SWAGGER_URL
      Object.values(STORAGE_KEYS).forEach(key => {
        if (key !== STORAGE_KEYS.SWAGGER_URL) {
          localStorage.removeItem(key)
        }
      })
      console.log('Cleared all MW localStorage data on unmount (kept Swagger URL)')
    }
  }, [location.pathname])

  // Clear all data when method changes and auto-set middleware method and endpoint
  useEffect(() => {
    if (selectedPath) {
      // Extract path and method from selectedPath
      const [path, method] = selectedPath.split('|')
      
      // Set middleware method based on selected swagger method
      if (method) {
        const upperMethod = method.toUpperCase()
        setMiddlewareMethod(upperMethod)
        console.log('Auto-set middleware method to:', upperMethod, 'from selected path:', selectedPath)
      }
      
      // Set middleware endpoint based on selected swagger path
      if (path) {
        // Add /api/v1 prefix to the path
        const endpoint = path.startsWith('/') ? `/api/v1${path}` : `/api/v1/${path}`
        setMiddlewareEndpoint(endpoint)
        console.log('Auto-set middleware endpoint to:', endpoint, 'from selected path:', path)
      }
      
      // Clear all parsed data when a new method is selected
      setBodyTree([])
      setOutputTree([])
      setPathParams([])
      setQueryParams([])
      setFormDataParams([])
      setInputClientFields([])
      setOutputClientFields([])
      setExpandedNodes(new Set())
      console.log('Cleared all MW data for new method selection')
    }
  }, [selectedPath])

  // Clear all data
  const handleClearAll = () => {
    // Don't clear swaggerUrl - keep it in localStorage
    setSwaggerSpec(null)
    setPaths([])
    setSelectedPath('')
    setBodyTree([])
    setOutputTree([])
    setPathParams([])
    setQueryParams([])
    setFormDataParams([])
    setInputClientFields([])
    setOutputClientFields([])
    setExpandedNodes(new Set())
    setError(null)
    setMiddlewareEndpoint('')
    setMiddlewareMethod('GET')
    // Clear localStorage except SWAGGER_URL
    Object.values(STORAGE_KEYS).forEach(key => {
      if (key !== STORAGE_KEYS.SWAGGER_URL) {
        localStorage.removeItem(key)
      }
    })
    console.log('All MW data cleared (kept Swagger URL)')
  }

  // Load Swagger spec
  const loadSwagger = async () => {
    if (!swaggerUrl.trim()) {
      setError('Lütfen Swagger URL girin')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(swaggerUrl)
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const spec: SwaggerSpec = await response.json()

      setSwaggerSpec(spec)

      // Parse paths
      const parsedPaths: SwaggerPath[] = []
      Object.entries(spec.paths || {}).forEach(([path, methods]) => {
        const pathMethods: SwaggerPath['methods'] = []
        Object.entries(methods).forEach(([method, details]) => {
          if (['get', 'post', 'put', 'patch', 'delete'].includes(method.toLowerCase())) {
            console.log(`loadSwagger: parsing ${method.toUpperCase()} ${path}`, {
              hasRequestBody: !!details.requestBody,
              hasResponses: !!details.responses,
              requestBody: details.requestBody,
            })
            pathMethods.push({
              method: method.toLowerCase(), // Store as lowercase to match Swagger spec
              summary: details.summary,
              operationId: details.operationId,
              requestBody: details.requestBody, // Keep original requestBody structure
              responses: details.responses,
            })
          }
        })
        if (pathMethods.length > 0) {
          parsedPaths.push({ path, methods: pathMethods })
        }
      })
      console.log('loadSwagger: parsed paths', parsedPaths)

      setPaths(parsedPaths)
    } catch (err: any) {
      setError(err.message || 'Swagger yüklenirken bir hata oluştu')
      console.error('Error loading Swagger:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load parameters from selected path
  useEffect(() => {
    if (!swaggerSpec || !selectedPath) {
      console.log('useEffect: missing swaggerSpec or selectedPath', { swaggerSpec: !!swaggerSpec, selectedPath })
      return
    }

    console.log('useEffect: parsing selectedPath', selectedPath)
    const [path, method] = selectedPath.split('|')
    console.log('useEffect: parsed path and method', { path, method, originalSelectedPath: selectedPath })
    
    // Get methodData directly from swaggerSpec, not from parsedPaths
    const pathData = swaggerSpec.paths[path]
    if (!pathData) {
      console.warn('useEffect: pathData not found for path', path, 'available paths:', Object.keys(swaggerSpec.paths))
      return
    }
    console.log('useEffect: pathData found', {
      path,
      pathDataKeys: Object.keys(pathData),
      pathData: JSON.stringify(pathData, null, 2),
    })

    // Try both lowercase and original method name
    const methodLower = method.toLowerCase()
    console.log('useEffect: looking for method', methodLower, 'in pathData', Object.keys(pathData))
    
    // Check all possible method names
    const possibleMethods = [methodLower, method.toUpperCase(), method]
    let methodData = null
    let foundMethod = null
    
    for (const methodName of possibleMethods) {
      if (pathData[methodName]) {
        methodData = pathData[methodName]
        foundMethod = methodName
        console.log(`useEffect: found methodData with method name: ${methodName}`)
        break
      }
    }
    
    if (!methodData) {
      console.warn('useEffect: methodData not found for any method variant', {
        tried: possibleMethods,
        available: Object.keys(pathData),
      })
      return
    }
    
    console.log('useEffect: methodData found (from swaggerSpec)', {
      foundMethod,
      hasRequestBody: !!methodData.requestBody,
      requestBody: methodData.requestBody,
      hasResponses: !!methodData.responses,
      methodDataKeys: Object.keys(methodData),
      fullMethodData: JSON.stringify(methodData, null, 2),
    })

    // Parse Body parameters and Form-Data parameters
    let bodySchema: any = null
    let formDataSchema: any = null
    
    // OpenAPI 3.0: Check requestBody
    if (methodData.requestBody) {
      console.log('requestBody:', JSON.stringify(methodData.requestBody, null, 2))
      
      // Check for form-data content types first (these should be separate from body)
      const formDataContentTypes = ['multipart/form-data', 'application/x-www-form-urlencoded']
      for (const contentType of formDataContentTypes) {
        if (methodData.requestBody.content?.[contentType]?.schema) {
          formDataSchema = methodData.requestBody.content[contentType].schema
          console.log('Found form-data schema in', contentType, JSON.stringify(formDataSchema, null, 2))
          break
        }
      }
      
      // Try different content types for body (excluding form-data types)
      const bodyContentTypes = [
        'application/json',
        'application/xml',
        'text/plain',
        '*/*', // Some specs use wildcard
      ]
      
      for (const contentType of bodyContentTypes) {
        if (methodData.requestBody.content?.[contentType]?.schema) {
          bodySchema = methodData.requestBody.content[contentType].schema
          console.log('Found body schema in', contentType, JSON.stringify(bodySchema, null, 2))
          break
        }
      }
      
      // If no content type found, try to get first available (but skip form-data types)
      if (!bodySchema && !formDataSchema && methodData.requestBody.content) {
        const contentKeys = Object.keys(methodData.requestBody.content)
        console.log('Available content types:', contentKeys)
        if (contentKeys.length > 0) {
          for (const contentType of contentKeys) {
            // Skip form-data types if we haven't found them yet
            if (formDataContentTypes.includes(contentType) && !formDataSchema) {
              if (methodData.requestBody.content[contentType]?.schema) {
                formDataSchema = methodData.requestBody.content[contentType].schema
                console.log('Using form-data content type:', contentType, JSON.stringify(formDataSchema, null, 2))
                break
              }
            } else if (!formDataContentTypes.includes(contentType) && !bodySchema) {
              console.log(`Checking content type: ${contentType}`, methodData.requestBody.content[contentType])
              if (methodData.requestBody.content[contentType]?.schema) {
                bodySchema = methodData.requestBody.content[contentType].schema
                console.log('Using content type:', contentType, JSON.stringify(bodySchema, null, 2))
                break
              }
            }
          }
        }
      }
      
      // Some Swagger specs have schema directly in requestBody
      if (!bodySchema && !formDataSchema && methodData.requestBody.schema) {
        bodySchema = methodData.requestBody.schema
        console.log('Found schema directly in requestBody:', JSON.stringify(bodySchema, null, 2))
      }
      
      // Check if requestBody has any other structure
      if (!bodySchema && !formDataSchema) {
        console.warn('WARNING: Could not find body or form-data schema. requestBody structure:', Object.keys(methodData.requestBody))
        console.warn('Full requestBody:', JSON.stringify(methodData.requestBody, null, 2))
      }
    }
    
    // Swagger 2.0: Check parameters for body parameter and formData parameters
    if (methodData.parameters) {
      console.log('Checking parameters for Swagger 2.0', methodData.parameters)
      
      // Check for formData parameters (Swagger 2.0)
      const formDataParams = methodData.parameters.filter((p: any) => p.in === 'formData')
      if (formDataParams.length > 0) {
        console.log('Found formData parameters in Swagger 2.0 format:', formDataParams)
        // Convert formData parameters to a schema-like structure
        const formDataProperties: any = {}
        formDataParams.forEach((param: any) => {
          formDataProperties[param.name] = param.schema || {
            type: param.type || 'string',
            format: param.format,
            description: param.description,
          }
        })
        formDataSchema = {
          type: 'object',
          properties: formDataProperties,
        }
        console.log('Form-data schema from Swagger 2.0:', JSON.stringify(formDataSchema, null, 2))
      }
      
      // Check for body parameter (Swagger 2.0)
      if (!bodySchema) {
        const bodyParam = methodData.parameters.find((p: any) => p.in === 'body')
        if (bodyParam) {
          console.log('Found body parameter in Swagger 2.0 format:', bodyParam)
          bodySchema = bodyParam.schema
          console.log('Body schema from Swagger 2.0:', JSON.stringify(bodySchema, null, 2))
        }
      }
    }
    
    if (!bodySchema) {
      console.log('No requestBody or body parameter found in methodData')
    }

    console.log('Final bodySchema:', JSON.stringify(bodySchema, null, 2))
    
    if (bodySchema) {
      const resolved = resolveSchema(bodySchema, swaggerSpec)
      console.log('Resolved body schema:', JSON.stringify(resolved, null, 2))
      if (!resolved) {
        console.warn('WARNING: Resolved body schema is null!')
        setBodyTree([])
      } else {
        const tree = schemaToTree(resolved, '', 'root', swaggerSpec)
        console.log('Generated body tree:', tree, 'length:', tree.length)
        if (tree.length === 0) {
          console.warn('WARNING: Body tree is empty! Resolved schema:', JSON.stringify(resolved, null, 2))
          // Try to create a root node if schema has properties but tree is empty
          if (resolved.properties) {
            console.log('Attempting to create root node from properties')
            const rootNode: JsonNode = {
              id: 'root',
              key: 'root',
              value: resolved,
              type: 'object',
              path: '',
              children: schemaToTree(resolved, '', 'root', swaggerSpec),
            }
            setBodyTree([rootNode])
          }
        } else {
          setBodyTree(tree)
        }
      }
    } else {
      console.log('No body schema found')
      setBodyTree([])
    }

    // Parse Form-Data parameters
    console.log('Final formDataSchema:', JSON.stringify(formDataSchema, null, 2))
    
    if (formDataSchema) {
      const resolved = resolveSchema(formDataSchema, swaggerSpec)
      console.log('Resolved form-data schema:', JSON.stringify(resolved, null, 2))
      if (!resolved) {
        console.warn('WARNING: Resolved form-data schema is null!')
        setFormDataParams([])
      } else {
        // Convert schema to tree and then to flat parameter list
        const tree = schemaToTree(resolved, '', 'root', swaggerSpec)
        console.log('Generated form-data tree:', tree, 'length:', tree.length)
        
        // Flatten the tree to get all form-data parameters
        const flattenTree = (nodes: JsonNode[]): JsonNode[] => {
          const result: JsonNode[] = []
          nodes.forEach((node) => {
            // If node has children, it's a parent - we still include it but also its children
            if (node.children && node.children.length > 0) {
              result.push(node)
              result.push(...flattenTree(node.children))
            } else {
              result.push(node)
            }
          })
          return result
        }
        
        const flatParams = flattenTree(tree)
        // Filter out root node if it exists
        const formDataParamsList = flatParams.filter((node) => node.id !== 'root' && node.key !== 'root')
        console.log('Form-data parameters:', formDataParamsList)
        setFormDataParams(formDataParamsList)
      }
    } else {
      console.log('No form-data schema found')
      setFormDataParams([])
    }

    // Parse Output (Response) schema
    let outputSchema: any = null
    
    if (methodData.responses) {
      console.log('responses:', methodData.responses)
      
      // Priority order: 200, 201, 202, default, then any other success code
      const successCodes = ['200', '201', '202', '204', 'default']
      const allResponseCodes = Object.keys(methodData.responses)
      
      // Try success codes first
      for (const code of successCodes) {
        if (methodData.responses[code]) {
          const response: any = methodData.responses[code]
          console.log(`Checking response ${code}:`, response)
          
          // Check content types
          if (response.content) {
            const contentTypes = ['application/json', 'application/xml', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']
            
            for (const contentType of contentTypes) {
              if (response.content[contentType]?.schema) {
                outputSchema = response.content[contentType].schema
                console.log(`Found output schema in ${code}/${contentType}:`, outputSchema)
                break
              }
            }
            
            // If no standard content type found, try first available
            if (!outputSchema) {
              const firstContentType = Object.keys(response.content)[0]
              if (firstContentType && response.content[firstContentType]?.schema) {
                outputSchema = response.content[firstContentType].schema
                console.log(`Using first content type from ${code}:`, firstContentType, outputSchema)
              }
            }
          }
          
          // Some specs have schema directly in response
          if (!outputSchema && response.schema) {
            outputSchema = response.schema
            console.log(`Found schema directly in response ${code}:`, outputSchema)
          }
          
          if (outputSchema) break
        }
      }
      
      // If still no schema, try any other response code
      if (!outputSchema) {
        for (const code of allResponseCodes) {
          if (!successCodes.includes(code) && methodData.responses[code]) {
            const response: any = methodData.responses[code]
            if (response.content) {
              const firstContentType = Object.keys(response.content)[0]
              if (firstContentType && response.content[firstContentType]?.schema) {
                outputSchema = response.content[firstContentType].schema
                console.log(`Using schema from response ${code}:`, outputSchema)
                break
              }
            }
            if (response.schema) {
              outputSchema = response.schema
              console.log(`Found schema directly in response ${code}:`, outputSchema)
              break
            }
          }
        }
      }
    }

    console.log('Final outputSchema:', JSON.stringify(outputSchema, null, 2))
    
    if (outputSchema) {
      const resolved = resolveSchema(outputSchema, swaggerSpec)
      console.log('Resolved output schema:', JSON.stringify(resolved, null, 2))
      if (!resolved) {
        console.warn('WARNING: Resolved output schema is null!')
        setOutputTree([])
      } else {
        const tree = schemaToTree(resolved, '', 'root', swaggerSpec)
        console.log('Generated output tree:', tree, 'length:', tree.length)
        if (tree.length === 0) {
          console.warn('WARNING: Output tree is empty! Resolved schema:', JSON.stringify(resolved, null, 2))
          // Try to create a root node if schema has properties but tree is empty
          if (resolved.properties) {
            console.log('Attempting to create root node from properties')
            const rootNode: JsonNode = {
              id: 'root',
              key: 'root',
              value: resolved,
              type: 'object',
              path: '',
              children: schemaToTree(resolved, '', 'root', swaggerSpec),
            }
            setOutputTree([rootNode])
          }
        } else {
          setOutputTree(tree)
        }
      }
    } else {
      console.log('No output schema found')
      setOutputTree([])
    }

    // Parse Path and Query parameters
    const pathParamsList: JsonNode[] = []
    const queryParamsList: JsonNode[] = []

    // Get parameters from method
    const methodParams = methodData.parameters || []
    
    // Get parameters from path level (shared parameters)
    const pathParams = pathData.parameters || []

    // Combine and process all parameters
    const allParams = [...pathParams, ...methodParams]

    allParams.forEach((param: any) => {
      const paramNode: JsonNode = {
        id: `param-${param.name}`,
        key: param.name,
        value: param.schema || { type: param.type || 'string' },
        type: param.schema?.type || param.type || 'string',
        path: param.name,
      }

      if (param.in === 'path') {
        pathParamsList.push(paramNode)
      } else if (param.in === 'query') {
        queryParamsList.push(paramNode)
      }
    })

    setPathParams(pathParamsList)
    setQueryParams(queryParamsList)
  }, [swaggerSpec, selectedPath])

  // Helper function to convert JsonNode to ClientField with tree structure
  const convertNodeToClientField = useCallback((node: JsonNode, baseId: string = '', category?: 'body' | 'path' | 'query' | 'form-data' | 'output'): ClientField => {
    const fieldId = baseId || `field-${Date.now()}-${Math.random()}-${node.id}`
    
    // Determine category from node.id if not provided
    let fieldCategory = category
    if (!fieldCategory) {
      if (node.id.startsWith('param-')) {
        // Check if it's path or query by checking the original params
        const isPath = pathParams.some(p => p.id === node.id)
        const isQuery = queryParams.some(p => p.id === node.id)
        if (isPath) fieldCategory = 'path'
        else if (isQuery) fieldCategory = 'query'
        else fieldCategory = 'body'
      } else {
        fieldCategory = 'body'
      }
    }
    
    const clientField: ClientField = {
      id: fieldId,
      name: node.key,
      type: node.type,
      sourcePath: node.path,
      sourceKey: node.key,
      sourceCategory: fieldCategory,
    }
    
    // Recursively convert children
    if (node.children && node.children.length > 0) {
      clientField.children = node.children.map((child, index) => 
        convertNodeToClientField(child, `${fieldId}-${index}`, fieldCategory)
      )
    }
    
    return clientField
  }, [pathParams, queryParams, formDataParams])

  // Automatically add backend models to client models when they are parsed
  useEffect(() => {
    if (!selectedPath) return

    const newInputFields: ClientField[] = []
    const newOutputFields: ClientField[] = []

    // Add body tree to input client fields
    bodyTree.forEach((node) => {
      const field = convertNodeToClientField(node, '', 'body')
      newInputFields.push(field)
    })

    // Add path params to input client fields
    pathParams.forEach((param) => {
      const field = convertNodeToClientField(param, '', 'path')
      newInputFields.push(field)
    })

    // Add query params to input client fields
    queryParams.forEach((param) => {
      const field = convertNodeToClientField(param, '', 'query')
      newInputFields.push(field)
    })

    // Add form-data params to input client fields
    formDataParams.forEach((param) => {
      const field = convertNodeToClientField(param, '', 'form-data')
      newInputFields.push(field)
    })

    // Add output tree to output client fields
    outputTree.forEach((node) => {
      const field = convertNodeToClientField(node, '', 'output')
      newOutputFields.push(field)
    })

    // Set client fields (replace existing ones for the selected method)
    if (newInputFields.length > 0 || newOutputFields.length > 0) {
      if (newInputFields.length > 0) {
        setInputClientFields(newInputFields)
      }
      if (newOutputFields.length > 0) {
        setOutputClientFields(newOutputFields)
      }
    }
  }, [selectedPath, bodyTree, pathParams, queryParams, formDataParams, outputTree, convertNodeToClientField])

  // Automatically sync client model tab when backend view tab changes
  useEffect(() => {
    setEditingFieldType(backendViewTab)
  }, [backendViewTab])

  const handleToggleExpand = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes)
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId)
    } else {
      newExpanded.add(nodeId)
    }
    setExpandedNodes(newExpanded)
  }

  const handleDragStart = (node: JsonNode, type: 'input' | 'output') => {
    setDraggedNode(node)
    setDraggedNodeType(type)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  // Helper function to check if a field path exists in tree (recursive)
const fieldPathExists = (fields: ClientField[], path: string): boolean => {
    for (const field of fields) {
      if (field.sourcePath === path) return true
      if (field.children && fieldPathExists(field.children, path)) return true
    }
    return false
  }

  const handleDrop = (e: React.DragEvent, targetType: 'input' | 'output', targetCategory?: 'body' | 'path' | 'query' | 'form-data' | 'output') => {
    e.preventDefault()
    
    // Handle ClientField drag (moving between categories)
    if (draggedClientField) {
      if (targetType === 'input' && targetCategory) {
        // Remove from old location
        const removeFieldFromTree = (fields: ClientField[], fieldId: string): ClientField[] => {
          return fields
            .filter((f) => f.id !== fieldId)
            .map((f) => {
              if (f.children) {
                return { ...f, children: removeFieldFromTree(f.children, fieldId) }
              }
              return f
            })
        }
        
        const updatedFields = removeFieldFromTree(inputClientFields, draggedClientField.id)
        
        // Update category and add to new location
        const updatedField = { ...draggedClientField, sourceCategory: targetCategory }
        
        setInputClientFields([...updatedFields, updatedField])
        setDraggedClientField(null)
      }
      return
    }
    
    // Handle JsonNode drag (from backend to client)
    if (!draggedNode || !draggedNodeType) return

    // Only allow dropping if source and target types match
    if (draggedNodeType !== targetType) return

    // Use provided category or determine from node.id
    let category: 'body' | 'path' | 'query' | 'form-data' | 'output' = targetCategory || 'body'
    if (!targetCategory) {
      if (draggedNode.id.startsWith('param-')) {
        const isPath = pathParams.some(p => p.id === draggedNode.id)
        const isQuery = queryParams.some(p => p.id === draggedNode.id)
        if (isPath) category = 'path'
        else if (isQuery) category = 'query'
      } else {
        // Check if it's from form-data
        const isFormData = formDataParams.some(p => p.id === draggedNode.id)
        if (isFormData) category = 'form-data'
        else if (targetType === 'output') category = 'output'
        else category = 'body'
      }
    }

    // Convert node to ClientField with tree structure
    const newField = convertNodeToClientField(draggedNode, '', category)
    
    // Check if any field already exists in the tree
  const targetFields = targetType === 'input' ? inputClientFields : outputClientFields
    
    // Check if the root field or any of its children already exist
    if (fieldPathExists(targetFields, newField.sourcePath)) {
      console.log('Field already exists:', newField.sourcePath)
      return
    }

    console.log('Adding field with tree structure:', newField)

    if (targetType === 'input') {
      setInputClientFields((prev) => [...prev, newField])
    } else {
      setOutputClientFields((prev) => [...prev, newField])
    }
    setDraggedNode(null)
    setDraggedNodeType(null)
  }

  const handleClientFieldDragStart = (field: ClientField) => {
    setDraggedClientField(field)
  }

  // Helper function to delete field from tree recursively
  const deleteFieldFromTree = (fields: ClientField[], fieldId: string): ClientField[] => {
    return fields
      .filter((f) => f.id !== fieldId)
      .map((f) => {
        if (f.children) {
          return { ...f, children: deleteFieldFromTree(f.children, fieldId) }
        }
        return f
      })
  }

  const handleDeleteClientField = (fieldId: string, type: 'input' | 'output') => {
    if (type === 'input') {
      setInputClientFields((prev) => deleteFieldFromTree(prev, fieldId))
    } else {
      setOutputClientFields((prev) => deleteFieldFromTree(prev, fieldId))
    }
  }

  const handleStartEditField = (field: ClientField, type: 'input' | 'output') => {
    setEditingFieldId(field.id)
    setEditingFieldName(field.name)
    setEditingFieldType(type)
  }

  // Helper function to update field in tree recursively
  const updateFieldInTree = (fields: ClientField[], fieldId: string, updates: Partial<ClientField>): ClientField[] => {
    return fields.map((f) => {
      if (f.id === fieldId) {
        return { ...f, ...updates }
      }
      if (f.children) {
        return { ...f, children: updateFieldInTree(f.children, fieldId, updates) }
      }
      return f
    })
  }

  const handleSaveEditField = () => {
    if (editingFieldId && editingFieldName.trim()) {
      const updates = { name: editingFieldName.trim() }
      if (editingFieldType === 'input') {
        setInputClientFields((prev) => updateFieldInTree(prev, editingFieldId, updates))
      } else {
        setOutputClientFields((prev) => updateFieldInTree(prev, editingFieldId, updates))
      }
      setEditingFieldId(null)
      setEditingFieldName('')
    }
  }

  const handleCancelEditField = () => {
    setEditingFieldId(null)
    setEditingFieldName('')
  }

  // Helper function to format tree structure as text
  const formatTreeAsText = (
    fields: ClientField[],
    depth: number = 0,
    includeMapping: boolean = true
  ): string => {
    let text = ''
    fields.forEach((field) => {
      const indent = '  '.repeat(depth)
      text += `${indent}- ${field.name} (${field.type})`
      if (includeMapping && field.sourcePath) {
        text += ` [Mapping: ${field.sourcePath}]`
      }
      text += '\n'
      
      if (field.children && field.children.length > 0) {
        text += formatTreeAsText(field.children, depth + 1, includeMapping)
      }
    })
    return text
  }

  // Helper function to format JsonNode tree as text
  const formatJsonNodeAsText = (
    nodes: JsonNode[],
    depth: number = 0
  ): string => {
    let text = ''
    nodes.forEach((node) => {
      const indent = '  '.repeat(depth)
      text += `${indent}- ${node.key} (${node.type})`
      if (node.path) {
        text += ` [Path: ${node.path}]`
      }
      text += '\n'
      
      if (node.children && node.children.length > 0) {
        text += formatJsonNodeAsText(node.children, depth + 1)
      }
    })
    return text
  }

  const generateFullPrompt = useCallback(() => {
    let prompt = '# MW (BFF) Katmanı - Tam Prompt\n\n'
    
    // Seçilen Metod Bilgisi
    if (selectedPath) {
      const [path, method] = selectedPath.split('|')
      const pathItem = paths.find((p) => p.path === path)
      const methodItem = pathItem?.methods.find((m) => m.method === method.toLowerCase())
      
      prompt += '## Seçilen API Metodu\n\n'
      prompt += `- **Metod**: ${method.toUpperCase()}\n`
      prompt += `- **Path**: ${path}\n`
      if (methodItem?.summary) {
        prompt += `- **Summary**: ${methodItem.summary}\n`
      }
      if (methodItem?.operationId) {
        prompt += `- **Operation ID**: ${methodItem.operationId}\n`
      }
      prompt += '\n'
    } else {
      prompt += '## Seçilen API Metodu\n\n'
      prompt += 'Henüz bir metod seçilmemiş.\n\n'
    }

    // Middleware Endpoint Bilgisi
    prompt += '## Middleware Endpoint\n\n'
    if (middlewareEndpoint.trim()) {
      prompt += `- **Metod**: ${middlewareMethod}\n`
      prompt += `- **Endpoint**: **${middlewareEndpoint.trim()}**\n\n`
    } else {
      prompt += 'Henüz middleware endpoint tanımlanmamış.\n\n'
    }

    // Backend Input Modelleri
    prompt += '## Backend Input Modelleri\n\n'
    
    if (bodyTree.length > 0) {
      prompt += '### Body Parameters\n\n'
      prompt += formatJsonNodeAsText(bodyTree)
      prompt += '\n'
    }
    
    if (pathParams.length > 0) {
      prompt += '### Path Parameters\n\n'
      pathParams.forEach((param) => {
        prompt += `- ${param.key} (${param.type}) [Path: ${param.path}]\n`
      })
      prompt += '\n'
    }
    
    if (queryParams.length > 0) {
      prompt += '### Query Parameters\n\n'
      queryParams.forEach((param) => {
        prompt += `- ${param.key} (${param.type}) [Path: ${param.path}]\n`
      })
      prompt += '\n'
    }
    
    if (formDataParams.length > 0) {
      prompt += '### Form-Data Parameters\n\n'
      prompt += formatJsonNodeAsText(formDataParams)
      prompt += '\n'
    }
    
    if (bodyTree.length === 0 && pathParams.length === 0 && queryParams.length === 0 && formDataParams.length === 0) {
      prompt += 'Henüz backend input parametreleri parse edilmemiş.\n\n'
    }

    // Backend Output Modelleri
    prompt += '## Backend Output Modelleri\n\n'
    
    if (outputTree.length > 0) {
      prompt += formatJsonNodeAsText(outputTree)
      prompt += '\n'
    } else {
      prompt += 'Henüz backend output parametreleri parse edilmemiş.\n\n'
    }

    // Client Input Modelleri
    prompt += '## Client Input Modelleri\n\n'
    
    if (inputClientFields.length > 0) {
      prompt += 'Aşağıdaki client input modelleri tanımlanmıştır:\n\n'
      prompt += formatTreeAsText(inputClientFields, 0, true)
      prompt += '\n'
    } else {
      prompt += 'Henüz client input modelleri tanımlanmamış.\n\n'
    }

    // Client Output Modelleri
    prompt += '## Client Output Modelleri\n\n'
    
    if (outputClientFields.length > 0) {
      prompt += 'Aşağıdaki client output modelleri tanımlanmıştır:\n\n'
      prompt += formatTreeAsText(outputClientFields, 0, true)
      prompt += '\n'
    } else {
      prompt += 'Henüz client output modelleri tanımlanmamış.\n\n'
    }

    // Mapping Bilgileri
    prompt += '## AutoMapper Mapping Bilgileri\n\n'
    prompt += 'Aşağıdaki mapping bilgileri client modellerindeki her field için belirtilmiştir:\n\n'
    
    const collectAllMappings = (fields: ClientField[]): string[] => {
      const mappings: string[] = []
      fields.forEach((field) => {
        if (field.sourcePath) {
          mappings.push(`- ${field.name} -> ${field.sourcePath}`)
        }
        if (field.children) {
          mappings.push(...collectAllMappings(field.children))
        }
      })
      return mappings
    }
    
    const inputMappings = collectAllMappings(inputClientFields)
    const outputMappings = collectAllMappings(outputClientFields)
    
    if (inputMappings.length > 0) {
      prompt += '### Input Mappings\n\n'
      inputMappings.forEach((mapping) => {
        prompt += mapping + '\n'
      })
      prompt += '\n'
    }
    
    if (outputMappings.length > 0) {
      prompt += '### Output Mappings\n\n'
      outputMappings.forEach((mapping) => {
        prompt += mapping + '\n'
      })
      prompt += '\n'
    }
    
    if (inputMappings.length === 0 && outputMappings.length === 0) {
      prompt += 'Henüz mapping bilgisi tanımlanmamış.\n\n'
    }

    // Analiz İsterleri
    prompt += '## Analiz İsterleri\n\n'
    if (analysisRequirements.trim()) {
      prompt += analysisRequirements.trim()
      prompt += '\n\n'
    } else {
      prompt += 'Henüz analiz dökümanı girilmemiş.\n\n'
    }

    // Sonuç
    prompt += '---\n\n'
    prompt += 'Yukarıdaki backend ve client modellerine göre MW (BFF) katmanını oluştur. '
    prompt += 'Backend servislerinden gelen verileri client modellerine map etmek için AutoMapper kullan. '
    prompt += 'Her client field\'ın mapping bilgisi yukarıda belirtilmiştir. '
    prompt += 'Tüm gereksinimleri dikkate alarak, modern ve ölçeklenebilir bir BFF mimarisi tasarla. '
    prompt += 'Proje yapısını, API endpoint\'lerini, modelleri, mapping konfigürasyonlarını, servisleri ve tüm gerekli bileşenleri oluştur.'

    setFullPrompt(prompt)
    setFullPromptDialogOpen(true)
  }, [selectedPath, paths, bodyTree, pathParams, queryParams, formDataParams, outputTree, inputClientFields, outputClientFields, middlewareEndpoint, middlewareMethod, analysisRequirements])

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
    a.download = 'mw_full_prompt.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Render client fields as tree structure
  const renderClientFieldTree = (
    fields: ClientField[],
    depth: number = 0,
    type: 'input' | 'output',
    isChild: boolean = false
  ) => {
    return fields.map((field) => {
      const hasChildren = field.children && field.children.length > 0
      const isExpanded = expandedNodes.has(field.id)
      const categoryColor = field.sourceCategory === 'body' ? '#667eea' : 
                           field.sourceCategory === 'path' ? '#f59e0b' :
                           field.sourceCategory === 'query' ? '#10b981' :
                           field.sourceCategory === 'form-data' ? '#8b5cf6' : '#00A859'

      return (
        <Box key={field.id} sx={{ ml: depth * 1.5, mb: 0.5 }}>
          <Box
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move'
              handleClientFieldDragStart(field)
            }}
            sx={{
              px: 1.5,
              py: 1,
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: alpha(categoryColor, 0.2),
              borderLeft: `3px solid ${categoryColor}`,
              backgroundColor: '#ffffff',
              transition: 'all 0.2s ease',
              cursor: 'grab',
              '&:hover': {
                borderColor: categoryColor,
                backgroundColor: alpha(categoryColor, 0.03),
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.08)',
                transform: 'translateY(-1px)',
                '& .field-actions': {
                  opacity: 1,
                },
              },
              '&:active': {
                cursor: 'grabbing',
                transform: 'translateY(0)',
              },
            }}
          >
            {editingFieldId === field.id && editingFieldType === type ? (
              <Stack direction="row" spacing={1} alignItems="center">
                <TextField
                  value={editingFieldName}
                  onChange={(e) => setEditingFieldName(e.target.value)}
                  size="small"
                  variant="outlined"
                  sx={{ 
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: '#ffffff',
                      borderRadius: '6px',
                      height: 32,
                      '& fieldset': {
                        borderColor: alpha('#000', 0.12),
                        borderWidth: '1px',
                      },
                      '&:hover fieldset': {
                        borderColor: alpha('#000', 0.25),
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: alpha('#000', 0.4),
                        borderWidth: '1px',
                      },
                    },
                    '& .MuiInputBase-input': {
                      padding: '6px 12px',
                      fontSize: '0.875rem',
                    },
                  }}
                  autoFocus
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleSaveEditField()
                    } else if (e.key === 'Escape') {
                      handleCancelEditField()
                    }
                  }}
                />
                <Button
                  size="small"
                  variant="contained"
                  onClick={handleSaveEditField}
                  disabled={!editingFieldName.trim()}
                  sx={{ 
                    minWidth: 60, 
                    height: 32,
                    backgroundColor: alpha('#000', 0.85),
                    borderRadius: '6px',
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    boxShadow: 'none',
                    '&:hover': {
                      backgroundColor: alpha('#000', 0.95),
                      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.12)',
                    },
                    '&:disabled': {
                      backgroundColor: alpha('#000', 0.25),
                      color: alpha('#000', 0.5),
                    },
                  }}
                >
                  Kaydet
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  onClick={handleCancelEditField}
                  sx={{ 
                    minWidth: 60, 
                    height: 32,
                    borderRadius: '6px',
                    textTransform: 'none',
                    fontSize: '0.75rem',
                    borderColor: alpha('#000', 0.2),
                    color: alpha('#000', 0.7),
                    '&:hover': {
                      borderColor: alpha('#000', 0.3),
                      backgroundColor: alpha('#000', 0.04),
                    },
                  }}
                >
                  İptal
                </Button>
              </Stack>
            ) : (
              <Stack spacing={0.5}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <DragIndicator sx={{ fontSize: 16, color: categoryColor }} />
                  {hasChildren && (
                    <IconButton
                      size="small"
                      onClick={() => handleToggleExpand(field.id)}
                      sx={{ p: 0, minWidth: 20, width: 20, height: 20 }}
                    >
                      <Typography variant="caption" sx={{ fontSize: 10 }}>
                        {isExpanded ? '▼' : '▶'}
                      </Typography>
                    </IconButton>
                  )}
                  {!hasChildren && <Box sx={{ width: 20 }} />}
                  <Typography 
                    variant="body2" 
                    sx={{ 
                      flex: 1, 
                      fontWeight: 500,
                      fontSize: '0.875rem',
                    }}
                  >
                    {field.name}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: 'text.secondary',
                      fontSize: '0.75rem',
                      px: 0.75,
                      py: 0.25,
                      bgcolor: alpha('#000', 0.05),
                      borderRadius: 0.5,
                    }}
                  >
                    {field.type}
                  </Typography>
                  <Typography 
                    variant="caption" 
                    sx={{ 
                      color: 'text.secondary',
                      fontSize: '0.7rem',
                      px: 0.5,
                    }}
                  >
                    {field.sourceKey}
                  </Typography>
                  {isChild && field.sourcePath && (
                    <Typography 
                      variant="caption" 
                      sx={{ 
                        color: 'text.secondary',
                        fontSize: '0.65rem',
                        fontStyle: 'italic',
                        px: 0.5,
                      }}
                    >
                      ↳ {field.sourcePath}
                    </Typography>
                  )}
                  <Box 
                    className="field-actions"
                    sx={{ 
                      display: 'flex',
                      gap: 0.5,
                      opacity: 0,
                      transition: 'opacity 0.2s',
                    }}
                  >
                    <IconButton
                      size="small"
                      onClick={() => handleStartEditField(field, type)}
                      sx={{ p: 0.5, width: 24, height: 24 }}
                    >
                      <Edit fontSize="small" sx={{ fontSize: 14 }} />
                    </IconButton>
                    <IconButton
                      size="small"
                      onClick={() => handleDeleteClientField(field.id, type)}
                      color="error"
                      sx={{ p: 0.5, width: 24, height: 24 }}
                    >
                      <Delete fontSize="small" sx={{ fontSize: 14 }} />
                    </IconButton>
                  </Box>
                </Stack>
              </Stack>
              )}
          </Box>
          {hasChildren && isExpanded && field.children && (
            <Box>
              {renderClientFieldTree(field.children, depth + 1, type, true)}
            </Box>
          )}
        </Box>
      )
    })
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
          <Tab label="Backend Integration" />
          <Tab label="Analiz İsterleri" />
        </Tabs>

        {/* Backend Integration Tab */}
        <Box sx={{ flex: 1, display: mainTab === 0 ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            borderBottom: '1px solid',
            borderColor: alpha('#000', 0.08),
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <Stack direction="row" spacing={2} alignItems="center" sx={{ flex: 1 }}>
            <TextField
              label="Swagger URL"
              value={swaggerUrl}
              onChange={(e) => setSwaggerUrl(e.target.value)}
              placeholder="https://api.example.com/swagger.json"
              size="small"
              variant="outlined"
              sx={{ 
                flex: 1, 
                maxWidth: 600,
                '& .MuiOutlinedInput-root': {
                  backgroundColor: '#ffffff',
                  borderRadius: '8px',
                  '& fieldset': {
                    borderColor: alpha('#000', 0.12),
                    borderWidth: '1px',
                  },
                  '&:hover fieldset': {
                    borderColor: alpha('#000', 0.25),
                  },
                  '&.Mui-focused fieldset': {
                    borderColor: alpha('#000', 0.4),
                    borderWidth: '1px',
                  },
                },
                '& .MuiInputLabel-root': {
                  color: alpha('#000', 0.6),
                  '&.Mui-focused': {
                    color: alpha('#000', 0.8),
                  },
                },
              }}
            />
            {paths.length > 0 && (
              <FormControl size="small" sx={{ minWidth: 300 }}>
                <InputLabel sx={{ 
                  color: alpha('#000', 0.6),
                  '&.Mui-focused': { 
                    color: alpha('#000', 0.8),
                  },
                }}>Metod Seç</InputLabel>
                <Select
                  value={selectedPath}
                  onChange={(e) => setSelectedPath(e.target.value)}
                  label="Metod Seç"
                  variant="outlined"
                  sx={{
                    backgroundColor: '#ffffff',
                    borderRadius: '8px',
                    '& .MuiOutlinedInput-notchedOutline': {
                      borderColor: alpha('#000', 0.12),
                      borderWidth: '1px',
                    },
                    '&:hover .MuiOutlinedInput-notchedOutline': {
                      borderColor: alpha('#000', 0.25),
                    },
                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                      borderColor: alpha('#000', 0.4),
                      borderWidth: '1px',
                    },
                    '& .MuiSelect-icon': {
                      color: alpha('#000', 0.5),
                    },
                  }}
                  MenuProps={{
                    PaperProps: {
                      sx: {
                        borderRadius: '8px',
                        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                        mt: 0.5,
                        border: '1px solid',
                        borderColor: alpha('#000', 0.08),
                        '& .MuiMenuItem-root': {
                          borderRadius: '4px',
                          mx: 0.5,
                          my: 0.25,
                          fontSize: '0.875rem',
                          '&:hover': {
                            backgroundColor: alpha('#000', 0.05),
                          },
                          '&.Mui-selected': {
                            backgroundColor: alpha('#000', 0.08),
                            '&:hover': {
                              backgroundColor: alpha('#000', 0.12),
                            },
                          },
                        },
                      },
                    },
                  }}
                >
                  {paths.map((pathItem) =>
                    pathItem.methods.map((method) => (
                      <MenuItem
                        key={`${pathItem.path}|${method.method}`}
                        value={`${pathItem.path}|${method.method}`}
                      >
                        {method.method.toUpperCase()} {pathItem.path} - {method.summary || method.operationId}
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            )}
            <Button
              variant="contained"
              startIcon={<Refresh />}
              onClick={loadSwagger}
              disabled={loading || !swaggerUrl.trim()}
              sx={{
                backgroundColor: alpha('#000', 0.85),
                borderRadius: '6px',
                textTransform: 'none',
                fontWeight: 500,
                px: 2.5,
                py: 0.75,
                fontSize: '0.875rem',
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: alpha('#000', 0.95),
                  boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                },
                '&:disabled': {
                  backgroundColor: alpha('#000', 0.25),
                  color: alpha('#000', 0.5),
                },
              }}
            >
              {loading ? <CircularProgress size={18} color="inherit" /> : 'Yükle'}
            </Button>
            <Button
              variant="outlined"
              startIcon={<Clear />}
              onClick={handleClearAll}
            sx={{
                color: alpha('#000', 0.7),
                borderColor: alpha('#000', 0.2),
                borderRadius: '6px',
                textTransform: 'none',
                fontWeight: 500,
                px: 2,
                py: 0.75,
                fontSize: '0.875rem',
              '&:hover': {
                  borderColor: alpha('#000', 0.3),
                  backgroundColor: alpha('#000', 0.04),
              },
            }}
          >
              Temizle
          </Button>
          </Stack>
        </Box>
        {error && (
          <Box sx={{ px: 2, pt: 1 }}>
            <Alert severity="error">
              {error}
            </Alert>
          </Box>
        )}

        {/* Middleware Endpoint and Method Type */}
        {selectedPath && (
          <Box
            sx={{
              p: 2,
              borderBottom: '1px solid',
              borderColor: alpha('#000', 0.08),
            }}
          >
            <Stack direction="row" spacing={2} sx={{ width: '100%', alignItems: 'flex-start' }}>
                <FormControl size="small" sx={{ minWidth: 200 }}>
                  <InputLabel sx={{ 
                    color: alpha('#000', 0.6),
                    '&.Mui-focused': { 
                      color: alpha('#000', 0.8),
                    },
                  }}>Middleware Metod Tipi</InputLabel>
              <Select
                    value={middlewareMethod}
                    onChange={(e) => setMiddlewareMethod(e.target.value)}
                    label="Middleware Metod Tipi"
                    variant="outlined"
                    sx={{
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      '& .MuiOutlinedInput-notchedOutline': {
                        borderColor: alpha('#000', 0.12),
                        borderWidth: '1px',
                      },
                      '&:hover .MuiOutlinedInput-notchedOutline': {
                        borderColor: alpha('#000', 0.25),
                      },
                      '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                        borderColor: alpha('#000', 0.4),
                        borderWidth: '1px',
                      },
                      '& .MuiSelect-icon': {
                        color: alpha('#000', 0.5),
                      },
                    }}
                    MenuProps={{
                      PaperProps: {
                        sx: {
                          borderRadius: '8px',
                          boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
                          mt: 0.5,
                          border: '1px solid',
                          borderColor: alpha('#000', 0.08),
                          '& .MuiMenuItem-root': {
                            borderRadius: '4px',
                            mx: 0.5,
                            my: 0.25,
                            fontSize: '0.875rem',
                            '&:hover': {
                              backgroundColor: alpha('#000', 0.05),
                            },
                            '&.Mui-selected': {
                              backgroundColor: alpha('#000', 0.08),
                              '&:hover': {
                                backgroundColor: alpha('#000', 0.12),
                              },
                            },
                          },
                        },
                      },
                    }}
                  >
                    <MenuItem value="GET">GET</MenuItem>
                    <MenuItem value="POST">POST</MenuItem>
              </Select>
            </FormControl>
                <TextField
                  label="Middleware Endpoint"
                  value={middlewareEndpoint}
                  onChange={(e) => setMiddlewareEndpoint(e.target.value)}
                  placeholder="/api/v1/example"
                  size="small"
                  variant="outlined"
                  helperText="Middleware katmanında dışarıya açılacak endpoint bilgisini girin"
                  sx={{ 
                    flex: 1,
                    '& .MuiOutlinedInput-root': {
                      backgroundColor: '#ffffff',
                      borderRadius: '8px',
                      '& fieldset': {
                        borderColor: alpha('#000', 0.12),
                        borderWidth: '1px',
                      },
                      '&:hover fieldset': {
                        borderColor: alpha('#000', 0.25),
                      },
                      '&.Mui-focused fieldset': {
                        borderColor: alpha('#000', 0.4),
                        borderWidth: '1px',
                      },
                    },
                    '& .MuiInputLabel-root': {
                      color: alpha('#000', 0.6),
                      '&.Mui-focused': {
                        color: alpha('#000', 0.8),
                      },
                    },
                    '& .MuiFormHelperText-root': {
                      color: alpha('#000', 0.5),
                      fontSize: '0.75rem',
                      mt: 0.5,
                    },
                  }}
                />
            </Stack>
          </Box>
        )}

        {/* Main Content */}
        <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left Side - JSON Tree */}
          <Box
            sx={{
              width: '50%',
              borderRight: 1,
              borderColor: 'divider',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                p: 1.5,
                borderBottom: '1px solid',
                borderColor: alpha('#000', 0.08),
              }}
            >
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600, fontSize: '0.875rem', color: alpha('#000', 0.7) }}>
                <Storage sx={{ color: '#1da1f2', fontSize: 18 }} />
                Backend JSON Ağacı
              </Typography>
            </Box>
            <Tabs
              value={backendViewTab}
              onChange={(_, newValue) => setBackendViewTab(newValue)}
              sx={{
                borderBottom: '1px solid',
                borderColor: alpha('#000', 0.08),
                px: 1.5,
                pt: 0.5,
                minHeight: 36,
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  minHeight: 36,
                  px: 1.5,
                  py: 0.75,
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: '#1da1f2',
                  height: 2,
                },
              }}
            >
              <Tab label="Input Parameters" value="input" />
              <Tab label="Output Parameters" value="output" />
            </Tabs>
            <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>
              {/* Input Parameters Tab */}
              <Box sx={{ display: backendViewTab === 'input' ? 'block' : 'none' }}>
                {/* Body Parameters */}
                {bodyTree.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#667eea', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Body Parameters
                    </Typography>
                    <Box sx={{ p: 1.5 }}>
                      {renderJsonTree(bodyTree, 0, handleDragStart, expandedNodes, handleToggleExpand, 'input')}
                    </Box>
                  </Box>
                )}

                {/* Path Parameters */}
                {pathParams.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Path Parameters
                    </Typography>
                    <Box sx={{ p: 1.5 }}>
                      {pathParams.map((param) => (
                        <Box
                          key={param.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            handleDragStart(param, 'input')
                          }}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            py: 0.75,
                            px: 1.5,
                            borderRadius: 1.5,
                            border: '1px solid',
                            borderColor: alpha('#f59e0b', 0.3),
                            mb: 0.5,
                            cursor: 'grab',
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              borderColor: '#f59e0b',
                              backgroundColor: alpha('#f59e0b', 0.05),
                              transform: 'translateY(-1px)',
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                            },
                            '&:active': {
                              cursor: 'grabbing',
                              transform: 'translateY(0)',
                            },
                          }}
                        >
                          <DragIndicator sx={{ fontSize: 16, color: '#f59e0b' }} />
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {param.key}
                          </Typography>
                          <Chip label={param.type} size="small" />
                          <Chip label="required" size="small" color="error" />
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Query Parameters */}
                {queryParams.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Query Parameters
                    </Typography>
                    <Box sx={{ p: 1.5 }}>
                      {queryParams.map((param) => (
                        <Box
                          key={param.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.effectAllowed = 'move'
                            handleDragStart(param, 'input')
                          }}
                          sx={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                            py: 0.75,
                            px: 1.5,
                            borderRadius: 1.5,
                            border: '1px solid',
                            borderColor: alpha('#10b981', 0.3),
                            mb: 0.5,
                            cursor: 'grab',
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              borderColor: '#10b981',
                              backgroundColor: alpha('#10b981', 0.05),
                              transform: 'translateY(-1px)',
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                            },
                            '&:active': {
                              cursor: 'grabbing',
                              transform: 'translateY(0)',
                            },
                          }}
                        >
                          <DragIndicator sx={{ fontSize: 16, color: '#10b981' }} />
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {param.key}
                          </Typography>
                          <Chip label={param.type} size="small" />
                          {param.value?.required && (
                            <Chip label="required" size="small" color="error" />
                          )}
                        </Box>
                      ))}
                    </Box>
                  </Box>
                )}

                {/* Form-Data Parameters */}
                {formDataParams.length > 0 && (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Form-Data Parameters
                    </Typography>
                    <Box sx={{ p: 1.5 }}>
                      {renderJsonTree(formDataParams, 0, handleDragStart, expandedNodes, handleToggleExpand, 'input')}
                    </Box>
                  </Box>
                )}

                {bodyTree.length === 0 && pathParams.length === 0 && queryParams.length === 0 && formDataParams.length === 0 && (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    Input parametreleri bulunamadı
                  </Typography>
                )}
              </Box>

              {/* Output Parameters Tab */}
              <Box sx={{ display: backendViewTab === 'output' ? 'block' : 'none' }}>
                {outputTree.length > 0 ? (
                  <Box sx={{ p: 1.5 }}>
                    {renderJsonTree(outputTree, 0, handleDragStart, expandedNodes, handleToggleExpand, 'output')}
                  </Box>
                ) : (
                  <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                    Output parametreleri bulunamadı
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>

          {/* Right Side - Client Models */}
          <Box
            sx={{
              width: '50%',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            <Box
              sx={{
                p: 1.5,
                borderBottom: '1px solid',
                borderColor: alpha('#000', 0.08),
              }}
            >
              <Typography variant="subtitle2" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600, fontSize: '0.875rem', color: alpha('#000', 0.7) }}>
                <Computer sx={{ color: '#1da1f2', fontSize: 18 }} />
                Client Models
              </Typography>
            </Box>
              <Tabs
                value={editingFieldType}
                onChange={(_, newValue) => setEditingFieldType(newValue)}
              sx={{
                borderBottom: '1px solid',
                borderColor: alpha('#000', 0.08),
                px: 1.5,
                pt: 0.5,
                minHeight: 36,
                '& .MuiTab-root': {
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.75rem',
                  minHeight: 36,
                  px: 1.5,
                  py: 0.75,
                },
                '& .MuiTabs-indicator': {
                  backgroundColor: '#1da1f2',
                  height: 2,
                },
              }}
              >
                <Tab label="Input Client Model" value="input" />
                <Tab label="Output Client Model" value="output" />
              </Tabs>
            <Box sx={{ flex: 1, overflow: 'auto', p: 1.5 }}>

              {/* Input Client Fields */}
              <Box sx={{ display: editingFieldType === 'input' ? 'block' : 'none' }}>
                {(() => {
                  // Group fields by category
                  const bodyFields = inputClientFields.filter(f => f.sourceCategory === 'body')
                  const pathFields = inputClientFields.filter(f => f.sourceCategory === 'path')
                  const queryFields = inputClientFields.filter(f => f.sourceCategory === 'query')
                  const formDataFields = inputClientFields.filter(f => f.sourceCategory === 'form-data')
                  
                  return (
                    <>
                      {/* Body Client Fields */}
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#667eea', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Body Client Fields
                        </Typography>
                <Box
                  sx={{
                            minHeight: bodyFields.length === 0 ? 60 : 'auto',
                    border: '1px dashed',
                            borderColor: alpha('#667eea', 0.3),
                            borderRadius: 2,
                    p: 1.5,
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              borderColor: alpha('#667eea', 0.5),
                              backgroundColor: alpha('#667eea', 0.02),
                            },
                  }}
                  onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, 'input', 'body')}
                        >
                          {bodyFields.length > 0 ? (
                            <Stack spacing={0.5}>
                              {renderClientFieldTree(bodyFields, 0, 'input')}
                            </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', textAlign: 'center', py: 1 }}>
                              Boş - Buraya sürükleyin
                            </Typography>
                          )}
                        </Box>
                      </Box>

                      {/* Path Client Fields */}
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Path Client Fields
                        </Typography>
                    <Box
                      sx={{
                            minHeight: pathFields.length === 0 ? 60 : 'auto',
                            border: '1px dashed',
                            borderColor: alpha('#f59e0b', 0.3),
                            borderRadius: 2,
                            p: 1.5,
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              borderColor: alpha('#f59e0b', 0.5),
                              backgroundColor: alpha('#f59e0b', 0.02),
                            },
                          }}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, 'input', 'path')}
                        >
                          {pathFields.length > 0 ? (
                            <Stack spacing={0.5}>
                              {renderClientFieldTree(pathFields, 0, 'input')}
                            </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', textAlign: 'center', py: 1 }}>
                              Boş - Buraya sürükleyin
                      </Typography>
                          )}
                    </Box>
                      </Box>

                      {/* Query Client Fields */}
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Query Client Fields
                        </Typography>
                        <Box
                          sx={{
                            minHeight: queryFields.length === 0 ? 60 : 'auto',
                            border: '1px dashed',
                            borderColor: alpha('#10b981', 0.3),
                            borderRadius: 2,
                            p: 1.5,
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              borderColor: alpha('#10b981', 0.5),
                              backgroundColor: alpha('#10b981', 0.02),
                            },
                          }}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, 'input', 'query')}
                        >
                          {queryFields.length > 0 ? (
                            <Stack spacing={0.5}>
                              {renderClientFieldTree(queryFields, 0, 'input')}
                            </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', textAlign: 'center', py: 1 }}>
                              Boş - Buraya sürükleyin
                            </Typography>
                          )}
                        </Box>
                      </Box>

                      {/* Form-Data Client Fields */}
                      <Box sx={{ mb: 1.5 }}>
                        <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          Form-Data Client Fields
                        </Typography>
                        <Box
                          sx={{
                            minHeight: formDataFields.length === 0 ? 60 : 'auto',
                            border: '1px dashed',
                            borderColor: alpha('#8b5cf6', 0.3),
                            borderRadius: 2,
                            p: 1.5,
                            backgroundColor: '#ffffff',
                            transition: 'all 0.2s ease',
                            '&:hover': {
                              borderColor: alpha('#8b5cf6', 0.5),
                              backgroundColor: alpha('#8b5cf6', 0.02),
                            },
                          }}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, 'input', 'form-data')}
                        >
                          {formDataFields.length > 0 ? (
                    <Stack spacing={0.5}>
                              {renderClientFieldTree(formDataFields, 0, 'input')}
                    </Stack>
                          ) : (
                            <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.75rem', textAlign: 'center', py: 1 }}>
                              Boş - Buraya sürükleyin
                            </Typography>
                  )}
                </Box>
                      </Box>
                    </>
                  )
                })()}
              </Box>

              {/* Output Client Fields */}
              <Box sx={{ display: editingFieldType === 'output' ? 'block' : 'none' }}>
                {outputClientFields.length > 0 ? (
                  <Box sx={{ mb: 1.5 }}>
                    <Typography variant="caption" sx={{ mb: 0.75, fontWeight: 600, fontSize: '0.7rem', color: '#00A859', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Output Client Fields
                    </Typography>
                    <Box
                      sx={{
                        border: '1px dashed',
                        borderColor: alpha('#00A859', 0.3),
                        borderRadius: 2,
                        p: 1.5,
                        backgroundColor: '#ffffff',
                        transition: 'all 0.2s ease',
                        '&:hover': {
                          borderColor: alpha('#00A859', 0.5),
                          backgroundColor: alpha('#00A859', 0.02),
                        },
                      }}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, 'output')}
                    >
                      <Stack spacing={0.5}>
                        {renderClientFieldTree(outputClientFields, 0, 'output')}
                      </Stack>
                    </Box>
                  </Box>
                ) : (
                <Box
                  sx={{
                    minHeight: 200,
                    border: '1px dashed',
                      borderColor: alpha('#1da1f2', 0.3),
                      borderRadius: 2,
                    p: 1.5,
                      backgroundColor: '#ffffff',
                      transition: 'all 0.2s ease',
                      '&:hover': {
                        borderColor: alpha('#1da1f2', 0.5),
                        backgroundColor: alpha('#1da1f2', 0.02),
                      },
                  }}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 'output')}
                >
                    <Box
                      sx={{
                        p: 3,
                        textAlign: 'center',
                      }}
                    >
                      <Typography variant="body2" color="text.secondary" sx={{ fontSize: '0.875rem' }}>
                        Sol taraftaki Output parametrelerini buraya sürükleyin
                      </Typography>
                    </Box>
                  </Box>
                  )}
              </Box>
            </Box>
          </Box>
        </Box>
        </Box>

        {/* Analiz İsterleri Tab */}
        <Box sx={{ flex: 1, display: mainTab === 1 ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', p: 2 }}>
          <Paper sx={{ flex: 1, p: 3 }}>
            <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
              Analiz Dökümanı
            </Typography>
            <Typography variant="body2" sx={{ mb: 2, color: 'text.secondary' }}>
              İş kuralları, analiz dökümanları ve gereksinimleri buraya girebilirsiniz.
            </Typography>
            <TextField
              multiline
              fullWidth
              value={analysisRequirements}
              onChange={(e) => setAnalysisRequirements(e.target.value)}
              placeholder="Analiz dökümanı ve gereksinimleri buraya yazın..."
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
      </Paper>

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
              <AutoAwesome sx={{ color: '#00A859' }} />
              MW (BFF) Katmanı - Tam Prompt
            </Typography>
            <Stack direction="row" spacing={1}>
              <Button
                startIcon={<ContentCopy />}
                onClick={handleCopyFullPrompt}
                size="small"
                variant="outlined"
                sx={{
                  borderRadius: '6px',
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  px: 2,
                  borderColor: alpha('#000', 0.2),
                  color: alpha('#000', 0.7),
                  '&:hover': {
                    borderColor: alpha('#000', 0.3),
                    backgroundColor: alpha('#000', 0.04),
                  },
                }}
              >
                Kopyala
              </Button>
              <Button
                startIcon={<Download />}
                onClick={handleDownloadFullPrompt}
                size="small"
                variant="contained"
                sx={{
                  backgroundColor: alpha('#000', 0.85),
                  borderRadius: '6px',
                  textTransform: 'none',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  px: 2,
                  boxShadow: 'none',
                  '&:hover': {
                    backgroundColor: alpha('#000', 0.95),
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                  },
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
            variant="outlined"
            sx={{
              mt: 2,
              '& .MuiOutlinedInput-root': {
                fontSize: '0.875rem',
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                fontFamily: 'monospace',
                '& fieldset': {
                  borderColor: alpha('#000', 0.12),
                  borderWidth: '1px',
                },
                '&:hover fieldset': {
                  borderColor: alpha('#000', 0.25),
                },
                '&.Mui-focused fieldset': {
                  borderColor: alpha('#000', 0.4),
                  borderWidth: '1px',
                },
              },
              '& .MuiInputBase-input': {
                padding: '12px 16px',
              },
            }}
            rows={25}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2, pt: 1 }}>
          <Button 
            onClick={() => setFullPromptDialogOpen(false)}
            sx={{
              borderRadius: '6px',
              textTransform: 'none',
              fontWeight: 500,
              fontSize: '0.875rem',
              px: 2.5,
              color: alpha('#000', 0.7),
              '&:hover': {
                backgroundColor: alpha('#000', 0.04),
              },
            }}
          >
            Kapat
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
