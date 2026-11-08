export const PRESENTATION_EXPORT_FORMATS = Object.freeze({
  pptx: { label: 'PowerPoint', detail: '可编辑的幻灯片', extension: 'pptx', icon: 'presentation' },
  pdf: { label: 'PDF', detail: '保留幻灯片版式', extension: 'pdf', icon: 'file-text' },
  docx: {
    label: 'Word 文稿',
    detail: '内容、图片、图表数据与讲稿',
    extension: 'docx',
    icon: 'file-pen-line',
  },
  md: { label: 'Markdown', detail: '文字、图表数据与讲稿', extension: 'md', icon: 'file-code-2' },
})
