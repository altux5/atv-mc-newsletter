import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useState } from 'react'

const AI_LOADING_MESSAGES = [
  "✨ Polishing your prose...",
  "🎨 Adding a touch of magic...",
  "🧠 AI is crafting perfection...",
  "💫 Making your words shine...",
  "🚀 Elevating your content...",
  "📝 Refining with care...",
]

interface RichTextEditorProps {
  content: string
  onChange: (html: string) => void
  placeholder?: string
  enableRefine?: boolean
  onRefine?: (html: string) => Promise<string>
  refineLabel?: string
}

export default function RichTextEditor({
  content,
  onChange,
  placeholder,
  enableRefine,
  onRefine,
  refineLabel = 'Refine with AI',
}: RichTextEditorProps) {
  const [isRefining, setIsRefining] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState(AI_LOADING_MESSAGES[0])
  
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Image.configure({
        HTMLAttributes: {
          style: 'max-width: 100%; height: auto;',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing your content...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'rich-text-editor-content',
      },
    },
  })

  // Update editor content when prop changes (for loading saved drafts)
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content)
    }
  }, [content, editor])

  if (!editor) {
    return null
  }

  const handleRefine = async () => {
    if (!onRefine || isRefining) return
    setIsRefining(true)
    setLoadingMessage(AI_LOADING_MESSAGES[Math.floor(Math.random() * AI_LOADING_MESSAGES.length)])
    
    // Cycle through messages while loading
    const messageInterval = setInterval(() => {
      setLoadingMessage(AI_LOADING_MESSAGES[Math.floor(Math.random() * AI_LOADING_MESSAGES.length)])
    }, 2000)
    
    try {
      const refined = await onRefine(editor.getHTML())
      if (refined) {
        editor.commands.setContent(refined)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to refine content'
      alert(message)
    } finally {
      clearInterval(messageInterval)
      setIsRefining(false)
    }
  }

  const addLink = () => {
    const url = window.prompt('Enter URL:')
    if (url) {
      editor.chain().focus().setLink({ href: url }).run()
    }
  }

  return (
    <div className="rich-text-editor">
      <div className="editor-toolbar">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={editor.isActive('bold') ? 'active' : ''}
          title="Bold"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={editor.isActive('italic') ? 'active' : ''}
          title="Italic"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          className={editor.isActive('strike') ? 'active' : ''}
          title="Strikethrough"
        >
          <s>S</s>
        </button>
        <span className="separator">|</span>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          className={editor.isActive('heading', { level: 2 }) ? 'active' : ''}
          title="Heading 2"
        >
          H2
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          className={editor.isActive('heading', { level: 3 }) ? 'active' : ''}
          title="Heading 3"
        >
          H3
        </button>
        <span className="separator">|</span>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          className={editor.isActive('bulletList') ? 'active' : ''}
          title="Bullet List"
        >
          • List
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          className={editor.isActive('orderedList') ? 'active' : ''}
          title="Numbered List"
        >
          1. List
        </button>
        <span className="separator">|</span>
        <button type="button" onClick={addLink} title="Add Link">
          🔗 Link
        </button>
        <span className="separator">|</span>
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo()}
          title="Undo"
        >
          ↶ Undo
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo()}
          title="Redo"
        >
          ↷ Redo
        </button>
        {enableRefine && (
          <>
            <span className="separator">|</span>
            <button
              type="button"
              onClick={handleRefine}
              disabled
              title="Work in progress — coming soon"
              aria-disabled="true"
              className="ai-refine-button"
            >
              <span className="ai-refine-icon">✨</span>
              <span className="ai-refine-text">{refineLabel}</span>
              <span className="ai-refine-sparkle"></span>
            </button>
          </>
        )}
      </div>
      
      {/* AI Loading Overlay */}
      {isRefining && (
        <div className="ai-loading-overlay">
          <div className="ai-loading-content">
            <div className="ai-loading-orb">
              <div className="ai-orb-ring"></div>
              <div className="ai-orb-ring"></div>
              <div className="ai-orb-ring"></div>
              <div className="ai-orb-core">AI</div>
            </div>
            <p className="ai-loading-message">{loadingMessage}</p>
            <p className="ai-loading-subtext">Please wait while we enhance your content...</p>
          </div>
        </div>
      )}
      
      <EditorContent editor={editor} />
    </div>
  )
}

