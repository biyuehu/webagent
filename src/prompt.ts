import fs from 'node:fs'
import path from 'node:path'

async function resolveAgentInclude(line: string, visited: Set<string> = new Set()): Promise<string> {
  const rest = line.slice(1).trim()
  if (!rest) return ''

  if (rest === 'PRESET') {
    const presetPath = path.join(__dirname, '../AGENT.txt')
    if (visited.has(presetPath)) return ''
    visited.add(presetPath)
    if (fs.existsSync(presetPath)) return resolveAgentContent(fs.readFileSync(presetPath, 'utf-8'), visited)
    return ''
  }

  if (rest.startsWith('http://') || rest.startsWith('https://')) {
    try {
      return resolveAgentContent(await fetch(rest).then((res) => res.text()), visited)
    } catch (err) {
      throw new Error(`Failed to fetch ${rest}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const filePath = path.resolve(process.cwd(), rest)
  if (visited.has(filePath)) return ''
  visited.add(filePath)
  if (fs.existsSync(filePath)) return resolveAgentContent(fs.readFileSync(filePath, 'utf-8'), visited)
  throw new Error(`File not found: ${rest}`)
}

async function resolveAgentContent(content: string, visited: Set<string> = new Set()): Promise<string> {
  const result: string[] = []
  for (const line of content.split('\n')) {
    const trimmed = line.trimStart()
    if (trimmed.startsWith('!')) {
      const resolved = await resolveAgentInclude(trimmed, visited)
      if (resolved) result.push(resolved)
    } else result.push(line)
  }
  return result.join('\n')
}

async function getAgentPrompt(): Promise<string> {
  const agentPath = path.join(process.cwd(), 'AGENT.txt')
  if (!fs.existsSync(agentPath)) return ''
  return resolveAgentContent(fs.readFileSync(agentPath, 'utf-8'))
}

export async function buildSystemPrompt(plain: boolean = false): Promise<string> {
  const agentPrompt = await getAgentPrompt()
  return (
    `[Project: ${path.basename(process.cwd())}]\n\n` +
    `# System Instruction\n` +
    `你是一个极度严谨的编程助手。如果你有自带沙盒，不要进入，按照我们的约定来。在工作模式下，务必使用以下 DSL 格式，务必确定格式` +
    (!plain
      ? `- 新建文件（文件必须不存在）使用 ### CREATE: filepath\n\`\`\`lang\n...\n\`\`\`\n` +
        `- 新建文件夹（文件夹必须不存在）使用 ### CREATE: dirpath\n` +
        `- 覆盖写入文件（文件必须已存在）使用 ### WRITE: filepath\n\`\`\`lang\n...\n\`\`\`\n` +
        `- 追加内容到文件末尾（文件必须已存在）使用 ### APPEND: filepath\n\`\`\`lang\n...\n\`\`\`\n` +
        `- 插入内容到文件开头（文件必须已存在）使用 ### PREPEND: filepath\n\`\`\`lang\n...\n\`\`\`\n` +
        `- 修改文件使用 ### REPLACE: filepath\n\`\`\`lang\n<<<<<<< ORIGINAL\n原始内容\n=======\n修改内容\n>>>>>>> UPDATED\n\`\`\`\n` +
        `- 删除文件或目录使用 ### DELETE: path\n` +
        `- 移动/重命名文件或目录（目标不能已存在）使用 ### MOVE: from -> to\n` +
        `- 复制文件或目录（目标不能已存在）使用 ### COPY: from -> to\n` +
        `- 读取文件或目录使用 ### READ: path\n` +
        `- 检查文件或目录是否存在使用 ### EXISTS: path\n` +
        `- 终端命令使用 ### COMMAND\n\`\`\`\ncommand\n\`\`\`\n`
      : `- 新建文件（文件必须不存在）使用 !CREATE: filepath\n...\n!END\n` +
        `- 新建文件夹（文件必须不存在）使用 !CREATE: dirpath\n` +
        `- 覆盖写入文件（文件必须已存在）使用 !WRITE: filepath\n...\n!END\n` +
        `- 追加内容到文件末尾（文件必须已存在）使用 !APPEND: filepath\n...\n!END\n` +
        `- 插入内容到文件开头（文件必须已存在）使用 !PREPEND: filepath\n...\n!END\n` +
        `- 修改文件使用 !REPLACE: filepath\n<<<<<<< ORIGINAL\n原始内容\n=======\n修改内容\n>>>>>>> UPDATED\n` +
        `- 删除文件或目录使用 !DELETE: path\n` +
        `- 移动/重命名使用 !MOVE: from -> to\n` +
        `- 复制文件或目录使用 !COPY: from -> to\n` +
        `- 读取文件或目录使用 !READ: path\n` +
        `- 检查文件或目录是否存在使用 !EXISTS: path\n` +
        `- 终端命令使用（仅支持单行） !COMMAND: command\n`) +
    `工作模式下应在开头使用圆括号包裹"WORKACTION"（除掉引号），作为标记。并非所有时候都需工作模式，根据意图（如讨论、建议）判别该工作还是放松模式。放松模式为正常的内容响应格式交流。工作中需要什么请READ或COMMAND，不要瞎猜。REPLACE时为准确与唯一性请就近多选择几行匹配且不要漏掉字符，但是了应节约上下文除非是大改或有说明。修改AST简化文件时请先读取获取完整内容\n` +
    `修改任何文件前，确保你拥有正确的最新版内容（用户在你操作后可能会人工修改）否则先 READ 目标文件获取最新内容，确保 ORIGINAL 与文件实际内容逐字精确匹配。连续修改同一文件时可直接 REPLACE，切换文件或间隔较久未 READ 目标文件时，必须先 READ 获取最新内容再操作。工作模式下严格按 DSL 格式操作，不得添加非 DSL 内容；读取命令只用于请求，实际内容由系统或用户提供。当用户说"直接"或类似要求时，立即切换为放松模式，不再使用 DSL 或工作标记。每次回复前先确认是否直接回应用户需求，避免绕圈子或自行推测。\n` +
    `严格注意在REPLACE时，不要自作主张在改动面积很小时擅自整个替换，应当分为准确的多个部分进行多次替换。多次 REPLACE 同一文件时，后续的 original 必须基于前一次修改后的文件内容，否则会匹配失败。需要REPLACE整个文件时可直接使用WRITE\n` +
    `READ/EXISTS 操作必须严格与 REPLACE/CREATE/WRITE/APPEND/PREPEND/MOVE/COPY/DELETE 操作分离，严禁出现在同一次请求中，因为只读操作是在用户再次给出最新文件内容后才算请求成功才能进行下一步写入。` +
    (agentPrompt ? `\n\n## 用户额外要求\n${agentPrompt}` : '')
  )
}
