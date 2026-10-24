/**
 * 指南页（帮助 → 指南）。
 *
 * 渲染层拆分阶段三。只迁教程、常见问题和 Ruka 说明段落。
 */

export function createGuidePage({ escapeHtml, guideProgress, guideActionButton }) {
  function renderRukaGuide() {
    return `
    <section class="guide-section ruka-guide">
      <div class="ai-concept-board">
        <div class="ai-board-head">
          <div>
            <span class="eyebrow">AI 基础概念</span>
            <h3>先分清五个角色，再看懂一次请求是怎么完成的</h3>
          </div>
          <p><strong>最短理解：</strong>你提出目标；客户端接收操作；Agent 拆解并执行；大模型负责推理生成；API、Key、Token 分别负责连接、身份和用量。</p>
        </div>

        <div class="ai-system-map" aria-label="AI 工作流程">
          <article class="ai-system-step">
            <span>01</span>
            <i data-lucide="user-round"></i>
            <div>
              <strong>你</strong>
              <p>说明目标、补充材料和限制，最后判断结果是否可信。你操作的是客户端，不会直接操作模型。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>02</span>
            <i data-lucide="panels-top-left"></i>
            <div>
              <strong>客户端</strong>
              <p>Codex 桌面版、Codex CLI、豆包桌面版等。它是你看见并操作的界面，不等于模型本身。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>03</span>
            <i data-lucide="bot"></i>
            <div>
              <strong>Agent 执行代理</strong>
              <p>Codex、DSH 等会理解任务、拆步骤、读写文件、调用工具，再检查结果。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>04</span>
            <i data-lucide="brain-circuit"></i>
            <div>
              <strong>大模型</strong>
              <p>GPT、DeepSeek、通义千问等负责理解、推理和生成内容。模型本身不会直接操作你的文件。</p>
            </div>
          </article>
          <article class="ai-system-step">
            <span>05</span>
            <i data-lucide="file-check-2"></i>
            <div>
              <strong>API 连接层</strong>
              <p>让客户端或 Agent 调用模型服务。API 是连接通道，不是模型，也不是桌面应用。</p>
            </div>
          </article>
        </div>

        <div class="ai-concept-strip">
          <article>
            <span>API Key</span>
            <strong>身份与计费凭证</strong>
            <p>告诉服务方是谁在调用、费用记到哪个账号。它是凭证，不是模型，也不能公开分享。</p>
          </article>
          <article>
            <span>Token</span>
            <strong>调用量与价格刻度</strong>
            <p>模型读写的文字会被切成 Token。输入、输出、上下文长度和价格通常都按它计算。</p>
          </article>
          <article>
            <span>桌面 AI 应用</span>
            <strong>打包好的完整产品</strong>
            <p>ChatGPT、豆包、DeepSeek 桌面版把界面、账号、模型调用和附加功能整合在一起。它不是可以塞进 Codex 的模型文件。</p>
          </article>
        </div>

        <p class="ai-flow-example">
          <strong>实际例子：</strong>你在 Codex 中输入“整理这份 PDF” → Codex 作为客户端接收任务 → Agent 读取文件并拆解步骤 → 通过 API 请求 GPT 或 DeepSeek → 大模型返回推理结果 → Agent 写入整理后的内容 → 你检查并确认。
        </p>
      </div>

      <section class="ruka-topic-section ruka-topic-reference">
        <div class="ruka-topic-head">
          <div>
            <span class="eyebrow">NETWORK &amp; EXTENSIONS</span>
            <h3>网络、代理与 Skills</h3>
          </div>
          <p>这部分只解释通用原理和安全边界：VPN 不是万能解，Clash Verge 需要订阅，Skill 也不会绕过账号、API 或网络限制。</p>
        </div>
        <div class="ruka-accordion ruka-topic-accordion">
        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">02</span>
            <span><strong>VPN 是什么</strong><small>只介绍原理和使用方式，不推荐任何服务</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p>VPN 会把设备网络流量先送到另一个服务器，再由服务器访问目标网站。它可能改变出口 IP、加密设备到 VPN 服务器之间的一段连接，但不等于匿名，也不保证更快或更安全。</p>
            <div class="ruka-compare">
              <div><strong>学校或公司 VPN</strong><span>通常用于访问内网资源。账号由组织提供，是否允许访问外部服务由组织策略决定。</span></div>
              <div><strong>商业 VPN</strong><span>客户端连接供应商服务器，关注隐私政策、日志、付款、退款和独立审计情况。</span></div>
              <div><strong>远程主机</strong><span>把任务放到远程 Windows 或 Linux 主机执行，本机只负责远程桌面或终端连接。</span></div>
              <div><strong>代理客户端</strong><span>Clash Verge 等工具负责管理节点和分流规则，需要自己提供订阅或配置，不会自带可用节点。</span></div>
            </div>
            <p class="ruka-note">VPN 只能解决部分网络路径问题。登录失败、API 401、余额不足、账号额度受限和程序配置错误，不会因为开启 VPN 自动恢复。不同地区对网络工具有不同法律和使用要求，请自行确认并只用于合规用途。</p>
          </div>
        </details>

        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">03</span>
            <span><strong>机场与 Clash Verge 使用</strong><small>订阅导入、节点、模式和系统代理</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p>“机场”是中文网络里对订阅式代理服务的常见叫法。用户购买或获得一条订阅链接，客户端读取节点列表，再根据规则把不同流量发送到不同节点。机场不是 Clash Verge 自带的，Clash Verge 只是客户端。</p>
            <ol class="ruka-steps">
              <li><strong>获取订阅。</strong>服务方会提供订阅 URL、YAML 配置或二维码。订阅 URL 通常带有身份令牌，泄露后别人可能直接消耗你的流量。</li>
              <li><strong>安装客户端。</strong>从 Clash Verge Rev 官方仓库下载 Windows 安装包，不要使用网盘转载、二次打包或要求关闭杀毒软件的版本。</li>
              <li><strong>导入订阅。</strong>打开 <code>订阅 / Profiles</code>，点击新建或导入，粘贴订阅 URL，保存后更新一次配置。</li>
              <li><strong>选择节点。</strong>进入 <code>代理 / Proxies</code>，先测延迟，再选择可用节点。名称、地区或延迟都不能代表真实安全性和稳定性。</li>
              <li><strong>选择模式。</strong><code>规则模式</code>按配置自动分流，日常优先；<code>全局模式</code>会让全部流量走代理，只适合临时排查；<code>直连模式</code>不使用代理。</li>
              <li><strong>开启系统代理。</strong>先使用 <code>系统代理</code>。只有应用不读取系统代理且确认配置正确时，再考虑 <code>TUN 模式</code>，它需要更高网络权限，也更容易影响本机连接。</li>
              <li><strong>让程序重新读取网络。</strong>开启代理后重启 Codex、终端或编辑器。已经运行的进程可能保留旧网络状态。</li>
              <li><strong>使用后检查。</strong>不需要时关闭系统代理或退出客户端，确认浏览器、商店和应用网络恢复正常。</li>
            </ol>
            <div class="ruka-links">
              <button class="button secondary" type="button" data-url="https://github.com/clash-verge-rev/clash-verge-rev/releases">
                <i data-lucide="code-xml"></i><span>Clash Verge 官方 Releases</span>
              </button>
            </div>
            <p class="ruka-note">机场和 VPN 都不是无风险的。订阅提供方可以看到部分连接元数据；免费节点可能记录、篡改或注入内容；未知安装包可能要求安装根证书或长期后台权限。不要在不信任的网络上处理账号和 API Key，不要分享订阅链接，也不要使用来源不明的机场提供的修改版客户端。</p>
          </div>
        </details>

        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">04</span>
            <span><strong>Skills 与插件</strong><small>安装、调用、检查和安全边界</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <p>Skill 是告诉 agent「遇到什么任务、按什么步骤做」的可复用工作流。Plugin 通常是一个更大的安装包，里面可以包含 Skill、工具、命令、配置或其他资源。</p>
            <ol class="ruka-steps">
              <li>从可信 GitHub 仓库下载 Skill，先阅读 <code>SKILL.md</code>。</li>
              <li>把 Skill 文件夹放入 <code>%USERPROFILE%\\.codex\\skills</code>，或者在 Codex 中按当前版本支持的方式安装插件。</li>
              <li>重启 Codex，使用 <code>$skill-name</code> 或直接描述任务来调用。</li>
              <li>在 Codex 里让 agent 列出当前可用的 Skill，确认本地实际识别结果。</li>
              <li>安装前检查脚本、网络请求、环境变量和文件访问范围。要求读取密钥、上传整个目录或执行未知 PowerShell 的 Skill 默认不要运行。</li>
            </ol>
            <div class="ruka-code"><code># 查看本地已有插件
codex plugin list</code></div>
            <p class="ruka-note">Skill 不是模型本身，也不能绕过账号、API 或网络限制。它只是让 agent 使用一套更稳定的工作方法。</p>
          </div>
        </details>

        <details class="ruka-route-shared">
          <summary>
            <span class="ruka-index">05</span>
            <span><strong>常见问题</strong><small>安装、登录、API、网络和 Skill 不生效</small></span>
            <i data-lucide="chevron-down"></i>
          </summary>
          <div class="ruka-body">
            <ul class="ruka-checks">
              <li><strong>微软商店搜不到：</strong>确认商店地区、系统版本和发行方，不要先安装同名的第三方应用。</li>
              <li><strong>登录一直转圈：</strong>先检查浏览器能否完成登录，再检查系统代理；代理变更后重启 Codex。</li>
              <li><strong>API 返回 401：</strong>通常是 Key 错误、已撤销、账户无权限或填到了另一套服务。重新创建并确认配置位置。</li>
              <li><strong>浏览器能访问但 Codex 不行：</strong>终端和应用可能没有读取系统代理。重启应用，或在支持时使用 TUN 模式做隔离测试。</li>
              <li><strong>Skill 不显示：</strong>检查目录是否正确、文件名是否为 <code>SKILL.md</code>、frontmatter 是否合法，然后重启 Codex。</li>
              <li><strong>更新后异常：</strong>先运行 <code>codex doctor</code>；仍无法恢复时查看官方发行说明，不要用未知补丁覆盖安装目录。</li>
            </ul>
          </div>
        </details>
      </div>
      </section>
    </section>
  `
  }

  function renderPage() {
    const { steps, done, total, percent } = guideProgress()
    const features = [
      ['sunrise', '今日', '当天课程、待交作业和最近资料。'],
      ['calendar-days', '课表', '拖入课表文件自动生成周视图，支持单双周。'],
      ['list-todo', '作业收件箱', '零碎作业集中记录，一键生成处理提示词。'],
      ['folder-open', '资料库', '任意文件按课程自动归档，像 Windows 文件夹一样展开。'],
    ]
    return `
    <section class="guide-hero">
      <div>
        <span class="eyebrow">GETTING STARTED</span>
        <h2>指南</h2>
        <p>ZP Workbench 是一个本地学习工作站。它不替你写作业，而是把课程、作业和资料归到一处，再把需要动脑的部分整理成可复制的提示词。</p>
      </div>
      <div class="guide-progress">
        <strong>${done} / ${total}</strong>
        <span>配置完成度</span>
        <div class="guide-progress-bar"><i style="--progress:${Math.max(0, Math.min(1, percent / 100))}"></i></div>
      </div>
    </section>

    <section class="guide-section">
      <div class="guide-section-head">
        <h3>它能做什么</h3>
        <p>左侧导航按「学习 / 资讯 / 系统 / 帮助」四组排列，日常用得最多的是学习这一组。</p>
      </div>
      <div class="guide-feature-grid">
        ${features
          .map(
            ([icon, title, body]) => `
            <article class="guide-feature">
              <i data-lucide="${icon}"></i>
              <strong>${escapeHtml(title)}</strong>
              <span>${escapeHtml(body)}</span>
            </article>`,
          )
          .join('')}
      </div>
    </section>

    <section class="guide-section">
      <div class="guide-section-head">
        <h3>第一次使用，按这个顺序</h3>
        <p>完成一项会自动打勾。教程不拦着你用软件，随时可以跳过去做别的事。</p>
      </div>
      <ol class="guide-steps">
        ${steps
          .map(
            (step, index) => `
            <li class="guide-step ${step.done ? 'is-done' : ''}">
              <span class="guide-step-mark">${step.done ? '<i data-lucide="check"></i>' : index + 1}</span>
              <div class="guide-step-copy">
                <strong>${escapeHtml(step.title)}</strong>
                <p>${escapeHtml(step.body)}</p>
              </div>
              <div class="guide-step-actions">
                ${guideActionButton(step.action)}
                ${
                  step.manual
                    ? `<button class="text-button" type="button" data-action="complete-guide-step" data-id="${escapeHtml(step.id)}">${step.done ? '标记未完成' : '标记完成'}</button>`
                    : ''
                }
              </div>
            </li>`,
          )
          .join('')}
      </ol>
    </section>

    <section class="guide-section">
      <div class="guide-section-head">
        <h3>常见疑问</h3>
        <p>几个第一次使用一定会问的问题。</p>
      </div>
      <div class="guide-faq">
        <details>
          <summary>我的数据存在哪里？</summary>
          <p>全部在本机。设置页可以直接打开资料库和日志目录，也能导出整套快照。</p>
        </details>
        <details>
          <summary>API 密钥会被工作站读取吗？</summary>
          <p>不会。工作站不读取 DeepSeek 的模型密钥，那部分由官方桌面端自己管理；导入资料时的课程分类在本机完成。</p>
        </details>
        <details>
          <summary>资料库会移动我的原文件吗？</summary>
          <p>首次导入是把文件复制进资料库目录，原文件保留在原处；之后在资料库里改课程分组，才会移动资料库中的副本。</p>
        </details>
      </div>
    </section>

    ${renderRukaGuide()}

    <div class="guide-foot">
      <button class="button secondary" type="button" data-action="replay-welcome">
        <i data-lucide="sparkles"></i><span>重新查看欢迎页</span>
      </button>
      <button class="button secondary" type="button" data-action="reset-guide">
        <i data-lucide="rotate-ccw"></i><span>重置教程进度</span>
      </button>
    </div>
  `
  }

  return { renderPage }
}
