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
    model: 'deepseek-chat',
    supportsVision: false,
  },
  {
    id: 'deepseek-flash',
    label: 'DeepSeek V4.1 Flash（视觉）',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-flash',
    supportsVision: true,
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    model: '',
    supportsVision: false,
  },
  {
    id: 'kimi',
    label: 'Kimi / Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: '',
    supportsVision: false,
  },
  {
    id: 'doubao',
    label: '字节豆包 / 火山方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    model: '',
    supportsVision: false,
  },
  {
    id: 'qianfan',
    label: '百度千帆',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    model: '',
    supportsVision: false,
  },
  {
    id: 'hunyuan',
    label: '腾讯混元',
    baseUrl: 'https://api.hunyuan.cloud.tencent.com/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'spark',
    label: '讯飞星火',
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimaxi.com/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'baichuan',
    label: '百川智能',
    baseUrl: 'https://api.baichuan-ai.com/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'yi',
    label: '零一万物 Yi',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'stepfun',
    label: '阶跃星辰 StepFun',
    baseUrl: 'https://api.stepfun.com/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'sensenova',
    label: '商汤日日新',
    baseUrl: 'https://api.sensenova.cn/compatible-mode/v2',
    model: '',
    supportsVision: false,
  },
  {
    id: 'siliconflow',
    label: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'openrouter',
    label: 'OpenRouter（聚合）',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'groq',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'mistral',
    label: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'xai',
    label: 'xAI Grok',
    baseUrl: 'https://api.x.ai/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'together',
    label: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'fireworks',
    label: 'Fireworks AI',
    baseUrl: 'https://api.fireworks.ai/inference/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'perplexity',
    label: 'Perplexity',
    baseUrl: 'https://api.perplexity.ai',
    model: '',
    supportsVision: false,
  },
  {
    id: 'cohere',
    label: 'Cohere',
    baseUrl: 'https://api.cohere.ai/compatibility/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    baseUrl: 'https://router.huggingface.co/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'github-models',
    label: 'GitHub Models',
    baseUrl: 'https://models.inference.ai.azure.com',
    model: '',
    supportsVision: false,
  },
  {
    id: 'ollama',
    label: 'Ollama（本机）',
    baseUrl: 'http://127.0.0.1:11434/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio（本机）',
    baseUrl: 'http://127.0.0.1:1234/v1',
    model: '',
    supportsVision: false,
  },
  {
    id: 'custom',
    label: '自定义 OpenAI Compatible',
    baseUrl: '',
    model: '',
    supportsVision: false,
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
            <small class="setting-hint">预设只填接口地址；模型 ID 和视觉能力请按账号实际可用模型填写。</small>
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
                          <button class="icon-button compact" type="button" data-action="edit-ai-profile" data-id="${escapeHtml(profile.id)}" title="编辑模型">
                            <i data-lucide="pencil"></i>
                          </button>
                          <button class="icon-button compact danger" type="button" data-action="delete-ai-profile" data-id="${escapeHtml(profile.id)}" title="删除模型">
                            <i data-lucide="trash-2"></i>
                          </button>
                        </div>
                      </div>
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
    const visionInput = document.querySelector('#aiProfileSupportsVision')
    if (labelInput) labelInput.value = preset.label
    if (baseUrlInput) baseUrlInput.value = preset.baseUrl
    if (modelInput) {
      modelInput.value = preset.model
      modelInput.placeholder = preset.model
        ? '例如：deepseek-chat'
        : `输入 ${preset.label} 的模型 ID`
    }
    if (visionInput) visionInput.checked = Boolean(preset.supportsVision)
  }

  /** 返回 true 表示这个动作属于模型配置页，main.js 不再处理。 */
  async function handleAction(action, element) {
    switch (action) {
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
