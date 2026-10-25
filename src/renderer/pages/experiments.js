/**
 * 资料库页（学习 → 资料库）。
 *
 * 渲染层拆分的第三个页面。只迁移渲染本身：拖放、分组、移动、迁移等动作与状态
 * 仍由 `main.js` 处理，`experimentGroups()` 也留在那里供拖放目标复用。
 */

export function createExperimentsPage({
  state,
  escapeHtml,
  experimentGroups,
  formatBytes,
  formatTime,
  fileTone,
  fileIconName,
  fileExtensionLabel,
}) {
  function renderPage() {
    if (!state.workspace) {
      return '<div class="loading-panel"><i data-lucide="loader"></i><span>正在读取资料库</span></div>'
    }
    const experiments = state.workspace.experiments || []
    const groups = experimentGroups(experiments, state.workspace.experimentGroups || [])
    const totalSize = experiments.reduce((sum, item) => sum + (Number(item.size) || 0), 0)
    const directory = state.settings?.experimentDir || '尚未设置'
    const selectedGroup =
      groups.find((group) => group.name === state.experimentSelectedGroup) || groups[0] || null

    return `
      <section class="page-intro action-intro">
        <div>
          <h2>资料库</h2>
          <p>按自己的学习方式建立资料库，拖入文件即可归档。根目录迁移会连同已有资料一起转移。</p>
        </div>
        <div class="button-row">
          <button class="button secondary" type="button" data-action="open-experiment-directory">
            <i data-lucide="folder-open"></i><span>打开目录</span>
          </button>
          <button class="button secondary" type="button" data-action="create-experiment-group">
            <i data-lucide="folder-plus"></i><span>新建资料库</span>
          </button>
          <button class="button primary" type="button" data-action="choose-experiment-files">
            <i data-lucide="plus"></i><span>选择文件</span>
          </button>
        </div>
      </section>

      <section class="experiment-metrics">
        <div><span>资料文件</span><strong>${experiments.length}</strong></div>
        <div><span>资料库</span><strong>${groups.length}</strong></div>
        <div><span>占用空间</span><strong>${formatBytes(totalSize)}</strong></div>
        <div class="experiment-path">
          <span>根目录</span>
          <button type="button" data-action="open-experiment-directory" title="${escapeHtml(directory)}">${escapeHtml(directory)}</button>
        </div>
      </section>

      <section class="experiment-dropzone ${state.experimentDropActive ? 'is-dragging' : ''} ${state.experimentImporting ? 'is-importing' : ''}" data-experiment-dropzone>
        <div class="experiment-dropzone-icon">
          <morph-icon class="experiment-morph" aria-hidden="true"></morph-icon>
        </div>
        <div class="experiment-dropzone-copy">
          <strong>${state.experimentImporting ? '正在复制并归档…' : state.experimentSuggestionBusy ? '正在分析资料归属…' : state.experimentDropTargetGroup ? `松手归档到“${escapeHtml(state.experimentDropTargetGroup)}”` : state.experimentDropActive ? '松手后生成分类建议' : '把课程资料拖到这里'}</strong>
          <span>${state.experimentDropTargetGroup ? '文件会直接进入你指定的课程文件夹。' : state.experimentDropActive ? '确认分类建议后才会复制文件。' : '支持 PDF、Word、Excel、PPT、图片、压缩包、代码等任意文件类型。'}</span>
        </div>
        <button class="button secondary" type="button" data-action="choose-experiment-files" ${state.experimentImporting ? 'disabled' : ''}>
          <i data-lucide="upload"></i><span>选择文件</span>
        </button>
      </section>

      ${
        groups.length
          ? `<div class="experiment-explorer">
              <aside class="experiment-explorer-sidebar" aria-label="我的资料库">
                <header class="experiment-explorer-sidebar-head">
                  <div>
                    <span class="eyebrow">MY LIBRARIES</span>
                    <strong>我的资料库</strong>
                  </div>
                  <span>${groups.length}</span>
                </header>
                <div class="experiment-root-row">
                  <span class="experiment-tree-chevron"><i data-lucide="library"></i></span>
                  <strong>资料库</strong>
                  <span>${experiments.length} 个文件</span>
                </div>
                <div class="experiment-group-list" data-scroll-preserve="experiment-groups">
                  ${groups
                    .map(
                      (group) => `
                        <div class="experiment-group ${group.name === selectedGroup?.name ? 'selected' : ''} ${group.name === state.experimentDropTargetGroup ? 'is-drop-target' : ''}" data-experiment-group="${escapeHtml(group.name)}" data-experiment-group-drop="${escapeHtml(group.name)}">
                          <button class="experiment-group-select" type="button" data-action="select-experiment-group" data-group="${escapeHtml(group.name)}">
                            <span class="experiment-folder">
                              <i data-lucide="folder"></i>
                              <span class="experiment-folder-count">${group.items.length}</span>
                            </span>
                            <span class="experiment-group-copy">
                              <strong>${escapeHtml(group.name)}</strong>
                              <small>${formatBytes(group.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0))}</small>
                            </span>
                            <i data-lucide="chevron-right"></i>
                          </button>
                          <span class="experiment-group-actions">
                            <button class="icon-button compact" type="button" data-action="rename-experiment-group" data-group="${escapeHtml(group.name)}" data-tooltip="重命名课程文件夹" aria-label="重命名课程文件夹">
                              <i data-lucide="pencil"></i>
                            </button>
                            <button class="icon-button compact" type="button" data-action="open-experiment-group" data-group="${escapeHtml(group.name)}" data-tooltip="在资源管理器中打开课程文件夹" aria-label="在资源管理器中打开课程文件夹">
                              <i data-lucide="folder-open"></i>
                            </button>
                            <button class="icon-button compact danger" type="button" data-action="remove-experiment-group" data-group="${escapeHtml(group.name)}" data-tooltip="删除空资料库" aria-label="删除空资料库" ${group.items.length ? 'disabled' : ''}>
                              <i data-lucide="trash-2"></i>
                            </button>
                          </span>
                        </div>`,
                    )
                    .join('')}
                </div>
              </aside>
              <section class="experiment-explorer-main" aria-label="${escapeHtml(selectedGroup?.name || '资料文件')}" ${selectedGroup ? `data-experiment-group-drop="${escapeHtml(selectedGroup.name)}"` : ''}>
                ${
                  selectedGroup
                    ? `<header class="experiment-explorer-head">
                        <div>
                          <span class="eyebrow">SELECTED FOLDER</span>
                          <h3>${escapeHtml(selectedGroup.name)}</h3>
                          <p>${selectedGroup.items.length} 个文件 · ${formatBytes(selectedGroup.items.reduce((sum, item) => sum + (Number(item.size) || 0), 0))}</p>
                        </div>
                      </header>
                      <div class="experiment-file-list" role="group">
                        ${selectedGroup.items
                          .map(
                            (item) => `
                              <article class="experiment-file ${state.experimentDraggingId === item.id ? 'is-dragging' : ''} ${state.experimentMovingId === item.id ? 'is-moving' : ''}" data-experiment-id="${escapeHtml(item.id)}" draggable="${state.experimentMovingId === item.id ? 'false' : 'true'}" title="拖动到左侧课程文件夹可直接移动">
                                <span class="file-sigil tone-${fileTone(item.originalName)}">
                                  <i data-lucide="${fileIconName(item.originalName)}"></i>
                                  <span>${escapeHtml(fileExtensionLabel(item.originalName))}</span>
                                </span>
                                <div class="experiment-file-copy">
                                  <strong title="${escapeHtml(item.title)}">${escapeHtml(item.title)}</strong>
                                  <span>${escapeHtml(item.originalName)} · ${formatBytes(item.size)} · ${formatTime(item.modifiedAt || item.importedAt)}</span>
                                </div>
                                <div class="experiment-file-actions">
                                  <button class="icon-button compact" type="button" data-action="open-experiment-file" data-id="${escapeHtml(item.id)}" data-tooltip="打开文件" aria-label="打开文件" ${state.experimentMovingId === item.id ? 'disabled' : ''}>
                                    <i data-lucide="external-link"></i>
                                  </button>
                                  <button class="icon-button compact" type="button" data-action="reveal-experiment-file" data-id="${escapeHtml(item.id)}" data-tooltip="在文件夹中显示" aria-label="在文件夹中显示" ${state.experimentMovingId === item.id ? 'disabled' : ''}>
                                    <i data-lucide="locate-fixed"></i>
                                  </button>
                                  <button class="icon-button compact" type="button" data-action="edit-experiment-group" data-id="${escapeHtml(item.id)}" data-tooltip="移动到其他课程文件夹" aria-label="移动到其他课程文件夹" ${state.experimentMovingId === item.id ? 'disabled' : ''}>
                                    <i data-lucide="${state.experimentMovingId === item.id ? 'loader-circle' : 'folder-pen'}"></i>
                                  </button>
                                  <button class="icon-button compact danger" type="button" data-action="delete-experiment" data-id="${escapeHtml(item.id)}" data-tooltip="从工作站移除记录" aria-label="从工作站移除记录" ${state.experimentMovingId === item.id ? 'disabled' : ''}>
                                    <i data-lucide="trash-2"></i>
                                  </button>
                                </div>
                              </article>`,
                          )
                          .join('')}
                      </div>`
                    : `<div class="empty-state experiment-group-empty">
                        <i data-lucide="folder-plus"></i>
                        <span>这个资料库还是空的。把文件拖到这里，或使用上方“选择文件”。</span>
                      </div>`
                }
              </section>
            </div>`
          : `<div class="empty-state experiment-empty">
              <i data-lucide="file-stack"></i>
              <span>还没有资料库。新建一个资料库后，把文件直接拖到它上面即可归档。</span>
            </div>`
      }
    `
  }

  return { renderPage }
}
