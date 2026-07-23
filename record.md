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
export type DSLBlock =
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
export type DSLBlock =
  | { type: 'REPLACE'; filePath: string; original: string; updated: string }
  | { type: 'CREATE'; filePath: string; content: string }
```

---

```ts
const before = source.slice(0, match.startIndex)
const after = source.slice(match.endIndex)
const updatedSource = before + block.updated + after
fs.writeFileSync(block.filePath, updatedSource, 'utf-8')
```

```ts
fs.writeFileSync(block.filePath, source.slice(0, match.startIndex) + block.updated + source.slice(match.endIndex), 'utf-8')
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
  const fileBlocks: string[] = []

  for (const filePath of allFiles) {
    if (!fs.existsSync(filePath)) continue
    const rawContent = fs.readFileSync(filePath, 'utf-8')

    const shouldSimplify = simplifySet.has(filePath)
    const content = shouldSimplify ? extractSkeleton(rawContent, filePath) : rawContent

    const ext = path.extname(filePath).slice(1) || 'ts'
    const label = shouldSimplify ? `${filePath} (AST Simplified)` : filePath
    fileBlocks.push(`### File: \`${label}\`\n\`\`\`${ext}\n${content}\n\`\`\``)
  }

  if (fileBlocks.length > 0) {
    sections.push(`## 焦点文件上下文\n${fileBlocks.join('\n\n')}`)
  }
}
```

- 你他妈不用 `.map` 我都忍了，谁他妈教你同时写 `arr.length > 0` 和 `for (const item of arr)` 的？

```ts
const fileBlocks = allFiles
  .map((filePath) => {
    if (!fs.existsSync(filePath)) return ''
    const rawContent = fs.readFileSync(filePath, 'utf-8')
    const shouldSimplify = simplifySet.has(filePath)
    return `### File: \`${shouldSimplify ? `${filePath} (AST Simplified)` : filePath}\`\n\`\`\`${path.extname(filePath).slice(1) ?? 'ts'}\n${shouldSimplify ? extractSkeleton(rawContent, filePath) : rawContent}\n\`\`\``
  })
  .filter(Boolean)
  .join('\n\n')
if (fileBlocks) sections.push(`## 焦点文件上下文\n${fileBlocks}`)
```

---

```ts
const cwd = options.cwd || process.cwd()
```

```ts
const cwd = options.cwd ?? process.cwd()
```

---
