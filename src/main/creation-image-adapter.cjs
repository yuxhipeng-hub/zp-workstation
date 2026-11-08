// 图片制作与导演会话分开。生产默认只接受已授权导入的真实文件。
// 未来服务必须实现独立费用预览/授权和文件校验，不能用文字结果冒充图片。
class ManualImageAdapter {
  capabilities() {
    return {
      id: 'manual-import',
      generation: 'unavailable',
      editing: 'external',
      files: 'explicit-project-artifacts',
      billing: 'external-unknown',
    }
  }
  async generate() {
    throw new Error(
      '当前没有已验证的自动生图服务。请在外部生图工具完成制作后导入真实图片；费用由该工具单独收取。',
    )
  }
}
module.exports = { ManualImageAdapter }
