/**
 * 欢迎层（首次启动）。
 *
 * 渲染层拆分阶段三。渲染迁出，显示与关闭时机仍由 `main.js` 的 syncOnboardingOverlay 控制。
 */

export function createWelcomeOverlay({ onboardingState }) {
  function renderOverlay() {
    if (onboardingState().welcomeSeen) return ''
    return `
    <div class="welcome-layer" data-welcome-layer>
      <section class="welcome-card" role="dialog" aria-modal="true" aria-labelledby="welcomeTitle">
        <span class="welcome-eyebrow">WELCOME</span>
        <h2 id="welcomeTitle">欢迎使用 ZP Workbench</h2>
        <p class="welcome-lead">一个面向学习与知识整理的本地工作站。它把日常学习中的内容集中起来，再使用你自己配置的 AI 模型提供智能辅助。</p>
        <div class="welcome-points">
          <div>
            <i data-lucide="layout-dashboard"></i>
            <span><strong>学习管理</strong>把课程、作业和资料收拢到一个视野里。</span>
          </div>
          <div>
            <i data-lucide="folder-tree"></i>
            <span><strong>资料整理</strong>让文件、课程和知识形成清晰、可查找的本地结构。</span>
          </div>
          <div>
            <i data-lucide="sparkles"></i>
            <span><strong>智能辅助</strong>用你配置的模型拆解作业、制定计划和处理复杂任务。</span>
          </div>
          <div>
            <i data-lucide="shield-check"></i>
            <span><strong>本地掌控</strong>数据、密钥和运行环境默认保留在你自己的电脑上。</span>
          </div>
        </div>
        <p class="welcome-note">欢迎页只做概括介绍。第一次使用的配置顺序、功能说明和常见问题，都集中在左侧「帮助 → 指南」。</p>
        <div class="welcome-actions">
          <button class="button secondary" type="button" data-action="open-guide-from-welcome">查看使用指南</button>
          <button class="button primary" type="button" data-action="finish-welcome">
            <i data-lucide="arrow-right"></i><span>进入工作站</span>
          </button>
        </div>
      </section>
    </div>
  `
  }

  return { renderOverlay }
}
