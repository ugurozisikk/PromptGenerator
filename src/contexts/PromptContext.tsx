import { createContext, useContext, useRef, ReactNode } from 'react'

interface PromptContextType {
  triggerPrompt: () => void
  setPromptHandler: (handler: () => void) => void
}

const PromptContext = createContext<PromptContextType | undefined>(undefined)

export const PromptProvider = ({ children }: { children: ReactNode }) => {
  const promptHandlerRef = useRef<(() => void) | null>(null)

  const setPromptHandler = (handler: () => void) => {
    promptHandlerRef.current = handler
  }

  const triggerPrompt = () => {
    if (promptHandlerRef.current) {
      promptHandlerRef.current()
    }
  }

  return (
    <PromptContext.Provider value={{ triggerPrompt, setPromptHandler }}>
      {children}
    </PromptContext.Provider>
  )
}

export const usePrompt = () => {
  const context = useContext(PromptContext)
  if (!context) {
    throw new Error('usePrompt must be used within PromptProvider')
  }
  return context
}

