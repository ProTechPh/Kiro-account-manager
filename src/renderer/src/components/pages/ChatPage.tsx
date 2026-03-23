import { useState, useEffect, useRef } from 'react'
import { Card } from '../ui'
import { MessageCircle, Plus, Send, Wifi, WifiOff, ChevronDown, RefreshCw, Trash2 } from 'lucide-react'
import { Button } from '../ui'
import { useTranslation } from '@/hooks/useTranslation'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  model?: string
}

interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
  model: string
}

interface ModelInfo {
  id: string
  name: string
  description: string
}

export function ChatPage() {
  const { t } = useTranslation()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [isServerOnline, setIsServerOnline] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [availableModels, setAvailableModels] = useState<ModelInfo[]>([])
  // Initialize with empty model - will be set when models are fetched
  const [selectedModel, setSelectedModel] = useState('')
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [isLoadingModels, setIsLoadingModels] = useState(true)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false)
  const [conversationToDelete, setConversationToDelete] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const modelDropdownRef = useRef<HTMLDivElement>(null)

  const activeConversation = conversations.find(c => c.id === activeConversationId)
  
  // Ensure we always have a valid model - allow "auto" as a valid option
  const safeSelectedModel = selectedModel 
    ? selectedModel 
    : (availableModels.length > 0 ? availableModels[0].id : null)
    
  const currentModel = availableModels.find(m => m.id === safeSelectedModel) || 
    (availableModels.length > 0 ? availableModels[0] : null)

  // Auto-scroll to bottom when messages change
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Save conversations to storage
  const saveConversations = async (conversationsToSave: Conversation[]) => {
    try {
      const chatData = {
        conversations: conversationsToSave,
        activeConversationId,
        selectedModel,
        lastUpdated: new Date().toISOString()
      }
      localStorage.setItem('kiro-chat-conversations', JSON.stringify(chatData))
    } catch (error) {
      console.error('Failed to save conversations:', error)
    }
  }

  // Load conversations from storage
  const loadConversations = async () => {
    try {
      setIsLoadingConversations(true)
      const data = localStorage.getItem('kiro-chat-conversations')
      if (data) {
        const chatData = JSON.parse(data)
        if (chatData.conversations && Array.isArray(chatData.conversations)) {
          // Convert date strings back to Date objects
          const loadedConversations = chatData.conversations.map((conv: any) => ({
            ...conv,
            createdAt: new Date(conv.createdAt),
            updatedAt: new Date(conv.updatedAt),
            messages: conv.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp)
            }))
          }))
          setConversations(loadedConversations)
          if (chatData.activeConversationId) {
            setActiveConversationId(chatData.activeConversationId)
          }
          if (chatData.selectedModel) {
            setSelectedModel(chatData.selectedModel)
          }
        }
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setIsLoadingConversations(false)
    }
  }

  // Fetch available models
  const fetchModels = async () => {
    try {
      setIsLoadingModels(true)
      const result = await window.api.proxyGetModels()
      const models: ModelInfo[] = (result.success && result.models?.length > 0) ? result.models : []
      setAvailableModels(models)
      if (models.length > 0 && (!selectedModel || !models.some((m: ModelInfo) => m.id === selectedModel))) {
        setSelectedModel(models[0].id)
      }
    } catch (error) {
      console.error('Error fetching models:', error)
      setAvailableModels([])
    } finally {
      setIsLoadingModels(false)
    }
  }

  // Check server status
  const checkServerStatus = async () => {
    try {
      const status = await window.api.proxyGetStatus()
      setIsServerOnline(status.running)
    } catch (error) {
      setIsServerOnline(false)
    }
  }

  // Create new conversation
  const createNewConversation = () => {
    // Use selected model or first available model
    const modelToUse = selectedModel || (availableModels.length > 0 ? availableModels[0].id : 'claude-3-5-sonnet-20241022')
    
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: t('chat.newChat'),
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      model: modelToUse
    }
    const updatedConversations = [newConversation, ...conversations]
    setConversations(updatedConversations)
    setActiveConversationId(newConversation.id)
    if (!selectedModel && availableModels.length > 0) {
      setSelectedModel(availableModels[0].id)
    }
  }

  // Switch conversation and update selected model
  const switchConversation = (conversationId: string) => {
    setActiveConversationId(conversationId)
    const conversation = conversations.find(c => c.id === conversationId)
    if (conversation && conversation.model) {
      console.log('Switching to conversation with model:', conversation.model)
      setSelectedModel(conversation.model)
    }
    // Save the active conversation change
    setTimeout(() => {
      const chatData = {
        conversations,
        activeConversationId: conversationId,
        selectedModel: conversation?.model || selectedModel,
        lastUpdated: new Date().toISOString()
      }
      localStorage.setItem('kiro-chat-conversations', JSON.stringify(chatData))
    }, 0)
  }

  // Handle model change
  const handleModelChange = (modelId: string) => {
    console.log('Model changed to:', modelId)
    setSelectedModel(modelId)
    setShowModelDropdown(false)
    
    // Update current conversation's model if one is active
    if (activeConversationId) {
      console.log('Updating conversation model to:', modelId)
      const updatedConversations = conversations.map(conv => 
        conv.id === activeConversationId 
          ? { ...conv, model: modelId }
          : conv
      )
      setConversations(updatedConversations)
    }
  }

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target as Node)) {
        setShowModelDropdown(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Generate conversation title using AI
  const generateConversationTitle = async (userMessage: string, assistantResponse: string): Promise<string> => {
    try {
      const titlePrompt = `Based on this conversation, create a short descriptive title that captures the main topic or purpose (3-5 words, no quotes or punctuation):

User: ${userMessage}
Assistant: ${assistantResponse.slice(0, 400)}

Examples:
- "JavaScript Array Methods"
- "React Component Help" 
- "Database Query Issue"
- "Python Data Analysis"

Title:`

      const result = await window.api.proxyChatCompletion(
        [{ role: 'user', content: titlePrompt }],
        selectedModel,
        { temperature: 0.2, max_tokens: 12 }
      )
      
      if (result.success && result.content) {
        // Clean up the title - remove quotes, extra punctuation
        let title = result.content.trim()
          .replace(/^["']|["']$/g, '') // Remove surrounding quotes
          .replace(/^Title:\s*/i, '') // Remove "Title:" prefix
          .replace(/[.!?]+$/, '') // Remove trailing punctuation
          .replace(/^\d+\.\s*/, '') // Remove numbered list format
          .slice(0, 35) // Limit length
        
        // If title is still too generic or short, create a better fallback
        if (title.length < 3 || title.toLowerCase().includes('conversation') || title.toLowerCase() === userMessage.toLowerCase().slice(0, title.length)) {
          // Create a more intelligent fallback based on message content
          if (userMessage.toLowerCase().includes('help') || userMessage.toLowerCase().includes('how')) {
            title = 'Help Request'
          } else if (userMessage.toLowerCase().includes('error') || userMessage.toLowerCase().includes('problem')) {
            title = 'Troubleshooting'
          } else if (userMessage.toLowerCase().includes('code') || userMessage.toLowerCase().includes('function')) {
            title = 'Code Discussion'
          } else {
            // Extract key words from user message
            const words = userMessage.split(' ').filter(word => 
              word.length > 3 && 
              !['what', 'how', 'can', 'you', 'help', 'with', 'the', 'and', 'for', 'this', 'that'].includes(word.toLowerCase())
            )
            title = words.slice(0, 3).join(' ') || 'General Chat'
          }
        }
        
        return title
      }
    } catch (error) {
      console.error('Failed to generate title:', error)
    }
    
    // Enhanced fallback logic
    const lowerMessage = userMessage.toLowerCase()
    if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
      return 'Help Request'
    } else if (lowerMessage.includes('error') || lowerMessage.includes('problem')) {
      return 'Troubleshooting'
    } else if (lowerMessage.includes('code') || lowerMessage.includes('function')) {
      return 'Code Discussion'
    } else {
      // Extract meaningful words
      const words = userMessage.split(' ').filter(word => 
        word.length > 3 && 
        !['what', 'how', 'can', 'you', 'help', 'with', 'the', 'and', 'for', 'this', 'that'].includes(word.toLowerCase())
      )
      return words.slice(0, 3).join(' ') || 'General Chat'
    }
  }

  // Delete conversation
  const deleteConversation = (conversationId: string) => {
    setConversations(prev => prev.filter(conv => conv.id !== conversationId))
    
    // If we're deleting the active conversation, clear the selection
    if (activeConversationId === conversationId) {
      setActiveConversationId(null)
    }
    
    setConversationToDelete(null)
  }

  // Confirm delete conversation
  const confirmDeleteConversation = (conversationId: string) => {
    setConversationToDelete(conversationId)
  }

  // Regenerate title for a conversation
  const regenerateTitle = async (conversationId: string) => {
    const conversation = conversations.find(c => c.id === conversationId)
    if (!conversation || conversation.messages.length < 2) return

    const userMessage = conversation.messages.find(m => m.role === 'user')
    const assistantMessage = conversation.messages.find(m => m.role === 'assistant')
    
    if (userMessage && assistantMessage) {
      try {
        setIsGeneratingTitle(true)
        const newTitle = await generateConversationTitle(userMessage.content, assistantMessage.content)
        
        setConversations(prev => prev.map(conv => 
          conv.id === conversationId 
            ? { ...conv, title: newTitle }
            : conv
        ))
      } catch (error) {
        console.error('Failed to regenerate title:', error)
      } finally {
        setIsGeneratingTitle(false)
      }
    }
  }

  // Send message
  // Send message
    const sendMessage = async () => {
      if (!message.trim() || !isServerOnline || isLoading) return

      const userMessage: ChatMessage = {
        id: Date.now().toString(),
        role: 'user',
        content: message.trim(),
        timestamp: new Date(),
        model: selectedModel || (availableModels.length > 0 ? availableModels[0].id : 'unknown')
      }

      let currentActiveConversationId = activeConversationId

      // Add user message to conversation
      if (activeConversationId) {
        setConversations(prev => prev.map(conv => 
          conv.id === activeConversationId 
            ? {
                ...conv,
                messages: [...conv.messages, userMessage],
                // Only update title if it's still the default "New Chat" title
                title: (conv.title === t('chat.newChat') && conv.messages.length === 0)
                  ? message.trim().slice(0, 30) + (message.trim().length > 30 ? '...' : '') 
                  : conv.title,
                updatedAt: new Date(),
                model: selectedModel // Update conversation model
              }
            : conv
        ))
      } else {
        // Create new conversation if none exists
        const newConversation: Conversation = {
          id: Date.now().toString(),
          title: t('chat.newChat'), // Temporary title, will be updated after first response
          messages: [userMessage],
          createdAt: new Date(),
          updatedAt: new Date(),
          model: selectedModel
        }
        currentActiveConversationId = newConversation.id
        setConversations(prev => [newConversation, ...prev])
        setActiveConversationId(newConversation.id)
        if (!selectedModel && availableModels.length > 0) {
          setSelectedModel(availableModels[0].id)
        }
      }

      const currentMessage = message.trim()
      setMessage('')
      setIsLoading(true)

      // Determine which model to use - allow any valid model including "auto"
      let modelToUse: string | null = null
      
      // First, try to use the selected model if it's valid
      if (selectedModel) {
        const modelExists = availableModels.some(m => m.id === selectedModel)
        if (modelExists) {
          modelToUse = selectedModel
        }
      }
      
      // If no valid selected model, use the first available model
      if (!modelToUse && availableModels.length > 0) {
        modelToUse = availableModels[0].id
        // Update the selected model state to match what we're actually using
        setSelectedModel(availableModels[0].id)
      }
      
      if (!modelToUse) {
        throw new Error('No valid model available. Please check server connection and try again.')
      }

      try {
        // Use the real chat completion API
        console.log('Sending chat completion with model:', modelToUse)
        console.log('Selected model state:', selectedModel)
        console.log('Available models:', availableModels.map(m => ({ id: m.id, name: m.name })))
        
        const result = await window.api.proxyChatCompletion(
          [{ role: 'user', content: currentMessage }],
          modelToUse,
          { temperature: 0.7, max_tokens: 4000 }
        )

        if (result.success && result.content) {
          const assistantMessage: ChatMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: result.content,
            timestamp: new Date(),
            model: modelToUse // Use the actual model that was sent
          }

          // Generate title for new conversations (first exchange)
          // This will be true for conversations that have exactly 1 message (the user message we just added)
          let generatedTitle: string | null = null
          
          // Always try to generate title for conversations with default titles
          const currentConv = conversations.find(c => c.id === currentActiveConversationId)
          const hasDefaultTitle = currentConv && (currentConv.title === t('chat.newChat'))
          const isFirstResponse = currentConv && currentConv.messages.length === 1
          
          if (hasDefaultTitle || isFirstResponse) {
            try {
              setIsGeneratingTitle(true)
              console.log('Generating title for conversation:', currentActiveConversationId)
              generatedTitle = await generateConversationTitle(currentMessage, result.content)
              console.log('Generated title:', generatedTitle)
            } catch (error) {
              console.error('Title generation failed:', error)
            } finally {
              setIsGeneratingTitle(false)
            }
          }

          setConversations(prev => prev.map(conv => 
            conv.id === currentActiveConversationId
              ? {
                  ...conv,
                  messages: [...conv.messages, assistantMessage],
                  title: generatedTitle || conv.title,
                  updatedAt: new Date()
                }
              : conv
          ))
        } else {
          throw new Error(result.error || 'No response received')
        }
      } catch (error) {
        console.error('Chat API error:', error)

        // Add error message
        const errorMessage: ChatMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to get response from AI service'}`,
          timestamp: new Date(),
          model: modelToUse // Use the actual model that was attempted
        }

        setConversations(prev => prev.map(conv => 
          conv.id === currentActiveConversationId
            ? {
                ...conv,
                messages: [...conv.messages, errorMessage],
                updatedAt: new Date()
              }
            : conv
        ))
      } finally {
        setIsLoading(false)
      }
    }

  // Handle textarea change
  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value)
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px'
    }
  }

  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  // Format timestamp
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // Auto-regenerate titles for conversations with generic titles
  const autoRegenerateTitles = async () => {
    const conversationsNeedingTitles = conversations.filter(conv => 
      (conv.title === 'hi' || conv.title === 'hello' || conv.title.length < 4 || 
       conv.title === 'New Chat' || conv.title === '新对话') && 
      conv.messages.length >= 2
    )

    for (const conv of conversationsNeedingTitles) {
      const userMessage = conv.messages.find(m => m.role === 'user')
      const assistantMessage = conv.messages.find(m => m.role === 'assistant')
      
      if (userMessage && assistantMessage) {
        try {
          console.log('Auto-regenerating title for conversation:', conv.id)
          const newTitle = await generateConversationTitle(userMessage.content, assistantMessage.content)
          
          setConversations(prev => prev.map(c => 
            c.id === conv.id 
              ? { ...c, title: newTitle }
              : c
          ))
          
          // Small delay between requests to avoid overwhelming the API
          await new Promise(resolve => setTimeout(resolve, 1000))
        } catch (error) {
          console.error('Failed to auto-regenerate title for conversation:', conv.id, error)
        }
      }
    }
  }

  // Load conversations and check server status on mount
  useEffect(() => {
    loadConversations()
    checkServerStatus()
    fetchModels()
    const unsubscribe = window.api.onProxyStatusChange?.((status) => {
      setIsServerOnline(status.running)
    })
    return () => unsubscribe?.()
  }, [])

  // Ensure selectedModel is set when availableModels are loaded
  useEffect(() => {
    if (availableModels.length > 0 && !selectedModel) {
      console.log('Setting initial model from available models:', availableModels[0].id)
      setSelectedModel(availableModels[0].id)
    }
  }, [availableModels, selectedModel])

  // Force set a valid model immediately on mount
  useEffect(() => {
    if (!selectedModel || selectedModel === 'auto' || selectedModel === 'Auto') {
      console.log('Forcing model selection - waiting for models to load')
      // Don't set a hardcoded model, wait for fetchModels to set it
    }
  }, [])

  // Fetch models when server comes online
  useEffect(() => {
    console.log('Server status changed:', isServerOnline)
    if (isServerOnline) {
      fetchModels()
    }
  }, [isServerOnline])

  // Auto-regenerate titles when server comes online and conversations are loaded
  useEffect(() => {
    if (isServerOnline && conversations.length > 0 && !isLoadingConversations) {
      // Small delay to ensure everything is loaded
      const timer = setTimeout(() => {
        autoRegenerateTitles()
      }, 2000)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [isServerOnline, conversations.length, isLoadingConversations])

  // Auto-scroll when messages change
  useEffect(() => {
    scrollToBottom()
  }, [activeConversation?.messages])

  // Force refresh model selection
  const forceRefreshModels = async () => {
    console.log('Force refreshing models...')
    setIsLoadingModels(true)
    await fetchModels()
    setIsLoadingModels(false)
  }

  // Debug logging for model selection
  useEffect(() => {
    console.log('Model selection state:', {
      selectedModel,
      currentModelName: currentModel?.name,
      currentModelId: currentModel?.id,
      availableModelsCount: availableModels.length,
      availableModelIds: availableModels.map(m => m.id)
    })
  }, [selectedModel, currentModel, availableModels])

  // Save conversations whenever they change (debounced)
  useEffect(() => {
    if (!isLoadingConversations) {
      const timeoutId = setTimeout(() => {
        saveConversations(conversations)
      }, 500) // Debounce saves by 500ms
      return () => clearTimeout(timeoutId)
    }
    return undefined
  }, [conversations, activeConversationId, selectedModel, isLoadingConversations])

  return (
    <div className="flex-1 p-6 space-y-6 overflow-hidden">
      {/* Page Header */}
      <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 p-6 border border-primary/20">
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-gradient-to-tr from-primary/20 to-transparent rounded-full blur-2xl" />
        <div className="relative flex items-center gap-4">
          <div className="p-3 rounded-xl bg-primary shadow-lg shadow-primary/25">
            <MessageCircle className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-primary">{t('chat.title')}</h1>
            <p className="text-muted-foreground">{t('chat.description')}</p>
          </div>
        </div>
      </div>

      {/* Chat Interface */}
      <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 rounded-[32px] overflow-hidden flex-1 flex flex-col h-[600px]">
        <div className="flex flex-1 overflow-hidden">
          {/* Conversations Sidebar */}
          <div className="w-80 border-r bg-muted/30 flex flex-col">
            {/* Sidebar Header */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold">{t('chat.title')}</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={createNewConversation}
                  disabled={!isServerOnline}
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  {t('chat.newChat')}
                </Button>
              </div>
            </div>

            {/* Conversations List */}
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mb-4 opacity-50" />
                  <p className="text-sm text-center">{t('chat.noConversations')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => (
                    <div
                      key={conv.id}
                      className={`relative group rounded-lg transition-colors ${
                        activeConversationId === conv.id
                          ? 'bg-primary/10 border border-primary/20'
                          : 'hover:bg-muted/50'
                      }`}
                    >
                      <button
                        onClick={() => switchConversation(conv.id)}
                        className="w-full text-left p-3 pr-10"
                      >
                        <div className="font-medium text-sm truncate mb-1 flex items-center gap-2">
                          {conv.title}
                          {isGeneratingTitle && activeConversationId === conv.id && conv.messages.length === 2 && (
                            <div className="flex space-x-1">
                              <div className="w-1 h-1 bg-primary rounded-full animate-bounce"></div>
                              <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                              <div className="w-1 h-1 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                            </div>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center justify-between">
                          <span>{conv.messages.length} {t('chat.messages', { n: conv.messages.length }).replace(/\d+ /, '')}</span>
                          <span className="text-xs bg-muted/50 px-2 py-0.5 rounded">
                            {availableModels.find(m => m.id === conv.model)?.name?.split(' ')[0] || conv.model.split('-')[0] || 'Model'}
                          </span>
                        </div>
                      </button>
                      
                      {/* Action Buttons */}
                      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        {/* Regenerate Title Button - only show for conversations with generic titles */}
                        {(conv.title === 'hi' || conv.title === 'hello' || conv.title.length < 4 || conv.title === t('chat.newChat')) && conv.messages.length >= 2 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              regenerateTitle(conv.id)
                            }}
                            className="p-1 rounded hover:bg-primary/10 hover:text-primary transition-all"
                            title={t('chat.regenerateTitle')}
                          >
                            <RefreshCw className="h-3 w-3" />
                          </button>
                        )}
                        
                        {/* Delete Button */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            confirmDeleteConversation(conv.id)
                          }}
                          className="p-1 rounded hover:bg-red-500/10 hover:text-red-500 transition-all"
                          title={t('chat.deleteConversation')}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col">
            {!isServerOnline ? (
              /* Server Offline State */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <WifiOff className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">{t('chat.serverOffline')}</h3>
                  <p className="text-sm">{t('chat.serverOfflineDesc')}</p>
                </div>
              </div>
            ) : !activeConversation ? (
              /* No Conversation Selected */
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <MessageCircle className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <h3 className="text-lg font-medium mb-2">{t('chat.selectConversation')}</h3>
                  <p className="text-sm mb-4">{t('chat.selectConversationDesc')}</p>
                  <Button onClick={createNewConversation} disabled={!isServerOnline} className="gap-2">
                    <Plus className="h-4 w-4" />
                    {t('chat.newChat')}
                  </Button>
                </div>
              </div>
            ) : (
              /* Active Conversation */
              <>
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {activeConversation.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                          msg.role === 'user'
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted'
                        }`}
                      >
                        <div className="whitespace-pre-wrap break-words">
                          {msg.content}
                        </div>
                        <div className={`text-xs mt-1 opacity-70 ${
                          msg.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'
                        }`}>
                          {formatTime(msg.timestamp)}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="bg-muted rounded-2xl px-4 py-2">
                        <div className="flex items-center gap-2">
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                          <span className="text-xs text-muted-foreground">{t('chat.thinking')}</span>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="border-t p-4">
                  <div className="flex items-end gap-3">
                    <div className="flex-1 relative">
                      <textarea
                        ref={textareaRef}
                        value={message}
                        onChange={handleTextareaChange}
                        onKeyDown={handleKeyDown}
                        placeholder={t('chat.placeholder')}
                        className="w-full resize-none rounded-xl border bg-background px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary min-h-[48px] max-h-[120px]"
                        rows={1}
                      />
                    </div>
                    <Button
                      onClick={sendMessage}
                      disabled={!message.trim() || !isServerOnline || isLoading}
                      size="sm"
                      className="h-12 w-12 rounded-xl"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  {/* Status Bar */}
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-4">
                      {isServerOnline ? (
                        <>
                          <div className="flex items-center gap-2">
                            <Wifi className="h-3 w-3 text-green-500" />
                            <span>{t('chat.online')}</span>
                          </div>
                          {/* Model Selector */}
                          <div className="relative" ref={modelDropdownRef}>
                            <button
                              onClick={() => setShowModelDropdown(!showModelDropdown)}
                              className="flex items-center gap-1 px-2 py-1 rounded bg-muted/50 hover:bg-muted transition-colors"
                              disabled={isLoadingModels || availableModels.length === 0}
                            >
                              <span className="font-medium">
                                {isLoadingModels
                                  ? t('chat.loading')
                                  : (currentModel?.name || (availableModels.length > 0 ? availableModels[0].name : 'No Models'))
                                }
                              </span>
                              <ChevronDown className="h-3 w-3" />
                            </button>
                            
                            {showModelDropdown && !isLoadingModels && (
                              <div className="absolute bottom-full left-0 mb-2 w-64 bg-popover border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                                <div className="p-2 border-b flex items-center justify-between">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    {t('chat.availableModels')}
                                  </span>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={forceRefreshModels}
                                    className="h-6 w-6 p-0"
                                  >
                                    <RefreshCw className="h-3 w-3" />
                                  </Button>
                                </div>
                                {availableModels.map((model) => (
                                  <button
                                    key={model.id}
                                    onClick={() => handleModelChange(model.id)}
                                    className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors ${
                                      selectedModel === model.id ? 'bg-primary/10 text-primary' : ''
                                    }`}
                                  >
                                    <div className="font-medium">{model.name}</div>
                                    <div className="text-xs text-muted-foreground truncate">{model.description || model.id}</div>
                                  </button>
                                ))}
                                {availableModels.length === 0 && (
                                  <div className="px-3 py-2 text-sm text-muted-foreground text-center">
                                    {t('chat.noModels')}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-3 w-3 text-red-500" />
                          <span>{t('chat.offline')}</span>
                        </>
                      )}
                    </div>
                    <div>
                      {t('chat.enterHint')}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* Delete Confirmation Dialog */}
      {conversationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border rounded-[24px] p-6 max-w-md mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">
              {t('chat.deleteTitle')}
            </h3>
            <p className="text-muted-foreground mb-6">
              {t('chat.deleteConfirm')}
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                onClick={() => setConversationToDelete(null)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => deleteConversation(conversationToDelete)}
              >
                {t('common.delete')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}