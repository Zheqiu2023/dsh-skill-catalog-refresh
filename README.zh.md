# dsh-skill-catalog-refresh

一个很小的 DeepSeek Harness 插件：让**已打开**会话的斜杠技能菜单与磁盘上的技能保持同步。

## 要解决的问题

`/` 菜单背后的技能目录由 `@deepseek-ai/dsh-client-ui-skill` **按会话缓存**，只拉取一次。安装、修改或删除
`SKILL.md` 都到不了已经打开的窗口：

- 宿主侧技能注册表确实会在每次失效时派发 `skills/change`；
- 该事件**不在** `@deepseek-ai/dsh-api-remotes` 的转发白名单里，客户端永远收不到；
- 缓存只由 `agent-preset/selected`、`plugin-manager/changed`、`connection/reset` 三种事件清空，而桌面壳里
  刷新页面通常一个都不产生。

可见现象：新装的技能对智能体立刻可用，但 `/` 菜单仍只列出会话开始时就有的技能；删掉的技能更是完全不变。

## 它做什么

把两个事件接起来，约 90 行宿主代码，不含任何前端代码：

```
skills/change  （宿主，@deepseek-ai/dsh-skill 每次失效都派发）
      │        防抖 400 ms
      ▼
plugin-manager/changed  （转发事件，@deepseek-ai/dsh-api-remotes 白名单）
      ▼
dsh-client-ui-skill  clearAll()  →  下次敲 / 时重新拉取目录
```

监听注册表失效而不是监听目录，因此覆盖所有技能 provider 与所有扫描根：项目 `.dsh/skills`、项目
`.agents/skills`、用户 DSH 根、共享 agents 根、自定义目录，以及任何注册到宿主上的其他 provider。

## 安装

用 DSH CLI：

```sh
dsh plugin --profile <profile> add dsh-skill-catalog-refresh
```

同时也发布在 npm 上，GitHub 源用法相同：

```sh
dsh plugin --profile <profile> add github:Zheqiu2023/dsh-skill-catalog-refresh
```

或用 `plugin_manager` 工具，两种 spec 均可：

```
install_bundle { target: "dsh-skill-catalog-refresh@1.0.0" }
install_bundle { target: "github:Zheqiu2023/dsh-skill-catalog-refresh" }
```

本地目录安装：**插件 → 添加插件**，选择包目录即可。

零配置、激活后无需重启、不注册命令与工具，也不会给模型上下文增加任何内容。

## 行为

| 情况 | 结果 |
|---|---|
| 技能目录、`SKILL.md` 或其 frontmatter 新增、修改、删除 | 抖动结束后广播一次 |
| 400 ms 内多次失效（一次保存常触发多次） | 合并为一次广播 |
| 触发时没有窗口连接 | 无需更新；之后连接的窗口会读到当前状态 |
| 智能体工具、模型上下文、会话日志 | 不受影响 |

## 诊断日志

每次广播向 `<DSH_HOME>/logs/skill-catalog-refresh.log` 追加一行：

```
2026-11-16T15:34:47.144Z announced catalog change after 2 skills/change event(s)
```

该行证明宿主侧确实执行了；窗口是否重绘需在窗口中观察。写入失败会被忽略，因此只读的主目录不会阻断刷新。

## 局限

- **只更新已连接的窗口。** 错过事件的窗口需要重连、刷新或新开会话。
- **依赖当前失效契约。** 本插件假设 `dsh-client-ui-skill` 会在 `plugin-manager/changed` 时清空缓存。
  如果将来的 DSH 版本自己转发了 `skills/change`（这才是上游正解），本插件就不再需要；若客户端失效契约变化，
  插件需随之更新。
- **有意复用 `plugin-manager/changed`。** 它是唯一语义为「目录级失效，请重读」的转发事件；载荷
  `{ reason: 'plugin' }` 符合其声明的 `PluginChange` 形状，其他监听方只把它当刷新提示。

## 已验证

宿主侧已在 Windows + DSH `0.2.2-rc.3` 上实测：在 `~/.agents/skills` 下新建与删除技能，各产生恰好一次广播
（每次操作合并 2 个 `skills/change` 事件），见上方日志。

客户端侧**未**在此声明为已验证。它依赖 `dsh-client-ui-skill` 在 `plugin-manager/changed` 时清空缓存的既有契约；
普通插件管理操作产生的同一事件曾被观察到能刷新菜单，但针对本插件自身广播的受控测试尚未进行。欢迎反馈实际结果。

## 许可证

MIT
