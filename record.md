# Record

```ts
for (const rawGlob of globs) {
  const isSimplify = rawGlob.endsWith('#')
  const matched = await glob(isSimplify ? rawGlob.slice(0, -1) : rawGlob, { onlyFiles: true, cwd })
  if (isSimplify) {
    rawSimplifyFiles.push(...matched)
  } else {
    rawNormalFiles.push(...matched)
  }
}
```

```ts
for (const rawGlob of globs) {
  const isSimplify = rawGlob.endsWith('#')
  ;(isSimplify ? rawSimplifyFiles : rawNormalFiles).push(
    ...(await glob(isSimplify ? rawGlob.slice(0, -1) : rawGlob, { onlyFiles: true, cwd }))
  )
}
```

---

```ts
const input = paths.join('\n')
const stdout = execSync('git check-ignore --stdin', {
  cwd,
  input,
  encoding: 'utf-8',
  stdio: ['pipe', 'pipe', 'ignore']
})
const ignoredList = stdout
  .split('\n')
  .map((p) => p.trim())
  .filter(Boolean)
```

```ts
return new Set(
  execSync('git check-ignore --stdin', {
    cwd,
    input: paths.join('\n'),
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'ignore']
  })
    .split('\n')
    .map((p) => p.trim())
    .filter(Boolean)
)
```

---

```ts
execSync(git check-ignore "${targetPath}", {
  cwd,
  stdio: 'ignore'
})
```

```ts
execSync(git check-ignore "${targetPath}", { cwd, stdio: 'ignore' })
```

---

```ts
const ast = remark().parse(input) as Root
const children = ast.children
/* ast only be referred once */
```

```ts
const children = (remark().parse(input) as Root).children
```

---

```ts
if (node.type === 'code') {
  return node as Code
}
```

```ts
if (node.type === 'code') return node as Code
```

---

```ts
export type DSLDef =
  | {
      type: 'REPLACE',
      filePath: string,
      original: string,
      updated: string
    }
  | {
      type: 'CREATE'
      filePath: string
      content: string
    }
```

```ts
export type DSLDef =
  | { type: 'REPLACE'; filePath: string; original: string; updated: string }
  | { type: 'CREATE'; filePath: string; content: string }
```

---

```ts
const before = source.slice(0, match.startIndex)
const after = source.slice(match.endIndex)
const updatedSource = before + op.updated + after
fs.writeFileSync(op.filePath, updatedSource, 'utf-8')
```

```ts
fs.writeFileSync(op.filePath, source.slice(0, match.startIndex) + op.updated + source.slice(match.endIndex), 'utf-8')
```

---

```ts
const ignoredSet = getGitIgnoredPaths(Array.from(new Set([...rawNormalFiles, ...rawSimplifyFiles])), cwd)
const normalFiles = Array.from(new Set(rawNormalFiles)).filter((file) => !ignoredSet.has(file))
const simplifyFiles = Array.from(new Set(rawSimplifyFiles)).filter((file) => !ignoredSet.has(file))

return { normalFiles, simplifyFiles }
```

```ts
const ignoredSet = getGitIgnoredPaths(Array.from(new Set([...rawNormalFiles, ...rawSimplifyFiles])), cwd)
return {
  normalFiles: Array.from(new Set(rawNormalFiles)).filter((file) => !ignoredSet.has(file)),
  simplifyFiles: Array.from(new Set(rawSimplifyFiles)).filter((file) => !ignoredSet.has(file))
}
```

---

```ts
if (allFiles.length > 0) {
  const fileOps: string[] = []

  for (const filePath of allFiles) {
    if (!fs.existsSync(filePath)) continue
    const rawContent = fs.readFileSync(filePath, 'utf-8')

    const shouldSimplify = simplifySet.has(filePath)
    const content = shouldSimplify ? extractSkeleton(rawContent, filePath) : rawContent

    const ext = path.extname(filePath).slice(1) || 'ts'
    const label = shouldSimplify ? `${filePath} (AST Simplified)` : filePath
    fileOps.push(`### File: \`${label}\`\n\`\`\`${ext}\n${content}\n\`\`\``)
  }

  if (fileOps.length > 0) {
    sections.push(`## 焦点文件上下文\n${fileOps.join('\n\n')}`)
  }
}
```

- 你他妈不用 `.map` 我都忍了，谁他妈教你同时写 `arr.length > 0` 和 `for (const item of arr)` 的？

```ts
const fileOps = allFiles
  .map((filePath) => {
    if (!fs.existsSync(filePath)) return ''
    const rawContent = fs.readFileSync(filePath, 'utf-8')
    const shouldSimplify = simplifySet.has(filePath)
    return `### File: \`${shouldSimplify ? `${filePath} (AST Simplified)` : filePath}\`\n\`\`\`${path.extname(filePath).slice(1) ?? 'ts'}\n${shouldSimplify ? extractSkeleton(rawContent, filePath) : rawContent}\n\`\`\``
  })
  .filter(Boolean)
  .join('\n\n')
if (fileOps) sections.push(`## 焦点文件上下文\n${fileOps}`)
```

---

```ts
const cwd = options.cwd || process.cwd()
```

```ts
const cwd = options.cwd ?? process.cwd()
```

---

```ts
const [targetLength, targetThickness] = Array.isArray(lengthData[targetId])
  ? lengthData[targetId]
  : [getNewLength(), getNewThickness()]
if (!Array.isArray(lengthData[targetId])) {
  lengthData[targetId] = [targetLength, targetThickness]
  saveTodayData(lengthData)
}
const [senderLength, senderThickness] = Array.isArray(lengthData[senderId])
  ? lengthData[senderId]
  : [getNewLength(), getNewThickness()]
if (!Array.isArray(lengthData[senderId])) {
  lengthData[senderId] = [senderLength, senderThickness]
  saveTodayData(lengthData)
}
```

```ts
const [[targetLength, targetThickness], [senderLength, senderThickness]] = [targetId, senderId].map((id) =>
  Array.isArray(lengthData[id])
    ? lengthData[id]
    : ((data: [number, number]) => {
        lengthData[id] = data
        saveTodayData(lengthData)
        return data
      })([getNewLength(), getNewThickness()])
)
```

---

如果说前面是过度愚蠢的解释 那这段完全是跟他妈刚学编程一样的脑瘫毫无灵活性可言了：

```typescript

function isReadonlyOnlyDSL(text: string): boolean {
  const types = DSLDef.map((d) => d.type)
  const found = types.some((t) => text.includes(t))
  if (!found) return false
  const labelMap: Record<string, DSLOpLabel> = {}
  for (const d of DSLDef) labelMap[d.type] = d.label
  return types.filter((t) => text.includes(t)).every((t) => labelMap[t] === 'readonly')
}
```

```typescript
function isReadonlyOnlyDSL(text: string): boolean {
  return DSLDef.filter(({ type }) => text.includes(type)).every(({ label }) => label === 'readonly')
}
```

哪怕有煞笔审美品味低下觉得后者声明式不喜欢 那么前代码也毫无疑问有问题 尤其是愚蠢逻辑问题 首先是又他妈声明式又他妈for const of 而且这他妈types和for完完全全就矛盾的 明明都他妈在一个数组里 结果他妈遍历两遍 一个是蹩脚map 一个是脑瘫地自以为高级构建labelrecord的傻逼行为 最愚蠢则是你他妈最后都filter他妈的那破found有个几把意义 filter自然就解决了found还他妈搁着.some
