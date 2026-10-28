/**
 * 模型配置页（系统 → 模型配置）。
 *
 * 从 `main.js` 拆出的第一个页面模块，用来确立后续页面拆分的模式：
 * - 页面自己负责渲染、表单采集和页面级动作；
 * - 共享状态、`render()`、`toast()`、`api` 由 `main.js` 注入，不直接依赖全局；
 * - 拆分只做搬移，不改变 DOM 结构、类名和行为。
 */

export const AI_PROVIDER_PRESETS = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    supportsVision: true,
  },
  {
    id: 'kimi',
    label: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: '',
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: '',
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: '',
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
  },
  {
    id: 'ollama',
    label: 'Ollama（本机）',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: '',
  },
  {
    id: 'custom',
    label: '自定义 OpenAI Compatible',
    baseUrl: '',
    model: '',
  },
]

export function createModelSettingsPage({
  state,
  api,
  escapeHtml,
  render,
  toast,
  aiProfiles,
  activeAiProfile,
  aiProtocolLabel,
}) {
  const visionResults = new Map()
  const verifiedProfiles = new Set()
  function renderProfileEditor() {
    if (!state.aiProfileEditorOpen) return ''
    const editing = aiProfiles().find((profile) => profile.id === state.aiEditingProfileId)
    return `
      <form class="ai-profile-editor" id="aiProfileForm">
        <div class="ai-profile-editor-head">
          <div>
            <strong>${editing ? '编辑模型配置' : '添加模型配置'}</strong>
            <span>Key 只保存在 Windows 安全凭据存储中，不会进入工作区或备份。</span>
          </div>
          <button class="icon-button compact" type="button" data-action="close-ai-profile" title="关闭">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="ai-profile-fields">
          <label class="field">
            <span>服务商预设</span>
            <select id="aiProfilePreset">
              ${AI_PROVIDER_PRESETS.map(
                (preset) =>
                  `<option value="${escapeHtml(preset.id)}" ${preset.id === 'custom' ? 'selected' : ''}>${escapeHtml(preset.label)}</option>`,
              ).join('')}
            </select>
          </label>
          <label class="field">
            <span>显示名称</span>
            <input id="aiProfileLabel" type="text" maxlength="80" required value="${escapeHtml(editing?.label || '')}" placeholder="例如：DeepSeek 主模型" />
          </label>
          <label class="field ai-profile-field-wide">
            <span>Base URL</span>
            <input id="aiProfileBaseUrl" type="url" maxlength="2048" required value="${escapeHtml(editing?.baseUrl || '')}" placeholder="https://api.example.com/v1" />
          </label>
          <label class="field">
            <span>模型 ID</span>
            <input id="aiProfileModel" type="text" maxlength="160" required value="${escapeHtml(editing?.model || '')}" placeholder="例如：deepseek-chat" />
          </label>
          <label class="field">
            <span>API Key</span>
            <input id="aiProfileApiKey" type="password" maxlength="4096" autocomplete="off" placeholder="${editing?.hasKey ? '已保存，留空保持不变' : '输入 API Key；本机模型可留空'}" />
          </label>
        </div>
        <details class="ai-advanced-settings">
          <summary>
            <span class="ai-advanced-icon"><i data-lucide="sliders-horizontal"></i></span>
            <span class="ai-advanced-copy">
              <strong>高级模型设置</strong>
              <small>控制调用协议、上下文长度、输出预算、推理强度和请求头。</small>
            </span>
            <span class="ai-advanced-toggle">
              <span>可选配置</span>
              <i data-lucide="chevron-down"></i>
            </span>
          </summary>
          <div class="ai-advanced-content">
            <div class="ai-advanced-section-head">
              <strong>调用参数</strong>
              <span>用于控制请求方式和模型的输出范围。</span>
            </div>
            <div class="ai-profile-fields">
              <label class="field">
                <span>API 协议</span>
                <select id="aiProfileProtocol">
                  <option value="chat-completions" ${editing?.protocol !== 'responses' ? 'selected' : ''}>Chat Completions</option>
                  <option value="responses" ${editing?.protocol === 'responses' ? 'selected' : ''}>Responses API</option>
                </select>
              </label>
              <label class="field">
                <span>请求超时（秒）</span>
                <input id="aiProfileTimeout" type="number" min="5" max="300" step="1" value="${Math.round((editing?.timeoutMs || 90000) / 1000)}" />
              </label>
              <label class="field">
                <span>上下文窗口（tokens）</span>
                <input id="aiProfileContextWindow" type="number" min="0" max="10000000" step="1024" value="${editing?.contextWindow || 0}" />
              </label>
              <label class="field">
                <span>默认最大输出（tokens）</span>
                <input id="aiProfileMaxOutput" type="number" min="64" max="100000" step="1" value="${editing?.maxOutputTokens || 1800}" />
              </label>
              <label class="field">
                <span>温度</span>
                <input id="aiProfileTemperature" type="number" min="0" max="2" step="0.1" value="${editing?.temperature ?? 0.2}" />
              </label>
              <label class="field">
                <span>推理强度</span>
                <select id="aiProfileReasoningEffort">
                  <option value="" ${!editing?.reasoningEffort ? 'selected' : ''}>默认</option>
                  <option value="low" ${editing?.reasoningEffort === 'low' ? 'selected' : ''}>低</option>
                  <option value="medium" ${editing?.reasoningEffort === 'medium' ? 'selected' : ''}>中</option>
                  <option value="high" ${editing?.reasoningEffort === 'high' ? 'selected' : ''}>高</option>
                </select>
              </label>
              <label class="field ai-profile-field-wide">
                <span>附加请求头（JSON）</span>
                <textarea id="aiProfileHeaders" rows="3" spellcheck="false" placeholder='{"HTTP-Referer":"https://example.com"}'>${escapeHtml(JSON.stringify(editing?.headers || {}, null, 2))}</textarea>
                <small>用于 OpenRouter 等服务的追踪头；密钥请只填写在上方 API Key 字段。</small>
              </label>
            </div>
            <div class="ai-advanced-section-head">
              <strong>能力声明</strong>
              <span>仅用于标记模型能力，不会改变服务商的账户权限。</span>
            </div>
            <div class="ai-capability-row">
              <label><input id="aiProfileSupportsTools" type="checkbox" ${editing?.supportsTools ? 'checked' : ''} /><span>支持工具调用</span></label>
              <label><input id="aiProfileSupportsVision" type="checkbox" ${editing?.supportsVision ? 'checked' : ''} /><span>支持视觉输入</span></label>
            </div>
          </div>
        </details>
        ${
          editing?.hasKey
            ? `<label class="ai-clear-key">
                <input id="aiProfileClearKey" type="checkbox" />
                <span>删除当前已保存的 API Key</span>
              </label>`
            : ''
        }
        <div class="button-row ai-profile-editor-actions">
          <button class="button secondary" type="button" data-action="close-ai-profile">取消</button>
          <button class="button primary" type="button" data-action="save-ai-profile">
            <i data-lucide="check"></i><span>保存模型</span>
          </button>
        </div>
      </form>
    `
  }

  function renderSettingsGroup() {
    const profiles = aiProfiles()
    const active = activeAiProfile()
    return `
      <div class="settings-group settings-group-wide" id="aiSettingsGroup">
        <div class="settings-group-head">
          <h2>模型档案</h2>
          <p>每个档案对应一个模型。Key 与配置分离保存，作业只发送你确认后的字段。</p>
        </div>
        ${
          profiles.length
            ? `<div class="ai-profile-list">
                ${profiles
                  .map((profile) => {
                    const isActive = profile.id === active?.id
                    const keyLabel = profile.hasKey
                      ? 'Key 已保存'
                      : !profile.requiresKey
                        ? '本机免 Key'
                        : '缺少 Key'
                    return `
                      <div class="ai-profile-row ${isActive ? 'is-active' : ''}">
                        <button class="ai-profile-select" type="button" data-action="activate-ai-profile" data-id="${escapeHtml(profile.id)}" title="${isActive ? '当前模型' : '设为当前模型'}">
                          <span class="ai-profile-dot"><i data-lucide="${isActive ? 'check' : 'server'}"></i></span>
                          <span class="ai-profile-copy">
                            <strong>${escapeHtml(profile.label)}</strong>
                            <small>${escapeHtml(profile.model)} · ${escapeHtml(aiProtocolLabel(profile.protocol))} · ${escapeHtml(profile.baseUrl)}</small>
                          </span>
                          <span class="badge ${profile.hasKey || !profile.requiresKey ? 'info' : 'danger'}">${keyLabel}</span>
                        </button>
                        <div class="ai-profile-actions">
                          <button class="icon-button compact" type="button" data-action="test-ai-profile" data-id="${escapeHtml(profile.id)}" title="测试连接">
                            <i data-lucide="plug-zap"></i>
                          </button>
                          <button class="icon-button compact" type="button" data-action="test-vision-profile" data-id="${escapeHtml(profile.id)}" title="测试图片识别" aria-label="测试图片识别" ${visionResults.get(profile.id)?.startsWith('正在') ? 'disabled aria-busy="true"' : ''}>
                            <i data-lucide="scan-eye"></i>
                          </button>
                          <button class="icon-button compact" type="button" data-action="edit-ai-profile" data-id="${escapeHtml(profile.id)}" title="编辑模型">
                            <i data-lucide="pencil"></i>
                          </button>
                          <button class="icon-button compact danger" type="button" data-action="delete-ai-profile" data-id="${escapeHtml(profile.id)}" title="删除模型">
                            <i data-lucide="trash-2"></i>
                          </button>
                        </div>
                      </div>
                      ${visionResults.has(profile.id) ? `<p class="setting-hint" role="status">${escapeHtml(visionResults.get(profile.id))}</p>${verifiedProfiles.has(profile.id) ? `<button type="button" class="button secondary" data-action="use-tested-vision-profile" data-id="${escapeHtml(profile.id)}">用于 PPT 视觉检查</button>` : ''}` : ''}
                    `
                  })
                  .join('')}
              </div>`
            : '<div class="ai-profile-empty"><i data-lucide="key-round"></i><span>还没有模型配置。点击右上角“添加模型”开始配置。</span></div>'
        }
        ${
          active
            ? `<p class="setting-hint ai-profile-summary">当前：${escapeHtml(active.label)} · ${escapeHtml(active.model)} · ${escapeHtml(aiProtocolLabel(active.protocol))}${active.hasKey || !active.requiresKey ? '' : ' · 请补充 API Key'}</p>`
            : ''
        }
        <div class="settings-group-head"><h2>PPT 视觉模型</h2><p>用于图片理解和页面视觉检查。检查会把本次作品的页面截图发送给所选模型，默认文字模型继续负责内容策划。</p></div>
        <label class="field"><span>视觉模型</span><select id="pptVisionProfile"><option value="">暂不启用</option>${profiles
          .filter((p) => p.supportsVision)
          .map(
            (p) =>
              `<option value="${escapeHtml(p.id)}" ${state.aiConfig?.visionProfileId === p.id ? 'selected' : ''}>${escapeHtml(p.label)} · ${escapeHtml(p.model)}</option>`,
          )
          .join('')}</select></label>
        <p class="setting-hint">先在模型编辑中的「能力声明」勾选支持视觉输入，再用眼睛图标实际测试图片识别。声明不等于验证通过。</p>
        <button type="button" class="button secondary" data-action="save-vision-profile">保存 PPT 视觉模型</button>
        ${renderProfileEditor()}
      </div>
    `
  }

  function renderPage() {
    const profiles = aiProfiles()
    const active = activeAiProfile()
    const activeReady = Boolean(active && (active.hasKey || !active.requiresKey))
    return `
      <section class="page-intro action-intro">
        <div>
          <h2>模型配置</h2>
          <p>管理 OpenAI Compatible 模型服务、API Key、调用协议和能力参数。作业拆解始终使用当前启用的模型。</p>
        </div>
        <button class="button primary" type="button" data-action="open-ai-profile">
          <i data-lucide="plus"></i><span>添加模型</span>
        </button>
      </section>

      <div class="workspace-metrics ai-model-metrics">
        <div><span>模型档案</span><strong>${profiles.length}</strong></div>
        <div><span>当前模型</span><strong>${escapeHtml(active?.label || '未配置')}</strong></div>
        <div><span>API 协议</span><strong>${escapeHtml(active ? aiProtocolLabel(active.protocol) : '--')}</strong></div>
        <div><span>连接状态</span><strong>${active ? (activeReady ? '可调用' : '缺少 Key') : '未配置'}</strong></div>
      </div>

      ${renderSettingsGroup()}
    `
  }

  function collectInput() {
    let headers = {}
    const headersValue = document.querySelector('#aiProfileHeaders')?.value?.trim() || '{}'
    try {
      headers = JSON.parse(headersValue)
    } catch {
      throw new Error('附加请求头必须是有效的 JSON 对象。')
    }
    return {
      profile: {
        id: state.aiEditingProfileId || undefined,
        label: document.querySelector('#aiProfileLabel')?.value || '',
        baseUrl: document.querySelector('#aiProfileBaseUrl')?.value || '',
        model: document.querySelector('#aiProfileModel')?.value || '',
        protocol: document.querySelector('#aiProfileProtocol')?.value || 'chat-completions',
        timeoutMs: Number(document.querySelector('#aiProfileTimeout')?.value || 90) * 1000,
        contextWindow: Number(document.querySelector('#aiProfileContextWindow')?.value || 0),
        maxOutputTokens: Number(document.querySelector('#aiProfileMaxOutput')?.value || 1800),
        temperature: Number(document.querySelector('#aiProfileTemperature')?.value ?? 0.2),
        reasoningEffort: document.querySelector('#aiProfileReasoningEffort')?.value || '',
        supportsTools: Boolean(document.querySelector('#aiProfileSupportsTools')?.checked),
        supportsVision: Boolean(document.querySelector('#aiProfileSupportsVision')?.checked),
        headers,
      },
      apiKey: document.querySelector('#aiProfileApiKey')?.value || '',
      clearKey: Boolean(document.querySelector('#aiProfileClearKey')?.checked),
    }
  }

  function applyPreset(select) {
    const preset = AI_PROVIDER_PRESETS.find((item) => item.id === select.value)
    if (!preset || preset.id === 'custom') return
    const labelInput = document.querySelector('#aiProfileLabel')
    const baseUrlInput = document.querySelector('#aiProfileBaseUrl')
    const modelInput = document.querySelector('#aiProfileModel')
    if (labelInput) labelInput.value = preset.label
    if (baseUrlInput) baseUrlInput.value = preset.baseUrl
    if (modelInput) {
      modelInput.value = preset.model
      modelInput.placeholder = preset.model
        ? '例如：deepseek-chat'
        : `输入 ${preset.label} 的模型 ID`
    }
    const visionInput = document.querySelector('#aiProfileSupportsVision')
    if (visionInput) visionInput.checked = Boolean(preset.supportsVision)
  }

  /** 返回 true 表示这个动作属于模型配置页，main.js 不再处理。 */
  async function handleAction(action, element) {
    switch (action) {
      case 'use-tested-vision-profile': {
        const profile = aiProfiles().find((p) => p.id === element.dataset.id)
        if (!profile || !verifiedProfiles.has(profile.id))
          throw new Error('请先完成这个模型的识图测试。')
        state.aiConfig = await api.saveAiProfile({ ...profile, supportsVision: true }, '', false)
        state.aiConfig = await api.setVisionProfile(profile.id)
        render()
        toast('已将通过识图测试的模型用于 PPT 视觉检查。', 'success')
        break
      }
      case 'save-vision-profile':
        state.aiConfig = await api.setVisionProfile(
          document.querySelector('#pptVisionProfile')?.value || '',
        )
        render()
        toast('PPT 视觉模型已保存。', 'success')
        break
      case 'test-vision-profile': {
        const id = element.dataset.id
        verifiedProfiles.delete(id)
        visionResults.set(id, '正在发送两张合成测试图，验证图片识别…')
        render()
        try {
          const result = await api.testVisionProfile(id)
          if (result.passed) verifiedProfiles.add(id)
          visionResults.set(
            id,
            `${result.passed ? '识图测试通过' : '识图测试未通过'} · 配置 ${result.model} · 返回 ${result.returnedModel || '未报告模型标识'} · ${result.elapsedMs} ms。${result.message}`,
          )
        } catch (error) {
          visionResults.set(id, `识图请求失败：${error.message}`)
        }
        render()
        break
      }
      case 'open-ai-profile':
        state.aiProfileEditorOpen = true
        state.aiEditingProfileId = null
        render()
        requestAnimationFrame(() => document.querySelector('#aiProfileLabel')?.focus())
        break
      case 'edit-ai-profile':
        state.aiProfileEditorOpen = true
        state.aiEditingProfileId = element.dataset.id || null
        render()
        requestAnimationFrame(() => document.querySelector('#aiProfileLabel')?.focus())
        break
      case 'close-ai-profile':
        state.aiProfileEditorOpen = false
        state.aiEditingProfileId = null
        render()
        break
      case 'save-ai-profile': {
        const form = document.querySelector('#aiProfileForm')
        if (!form?.checkValidity()) {
          form?.reportValidity()
          break
        }
        const input = collectInput()
        visionResults.delete(input.profile.id)
        verifiedProfiles.delete(input.profile.id)
        state.aiConfig = await api.saveAiProfile(input.profile, input.apiKey, input.clearKey)
        state.aiProfileEditorOpen = false
        state.aiEditingProfileId = null
        render()
        toast('模型配置已保存。', 'success')
        break
      }
      case 'activate-ai-profile':
        state.aiConfig = await api.activateAiProfile(element.dataset.id)
        render()
        toast('已切换当前 AI 模型。', 'success')
        break
      case 'test-ai-profile': {
        const profile = aiProfiles().find((item) => item.id === element.dataset.id)
        const result = await api.testAiProfile(element.dataset.id)
        toast(`${profile?.label || '模型'} 连接成功：${result.message || 'OK'}`, 'success', 6000)
        break
      }
      case 'delete-ai-profile': {
        const profile = aiProfiles().find((item) => item.id === element.dataset.id)
        if (!profile || !window.confirm(`删除模型配置“${profile.label}”及其 API Key 吗？`)) break
        state.aiConfig = await api.deleteAiProfile(profile.id)
        if (state.aiEditingProfileId === profile.id) {
          state.aiProfileEditorOpen = false
          state.aiEditingProfileId = null
        }
        render()
        toast('模型配置已删除。', 'success')
        break
      }
      default:
        return false
    }
    return true
  }

  return { renderPage, handleAction, applyPreset }
}
