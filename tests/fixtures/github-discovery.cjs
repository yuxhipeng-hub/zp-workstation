const captured = '2026-11-06T10:00:00.000Z'
function gitstock(period = 'weekly', at = captured) {
  return {
    date: at.slice(0, 10),
    period,
    timezone: 'UTC',
    items: [
      {
        rank: 1,
        owner: 'example',
        repo: 'research-tool',
        description: '用于整理资料的开源工具。',
        language: 'Python',
        stars: 12345,
        forks: 210,
        stars_gained: 1250,
        captured_at: Date.parse(at) / 1000,
        github_url: 'https://evil.invalid/ignored',
      },
      {
        rank: 2,
        owner: 'example',
        repo: 'design-kit',
        description:
          '<img src=x onerror=alert(1)> A design toolkit ' + 'long description '.repeat(12),
        language: 'TypeScript',
        stars: 7800,
        forks: 100,
        stars_gained: 460,
        captured_at: Date.parse(at) / 1000,
      },
    ],
  }
}
function archive(at = '2026-11-06 19:00:00 +0800') {
  return (
    '# github-hot-hub\n`更新时间：' +
    at +
    '`\n' +
    [
      ['今日热门仓库', 'today'],
      ['近一周热门仓库', 'this week'],
      ['近一月热门仓库', 'this month'],
    ]
      .map(
        ([title, suffix]) =>
          `## ${title}\n\n1. [example / backup](https://github.com/example/backup)\n    - Backup project description\n    - language: **Rust** &nbsp;&nbsp; stars: **8,100** &nbsp;&nbsp; folks: **90** &nbsp;&nbsp; \`510 stars ${suffix}\`\n\n1. [example / second](https://github.com/example/second)\n    - Second project\n    - language: **Go** &nbsp;&nbsp; stars: **1,020** &nbsp;&nbsp; folks: **12** &nbsp;&nbsp; \`20 stars ${suffix}\`\n`,
      )
      .join('\n')
  )
}
module.exports = { captured, gitstock, archive }
